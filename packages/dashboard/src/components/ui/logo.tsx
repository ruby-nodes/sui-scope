import type { SVGProps } from "react";

/**
 * SuiScope periscope logo — concentric rings with crosshair ticks and a
 * centre dot, rendered with the brand cyan→sky gradient.
 *
 * Use className to control size, e.g. className="h-6 w-6".
 */
export function SuiScopeLogo({
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient
          id="scope-logo-grad"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#4da2ff" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      {/* Outer ring */}
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="url(#scope-logo-grad)"
        strokeWidth="1.25"
      />

      {/* Crosshair ticks — top, bottom, left, right */}
      <line
        x1="12" y1="1"
        x2="12" y2="5.5"
        stroke="url(#scope-logo-grad)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <line
        x1="12" y1="18.5"
        x2="12" y2="23"
        stroke="url(#scope-logo-grad)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <line
        x1="1"  y1="12"
        x2="5.5" y2="12"
        stroke="url(#scope-logo-grad)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <line
        x1="18.5" y1="12"
        x2="23"   y2="12"
        stroke="url(#scope-logo-grad)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      {/* Inner ring */}
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke="url(#scope-logo-grad)"
        strokeWidth="1.25"
      />

      {/* Centre dot */}
      <circle cx="12" cy="12" r="1.75" fill="url(#scope-logo-grad)" />
    </svg>
  );
}
