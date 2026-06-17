"use client";

import type { ReactNode } from "react";

type SortDir = "asc" | "desc";

export interface Column<T> {
  key: string;
  header: string;
  /** Optional prose explanation shown in a hover tooltip on the column header. */
  tooltip?: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  className?: string;
}

function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function DataTable<T,>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir = "asc",
  onSort,
  className = "",
}: DataTableProps<T>) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  sortKey === col.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                onClick={
                  col.sortable && onSort
                    ? () => {
                        onSort(col.key);
                      }
                    : undefined
                }
                className={cx(
                  "px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted",
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left",
                  col.sortable &&
                    "cursor-pointer select-none hover:text-accent transition-colors",
                  sortKey === col.key && "text-accent",
                  col.className,
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.tooltip !== undefined && (
                    <span className="group/tip relative inline-flex cursor-help">
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="h-3 w-3 shrink-0 text-text-muted/50 group-hover/tip:text-accent transition-colors"
                        aria-hidden="true"
                      >
                        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="currentColor">i</text>
                      </svg>
                      <span
                        role="tooltip"
                        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-md border border-border bg-bg-raised px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-text-secondary shadow-xl group-hover/tip:visible"
                      >
                        {col.tooltip}
                      </span>
                    </span>
                  )}
                  {sortKey === col.key && (
                    <span aria-hidden="true">
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border-subtle transition-colors hover:bg-bg-raised group"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    "px-4 py-3 text-text-primary",
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left",
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
