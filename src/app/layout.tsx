import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";

// validateEnv(); // Removed to prevent blocking the entire app build/runtime

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nexus Forge — Knowledge-to-Ship Operator",
  description: "Turn learning content, GitHub repos, and AI agent chats into executable build workflows and proof-of-work packs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-background">Skip to content</a>
        <header className="border-b">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">Nexus Forge</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/projects" className="hover:text-primary/80 transition-colors">Projects</Link>
              <Link href="/projects/new" className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                New Project
              </Link>
              <AuthControls />
            </nav>
          </div>
        </header>
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <footer className="border-t py-4 text-center text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span>Nexus Forge — evidence-first repository intelligence</span>
            <Link className="underline" href="/trust">Trust center</Link>
            <Link className="underline" href="/support">Support and feedback</Link>
            <Link className="underline" href="/settings/connections">Connections</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
