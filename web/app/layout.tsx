import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { ToasterProvider } from "@/components/ToasterProvider";
import { TokenUsageProvider } from "@/lib/token-usage";

import "./globals.css";

export const metadata: Metadata = {
  title: "Typesetter · Resumate",
  description: "A bright typography studio for clean, tailored resumes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-studio-bg font-sans text-studio-ink antialiased">
        <TokenUsageProvider>
          {children}
          <ToasterProvider />
        </TokenUsageProvider>
      </body>
    </html>
  );
}
