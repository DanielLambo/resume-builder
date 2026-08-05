import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { StoreProvider } from "@/components/providers/StoreProvider";
import { ToasterProvider } from "@/components/ToasterProvider";
import { TokenUsageProvider } from "@/lib/token-usage";

import "./globals.css";

export const metadata: Metadata = {
  title: "Resumate — Tailored resumes that stay honest",
  description:
    "Tailor your resume for every job with honest AI edits, hiring-manager reviews, and a one-page lock.",
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
        <StoreProvider>
          <TokenUsageProvider>
            {children}
            <ToasterProvider />
          </TokenUsageProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
