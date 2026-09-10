/**
 * Loại giao dịch kho (Doc04).
 */
export const StockTransactionType = {
  RECEIPT: 'RECEIPT',           // nhập kho
  ISSUE: 'ISSUE',               // xuất cho WO
  RETURN: 'RETURN',             // trả lại kho
  ADJUSTMENT: 'ADJUSTMENT',     // điều chỉnh (kiểm kê)
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
} as const;
export type StockTransactionType =
  (typeof StockTransactionType)[keyof typeof StockTransactionType];
