import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useHealth } from '../../context/useHealth';

export const AppShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const { health, loading, refreshHealth } = useHealth();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#070a12] text-slate-100 font-sans">
      {/* Persistent Sidebar */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar health={health} loading={loading} onRefresh={refreshHealth} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-7 bg-[#070a12] relative">
          {/* Subtle restrained background grid */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />

          <div className="relative max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
