import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

// validateEnv(); // Removed to prevent blocking the entire app build/runtime

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hermes Forge — Knowledge-to-Ship Operator",
  description: "Turn learning content, GitHub repos, and AI agent chats into executable build workflows and proof-of-work packs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">Hermes Forge</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/projects" className="hover:text-primary/80 transition-colors">Projects</Link>
              <Link href="/projects/new" className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                New Project
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
        <footer className="border-t py-4 text-center text-xs text-muted-foreground">
          Hermes Forge — Built for Gappy AI National AI Hackathon
        </footer>
      </body>
    </html>
  );
}
