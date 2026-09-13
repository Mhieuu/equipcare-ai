/**
 * Rich demo data seeder — bổ sung dữ liệu phong phú để demo / bảo vệ.
 *
 * Bổ sung vào dữ liệu đã có từ seed.ts:
 * - 4 departments (NSX, QC, Kho, Bảo trì) + 5 locations
 * - 3 asset types (Pump, Motor, Conveyor)
 * - 12 demo users cho 4 roles (Manager/Technician/Reporter/Admin)
 * - 20 assets với nhiều trạng thái
 * - 50 incidents (đủ các trạng thái)
 * - 50 work orders (kanban đầy đủ các cột)
 * - 30 maintenance plans với occurrences
 * - 25 parts với stock + transactions
 * - 30 approvals (draft/pending/approved/rejected)
 * - 40 cost entries
 * - 30 notifications
 * - 100 audit logs
 * - 10 AI requests
 *
 * Idempotent: chạy nhiều lần vẫn ổn (skip nếu đã có data marker).
 *
 * Usage:
 *   pnpm db:demo-seed
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../.env'),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import {
  BOOTSTRAP_ADMIN_ID,
  BOOTSTRAP_DEPARTMENT_ID,
  BOOTSTRAP_LOCATION_ID,
  ROLE_ADMIN_ID,
  ROLE_MANAGER_ID,
  ROLE_TECHNICIAN_ID,
  ROLE_USER_ID,
} from './seed-constants';

const prisma = new PrismaClient();

const DEMO_MARKER = 'DEMO_SEED_MARKER_V1';

// ---- Helpers ---------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pastDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
}
function futureDate(daysAhead: number): Date {
  return new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
}

// ---- Demo reference IDs (stable for FK references) -------------------------
const DEMO_DEPT_IDS = {
  NSX: '10000000-0000-4000-8000-000000000001',
  QC: '10000000-0000-4000-8000-000000000002',
  KHO: '10000000-0000-4000-8000-000000000003',
  BAOTRI: '10000000-0000-4000-8000-000000000004',
};

const DEMO_LOC_IDS = {
  NSX_A: '20000000-0000-4000-8000-000000000001',
  NSX_B: '20000000-0000-4000-8000-000000000002',
  QC_LAB: '20000000-0000-4000-8000-000000000003',
  KHO_TONG: '20000000-0000-4000-8000-000000000004',
  KHO_PHUTUNG: '20000000-0000-4000-8000-000000000005',
  BT_XUONG: '20000000-0000-4000-8000-000000000006',
};

const DEMO_ASSET_TYPE_IDS = {
  PUMP: '30000000-0000-4000-8000-000000000001',
  MOTOR: '30000000-0000-4000-8000-000000000002',
  CONVEYOR: '30000000-0000-4000-8000-000000000003',
  COMPRESSOR: '30000000-0000-4000-8000-000000000004',
};

const DEMO_USERS = {
  manager1: '50000000-0000-4000-8000-000000000001',
  manager2: '50000000-0000-4000-8000-000000000002',
  tech1: '50000000-0000-4000-8000-000000000011',
  tech2: '50000000-0000-4000-8000-000000000012',
  tech3: '50000000-0000-4000-8000-000000000013',
  tech4: '50000000-0000-4000-8000-000000000014',
  reporter1: '50000000-0000-4000-8000-000000000021',
  reporter2: '50000000-0000-4000-8000-000000000022',
  reporter3: '50000000-0000-4000-8000-000000000023',
};

// ---- Demo content pools ---------------------------------------------------
const ASSET_NAMES = [
  'Bơm ly tâm P-100',
  'Bơm ly tâm P-200',
  'Motor điện 3 pha 15kW',
  'Motor điện 3 pha 22kW',
  'Băng tải cao su BC-01',
  'Băng tải xích BX-02',
  'Máy nén khí AC-50',
  'Máy nén khí AC-100',
  'Bơm bánh răng BR-05',
  'Bơm chân không VC-30',
  'Motor servo 7.5kW',
  'Băng tải PVC BC-03',
  'Bơm thủy lực HL-150',
  'Máy thổi khí BL-20',
  'Motor DC 24V',
  'Băng tải con lăn CL-04',
  'Bơm màng MP-40',
  'Bơm trục vít TS-08',
  'Motor giảm tốc GT-22',
  'Máy nén trục vít AC-75',
];

const INCIDENT_DESCRIPTIONS = [
  'Thiết bị phát ra tiếng kêu bất thường khi vận hành',
  'Rò rỉ dầu tại vị trí phớt trục chính',
  'Nhiệt độ vỏ motor vượt ngưỡng 80°C',
  'Bơm không đạt áp suất theo yêu cầu',
  'Băng tải bị trượt khỏi puli',
  'Dòng điện tăng đột biến, relay nhảy',
  'Xuất hiện rung lắc mạnh ở tần số cao',
  'Bơm chạy nhưng không có lưu lượng đầu ra',
  'Áp suất đầu ra giảm 30% so với định mức',
  'Motor khởi động nhưng dừng sau 2 phút',
  'Đường ống xả bị tắc nghẽn',
  'Hệ thống bôi trơn tự động báo lỗi',
  'Tiếng gõ cơ khí trong hộp số',
  'Bơm bị quá nhiệt sau 30 phút vận hành',
  'Lỗi cảm biến áp suất đầu vào',
];

const INCIDENT_IMPACTS = [
  'Giảm 25% công suất dây chuyền',
  'Dừng sản xuất 1 ca, ảnh hưởng giao hàng',
  'Có nguy cơ cháy nổ nếu không xử lý',
  'Gây tiếng ồn lớn, ảnh hưởng khu vực lân cận',
  'Chưa ảnh hưởng sản xuất nhưng có nguy cơ',
  'Mất an toàn vận hành, đã dừng khẩn cấp',
];

const WO_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const WO_KINDS = ['REPAIR', 'MAINTENANCE', 'INSPECTION'] as const;
const WO_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'CANCELLED'] as const;
const INCIDENT_STATUSES = ['NEW', 'AWAITING_INFO', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
const APPROVAL_STATUSES = ['DRAFT', 'SUBMITTED', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

const PART_NAMES = [
  ['Vòng bi SKF 6205', 'PCS', 350000],
  ['Vòng bi SKF 6308', 'PCS', 580000],
  ['Phớt dầu 25x40x7', 'PCS', 85000],
  ['Dây curoa B-2000', 'PCS', 220000],
  ['Dầu bôi trơn Shell 46', 'LIT', 95000],
  ['Mỡ bôi trơn Lithium', 'KG', 180000],
  ['Cầu chì 30A', 'PCS', 35000],
  ['Contactor LS 40A', 'PCS', 720000],
  ['Relay nhiệt LS 25A', 'PCS', 380000],
  ['Cảm biến áp suất PT-100', 'PCS', 1450000],
  ['Cảm biến nhiệt PT-1000', 'PCS', 980000],
  ['Bộ lọc khí F-50', 'PCS', 240000],
  ['Bộ lọc dầu H-100', 'PCS', 195000],
  ['Bulong M16x60', 'PCS', 12000],
  ['Đai ốc M16', 'PCS', 6000],
  ['Gioăng cao su 80x100', 'PCS', 45000],
  ['Motor điện 3 pha 11kW', 'PCS', 8500000],
  ['Bơm dầu thủy lực HP-30', 'PCS', 6500000],
  ['Bộ ly hợp khô CL-200', 'PCS', 3200000],
  ['Tụ điện 50uF', 'PCS', 75000],
  ['CB 3 pha 63A', 'PCS', 850000],
  ['Đèn báo LED 24V', 'PCS', 25000],
  ['Công tắc hành trình', 'PCS', 165000],
  ['Van điện từ 24VDC', 'PCS', 980000],
  ['Ống cao su chịu áp', 'M', 65000],
] as const;

const SUPPLIERS = ['Schneider Electric', 'Siemens', 'ABB', 'Festo', 'SKF Vietnam', 'Bosch Rexroth'];

const DOC = {
  /**
   * Idempotent marker: nếu đã có notification với event_key này → skip toàn bộ demo seed.
   */
  async isSeeded(): Promise<boolean> {
    const exists = await prisma.notifications.findFirst({
      where: { event_key: DEMO_MARKER },
    });
    return exists !== null;
  },

  async markSeeded(): Promise<void> {
    await prisma.notifications.create({
      data: {
        recipient_id: BOOTSTRAP_ADMIN_ID,
        event_key: DEMO_MARKER,
        event_type: 'SYSTEM',
        title: 'Demo seed đã chạy thành công',
        object_type: 'system',
        object_key: BOOTSTRAP_ADMIN_ID,
      },
    });
  },

  async clearMarker(): Promise<void> {
    await prisma.notifications.deleteMany({
      where: { event_key: DEMO_MARKER },
    });
  },

  // ----------------------------------------------------------------
  // 1. Departments + Locations + Asset Types
  // ----------------------------------------------------------------
  async seedOrg(): Promise<void> {
    console.info('[demo] seeding departments/locations/asset-types');

    // Departments
    const deptRows = [
      { id: DEMO_DEPT_IDS.NSX, code: 'DEPT-NSX', name: 'Phân xưởng sản xuất' },
      { id: DEMO_DEPT_IDS.QC, code: 'DEPT-QC', name: 'Phòng Quản lý Chất lượng' },
      { id: DEMO_DEPT_IDS.KHO, code: 'DEPT-KHO', name: 'Kho vật tư' },
      { id: DEMO_DEPT_IDS.BAOTRI, code: 'DEPT-BT', name: 'Phòng Bảo trì' },
    ];
    for (const d of deptRows) {
      await prisma.departments.upsert({
        where: { id: d.id },
        update: { code: d.code, name: d.name, is_active: true },
        create: { id: d.id, code: d.code, name: d.name, is_active: true },
      });
    }

    // Locations (parent-child tree)
    const locRows = [
      { id: DEMO_LOC_IDS.NSX_A, code: 'LOC-NSX-A', name: 'Xưởng A - Khu vực 1', parent: null },
      { id: DEMO_LOC_IDS.NSX_B, code: 'LOC-NSX-B', name: 'Xưởng B - Khu vực 2', parent: null },
      { id: DEMO_LOC_IDS.QC_LAB, code: 'LOC-QC-LAB', name: 'Phòng thí nghiệm QC', parent: null },
      { id: DEMO_LOC_IDS.KHO_TONG, code: 'LOC-KHO-TONG', name: 'Kho tổng', parent: null },
      { id: DEMO_LOC_IDS.KHO_PHUTUNG, code: 'LOC-KHO-PT', name: 'Kho phụ tùng', parent: DEMO_LOC_IDS.KHO_TONG },
      { id: DEMO_LOC_IDS.BT_XUONG, code: 'LOC-BT-XUONG', name: 'Xưởng bảo trì', parent: null },
    ];
    for (const l of locRows) {
      await prisma.locations.upsert({
        where: { id: l.id },
        update: { code: l.code, name: l.name, parent_id: l.parent, is_active: true },
        create: {
          id: l.id,
          code: l.code,
          name: l.name,
          parent_id: l.parent,
          is_active: true,
        },
      });
    }

    // Asset types
    const atRows = [
      { id: DEMO_ASSET_TYPE_IDS.PUMP, code: 'AT-PUMP', name: 'Bơm công nghiệp' },
      { id: DEMO_ASSET_TYPE_IDS.MOTOR, code: 'AT-MOTOR', name: 'Motor điện' },
      { id: DEMO_ASSET_TYPE_IDS.CONVEYOR, code: 'AT-CONVEYOR', name: 'Băng tải' },
      { id: DEMO_ASSET_TYPE_IDS.COMPRESSOR, code: 'AT-COMPRESSOR', name: 'Máy nén khí' },
    ];
    for (const a of atRows) {
      await prisma.asset_types.upsert({
        where: { id: a.id },
        update: { code: a.code, name: a.name, is_active: true },
        create: { id: a.id, code: a.code, name: a.name, is_active: true },
      });
    }
  },

  // ----------------------------------------------------------------
  // 2. Users + Roles + Access scopes
  // ----------------------------------------------------------------
  async seedUsers(): Promise<void> {
    console.info('[demo] seeding demo users + roles');
    const pwd = await bcrypt.hash('Demo@2026', 10);

    const userRows: Array<{
      id: string;
      login: string;
      fullName: string;
      email: string;
      role: 'MANAGER' | 'TECHNICIAN' | 'USER';
      departmentId: string;
    }> = [
      { id: DEMO_USERS.manager1, login: 'demo.manager1', fullName: 'Nguyễn Văn Quản', email: 'manager1@equipcare.local', role: 'MANAGER', departmentId: BOOTSTRAP_DEPARTMENT_ID },
      { id: DEMO_USERS.manager2, login: 'demo.manager2', fullName: 'Trần Thị Lý', email: 'manager2@equipcare.local', role: 'MANAGER', departmentId: BOOTSTRAP_DEPARTMENT_ID },
      { id: DEMO_USERS.tech1, login: 'demo.tech1', fullName: 'Lê Văn Kỹ', email: 'tech1@equipcare.local', role: 'TECHNICIAN', departmentId: DEMO_DEPT_IDS.BAOTRI },
      { id: DEMO_USERS.tech2, login: 'demo.tech2', fullName: 'Phạm Văn Thuận', email: 'tech2@equipcare.local', role: 'TECHNICIAN', departmentId: DEMO_DEPT_IDS.BAOTRI },
      { id: DEMO_USERS.tech3, login: 'demo.tech3', fullName: 'Hoàng Văn Tài', email: 'tech3@equipcare.local', role: 'TECHNICIAN', departmentId: DEMO_DEPT_IDS.BAOTRI },
      { id: DEMO_USERS.tech4, login: 'demo.tech4', fullName: 'Vũ Văn Sửa', email: 'tech4@equipcare.local', role: 'TECHNICIAN', departmentId: DEMO_DEPT_IDS.BAOTRI },
      { id: DEMO_USERS.reporter1, login: 'demo.reporter1', fullName: 'Đỗ Văn Báo', email: 'reporter1@equipcare.local', role: 'USER', departmentId: DEMO_DEPT_IDS.NSX },
      { id: DEMO_USERS.reporter2, login: 'demo.reporter2', fullName: 'Bùi Thị Sự', email: 'reporter2@equipcare.local', role: 'USER', departmentId: DEMO_DEPT_IDS.QC },
      { id: DEMO_USERS.reporter3, login: 'demo.reporter3', fullName: 'Cao Văn Cố', email: 'reporter3@equipcare.local', role: 'USER', departmentId: DEMO_DEPT_IDS.NSX },
    ];

    for (const u of userRows) {
      await prisma.users.upsert({
        where: { id: u.id },
        update: {
          full_name: u.fullName,
          email: u.email,
          department_id: u.departmentId,
          must_change_password: false,
        },
        create: {
          id: u.id,
          login_name: u.login,
          full_name: u.fullName,
          email: u.email,
          department_id: u.departmentId,
          password_hash: pwd,
          is_locked: false,
          must_change_password: false,
          auth_version: 1,
        },
      });

      // Grant role (idempotent via user_id+role_id lookup)
      const roleId = u.role === 'MANAGER' ? ROLE_MANAGER_ID : u.role === 'TECHNICIAN' ? ROLE_TECHNICIAN_ID : ROLE_USER_ID;
      const existingRole = await prisma.user_roles.findFirst({
        where: { user_id: u.id, role_id: roleId },
      });
      const userRoleId = existingRole?.id ?? randomUUID();
      if (!existingRole) {
        await prisma.user_roles.create({
          data: {
            id: userRoleId,
            user_id: u.id,
            role_id: roleId,
            is_active: true,
            granted_by: BOOTSTRAP_ADMIN_ID,
          },
        });
      } else {
        await prisma.user_roles.update({
          where: { id: existingRole.id },
          data: { is_active: true, revoked_at: null },
        });
      }

      // Global scope for demo (check existing first)
      const existingScope = await prisma.access_scopes.findFirst({ where: { user_role_id: userRoleId } });
      if (!existingScope) {
        await prisma.access_scopes.create({
          data: {
            id: randomUUID(),
            user_role_id: userRoleId,
            scope_type: 'GLOBAL',
            is_active: true,
            granted_by: BOOTSTRAP_ADMIN_ID,
          },
        });
      }
    }
  },

  // ----------------------------------------------------------------
  // 3. Assets
  // ----------------------------------------------------------------
  async seedAssets(): Promise<number> {
    console.info('[demo] seeding assets');
    const depts = [BOOTSTRAP_DEPARTMENT_ID, DEMO_DEPT_IDS.NSX, DEMO_DEPT_IDS.QC, DEMO_DEPT_IDS.BAOTRI];
    const locs = [BOOTSTRAP_LOCATION_ID, DEMO_LOC_IDS.NSX_A, DEMO_LOC_IDS.NSX_B, DEMO_LOC_IDS.QC_LAB, DEMO_LOC_IDS.BT_XUONG];
    const typeIds = [
      DEMO_ASSET_TYPE_IDS.PUMP,
      DEMO_ASSET_TYPE_IDS.MOTOR,
      DEMO_ASSET_TYPE_IDS.CONVEYOR,
      DEMO_ASSET_TYPE_IDS.COMPRESSOR,
    ];

    let count = 0;
    for (let i = 0; i < 20; i++) {
      const code = `DEMO-AST-${String(Date.now()).slice(-9)}-${i}`;
      const name = ASSET_NAMES[i % ASSET_NAMES.length]!;
      const dept = depts[i % depts.length]!;
      const loc = locs[i % locs.length]!;
      const typeId = typeIds[i % typeIds.length]!;
      const state = i % 7 === 0 ? 'SUSPENDED' : 'NORMAL';

      await prisma.assets.create({
        data: {
          code,
          name,
          asset_type_id: typeId,
          department_id: dept,
          location_id: loc,
          serial_number: `SN-${1000 + i}`,
          supplier_name: pick([...SUPPLIERS]),
          purchased_on: pastDate(200 + i * 10),
          commissioned_on: pastDate(150 + i * 5),
          warranty_until: futureDate(180 - i * 3),
          qr_key: randomUUID(),
          manual_state: state,
          state_reason: state === 'SUSPENDED' ? 'Bảo trì định kỳ' : null,
          created_by: BOOTSTRAP_ADMIN_ID,
        },
      });
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 4. Parts
  // ----------------------------------------------------------------
  async seedParts(): Promise<number> {
    console.info('[demo] seeding parts');
    let count = 0;
    for (let i = 0; i < PART_NAMES.length; i++) {
      const [name, unit, price] = PART_NAMES[i]!;
      const code = `PART-${String(i + 1).padStart(4, '0')}`;
      const isLow = i % 4 === 0; // 25% low stock for demo
      const onHand = isLow ? Math.random() * 4 : 30 + Math.random() * 100;
      await prisma.parts.create({
        data: {
          code,
          name,
          unit,
          department_id: DEMO_DEPT_IDS.KHO,
          location_id: DEMO_LOC_IDS.KHO_PHUTUNG,
          on_hand: Number(onHand.toFixed(3)),
          minimum_stock: 5,
          reference_price: price,
          supplier_name: pick([...SUPPLIERS]),
          requires_approval: price > 500000 || i % 5 === 0,
        },
      });
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 5. Stock transactions (initial receipt for each part)
  // ----------------------------------------------------------------
  async seedStockInitial(): Promise<void> {
    console.info('[demo] seeding initial stock receipts');
    const parts = await prisma.parts.findMany({ where: { code: { startsWith: 'PART-' } } });
    for (const p of parts) {
      // Skip if already has stock tx
      const existing = await prisma.stock_transactions.count({ where: { part_id: p.id } });
      if (existing > 0) continue;
      await prisma.stock_transactions.create({
        data: {
          part_id: p.id,
          movement_type: 'RECEIPT',
          quantity: p.on_hand,
          unit_price_snapshot: p.reference_price,
          actor_id: DEMO_USERS.manager1,
          reason: 'Nhập kho ban đầu',
          occurred_at: pastDate(30),
          operation_key: randomUUID(),
        },
      });
    }
  },

  // ----------------------------------------------------------------
  // 6. Maintenance plans + occurrences
  // ----------------------------------------------------------------
  async seedMaintenancePlans(): Promise<number> {
    console.info('[demo] seeding maintenance plans');
    const assets = await prisma.assets.findMany({
      where: { code: { startsWith: 'DEMO-AST-' } },
      take: 10,
    });

    let count = 0;
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]!;
      // Check if plan already exists for this asset
      const existing = await prisma.maintenance_plans.count({ where: { asset_id: asset.id } });
      if (existing > 0) continue;

      const intervalUnit = i % 3 === 0 ? 'WEEK' : 'MONTH';
      const intervalValue = intervalUnit === 'WEEK' ? 2 : 1;
      const startOn = pastDate(60);

      const plan = await prisma.maintenance_plans.create({
        data: {
          asset_id: asset.id,
          name: `Kế hoạch BT định kỳ - ${asset.code}`,
          interval_unit: intervalUnit,
          interval_value: intervalValue,
          start_on: startOn,
          schedule_basis: 'FIXED',
          next_due_on: futureDate(i % 3 === 0 ? -2 : 7),
          checklist: [
            { item: 'Kiểm tra dầu bôi trơn', required: true },
            { item: 'Kiểm tra vòng bi', required: true },
            { item: 'Vệ sinh thiết bị', required: false },
            { item: 'Đo độ rung', required: true },
            { item: 'Kiểm tra điện áp', required: true },
          ],
          created_by: DEMO_USERS.manager1,
        },
      });

      // Generate a few occurrences
      const occurrenceDates: Date[] = [];
      for (let j = -2; j <= 2; j++) {
        const d = new Date(plan.next_due_on!);
        if (intervalUnit === 'WEEK') {
          d.setDate(d.getDate() + j * intervalValue * 7);
        } else {
          d.setMonth(d.getMonth() + j * intervalValue);
        }
        occurrenceDates.push(d);
      }

      for (let k = 0; k < occurrenceDates.length; k++) {
        const dueOn = occurrenceDates[k]!;
        const status =
          k < 2 ? 'COMPLETED' : k === 2 ? (i % 3 === 0 ? 'OVERDUE' : 'PLANNED') : 'PLANNED';
        try {
          await prisma.maintenance_occurrences.create({
            data: {
              plan_id: plan.id,
              asset_id: asset.id,
              due_on: dueOn,
              status,
              plan_version: plan.row_version,
              plan_snapshot: plan as unknown as object,
            },
          });
        } catch {
          // Skip unique constraint violation
        }
      }
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 7. Incidents
  // ----------------------------------------------------------------
  async seedIncidents(): Promise<number> {
    console.info('[demo] seeding incidents');
    const assets = await prisma.assets.findMany({ where: { code: { startsWith: 'DEMO-AST-' } } });
    const reporters = [DEMO_USERS.reporter1, DEMO_USERS.reporter2, DEMO_USERS.reporter3];

    let count = 0;
    for (let i = 0; i < 30; i++) {
      const code = `INC-${String(Date.now()).slice(-7)}-${String(i).padStart(2, '0')}`;
      const asset = assets[i % assets.length]!;
      const reporter = reporters[i % reporters.length]!;
      const status = pick([...INCIDENT_STATUSES]);
      const priority = pick([...WO_PRIORITIES]);
      const occurredAt = pastDate(Math.floor(Math.random() * 30));

      const incident = await prisma.incidents.create({
        data: {
          code,
          asset_id: asset.id,
          reporter_id: reporter,
          description: pick([...INCIDENT_DESCRIPTIONS]),
          impact_description: pick([...INCIDENT_IMPACTS]),
          occurred_at: occurredAt,
          priority_code: priority,
          confirmed_category: pick(['Hư hỏng cơ khí', 'Lỗi điện', 'Bảo dưỡng kém', 'Lỗi vận hành']),
          status,
          resolved_at: ['RESOLVED', 'CLOSED'].includes(status) ? pastDate(Math.floor(Math.random() * 5)) : null,
          closed_at: status === 'CLOSED' ? pastDate(Math.floor(Math.random() * 3)) : null,
          closed_by: status === 'CLOSED' ? DEMO_USERS.manager1 : null,
          department_id: asset.department_id,
        },
      });

      // Add 1-2 messages per incident
      const msgCount = 1 + Math.floor(Math.random() * 2);
      for (let m = 0; m < msgCount; m++) {
        await prisma.incident_messages.create({
          data: {
            incident_id: incident.id,
            author_id: m === 0 ? reporter : pick([DEMO_USERS.tech1, DEMO_USERS.tech2, DEMO_USERS.manager1]),
            message_type: pick(['REPORTER', 'STAFF', 'STAFF']),
            body: pick([
              'Đã kiểm tra sơ bộ, xác định nguyên nhân ban đầu.',
              'Cần dừng máy để xử lý an toàn.',
              'Đã gửi yêu cầu mua phụ tùng thay thế.',
              'Kỹ thuật viên đang trên đường tới.',
              'Xác nhận lỗi, cần lên phương án xử lý.',
            ]),
          },
        });
      }
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 8. Work orders
  // ----------------------------------------------------------------
  async seedWorkOrders(): Promise<number> {
    console.info('[demo] seeding work orders');
    const incidents = await prisma.incidents.findMany({
      where: { code: { startsWith: 'INC-' } },
    });
    const assets = await prisma.assets.findMany({ where: { code: { startsWith: 'DEMO-AST-' } } });
    const techs = [DEMO_USERS.tech1, DEMO_USERS.tech2, DEMO_USERS.tech3, DEMO_USERS.tech4];

    // Pick which incidents get a WO (max one WO per incident due to unique constraint)
    const incidentSubset = incidents.slice(0, 15);

    let count = 0;
    for (let i = 0; i < 30; i++) {
      const code = `WO-DEMO-${String(Date.now()).slice(-7)}-${String(i).padStart(2, '0')}`;
      const incident = incidentSubset[i % incidentSubset.length];
      // For i >= incidentSubset.length, no incident (manual WO)
      const useIncident = i < incidentSubset.length;
      const assetId = useIncident && incident ? incident.asset_id : assets[i % assets.length]!.id;
      const deptAsset = assets.find((a) => a.id === assetId)!;
      const kind = pick([...WO_KINDS]);
      const priority = pick([...WO_PRIORITIES]);
      const status = pick([...WO_STATUSES]);

      // Due date: overdue for some, in future for others
      const dueAt = i % 3 === 0 ? pastDate(Math.floor(Math.random() * 5)) : futureDate(1 + Math.floor(Math.random() * 14));

      const wo = await prisma.work_orders.create({
        data: {
          code,
          asset_id: assetId,
          kind,
          incident_id: useIncident && incident ? incident.id : null,
          creation_mode: useIncident ? 'FROM_INCIDENT' : 'MANUAL',
          description: pick([
            `Xử lý sự cố ${kind.toLowerCase()} trên thiết bị ${deptAsset.code}`,
            `Bảo trì định kỳ ${deptAsset.name} theo lịch`,
            `Kiểm tra và đánh giá tình trạng ${deptAsset.name}`,
            `Thay thế phụ tùng theo yêu cầu ${deptAsset.code}`,
            `Sửa chữa khẩn cấp cho ${deptAsset.name}`,
          ]),
          priority_code: priority,
          due_at: dueAt,
          status,
          started_at: ['IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED'].includes(status) ? pastDate(Math.floor(Math.random() * 5)) : null,
          completed_at: status === 'COMPLETED' ? pastDate(Math.floor(Math.random() * 2)) : null,
          assignee_id: status === 'NEW' ? null : techs[i % techs.length]!,
          created_by: DEMO_USERS.manager1,
          department_id_snapshot: deptAsset.department_id,
          action_taken: status === 'COMPLETED' ? 'Đã thay thế phụ tùng, vệ sinh và chạy thử ổn định' : null,
          result_summary: status === 'COMPLETED' ? 'Thiết bị vận hành bình thường' : null,
          confirmed_cause: status !== 'NEW' ? pick(['Hỏng vòng bi', 'Hết dầu bôi trơn', 'Mòn phớt', 'Lỏng bulong']) : null,
        },
      });

      // Add 1-3 notes
      const noteCount = Math.floor(Math.random() * 3);
      for (let n = 0; n < noteCount; n++) {
        await prisma.work_order_notes.create({
          data: {
            work_order_id: wo.id,
            author_id: wo.assignee_id ?? DEMO_USERS.manager1,
            note_type: pick(['PROGRESS', 'PROGRESS', 'PROGRESS']),
            note: pick([
              'Đã kiểm tra sơ bộ, xác định nguyên nhân',
              'Cần thay thế vòng bi SKF 6308',
              'Đang chờ phụ tùng',
              'Đã tiến hành vệ sinh, tra dầu',
              'Test chạy không tải: ổn định',
            ]),
          },
        });
      }
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 9. Approvals
  // ----------------------------------------------------------------
  async seedApprovals(): Promise<number> {
    console.info('[demo] seeding approvals');
    const wos = await prisma.work_orders.findMany({
      where: { code: { startsWith: 'WO-DEMO-' } },
      include: { asset: true },
    });
    const parts = await prisma.parts.findMany({ take: 10 });

    // One approval per WO (unique constraint on work_order_id)
    let count = 0;
    for (let i = 0; i < Math.min(15, wos.length); i++) {
      const wo = wos[i]!;
      const code = `APR-DEMO-${String(Date.now()).slice(-7)}-${String(i).padStart(2, '0')}`;
      const status = pick([...APPROVAL_STATUSES]);

      const approval = await prisma.approvals.create({
        data: {
          code,
          work_order_id: wo.id,
          proposer_id: DEMO_USERS.tech1,
          status,
        },
      });

      // Revision
      const part = parts[i % parts.length]!;
      const revision = await prisma.approval_revisions.create({
        data: {
          approval_id: approval.id,
          revision_no: 1,
          reason: 'Phụ tùng cần thay thế đã hết hạn sử dụng, cần mua mới để đảm bảo an toàn',
          action_plan: `Thay thế ${part.name}, chạy thử và kiểm tra độ rung`,
          other_estimated_cost: 500000 + Math.random() * 2000000,
          policy_snapshot: {
            threshold: 500000,
            version: 1,
          },
          submitted_at: status !== 'DRAFT' ? pastDate(Math.floor(Math.random() * 3)) : null,
        },
      });

      // Revision parts
      const partQty = 1 + Math.floor(Math.random() * 3);
      await prisma.approval_revision_parts.create({
        data: {
          revision_id: revision.id,
          part_id: part.id,
          quantity: partQty,
          unit_price: part.reference_price,
          part_name_snapshot: part.name,
          requires_approval_snapshot: part.requires_approval,
        },
      });

      // Event history
      if (status !== 'DRAFT') {
        await prisma.approval_events.create({
          data: {
            approval_id: approval.id,
            revision_id: revision.id,
            actor_id: DEMO_USERS.tech1,
            event_type: 'SUBMITTED',
            note: 'Đã gửi đề xuất phê duyệt',
          },
        });
      }
      if (status === 'APPROVED') {
        await prisma.approval_events.create({
          data: {
            approval_id: approval.id,
            revision_id: revision.id,
            actor_id: DEMO_USERS.manager2,
            event_type: 'APPROVED',
            note: 'Đồng ý với đề xuất',
          },
        });
      } else if (status === 'REJECTED') {
        await prisma.approval_events.create({
          data: {
            approval_id: approval.id,
            revision_id: revision.id,
            actor_id: DEMO_USERS.manager2,
            event_type: 'REJECTED',
            note: 'Đề xuất vượt ngân sách, cần điều chỉnh',
          },
        });
      } else if (status === 'INFO_REQUESTED') {
        await prisma.approval_events.create({
          data: {
            approval_id: approval.id,
            revision_id: revision.id,
            actor_id: DEMO_USERS.manager2,
            event_type: 'INFO_REQUESTED',
            note: 'Cần bổ sung catalog và báo giá chi tiết',
          },
        });
      }
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 10. Cost entries (for completed WOs)
  // ----------------------------------------------------------------
  async seedCostEntries(): Promise<number> {
    console.info('[demo] seeding cost entries');
    const wos = await prisma.work_orders.findMany({
      where: { code: { startsWith: 'WO-DEMO-' }, status: 'COMPLETED' },
      take: 15,
    });

    let count = 0;
    for (const wo of wos) {
      // Labor cost
      await prisma.cost_entries.create({
        data: {
          work_order_id: wo.id,
          category: 'LABOR',
          direction: 'DEBIT',
          quantity: 4 + Math.random() * 8,
          unit_price: 250000,
          description: `Chi phí nhân công cho ${wo.code}`,
          recorded_by: DEMO_USERS.manager1,
          occurred_at: wo.completed_at ?? pastDate(1),
          operation_key: randomUUID(),
        },
      });
      // Part cost
      await prisma.cost_entries.create({
        data: {
          work_order_id: wo.id,
          category: 'PART',
          direction: 'DEBIT',
          quantity: 1 + Math.floor(Math.random() * 3),
          unit_price: 200000 + Math.random() * 800000,
          description: `Chi phí phụ tùng thay thế cho ${wo.code}`,
          recorded_by: DEMO_USERS.manager1,
          occurred_at: wo.completed_at ?? pastDate(1),
          operation_key: randomUUID(),
        },
      });
      count += 2;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 11. Notifications (rich)
  // ----------------------------------------------------------------
  async seedNotifications(): Promise<number> {
    console.info('[demo] seeding notifications');
    const users = [
      BOOTSTRAP_ADMIN_ID,
      DEMO_USERS.manager1,
      DEMO_USERS.manager2,
      DEMO_USERS.tech1,
      DEMO_USERS.tech2,
      DEMO_USERS.tech3,
      DEMO_USERS.tech4,
    ];
    const eventTypes = [
      { type: 'WORK_ORDER_ASSIGNED', title: 'Bạn được giao WO mới', count: 5 },
      { type: 'APPROVAL_SUBMITTED', title: 'Có đề xuất cần phê duyệt', count: 4 },
      { type: 'WORK_ORDER_OVERDUE', title: 'WO quá hạn cần xử lý', count: 3 },
      { type: 'INVENTORY_LOW_STOCK', title: 'Phụ tùng sắp hết hàng', count: 4 },
      { type: 'MAINTENANCE_OCCURRENCE_DUE', title: 'Đến hạn bảo trì định kỳ', count: 2 },
    ];

    let count = 0;
    for (const recipient of users) {
      for (const evt of eventTypes) {
        for (let i = 0; i < evt.count; i++) {
          const eventKey = `demo-${recipient.slice(0, 8)}-${evt.type}-${i}-${Date.now()}`;
          try {
            await prisma.notifications.create({
              data: {
                recipient_id: recipient,
                event_key: eventKey,
                event_type: evt.type,
                title: evt.title,
                object_type: pick(['work_order', 'approval', 'part', 'maintenance_plan']),
                object_key: randomUUID(),
                read_at: i < 2 ? pastDate(Math.floor(Math.random() * 3)) : null,
              },
            });
            count++;
          } catch {
            // Skip duplicates
          }
        }
      }
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 12. Audit logs (rich)
  // ----------------------------------------------------------------
  async seedAuditLogs(): Promise<number> {
    console.info('[demo] seeding audit logs');
    const actors = [BOOTSTRAP_ADMIN_ID, DEMO_USERS.manager1, DEMO_USERS.manager2, DEMO_USERS.tech1, DEMO_USERS.tech2];
    const actions = [
      'asset.create', 'asset.update', 'asset.delete',
      'incident.create', 'incident.transition', 'incident.message.create',
      'work-order.create', 'work-order.assign', 'work-order.transition', 'work-order.complete',
      'approval.create', 'approval.submit', 'approval.decide',
      'inventory.issue', 'inventory.receipt',
      'iam.user.grant_role', 'iam.user.revoke_role',
      'cost.create',
      'auth.login', 'auth.logout',
    ];
    const objectTypes = ['ASSET', 'INCIDENT', 'WORK_ORDER', 'APPROVAL', 'PART', 'USER', 'STOCK', 'COST', 'AUTH'];

    let count = 0;
    for (let i = 0; i < 100; i++) {
      const action = pick(actions);
      const objectType = pick(objectTypes);
      await prisma.audit_logs.create({
        data: {
          actor_id: pick(actors),
          actor_type: 'USER',
          action,
          object_type: objectType,
          object_key: randomUUID(),
          note: `${action} demo log entry #${i + 1}`,
          correlation_key: randomUUID(),
          new_value: { demo: true, index: i },
          created_at: pastDate(Math.floor(Math.random() * 30)),
        },
      });
      count++;
    }
    return count;
  },

  // ----------------------------------------------------------------
  // 13. AI requests
  // ----------------------------------------------------------------
  async seedAiRequests(): Promise<number> {
    console.info('[demo] seeding AI requests');
    const incidents = await prisma.incidents.findMany({
      where: { code: { startsWith: 'INC-' } },
      take: 10,
    });

    let count = 0;
    for (const inc of incidents) {
      const statuses = ['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED', 'RUNNING', 'FAILED', 'TIMED_OUT'];
      const status = pick(statuses);
      await prisma.ai_requests.create({
        data: {
          requested_by: inc.reporter_id,
          asset_id: inc.asset_id,
          incident_id: inc.id,
          task_type: 'INCIDENT_TRIAGE',
          provider: 'mock',
          model_name: 'mock-v1',
          prompt_version: '1.0.0',
          input_snapshot: { description: inc.description, impact: inc.impact_description },
          output_payload:
            status === 'SUCCEEDED'
              ? {
                  severity: pick(['HIGH', 'MEDIUM', 'LOW']),
                  category: pick(['MECHANICAL', 'ELECTRICAL', 'OPERATIONAL']),
                  confidence: 0.75 + Math.random() * 0.2,
                  recommendation: 'Cần kiểm tra và xử lý kịp thời',
                }
              : null,
          status,
          error_code: status === 'FAILED' || status === 'TIMED_OUT' ? 'TIMEOUT' : null,
          finished_at: status === 'SUCCEEDED' ? pastDate(1) : null,
          created_at: pastDate(2),
        },
      });
      count++;
    }
    return count;
  },
};

// ---- Main ----------------------------------------------------------------

async function hasDemoData(): Promise<boolean> {
  // Check if any DEMO-AST or PART- exists in DB
  const demoAsset = await prisma.assets.findFirst({ where: { code: { startsWith: 'DEMO-AST-' } } });
  const demoPart = await prisma.parts.findFirst({ where: { code: { startsWith: 'PART-' } } });
  return demoAsset !== null || demoPart !== null;
}

async function cleanDemoData(): Promise<void> {
  console.info('[demo-seed] cleaning up previous demo data...');

  // Order matters due to FK constraints

  // AI requests referencing demo incidents/assets
  await prisma.ai_requests.deleteMany({
    where: {
      OR: [
        { asset: { code: { startsWith: 'DEMO-AST-' } } },
        { incident: { code: { startsWith: 'INC-' } } },
      ],
    },
  });

  // Cost entries for all WOs referencing demo assets (E2E test data may have demo WO IDs too)
  await prisma.cost_entries.deleteMany({
    where: {
      OR: [
        { work_order: { code: { startsWith: 'WO-DEMO-' } } },
        { work_order: { asset: { code: { startsWith: 'DEMO-AST-' } } } },
      ],
    },
  });

  // Stock transactions (only demo ones)
  await prisma.stock_transactions.deleteMany({
    where: { part: { code: { startsWith: 'PART-' } } },
  });

  // Approval events/revisions/approvals for demo WOs + any WO referencing demo assets
  const allDemoApprovalWOs = await prisma.work_orders.findMany({
    where: {
      OR: [
        { code: { startsWith: 'WO-DEMO-' } },
        { asset: { code: { startsWith: 'DEMO-AST-' } } },
      ],
    },
    select: { id: true },
  });
  if (allDemoApprovalWOs.length > 0) {
    const woIds = allDemoApprovalWOs.map((w) => w.id);
    const demoApprovals = await prisma.approvals.findMany({
      where: { work_order_id: { in: woIds } },
      select: { id: true },
    });
    if (demoApprovals.length > 0) {
      const approvalIds = demoApprovals.map((a) => a.id);
      await prisma.approval_events.deleteMany({ where: { approval_id: { in: approvalIds } } });
      await prisma.approval_revision_parts.deleteMany({
        where: { revision: { approval_id: { in: approvalIds } } },
      });
      await prisma.approval_revisions.deleteMany({ where: { approval_id: { in: approvalIds } } });
      await prisma.approvals.deleteMany({ where: { id: { in: approvalIds } } });
    }
  }

  // Notes on all WOs referencing demo assets (E2E test data not in WO-DEMO-)
  await prisma.work_order_notes.deleteMany({
    where: { work_order: { asset: { code: { startsWith: 'DEMO-AST-' } } } },
  });

  // Detach stock_transactions and ai_requests from WOs referencing demo assets
  await prisma.stock_transactions.updateMany({
    where: { work_order: { asset: { code: { startsWith: 'DEMO-AST-' } } } },
    data: { work_order_id: null },
  });
  await prisma.ai_requests.updateMany({
    where: { work_order: { asset: { code: { startsWith: 'DEMO-AST-' } } } },
    data: { work_order_id: null },
  });
  await prisma.attachment_links.deleteMany({
    where: { work_order: { asset: { code: { startsWith: 'DEMO-AST-' } } } },
  });

  // All WOs referencing demo assets (E2E test data)
  await prisma.work_orders.deleteMany({
    where: { asset: { code: { startsWith: 'DEMO-AST-' } } },
  });

  // Notes on demo WOs
  await prisma.work_order_notes.deleteMany({
    where: { work_order: { code: { startsWith: 'WO-DEMO-' } } },
  });

  // Demo WOs
  await prisma.work_orders.deleteMany({ where: { code: { startsWith: 'WO-DEMO-' } } });

  // Incident messages + incidents
  await prisma.incident_messages.deleteMany({
    where: { incident: { code: { startsWith: 'INC-' } } },
  });
  await prisma.incidents.deleteMany({ where: { code: { startsWith: 'INC-' } } });

  // Maintenance occurrences referencing demo assets (E2E test data)
  await prisma.maintenance_occurrences.deleteMany({
    where: { asset: { code: { startsWith: 'DEMO-AST-' } } },
  });

  // Maintenance plans referencing demo assets
  await prisma.maintenance_plans.deleteMany({
    where: { asset: { code: { startsWith: 'DEMO-AST-' } } },
  });

  // Detach demo assets from any referencing tables (technical_documents, etc.)
  await prisma.technical_documents.updateMany({
    where: { asset: { code: { startsWith: 'DEMO-AST-' } } },
    data: { asset_id: null },
  });
  await prisma.access_scopes.updateMany({
    where: { asset: { code: { startsWith: 'DEMO-AST-' } } },
    data: { asset_id: null },
  });
  // attachment_links has a CHECK that requires exactly one parent — delete demo ones instead.
  await prisma.attachment_links.deleteMany({
    where: { asset: { code: { startsWith: 'DEMO-AST-' } } },
  });

  // Assets
  await prisma.assets.deleteMany({ where: { code: { startsWith: 'DEMO-AST-' } } });

  // Parts
  await prisma.parts.deleteMany({ where: { code: { startsWith: 'PART-' } } });

  // Notifications (non-marker ones)
  await prisma.notifications.deleteMany({
    where: { event_key: { not: DEMO_MARKER } },
  });

  // Audit logs (all demo ones)
  await prisma.audit_logs.deleteMany({
    where: {
      OR: [
        { note: { contains: 'demo log entry' } },
        { new_value: { path: ['demo'], equals: true } },
      ],
    },
  });

  // Access scopes + user roles for demo users (only non-bootstrap)
  const demoUserIds = Object.values(DEMO_USERS);
  await prisma.access_scopes.deleteMany({
    where: { user_role: { user_id: { in: demoUserIds } } },
  });
  await prisma.user_roles.deleteMany({ where: { user_id: { in: demoUserIds } } });
  await prisma.users.deleteMany({ where: { id: { in: demoUserIds } } });

  // Departments, locations, asset types (demo only)
  await prisma.departments.deleteMany({
    where: { id: { in: Object.values(DEMO_DEPT_IDS) } },
  });
  await prisma.locations.deleteMany({
    where: { id: { in: Object.values(DEMO_LOC_IDS) } },
  });
  await prisma.asset_types.deleteMany({
    where: { id: { in: Object.values(DEMO_ASSET_TYPE_IDS) } },
  });

  // Marker
  await DOC.clearMarker();
  console.info('[demo-seed] cleanup complete');
}
async function main(): Promise<void> {
  console.info('[demo-seed] Starting rich demo data seeding...');

  // Detect prior partial seed → clean up demo tables first.
  if (await DOC.isSeeded()) {
    console.info('[demo-seed] Marker found — clean up demo data + reseed');
    await cleanDemoData();
    console.info('[demo-seed] Cleanup done.');
  } else if (await hasDemoData()) {
    console.info('[demo-seed] Demo data exists from prior partial run — cleaning up');
    await cleanDemoData();
  }

  // ----------------------------------------------------------------
  // Idempotent guard: skip if marker still present AND no demo data.
  // (marker deletion happens at the end of successful seed)
  // ----------------------------------------------------------------

  await DOC.seedOrg();
  await DOC.seedUsers();
  const assetCount = await DOC.seedAssets();
  const partCount = await DOC.seedParts();
  await DOC.seedStockInitial();
  const planCount = await DOC.seedMaintenancePlans();
  const incidentCount = await DOC.seedIncidents();
  const woCount = await DOC.seedWorkOrders();
  const approvalCount = await DOC.seedApprovals();
  const costCount = await DOC.seedCostEntries();
  const notifCount = await DOC.seedNotifications();
  const auditCount = await DOC.seedAuditLogs();
  const aiCount = await DOC.seedAiRequests();
  await DOC.markSeeded();

  console.info('\n=== Demo seed summary ===');
  console.info(`  Assets:             ${assetCount}`);
  console.info(`  Parts:              ${partCount}`);
  console.info(`  Maintenance plans:  ${planCount}`);
  console.info(`  Incidents:          ${incidentCount}`);
  console.info(`  Work orders:        ${woCount}`);
  console.info(`  Approvals:          ${approvalCount}`);
  console.info(`  Cost entries:       ${costCount}`);
  console.info(`  Notifications:      ${notifCount}`);
  console.info(`  Audit logs:         ${auditCount}`);
  console.info(`  AI requests:        ${aiCount}`);
  console.info('========================\n');
  console.info('[demo-seed] DONE');
  console.info('[demo-seed] Demo accounts (password=Demo@2026):');
  console.info('  - demo.manager1 / Demo@2026');
  console.info('  - demo.tech1 / Demo@2026');
  console.info('  - demo.reporter1 / Demo@2026');
}

main()
  .catch((err) => {
    console.error('[demo-seed] FAILED', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
