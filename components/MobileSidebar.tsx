import React, { useEffect } from 'react'
import Sidebar from './Sidebar'

interface MobileSidebarProps {
  open: boolean
  onClose: () => void
}

export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  return (
    <>
      {/* Overlay */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {/* Mobile Sidebar */}
      <div className="block lg:hidden">
        <Sidebar open={open} />
      </div>
    </>
  )
} 