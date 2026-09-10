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
 * Vai trò hệ thống (Doc03 UseCase).
 */
export const SystemRole = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TECHNICIAN: 'TECHNICIAN',
  REPORTER: 'REPORTER',
  VIEWER: 'VIEWER',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];
