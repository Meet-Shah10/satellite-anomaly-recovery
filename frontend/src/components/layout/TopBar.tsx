import React, { useEffect, useState } from 'react';
import {
  Radio,
  Server,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';
import type { HealthResponse } from '../../api/types';

interface TopBarProps {
  health: HealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ health, loading, onRefresh }) => {
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = () => {
    if (!health) {
      return <StatusBadge label="SERVER OFFLINE" variant="critical" pulse size="sm" />;
    }
    if (health.status === 'ok') {
      return <StatusBadge label="RESEARCH ENGINE ONLINE" variant="nominal" pulse size="sm" />;
    }
    return <StatusBadge label="ENGINE DEGRADED" variant="warning" pulse size="sm" />;
  };

  return (
    <header className="h-14 bg-[#090e1a] border-b border-slate-800 px-4 flex items-center justify-between text-xs select-none">
      {/* Left: Ground Station Identity & Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
          <span className="font-semibold text-slate-200 tracking-wide uppercase text-xs hidden sm:inline">
            Ground Station
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800 hidden sm:block" />

        {getStatusBadge()}
      </div>

      {/* Right: Mission UTC Clock, Sync, and Swagger Docs */}
      <div className="flex items-center gap-2.5">
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1322] border border-slate-800 text-slate-300">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-mono tracking-tight">{utcTime}</span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded bg-[#0d1322] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
          title="Refresh Backend Telemetry & Status"
          aria-label="Refresh Backend Telemetry & Status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
        </button>

        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/40 hover:bg-sky-900/60 border border-sky-800/60 text-sky-300 text-xs font-medium transition-colors"
          title="Open FastAPI Swagger Interactive Documentation"
        >
          <Server className="w-3.5 h-3.5" />
          <span>API Docs</span>
        </a>
      </div>
    </header>
  );
};
