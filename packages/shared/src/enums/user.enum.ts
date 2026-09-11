/**
 * Trạng thái User (Doc03).
 */
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Vai trò hệ thống (Doc04 §3.2: code-version cứng trong code, 4 vai trò).
 * Phân biệt với USER (Người sử dụng — người báo sự cố) đã được Doc04 phân loại.
 */
export const SystemRole = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TECHNICIAN: 'TECHNICIAN',
  USER: 'USER',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

/**
 * Trạng thái manual của asset (Doc04 §3.2).
 */
export const AssetManualState = {
  NORMAL: 'NORMAL',
  SUSPENDED: 'SUSPENDED',
  RETIRED: 'RETIRED',
} as const;
export type AssetManualState = (typeof AssetManualState)[keyof typeof AssetManualState];

/**
 * Trạng thái derived của asset (Doc04 §3.2 — view v_asset_state).
 * Mapping sang nhãn tiếng Việt: xem Q-08 trong plan rev. 6.1.
 */
export const AssetActivityStatus = {
  OPERATIONAL: 'OPERATIONAL',
  MAINTENANCE: 'MAINTENANCE',
  REPAIR: 'REPAIR',
  SUSPENDED: 'SUSPENDED',
  RETIRED: 'RETIRED',
} as const;
export type AssetActivityStatus = (typeof AssetActivityStatus)[keyof typeof AssetActivityStatus];
