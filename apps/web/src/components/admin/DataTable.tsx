import type { ReactNode } from 'react';
import { Card, EmptyState, LoadingSkeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Table for administrative lists.
 *
 * Below the `lg` breakpoint it renders as a stack of cards rather than a
 * horizontally-scrolling table. A table squeezed onto a phone is technically
 * responsive and practically unusable; each column declares a `cardLabel` so
 * the stacked form reads as a labelled record.
 */

export interface Column<T> {
  /** Stable key, also used as the React key for the cell. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligned — use for money and counts. */
  numeric?: boolean;
  /** Hidden in the mobile card view when false. */
  showInCard?: boolean;
  /** Label shown beside the value in the card view. Defaults to `header`. */
  cardLabel?: string;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Rendered as the card headline on mobile. */
  cardTitle?: (row: T) => ReactNode;
  empty?: { title: string; description?: string; icon?: ReactNode; action?: ReactNode };
  toolbar?: ReactNode;
  footer?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  onRowClick,
  cardTitle,
  empty,
  toolbar,
  footer,
}: DataTableProps<T>) {
  return (
    <Card padded={false} className="overflow-hidden">
      {toolbar && <div className="flex flex-wrap gap-3 border-b border-border p-4">{toolbar}</div>}

      {loading ? (
        <div className="p-5">
          <LoadingSkeleton rows={6} />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={empty?.title ?? 'Nothing to show'}
            description={empty?.description}
            icon={empty?.icon}
            action={empty?.action}
          />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto scroll-slim lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn(
                        'px-5 py-3 font-medium',
                        column.numeric && 'text-right',
                        column.headerClassName,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-border transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-muted/40',
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn('px-5 py-4 align-middle', column.numeric && 'tabular text-right', column.className)}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <ul className="divide-y divide-border lg:hidden">
            {rows.map((row) => (
              <li key={rowKey(row)}>
                <div
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={cn('p-4', onRowClick && 'cursor-pointer transition-colors hover:bg-muted/40')}
                >
                  {cardTitle && <div className="mb-3 font-medium">{cardTitle(row)}</div>}
                  <dl className="space-y-1.5">
                    {columns
                      .filter((column) => column.showInCard !== false)
                      .map((column) => (
                        <div key={column.key} className="flex items-baseline justify-between gap-4 text-sm">
                          <dt className="shrink-0 text-xs text-muted-foreground">
                            {column.cardLabel ?? column.header}
                          </dt>
                          <dd className={cn('text-right', column.numeric && 'tabular')}>{column.render(row)}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {footer && <div className="border-t border-border p-4">{footer}</div>}
    </Card>
  );
}

/** Page-count footer for a paginated list. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="tabular text-xs text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <span className="tabular px-2 py-1.5 text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
