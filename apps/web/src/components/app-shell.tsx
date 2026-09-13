'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  AlertOctagon,
  Wrench,
  ClipboardList,
  Package,
  Bell,
  Calendar,
  Settings,
  Users,
  LogOut,
  Boxes,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { clsx } from 'clsx';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/incidents', label: 'Sự cố', icon: AlertOctagon },
  { href: '/work-orders', label: 'Phiếu công việc', icon: Wrench },
  { href: '/approvals', label: 'Phê duyệt', icon: ClipboardList },
  { href: '/assets', label: 'Thiết bị', icon: Boxes },
  { href: '/inventory/parts', label: 'Linh kiện', icon: Package },
  { href: '/maintenance/plans', label: 'Bảo trì', icon: Calendar },
  { href: '/notifications', label: 'Thông báo', icon: Bell, roles: ['USER', 'TECHNICIAN', 'MANAGER', 'ADMIN'] },
  { href: '/reports', label: 'Báo cáo', icon: FileText, permission: 'report:export' },
  { href: '/iam/users', label: 'Người dùng', icon: Users, permission: 'iam:user:read' },
  { href: '/iam/audit-logs', label: 'Audit log', icon: ShieldCheck, permission: 'audit:read:all' },
  { href: '/organization', label: 'Tổ chức', icon: Settings, permission: 'org:read' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, hasPermission, hasRole, logout, accessToken } = useAuth();

  useSocket();

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count'),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">Đang tải...</div>
      </div>
    );
  }

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.roles && !hasRole(item.roles)) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <Wrench className="h-6 w-6 text-brand-400" />
          <span className="font-bold text-lg">EquipCare</span>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition',
                  active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.href === '/notifications' && (unread?.count ?? 0) > 0 && (
                  <span className="bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {unread!.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-2 px-2">
            <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-medium">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.fullName}</p>
              <p className="text-xs text-slate-400 truncate">{user.roles[0]?.name ?? '—'}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 rounded"
          >
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
