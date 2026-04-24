"use client"
import React from "react"
import { Toaster as Sonner } from "sonner"
type ToasterProps = React.ComponentProps<typeof Sonner>
const Toaster = ({ ...props }: ToasterProps) => {
  // We force dark mode for the entire application theme to match the Cyber-Industrial design
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-slate-950 group-[.toaster]:text-slate-100 group-[.toaster]:border-slate-800 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-xl font-sans",
          description: "group-[.toast]:text-slate-400 text-[11px] font-medium",
          actionButton:
            "group-[.toast]:bg-sky-500 group-[.toast]:text-sky-50 group-[.toast]:font-bold",
          cancelButton:
            "group-[.toast]:bg-slate-800 group-[.toast]:text-slate-400",
          icon: "text-sky-400",
        },
      }}
      {...props}
    />
  )
}
export { Toaster }