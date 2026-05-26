import type { ReactNode } from "react";

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({
  children,
  className = "",
}: PageContainerProps) {
  return (
    <div className={`mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}

export interface SectionHeadingProps {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function SectionHeading({
  children,
  as: Tag = "h2",
  className = "",
}: SectionHeadingProps) {
  const sizeClass =
    Tag === "h1" ? "text-3xl" : Tag === "h2" ? "text-xl" : "text-lg";
  return (
    <Tag
      className={`font-semibold tracking-tight text-text-primary ${sizeClass} ${className}`}
    >
      {children}
    </Tag>
  );
}
