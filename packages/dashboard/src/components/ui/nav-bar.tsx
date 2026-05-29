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
              <li>
                <a
                  href="https://github.com/ruby-nodes/sui-scope"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 flex items-center gap-1.5 rounded border border-accent/30 bg-accent-dim px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  <span className="hidden sm:inline">Add your provider</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
