import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Analyst vs. Monkey",
  description: "A Claude-powered analyst vs. a random dart-throwing monkey, paper trading head to head.",
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Analyst v Monkey" },
};

export const viewport: Viewport = { themeColor: "#0a0c10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <header className="nav">
          <Link href="/" className="brand">Analyst <span className="muted">vs.</span> Monkey</Link>
          <nav>
            <Link href="/agent/analyst">Analyst</Link>
            <Link href="/agent/monkey">Monkey</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
