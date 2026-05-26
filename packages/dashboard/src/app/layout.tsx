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
    "Public benchmarking and observability for Sui infrastructure providers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-bg-base font-sans text-text-primary antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
