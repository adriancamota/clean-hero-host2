'use client'
import { useState, useCallback, useEffect } from 'react'
import {  MapPin, Upload, CheckCircle, Loader } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GoogleGenerativeAI } from "@google/generative-ai";
import { StandaloneSearchBox,  useJsApiLoader } from '@react-google-maps/api'
import { Libraries } from '@react-google-maps/api';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { createReport, createUser, getRecentReports, getUserByEmail } from '@/utils/db/actions';

const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

const libraries: Libraries = ['places'];

const MAX_RETRIES = 3;

export default function ReportPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const router = useRouter();

  const [reports, setReports] = useState<Array<{
    id: number;
    location: string;
    wasteType: string;
    amount: string;
    createdAt: string;
  }>>([]);

  const [newReport, setNewReport] = useState({
    location: '',
    type: '',
    amount: '',
  })

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<{
    wasteType: string;
    quantity: string;
    confidence: number;
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [searchBox, setSearchBox] = useState<google.maps.places.SearchBox | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey!,
    libraries: libraries
  });

  const onLoad = useCallback((ref: google.maps.places.SearchBox) => {
    setSearchBox(ref);
  }, []);

  const onPlacesChanged = () => {
    if (searchBox) {
      const places = searchBox.getPlaces();
      if (places && places.length > 0) {
        const place = places[0];
        setNewReport(prev => ({
          ...prev,
          location: place.formatted_address || '',
        }));
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewReport({ ...newReport, [name]: value })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleVerify = async (retryCount = 0) => {
    const prompt = `Analyze this image of waste and provide a JSON response with the following fields:
    - wasteType: the type of waste shown (e.g., "Plastic Bottles", "Electronic Waste", "Food Waste")
    - quantity: estimated amount in kilograms only (e.g., "2 kg", "0.5 kg")
    - confidence: a number between 0 and 1 indicating confidence in the analysis

    Important: Always provide the quantity in kilograms (kg) only.

    Format the response as valid JSON only, like:
    {"wasteType": "...", "quantity": "... kg", "confidence": 0.9}`;

    if (!file) {
      toast.error('Please select an image first');
      return;
    }

    if (retryCount >= MAX_RETRIES) {
      toast.error('Maximum retry attempts reached. Please try with a different image.');
      setVerificationStatus('failure');
      return;
    }

    setVerificationStatus('verifying');
    
    try {
      if (!geminiApiKey) {
        toast.error('API key missing. Check environment variables.');
        return;
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey!);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Check file size
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image too large. Please use an image under 10MB');
        return;
      }

      try {
        const base64Data = await readFileAsBase64(file);
        if (!base64Data) {
          throw new Error('Failed to read image file');
        }

        const imageParts = [
          {
            inlineData: {
              data: base64Data.split(',')[1],
              mimeType: file.type,
            },
          },
        ];

        toast.loading(`Analyzing image (Attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        
        const result = await model.generateContent([prompt, ...imageParts]);
        const text = await result.response.text();

        if (!text) {
          throw new Error('Empty response from AI');
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : text;

        try {
          const parsedResult = JSON.parse(jsonString);
          
          const sanitizedResult = {
            wasteType: String(parsedResult.wasteType || '').trim(),
            quantity: String(parsedResult.quantity || '').trim(),
            confidence: Number(parsedResult.confidence) || 0.5
          };

          if (!sanitizedResult.wasteType || !sanitizedResult.quantity) {
            throw new Error('Invalid response format');
          }

          if (sanitizedResult.wasteType.toLowerCase().includes('no waste') || 
              sanitizedResult.wasteType.toLowerCase() === 'none' ||
              sanitizedResult.wasteType.toLowerCase() === 'no waste detected') {
            toast.error('No waste detected in the image. Please upload a clear image of waste.');
            setVerificationStatus('failure');
            return;
          }

          setVerificationResult(sanitizedResult);
          setVerificationStatus('success');
          setNewReport({
            ...newReport,
            type: sanitizedResult.wasteType,
            amount: sanitizedResult.quantity
          });
          toast.success('Image verified successfully');
        } catch (error) {
          console.error('Failed to parse JSON response:', text);
          const fallbackResult = {
            wasteType: "Unknown",
            quantity: "1 kg",
            confidence: 0.5
          };
          setVerificationResult(fallbackResult);
          setVerificationStatus('success');
          setNewReport({
            ...newReport,
            type: fallbackResult.wasteType,
            amount: fallbackResult.quantity
          });
          toast('AI response was unclear. Using default values.', {
            icon: '⚠️',
          });
        }

      } catch (error: any) {
        console.error(`Verification attempt ${retryCount + 1} failed:`, error);
        
        if (error.message?.includes('RESOURCE_EXHAUSTED')) {
          toast.error('API rate limit reached. Please try again in a moment.');
          return;
        }

        if (error.message?.includes('INVALID_ARGUMENT')) {
          toast.error('Image format not supported. Please try a different image.');
          return;
        }

        // Automatically retry for certain errors
        if (retryCount < MAX_RETRIES) {
          toast.error(`Verification failed. Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setTimeout(() => {
            handleVerify(retryCount + 1);
          }, 2000); // Wait 2 seconds before retrying
          return;
        }

        toast.error(`Failed to verify image: ${error.message || 'Unknown error'}`);
        setVerificationStatus('failure');
      }

    } catch (error: any) {
      console.error('Critical error during verification:', error);
      toast.error('Critical error occurred. Please try again later.');
      setVerificationStatus('failure');
    } finally {
      toast.dismiss();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationStatus !== 'success' || !user) {
      toast.error('Please verify the waste before submitting or log in.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const report = await createReport(
        user.id,
        newReport.location,
        newReport.type,
        newReport.amount,
        preview || undefined,
        verificationResult ? JSON.stringify(verificationResult) : undefined
      ) as any;
      
      const formattedReport = {
        id: report.id,
        location: report.location,
        wasteType: report.wasteType,
        amount: report.amount,
        createdAt: report.createdAt.toISOString().split('T')[0]
      };
      
      setReports([formattedReport, ...reports]);
      setNewReport({ location: '', type: '', amount: '' });
      setFile(null);
      setPreview(null);
      setVerificationStatus('idle');
      setVerificationResult(null);
      

      toast.success(`Report submitted successfully! You've earned points for reporting waste.`);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const email = localStorage.getItem('userEmail');
      if (email) {
        let user = await getUserByEmail(email);
        if (!user) {
          user = await createUser(email, 'Anonymous User');
        }
        setUser(user);
        
        const recentReports = await getRecentReports() as any;
        const formattedReports = recentReports.map((report: any)=> ({
          ...report,
          createdAt: report.createdAt.toISOString().split('T')[0]
        }));
        setReports(formattedReports);
      } else {
        router.push('/login'); 
      }
    };
    checkUser();
  }, [router]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800 dark:text-white">Report waste</h1>
      
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg mb-12">
        <div className="mb-8">
          <label htmlFor="waste-image" className="block text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
            Upload Waste Image
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-xl hover:border-green-500 transition-colors duration-300 dark:hover:border-green-400">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <div className="flex text-sm text-gray-600 dark:text-gray-300">
                <label
                  htmlFor="waste-image"
                  className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500"
                >
                  <span>Upload a file</span>
                  <input id="waste-image" name="waste-image" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG, GIF up to 10MB</p>
            </div>
          </div>
        </div>
        
        {preview && (
          <div className="mt-4 mb-8">
            <img src={preview} alt="Waste preview" className="max-w-full h-auto rounded-xl shadow-md" />
          </div>
        )}
        
        <Button 
          type="button" 
          onClick={() => handleVerify(0)}
          className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg rounded-xl transition-colors duration-300" 
          disabled={!file || verificationStatus === 'verifying'}
        >
          {verificationStatus === 'verifying' ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Verifying...
            </>
          ) : 'Verify Waste'}
        </Button>

        {verificationStatus === 'success' && verificationResult && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-8 rounded-r-xl">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-400 mr-3" />
              <div>
                <h3 className="text-lg font-medium text-green-800">Verification Successful</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Waste Type: {verificationResult.wasteType}</p>
                  <p>Quantity: {verificationResult.quantity}</p>
                  <p>Confidence: {(verificationResult.confidence * 100).toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {verificationStatus === 'failure' && (
          <div className="mt-4">
            <Button 
              type="button" 
              onClick={() => handleVerify(0)} 
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Retry Verification
            </Button>
            <p className="text-sm text-gray-500 mt-2">
              Tip: Try with a clearer image or different lighting
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Location</label>
            {isLoaded ? (
              <StandaloneSearchBox
                onLoad={onLoad}
                onPlacesChanged={onPlacesChanged}
              >
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={newReport.location}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Enter waste location"
                />
              </StandaloneSearchBox>
            ) : (
              <input
                type="text"
                id="location"
                name="location"
                value={newReport.location}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 dark:bg-gray-700 dark:text-gray-100"
                placeholder="Enter waste location"
              />
            )}
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Waste Type</label>
            <input
              type="text"
              id="type"
              name="type"
              value={newReport.type}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 bg-gray-100 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Verified waste type"
              readOnly
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Estimated Amount</label>
            <input
              type="text"
              id="amount"
              name="amount"
              value={newReport.amount}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 bg-gray-100 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Verified amount"
              readOnly
            />
          </div>
        </div>
        <Button 
          type="submit" 
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg rounded-xl transition-colors duration-300 flex items-center justify-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Submitting...
            </>
          ) : 'Submit Report'}
        </Button>
      </form>

      <h2 className="text-3xl font-semibold mb-6 text-gray-800 dark:text-white">Recent Reports</h2>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    <MapPin className="inline-block w-4 h-4 mr-2 text-green-500" />
                    {report.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{report.wasteType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{report.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{report.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}