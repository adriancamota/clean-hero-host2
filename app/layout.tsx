"use client"

import { useState, useEffect } from "react"
import { Inter } from 'next/font/google'
import "./globals.css"
import Header from "@/components/Header"
import Sidebar from "@/components/Sidebar"
import { Toaster } from 'react-hot-toast'
import { getAvailableRewards, getUserByEmail } from '@/utils/db/actions'
import { AudioProvider } from '@/contexts/AudioContext'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail')
    setIsLoggedIn(!!userEmail)

    const fetchTotalEarnings = async () => {
      try {
        if (userEmail) {
          const user = await getUserByEmail(userEmail)
          if (user) {
            const availableRewards = await getAvailableRewards(user.id) as any
            setTotalEarnings(availableRewards)
          }
        }
      } catch (error) {
        console.error('Error fetching total earnings:', error)
      }
    }

    fetchTotalEarnings()
  }, [])

  return (
    <html lang="en">
      <body className={`${inter.className} bg-white dark:bg-[#0F1729] min-h-screen`}>
        <AudioProvider>
          <div className="min-h-screen bg-gray-50 dark:bg-[#0F1729] flex flex-col">
            <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} totalEarnings={totalEarnings} />
            <div className="flex flex-1">
              <Sidebar open={sidebarOpen} />
              <main className={`flex-1 p-4 lg:p-8 transition-all duration-300 bg-gray-50 dark:bg-[#0F1729] ${
                isLoggedIn ? 'ml-0 lg:ml-64' : 'mx-auto max-w-7xl'
              }`}>
                {children}
              </main>
            </div>
          </div>
          <Toaster />
        </AudioProvider>
      </body>
    </html>
  )
}
