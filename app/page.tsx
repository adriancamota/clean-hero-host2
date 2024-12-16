// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { ArrowRight, Leaf, Recycle, Users, Coins, MapPin, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Poppins } from 'next/font/google'
import Link from 'next/link'
import ContractInteraction from '@/components/ContractInteraction'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { getImpactData } from '@/utils/db/actions'
const poppins = Poppins({ 
  weight: ['300', '400', '600'],
  subsets: ['latin'],
  display: 'swap',
})

function AnimatedGlobe() {
  return (
    <div className="relative w-32 h-32 mx-auto mb-8">
      <div className="absolute inset-0 rounded-full bg-green-500 opacity-20 animate-pulse"></div>
      <div className="absolute inset-2 rounded-full bg-green-400 opacity-40 animate-ping"></div>
      <div className="absolute inset-4 rounded-full bg-green-300 opacity-60 animate-spin"></div>
      <div className="absolute inset-6 rounded-full bg-green-200 opacity-80 animate-bounce"></div>
      <Leaf className="absolute inset-0 m-auto h-16 w-16 text-green-600 animate-pulse" />
    </div>
  )
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    setLoggedIn(!!userEmail);
  }, []);

  const handleGetStarted = () => {
    if (!loggedIn) {
      toast.error('Please login first to access this feature');
      return;
    }
    setLoggedIn(true);
  };

  const [impactData, setImpactData] = useState({
    wasteCollected: 0,
    reportsSubmitted: 0,
    tokensEarned: 0,
    co2Offset: 0
  });

  useEffect(() => {
    async function fetchImpactData() {
      try {
        const data = await getImpactData();
        setImpactData(data);
      } catch (error) {
        console.error("Error fetching impact data:", error);
        // Set default values in case of error
        setImpactData({
          wasteCollected: 0,
          reportsSubmitted: 0,
          tokensEarned: 0,
          co2Offset: 0
        });
      }
    }

    fetchImpactData();
  }, []);

  return (
    <div className="min-h-screen w-full relative">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("/eco-background.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      />
      <main className={`${poppins.className} min-h-screen bg-white dark:bg-gray-900 p-4 rounded-[40px] relative z-10`}>
        <div className="container mx-auto px-4 py-8 flex-grow">
          <section className="text-center mb-20">
            <AnimatedGlobe />
            <h1 className="text-6xl font-bold mb-6 text-gray-800 dark:text-gray-100 tracking-tight">
              Clean-Hero <span className="text-green-600 dark:text-green-400">Waste Management</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed mb-8">
              Join our community in making waste management more efficient and rewarding!
            </p>
            {!loggedIn ? (
              <Button 
                onClick={handleGetStarted} 
                className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white text-lg py-6 px-10 rounded-full font-medium transition-all duration-300 ease-in-out transform hover:scale-105"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            ) : (
              <Link href="/report">
                <Button className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white text-lg py-6 px-10 rounded-full font-medium transition-all duration-300 ease-in-out transform hover:scale-105">
                  Report Waste
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            )}
          </section>
          
          <section className="grid md:grid-cols-3 gap-10 mb-20">
            <FeatureCard
              icon={Leaf}
              title="Eco-Friendly"
              description="Contribute to a cleaner environment by reporting and collecting waste."
            />
            <FeatureCard
              icon={Coins}
              title="Earn Rewards"
              description="Get tokens for your contributions to waste management efforts."
            />
            <FeatureCard
              icon={Users}
              title="Community-Driven"
              description="Be part of a growing community committed to sustainable practices."
            />
          </section>
          
          <section className="bg-white dark:bg-gray-800 p-10 rounded-3xl shadow-lg mb-20">
            <h2 className="text-4xl font-bold mb-12 text-center text-gray-800 dark:text-gray-100">Our Impact</h2>
            <div className="grid md:grid-cols-4 gap-6">
              <ImpactCard title="Waste Collected" value={`${impactData.wasteCollected} kg`} icon={Recycle} />
              <ImpactCard title="Reports Submitted" value={impactData.reportsSubmitted.toString()} icon={MapPin} />
              <ImpactCard title="Tokens Earned" value={impactData.tokensEarned.toString()} icon={Coins} />
              <ImpactCard title="CO2 Offset" value={`${impactData.co2Offset} kg`} icon={Leaf} />
            </div>
          </section>

          {/* FAQ Section */}
          <section className="bg-white dark:bg-gray-800 p-10 rounded-3xl shadow-lg mb-20">
            <h2 className="text-4xl font-bold mb-12 text-center text-gray-800 dark:text-gray-100">Frequently Asked Questions</h2>
            <div className="space-y-6 max-w-3xl mx-auto">
              <FaqItem 
                question="How does Clean-Hero work?" 
                answer="Clean-Hero is a waste management platform where users can report waste locations, collect waste, and earn rewards for their environmental contributions."
              />
              <FaqItem 
                question="How do I earn tokens?" 
                answer="You can earn tokens by reporting waste locations and verifying waste collection. Each verified action contributes to your token balance."
              />
              <FaqItem 
                question="What can I do with earned tokens?" 
                answer="Tokens can be exchanged for rewards, used to participate in community initiatives, or traded within our ecosystem."
              />
              <FaqItem 
                question="How do I verify waste collection?" 
                answer="Take before and after photos of the waste location and submit them through our platform. Our community will verify your contribution."
              />
            </div>
          </section>

          {/* Contact Section */}
          <section className="bg-white dark:bg-gray-800 p-10 rounded-3xl shadow-lg mb-20">
            <div className="max-w-2xl mx-auto text-center">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="p-6">
                  <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Support</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">Our support team is here for you.</p>
                  <Link href="mailto:support@clean-hero.com">
                    <Button variant="outline" className="w-full group">
                      Contact Support
                      <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Partnership</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">Interested in partnering with us?</p>
                  <Link href="mailto:partners@clean-hero.com">
                    <Button variant="outline" className="w-full group">
                      Partner With Us
                      <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
        {/* Footer */}
        <footer className="w-full py-8 px-4">
          <div className="text-center text-gray-600 dark:text-gray-400">
            <p>&copy; {new Date().getFullYear()} Clean-Hero. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </div>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
      <button
        className="flex justify-between items-center w-full text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">{question}</h3>
        <ChevronRight className={`h-5 w-5 transform transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && (
        <p className="mt-4 text-gray-600 dark:text-gray-300">{answer}</p>
      )}
    </div>
  )
}

function ImpactCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : value;
  
  return (
    <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 transition-all duration-300 ease-in-out hover:shadow-md">
      <Icon className="h-10 w-10 text-green-500 dark:text-green-400 mb-4" />
      <p className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-100">{formattedValue}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">{title}</p>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 ease-in-out flex flex-col items-center text-center">
      <div className="bg-green-100 dark:bg-green-900 p-4 rounded-full mb-6">
        <Icon className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">{title}</h3>
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{description}</p>
    </div>
  )
}
