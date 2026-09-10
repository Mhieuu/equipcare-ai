# 0001_init — M1 baseline

Created:

- **tenants** (single-tenant baseline: 1 row `code='default'`)
- **org_units** + **departments** + **locations** (org structure)
- **users** + **sessions** + **login_attempts** (auth)
- **roles** + **permissions** + **role_permissions** + **user_roles** + **user_role_scopes** (RBAC)
- **audit_logs** (Doc02 §6)
- **thresholds** (defaults; per-action override từ M6)

## FK cascade rules

| Relation | On delete |
|---|---|
| Org structure + IAM + thresholds → tenant | CASCADE |
| users.sessions / login_attempts / roles → users | CASCADE (sessions) / SET NULL (logs) |
| users.department → departments | SET NULL |
| user_roles → users/roles | CASCADE |
| user_role_scopes → user_roles | CASCADE |
| role_permissions → roles/permissions | CASCADE |
| audit_logs.user → users | SET NULL |

## Indexes

- All FK columns đều có index (`@@index([fk])`)
- `users(email)` — login lookup
- `sessions(expiresAt)` — sweep job cleanup
- `login_attempts(email, createdAt)` — lockout check
- `audit_logs(tenant_id, created_at)`, `audit_logs(entity, entity_id)` — report
- `thresholds(tenant_id, domain, key)` — unique

## Default values

- `UserStatus`: ACTIVE
- `failedAttempts`: 0
- `isSystem`: false (true với role 'ADMIN', 'MANAGER', 'TECHNICIAN', 'REPORTER', 'VIEWER')

## Seed (sau migration)

`apps/api/prisma/seed.ts` sẽ chạy:

1. Tạo tenant `default` (id cố định `00000000-0000-0000-0000-000000000001`)
2. Tạo OrgUnit + Department + Location mẫu
3. Tạo 5 system roles + tất cả permissions từ `@equipcare/shared` Permission constant
4. Tạo 4 demo users: admin.sx, manager.sx, ktv.sx01, reporter.sx01 (password = `Demo@123`)
5. Gán role cho từng user
6. Tạo thresholds mặc định

Tất cả qua `prisma.x.upsert(...)` để idempotent.

## Rollback

Không có downgrade script; rollback bằng `docker volume rm equipcare-ai_pg_data` (mất data) hoặc restore backup.
