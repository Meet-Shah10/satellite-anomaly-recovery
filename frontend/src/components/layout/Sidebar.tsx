import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  Cpu,
  LineChart,
  Navigation,
  Sliders,
  BarChart3,
  History,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  isImplemented: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navItems: NavItem[] = [
    {
      to: '/',
      label: 'Mission Overview',
      icon: <Activity className="w-4 h-4 shrink-0" />,
      isImplemented: true,
    },
    {
      to: '/digital-twin',
      label: 'Spacecraft Digital Twin',
      icon: <Cpu className="w-4 h-4 shrink-0" />,
      isImplemented: true,
    },
    {
      to: '/telemetry-lab',
      label: 'Telemetry & Anomaly Lab',
      icon: <LineChart className="w-4 h-4 shrink-0" />,
      isImplemented: true,
    },
    {
      to: '/planner',
      label: 'Recovery Path Planner',
      icon: <Navigation className="w-4 h-4 shrink-0" />,
      isImplemented: false,
    },
    {
      to: '/simulation-lab',
      label: 'Simulation Laboratory',
      icon: <Sliders className="w-4 h-4 shrink-0" />,
      isImplemented: false,
    },
    {
      to: '/benchmarking',
      label: 'Algorithm Benchmarking',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      isImplemented: false,
    },
    {
      to: '/history',
      label: 'Experiment History',
      icon: <History className="w-4 h-4 shrink-0" />,
      isImplemented: false,
    },
    {
      to: '/reports',
      label: 'Research Reports',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      isImplemented: false,
    },
    {
      to: '/settings',
      label: 'Settings & Status',
      icon: <Settings className="w-4 h-4 shrink-0" />,
      isImplemented: true,
    },
  ];

  return (
    <aside
      className={`relative z-20 flex flex-col bg-[#070b14] border-r border-slate-800 transition-all duration-300 select-none ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-3.5 border-b border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-md bg-sky-950/80 border border-sky-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
                Aegis Orbit
              </div>
              <div className="text-[11px] text-sky-400/90 truncate tracking-tight">
                Dynamic A* Recovery
              </div>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-7 h-7 mx-auto rounded-md bg-sky-950/80 border border-sky-500/40 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors group relative ${
                isActive
                  ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30 font-medium shadow-[0_0_12px_rgba(56,189,248,0.08)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`
            }
          >
            <span className="shrink-0">{item.icon}</span>

            {!collapsed && (
              <div className="flex-1 flex items-center justify-between min-w-0">
                <span className="truncate">{item.label}</span>
                {!item.isImplemented && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60 font-sans tracking-tight shrink-0 ml-1.5">
                    Coming soon
                  </span>
                )}
              </div>
            )}

            {collapsed && (
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-slate-200 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg z-50">
                <span>{item.label}</span>
                {!item.isImplemented && (
                  <span className="ml-1.5 text-[10px] text-slate-400">(Coming soon)</span>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400">
        {!collapsed ? (
          <div>
            <div className="text-slate-300 font-medium">Research Workspace</div>
            <div className="text-slate-400 text-[10px] mt-0.5 font-mono">LEO raised-cosine solar model</div>
          </div>
        ) : (
          <div className="text-center font-mono text-[10px] text-slate-400">LEO</div>
        )}
      </div>
    </aside>
  );
};
