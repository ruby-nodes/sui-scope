"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Leaderboard" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-base/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo / wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-text-primary hover:text-accent transition-colors"
        >
          <span className="text-accent font-mono text-base">◈</span>
          SuiScope
        </Link>

        {/* Nav links */}
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
    </header>
  );
}
