import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lobster Agent Trader — turn unspent AI tokens into running positions",
  description:
    "Keep a ledger of your idle monthly AI token allowance and hand it to an agent that decides, explains itself, and gets stopped by guardrails on Lighter.",
};

// Runs before paint: an explicit choice wins, otherwise follow the OS. Without
// the fallback a dark-preferring OS would render the light theme until the user
// touched the toggle.
const themeInit = `try{var k="lighter-trader-theme";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#f2f0f3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0e0b1a" media="(prefers-color-scheme: dark)" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f%5B%5D=clash-grotesk@400,500,600,700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
