'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  Users,
  Zap,
  FileText,
  CreditCard,
  Bell,
  ClipboardList,
  MessageSquare,
  Archive,
  LineChart,
  Download,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  {
    label: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Buildings',
    href: '/admin/buildings',
    icon: Building2,
  },
  {
    label: 'Flats',
    href: '/admin/flats',
    icon: DoorOpen,
  },
  {
    label: 'Tenants',
    href: '/admin/tenants',
    icon: Users,
  },
  {
    label: 'Tenancy Requests',
    href: '/admin/tenancy-requests',
    icon: ClipboardList,
    badge: true,
  },
  {
    label: 'Meters',
    href: '/admin/meters',
    icon: Zap,
  },
  {
    label: 'Billing',
    href: '/admin/billing',
    icon: FileText,
  },
  {
    label: 'Payments',
    href: '/admin/payments',
    icon: CreditCard,
  },
  {
    label: 'Complaints',
    href: '/admin/complaints',
    icon: MessageSquare,
  },
  {
    label: 'Archive',
    href: '/admin/archive',
    icon: Archive,
  },
  {
    label: 'Insights',
    href: '/admin/insights',
    icon: LineChart,
  },
  {
    label: 'Notifications',
    href: '/admin/notifications',
    icon: Bell,
  },
  {
    label: 'Export',
    href: '/admin/export',
    icon: Download,
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
];

interface AdminSidebarProps {
  pendingCount?: number;
  onClose?: () => void;
}

export function AdminSidebar({ pendingCount = 0, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900">ElectroManage</span>
        </div>
      </div>

      {/* Role chip */}
      <div className="px-6 py-3 border-b border-gray-100">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          Admin Portal
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      isActive ? 'text-blue-600' : 'text-gray-400'
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && pendingCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs text-white">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4 text-gray-400" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
