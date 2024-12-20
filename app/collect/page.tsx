'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'react-hot-toast'
import { getUserByEmail, getWasteCollectionTasks, saveCollectedWaste, saveReward, updateTaskStatus } from '@/utils/db/actions'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Make sure to set your Gemini API key in your environment variables
const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

interface CollectionTask {
  id: number
  location: string
  wasteType: string
  amount: string
  status: 'pending' | 'in_progress' | 'completed' | 'verified'
  date: string
  collectorId: number | null
}

interface VerificationGuideline {
  met: boolean;
  message: string;
  icon: string; // For visual feedback
};

const ITEMS_PER_PAGE = 5

export default function CollectPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredWasteType, setHoveredWasteType] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)

  const [guidelines, setGuidelines] = useState<VerificationGuideline[]>([
    { met: false, message: 'Image is clear and well-lit', icon: '🔆' },
    { met: false, message: 'Waste type matches report', icon: '♻️' },
    { met: false, message: 'Quantity is visible and matches', icon: '⚖️' },
    { met: false, message: 'Image angle shows waste clearly', icon: '📸' }
  ]);

  const [selectedTask, setSelectedTask] = useState<CollectionTask | null>(null)
  const [verificationImage, setVerificationImage] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<{
    wasteTypeMatch: boolean;
    quantityMatch: boolean;
    confidence: number;
  } | null>(null)
  const [reward, setReward] = useState<number | null>(null)

  useEffect(() => {
    const fetchUserAndTasks = async () => {
      setLoading(true)
      try {
        // Fetch user
        const userEmail = localStorage.getItem('userEmail')
        if (userEmail) {
          const fetchedUser = await getUserByEmail(userEmail)
          if (fetchedUser) {
            setUser(fetchedUser)
          } else {
            toast.error('User not found. Please log in again.')
            // Redirect to login page or handle this case appropriately
          }
        } else {
          toast.error('User not logged in. Please log in.')
          // Redirect to login page or handle this case appropriately
        }

        // Fetch tasks
        const fetchedTasks = await getWasteCollectionTasks()
        setTasks(fetchedTasks as CollectionTask[])
      } catch (error) {
        console.error('Error fetching user and tasks:', error)
        toast.error('Failed to load user data and tasks. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchUserAndTasks()
  }, [])

  const handleStatusChange = async (taskId: number, newStatus: CollectionTask['status']) => {
    if (!user) {
      toast.error('Please log in to collect waste.')
      return
    }

    try {
      const updatedTask = await updateTaskStatus(taskId, newStatus, user.id)
      if (updatedTask) {
        setTasks(tasks.map(task => 
          task.id === taskId ? { ...task, status: newStatus, collectorId: user.id } : task
        ))
        toast.success('Task status updated successfully')
      } else {
        toast.error('Failed to update task status. Please try again.')
      }
    } catch (error) {
      console.error('Error updating task status:', error)
      toast.error('Failed to update task status. Please try again.')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setVerificationImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const readFileAsBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1]
  }

  const MAX_RETRIES = 3;

  const handleVerify = async () => {
    if (!selectedTask || !verificationImage || !user) {
      toast.error('Missing required information for verification.')
      return
    }

    setVerificationStatus('verifying')
    
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey!)
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

      const base64Data = readFileAsBase64(verificationImage)

      const imageParts = [{
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg',
        },
      }]

      const prompt = `Analyze this image of waste and provide a JSON response with the following fields:
        - wasteType: the type of waste shown (e.g., "Plastic Bottles", "Electronic Waste", "Food Waste", or "No waste detected" if no waste is visible)
        - quantity: estimated amount in kilograms (e.g., "2.5", or "0" if no waste)
        - confidence: a number between 0 and 1 indicating confidence in the analysis

        Expected waste:
        - Type: ${selectedTask.wasteType}
        - Amount: ${selectedTask.amount} kg

        Important guidelines:
        - If no waste is visible, respond with wasteType: "No waste detected" and quantity: "0"
        - Be lenient with type matching (similar types should match)
        - For quantity:
          * Expected amount is ${selectedTask.amount} kg
          * Must be within 50% of expected amount
          * Reject if more than 3x or less than 0.3x the expected amount
        - Provide quantity as a number only (without 'kg')
        - Be very strict with quantity estimation
        
        Format response as valid JSON only:
        {"wasteType": "...", "quantity": "...", "confidence": 0.9}`

      const result = await model.generateContent([prompt, ...imageParts])
      const text = result.response.text()
      
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Invalid response format');
        }

        const parsedResult = JSON.parse(jsonMatch[0]);
        
        // First check if no waste was detected
        if (parsedResult.wasteType.toLowerCase() === 'no waste detected') {
          setVerificationStatus('failure');
          toast.error('No waste detected in the image. Please ensure the waste is clearly visible.');
          return;
        }
        
        // Rest of the verification logic...
        const expectedQuantity = parseFloat(selectedTask.amount);
        const actualQuantity = parseFloat(parsedResult.quantity);
        const tolerance = 0.5;

        // Check type match
        const typeMatches = parsedResult.wasteType.toLowerCase().includes(selectedTask.wasteType.toLowerCase()) ||
                           selectedTask.wasteType.toLowerCase().includes(parsedResult.wasteType.toLowerCase());
        
        // Improved quantity matching logic
        const lowerBound = expectedQuantity * (1 - tolerance);
        const upperBound = expectedQuantity * (1 + tolerance);
        const quantityMatches = actualQuantity >= lowerBound && actualQuantity <= upperBound;

        if (actualQuantity > expectedQuantity * 3 || actualQuantity < expectedQuantity * 0.3) {
          setVerificationStatus('failure');
          toast.error(`Quantity mismatch: Expected around ${expectedQuantity}kg, but found ${actualQuantity}kg`);
          return;
        }

        // Set verification result
        setVerificationResult({
          wasteTypeMatch: typeMatches,
          quantityMatch: quantityMatches,
          confidence: parsedResult.confidence
        });

        const verificationPassed = typeMatches && quantityMatches && parsedResult.confidence > 0.7;

        if (verificationPassed) {
          setVerificationStatus('success');
          await handleStatusChange(selectedTask.id, 'verified');
          const earnedReward = Math.floor(Math.random() * 50) + 10;
          
          await saveReward(user.id, earnedReward);
          await saveCollectedWaste(selectedTask.id, user.id, parsedResult);

          setReward(earnedReward);
          toast.success(`Verification successful! You earned ${earnedReward} tokens!`);
        } else {
          setVerificationStatus('failure');
          let errorMessage = 'Verification failed: ';
          if (!typeMatches) errorMessage += 'Waste type does not match. ';
          if (!quantityMatches) errorMessage += 'Quantity differs significantly. ';
          if (parsedResult.confidence <= 0.7) errorMessage += 'Low confidence in verification. ';
          toast.error(errorMessage);
        }

      } catch (error) {
        console.error('Parse Error:', error);
        console.error('AI Response:', text);
        toast.error('Unable to process the verification result. Please try again.');
        setVerificationStatus('failure');
      }
    } catch (error) {
      console.error('Verification Error:', error);
      toast.error('Error during verification. Please try again.');
      setVerificationStatus('failure');
    }
  }

  const pageCount = Math.ceil(tasks.length / ITEMS_PER_PAGE)
  const paginatedTasks = tasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800 dark:text-white">Waste Collection Tasks</h1>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin h-8 w-8 text-gray-500" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedTasks.map(task => (
              <div key={task.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100 flex items-center">
                    <div className="w-5 h-5 mr-2 text-gray-500" />
                    {task.location}
                  </h2>
                  <StatusBadge status={task.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 dark:text-gray-300 mb-3">
                  <div className="flex items-center relative">
                    <div className="w-4 h-4 mr-2 text-gray-500" />
                    <span 
                      onMouseEnter={() => setHoveredWasteType(task.wasteType)}
                      onMouseLeave={() => setHoveredWasteType(null)}
                      className="cursor-pointer"
                    >
                      {task.wasteType.length > 8 ? `${task.wasteType.slice(0, 8)}...` : task.wasteType}
                    </span>
                    {hoveredWasteType === task.wasteType && (
                      <div className="absolute left-0 top-full mt-1 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                        {task.wasteType}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 mr-2 text-gray-500" />
                    {task.amount}
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 mr-2 text-gray-500" />
                    {task.date}
                  </div>
                </div>
                <div className="flex justify-end">
                  {task.status === 'pending' && (
                    <Button onClick={() => handleStatusChange(task.id, 'in_progress')} variant="outline" size="sm">
                      Start Collection
                    </Button>
                  )}
                  {task.status === 'in_progress' && task.collectorId === user?.id && (
                    <Button onClick={() => setSelectedTask(task)} variant="outline" size="sm">
                      Complete & Verify
                    </Button>
                  )}
                  {task.status === 'in_progress' && task.collectorId !== user?.id && (
                    <span className="text-yellow-600 text-sm font-medium">In progress by another collector</span>
                  )}
                  {task.status === 'verified' && (
                    <span className="text-green-600 text-sm font-medium">Reward Earned</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-center">
            <Button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="mr-2"
            >
              Previous
            </Button>
            <span className="mx-2 self-center">
              Page {currentPage} of {pageCount}
            </span>
            <Button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
              disabled={currentPage === pageCount}
              className="ml-2"
            >
              Next
            </Button>
          </div>
        </>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Verify Collection</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">Upload a photo of the collected waste to verify and earn your reward.</p>
            <div className="mb-4">
              <label htmlFor="verification-image" className="block text-sm font-medium text-gray-700 mb-2">
                Upload Image
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Camera className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex flex-col text-sm text-gray-600">
                    <label
                      htmlFor="verification-image"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                    >
                      <span className="text-center">Upload a file</span>
                      <input id="verification-image" name="verification-image" type="file" className="sr-only" onChange={handleImageUpload} accept="image/*" />
                    </label>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
                  </div>
                </div>
              </div>
            </div>
            {verificationImage && (
              <Image src={verificationImage} alt="Verification" className="mb-4 rounded-md w-full" />
            )}
            <Button
              onClick={() => handleVerify()}
              className="w-full"
              disabled={!verificationImage || verificationStatus === 'verifying'}
            >
              {verificationStatus === 'verifying' ? (
                <>
                  <div className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Verifying...
                </>
              ) : 'Verify Collection'}
            </Button>
            {verificationStatus === 'success' && verificationResult && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md space-y-2">
                <p className="font-medium text-green-800">Verification Results:</p>
                <p className="text-green-700">Waste Type Match: {verificationResult.wasteTypeMatch ? 'Yes' : 'No'}</p>
                <p className="text-green-700">Quantity Match: {verificationResult.quantityMatch ? 'Yes' : 'No'}</p>
                <p className="text-green-700">Confidence: {(verificationResult.confidence * 100).toFixed(2)}%</p>
              </div>
            )}
            {verificationStatus === 'failure' && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm font-medium">Verification failed</p>
                <p className="text-red-500 text-xs mt-1">
                  Please ensure:
                  - The waste type matches what was reported
                  - The quantity matches the report
                </p>
                <Button 
                  onClick={() => handleVerify()} 
                  className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  Try Again
                </Button>
              </div>
            )}
            <Button onClick={() => setSelectedTask(null)} variant="outline" className="w-full mt-2">
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: CollectionTask['status'] }) {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: <div className="w-3 h-3" /> },
    in_progress: { color: 'bg-blue-100 text-blue-800', icon: <div className="w-3 h-3" /> },
    completed: { color: 'bg-green-100 text-green-800', icon: <div className="w-3 h-3" /> },
    verified: { color: 'bg-purple-100 text-purple-800', icon: <div className="w-3 h-3" /> },
  }

  const { color, icon } = statusConfig[status]

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${color} flex items-center`}>
      {icon}
      {status.replace('_', ' ')}
    </span>
  )
}