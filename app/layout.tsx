import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "./nav";
import PwaRegister from "./pwa-register";
import PageTransition from "./page-transition";
import PullToRefresh from "./pull-to-refresh";
import { getAllAgents } from "../lib/agents";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Trading Agents — Paper Trading Dashboard",
  description: "Live decisions, trade logs, and performance analytics for autonomous paper trading agents — Plutus, Helios, and Hermes.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trading Agents",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const agents = await getAllAgents();
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        <PwaRegister />
        <PullToRefresh />
        <Nav agents={agents} />
        <main style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px 80px" }}>
          <PageTransition>{children}</PageTransition>
        </main>
      </body>
    </html>
  );
}
