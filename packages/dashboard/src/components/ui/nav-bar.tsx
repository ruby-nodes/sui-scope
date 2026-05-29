"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SuiScopeLogo } from "./logo";

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Leaderboard" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/api", label: "API" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-base/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo / wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-text-primary hover:opacity-85 transition-opacity"
        >
          <SuiScopeLogo className="h-6 w-6 shrink-0" />
          <span className="text-sm">
            <span className="text-accent">Sui</span>
            <span>Scope</span>
          </span>
        </Link>

        {/* Live indicator + nav links */}
        <div className="flex items-center gap-5">
          {/* Pulsing LIVE dot */}
          <div className="hidden items-center gap-1.5 sm:flex" aria-label="Live monitoring active">
            <span className="inline-block h-2 w-2 rounded-full bg-tier-good animate-live-pulse" />
            <span className="text-xs font-medium uppercase tracking-widest text-text-muted">
              Live
            </span>
          </div>

          <nav aria-label="Main navigation">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map(({ href, label }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`rounded px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-accent-dim text-accent font-medium"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
