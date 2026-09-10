/**
 * @equipcare/backend-core — domain core (KHÔNG chứa HTTP).
 * - PrismaService (singleton per process)
 * - RBAC policy + scope check (M2/M3 sẽ đầy đủ)
 * - State machine cho WO / Incident
 * - SLA engine (active_elapsed, is_overdue)
 * - Inventory domain
 *
 * API và worker cùng import package này; mỗi process có 1 PrismaService instance.
 */
export * from './prisma/prisma.service.js';
export * from './errors/app-error.js';
export * from './rbac/policy.js';
export * from './state-machine/work-order.machine.js';
export * from './sla/sla.engine.js';
