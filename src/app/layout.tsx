import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#090a0f",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "منصة الاختبارات الإلكترونية",
  description: "إنشاء اختبارات إلكترونية واستيراد الأسئلة وحلها بمرونة وسرعة فائقة",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "اختباراتي",
  },
  icons: {
    icon: "/icons/favicon-32x32.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${cairo.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <RegisterServiceWorker />
        <Toaster richColors position="top-center" dir="rtl" />
      </body>
    </html>
  );
}

