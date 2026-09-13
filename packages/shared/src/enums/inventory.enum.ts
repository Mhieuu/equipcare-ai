/**
 * Loai giao dich kho (Doc04 section 5.6 + 0007_inventory CHECK).
 *
 * ISSUE         - linh kien xuat kho cho WO (giam on_hand).
 * RETURN        - linh kien tra lai kho tu WO (tang on_hand). Phai gan original_stock_tx_id.
 * RECEIPT       - nhap kho (tang on_hand).
 * ADJUSTMENT    - dieu chinh thu cong (tang/giam on_hand, can reason).
 * TRANSFER_IN   - nhan chuyen kho noi bo (tang on_hand).
 * TRANSFER_OUT  - xuat chuyen kho noi bo (giam on_hand).
 */
export const StockTransactionType = {
  RECEIPT: 'RECEIPT',
  ISSUE: 'ISSUE',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
} as const;
export type StockTransactionType =
  (typeof StockTransactionType)[keyof typeof StockTransactionType];

/**
 * Movement type co anh huong tang on_hand (cho aggregation).
 */
export const STOCK_INBOUND: StockTransactionType[] = [
  StockTransactionType.RECEIPT,
  StockTransactionType.RETURN,
  StockTransactionType.TRANSFER_IN,
];
export const STOCK_OUTBOUND: StockTransactionType[] = [
  StockTransactionType.ISSUE,
  StockTransactionType.TRANSFER_OUT,
];
