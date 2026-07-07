import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NavBar } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SuiScope",
    template: "%s · SuiScope",
  },
  description:
    "Benchmark and monitor Sui blockchain infrastructure performance. Track provider metrics, latency, and network health in real-time.",
  openGraph: {
    type: "website",
    url: "https://scope.rubynodes.io/",
    title: "SuiScope - Blockchain Analytics Dashboard",
    description:
      "Benchmark and monitor Sui blockchain infrastructure performance. Track provider metrics, latency, and network health in real-time.",
    images: [
      {
        url: "https://scope.rubynodes.io/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    siteName: "SuiScope",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuiScope - Blockchain Analytics Dashboard",
    description:
      "Benchmark and monitor Sui blockchain infrastructure performance. Track provider metrics, latency, and network health in real-time.",
    images: ["https://scope.rubynodes.io/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-bg-base font-sans text-text-primary antialiased flex flex-col min-h-screen">
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border bg-bg-base/95 mt-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-text-muted sm:flex-row sm:px-6 lg:px-8">
            <p>
              Built by{" "}
              <a
                href="https://rubynodes.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-accent transition-colors"
              >
                Ruby Nodes
              </a>
              {" · "}
              Neutral infrastructure benchmarking for the Sui ecosystem.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/ruby-nodes/sui-scope"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-text-secondary hover:text-accent transition-colors"
                aria-label="SuiScope on GitHub"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span>ruby-nodes/sui-scope</span>
              </a>
              <a
                href="https://rubynodes.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-accent transition-colors"
              >
                rubynodes.io
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
