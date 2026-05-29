"use client";

import type { ReactNode } from "react";

type SortDir = "asc" | "desc";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
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
                )}
              >
                {col.header}
                {sortKey === col.key && (
                  <span aria-hidden="true" className="ml-1">
                    {sortDir === "asc" ? "↑" : "↓"}
                  </span>
                )}
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
