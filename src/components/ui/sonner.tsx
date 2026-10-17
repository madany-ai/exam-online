"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "dark" } = useTheme()

  return (
    <Sonner
      theme={(theme === "system" ? "dark" : theme) as ToasterProps["theme"]}
      className="toaster group font-sans"
      dir="rtl"
      richColors
      closeButton
      expand
      visibleToasts={4}
      icons={{
        success: (
          <CircleCheckIcon className="size-5 text-emerald-400" />
        ),
        info: (
          <InfoIcon className="size-5 text-sky-400" />
        ),
        warning: (
          <TriangleAlertIcon className="size-5 text-amber-400" />
        ),
        error: (
          <OctagonXIcon className="size-5 text-rose-400" />
        ),
        loading: (
          <Loader2Icon className="size-5 animate-spin text-emerald-400" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast font-sans rounded-xl shadow-2xl border border-border/80 bg-card/95 backdrop-blur-md px-4 py-3.5 items-start gap-3",
          title: "font-bold text-sm leading-6",
          description: "text-xs leading-5 mt-1 opacity-90",
          actionButton: "font-semibold",
          cancelButton: "font-medium",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
