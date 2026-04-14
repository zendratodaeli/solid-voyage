import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { VisitorTracker } from "@/components/analytics/VisitorTracker";
import { UserActivityTracker } from "@/components/analytics/UserActivityTracker";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solid Voyage | Maritime Freight Intelligence",
  description: "Premium Freight Recommendation & Voyage Profitability Intelligence Platform for the maritime industry",
  keywords: ["maritime", "freight", "voyage", "chartering", "shipbroker", "TCE", "profitability"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
          <ThemeProvider>
            <VisitorTracker />
            <UserActivityTracker />
            {children}
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

