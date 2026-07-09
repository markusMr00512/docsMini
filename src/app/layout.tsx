import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocsMini — ویرایشگر همکارانه اسناد",
  description:
    "ویرایشگر اسناد همکارانه و لحظه‌ای با پشتیبانی کامل از فارسی و راست‌چین. ساخته‌شده با Next.js و SignalR/Socket.io.",
  keywords: ["DocsMini", "ویرایشگر", "همکارانه", "فارسی", "راست‌چین", "Next.js"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${vazirmatn.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
