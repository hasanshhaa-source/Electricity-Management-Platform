'use client';

import { useState } from 'react';
import { AdminSidebar } from './admin-sidebar';
import { AdminHeader } from './admin-header';
import type { AuthUser } from '@/types';

interface AdminLayoutShellProps {
  user: AuthUser;
  pendingCount: number;
  children: React.ReactNode;
}

export function AdminLayoutShell({ user, pendingCount, children }: AdminLayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <AdminSidebar pendingCount={pendingCount} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-30 flex lg:hidden">
            <AdminSidebar pendingCount={pendingCount} onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader user={user} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
