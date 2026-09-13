'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle, Package2 } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/modal';

interface Part {
  id: string;
  code: string;
  name: string;
  unit: string;
  onHand: string;
  minimumStock: string;
  referencePrice: string | null;
  isActive: boolean;
  department: { id: string; name: string };
  location: { id: string; name: string };
  updatedAt: string;
}

export default function PartsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [receiptModal, setReceiptModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [receiptQty, setReceiptQty] = useState('');
  const [receiptNote, setReceiptNote] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['parts', filter],
    queryFn: () =>
      apiGet<{ items: Part[]; total: number }>('/parts', {
        lowStock: filter === 'low' ? 'true' : undefined,
        limit: 100,
      }),
  });

  const lowStockCount = data?.items.filter((p) => Number(p.onHand) <= Number(p.minimumStock)).length ?? 0;

  const submitReceipt = async () => {
    if (!selectedPart || !receiptQty) return;
    try {
      await apiPost('/stock-transactions/receipt', {
        partId: selectedPart.id,
        quantity: Number(receiptQty),
        sourceNote: receiptNote || undefined,
      });
      toast.success('Đã nhập kho', `${selectedPart.code} +${receiptQty}`);
      setReceiptModal(false);
      setSelectedPart(null);
      setReceiptQty('');
      setReceiptNote('');
      void qc.invalidateQueries({ queryKey: ['parts'] });
    } catch (e) {
      toast.error('Lỗi', (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Linh kiện / Kho</h1>
        {hasPermission('inventory:part:create') && (
          <button
            className="btn-primary"
            onClick={() => toast.info('Tạo linh kiện', 'Dùng API POST /parts hoặc tạo trong admin')}
          >
            <Plus className="h-4 w-4" /> Tạo linh kiện
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Tất cả
        </button>
        <button
          onClick={() => setFilter('low')}
          className={`btn ${filter === 'low' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Sắp hết ({lowStockCount})
        </button>
      </div>

      <DataTable
        rowKey={(r) => r.id}
        loading={isLoading}
        onRefresh={() => refetch()}
        pagination={{
          page: 1,
          pageSize: 100,
          total: data?.total ?? 0,
          onPageChange: () => {},
        }}
        columns={[
          { key: 'code', header: 'Mã', render: (r) => <span className="font-mono">{r.code}</span>, width: '150px' },
          { key: 'name', header: 'Tên', render: (r) => r.name },
          {
            key: 'onHand',
            header: 'Tồn kho',
            render: (r) => {
              const isLow = Number(r.onHand) <= Number(r.minimumStock);
              return (
                <span className={isLow ? 'badge-red' : 'badge-green'}>
                  {r.onHand} {r.unit}
                </span>
              );
            },
            width: '120px',
          },
          { key: 'min', header: 'Tối thiểu', render: (r) => `${r.minimumStock} ${r.unit}`, width: '120px' },
          { key: 'price', header: 'Giá', render: (r) => r.referencePrice ? `${Number(r.referencePrice).toLocaleString('vi-VN')} đ` : '—', width: '120px' },
          { key: 'dept', header: 'Phòng ban', render: (r) => r.department.name },
          { key: 'loc', header: 'Vị trí', render: (r) => r.location.name },
          {
            key: 'actions',
            header: '',
            render: (r) =>
              hasPermission('inventory:receipt') && (
                <button
                  className="btn-secondary text-xs"
                  onClick={() => {
                    setSelectedPart(r);
                    setReceiptModal(true);
                  }}
                >
                  <Package2 className="h-3 w-3" /> Nhập
                </button>
              ),
            width: '80px',
          },
        ]}
        rows={data?.items ?? []}
      />

      <Modal
        open={receiptModal}
        onClose={() => setReceiptModal(false)}
        title={selectedPart ? `Nhập kho: ${selectedPart.code}` : ''}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setReceiptModal(false)}>Hủy</button>
            <button className="btn-primary" onClick={submitReceipt} disabled={!receiptQty}>
              Xác nhận nhập
            </button>
          </>
        }
      >
        {selectedPart && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Hiện tại: <span className="font-medium">{selectedPart.onHand} {selectedPart.unit}</span>
            </p>
            <div>
              <label className="label">Số lượng nhập *</label>
              <input type="number" className="input" value={receiptQty} onChange={(e) => setReceiptQty(e.target.value)} min="0.001" step="any" />
            </div>
            <div>
              <label className="label">Ghi chú</label>
              <input className="input" value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} placeholder="Nhà cung cấp, số HĐ..." />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
