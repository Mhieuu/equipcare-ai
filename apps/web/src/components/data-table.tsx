'use client';

import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (p: number) => void;
  };
  onRefresh?: () => void;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  emptyText = 'Không có dữ liệu',
  onRowClick,
  rowKey,
  pagination,
  onRefresh,
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 0;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="text-sm text-slate-600">
          {pagination && (
            <>
              Trang {pagination.page}/{totalPages} · {pagination.total} kết quả
            </>
          )}
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="btn-ghost text-xs">
            <RefreshCw className={clsx('h-3 w-3', loading && 'animate-spin')} />
            Làm mới
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.width ? { width: c.width } : undefined} className={c.className}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-slate-500 py-8">
                  Đang tải...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-slate-500 py-8">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <button
            className="btn-secondary text-xs"
            disabled={pagination.page <= 1}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Trước
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={pagination.page >= totalPages}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            Sau <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
