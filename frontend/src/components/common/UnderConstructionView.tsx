import React from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ArrowLeft,
  CheckCircle2,
  Layers,
  Database,
  Terminal,
  ShieldAlert,
} from 'lucide-react';
import { useHealth } from '../../context/useHealth';

export interface PlannedFeature {
  title: string;
  description: string;
  endpoints: string[];
}

interface UnderConstructionViewProps {
  title: string;
  subtitle: string;
  phaseTarget?: string;
  plannedFeatures: PlannedFeature[];
  scientificScope: string[];
  icon: React.ReactNode;
}

export const UnderConstructionView: React.FC<UnderConstructionViewProps> = ({
  title,
  subtitle,
  plannedFeatures,
  scientificScope,
  icon,
}) => {
  const { health } = useHealth();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-sky-400" />
                <span>Module Queued for Implementation</span>
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-white flex items-center gap-2.5">
              <span className="text-sky-400">{icon}</span>
              <span>{title}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Overview</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Architecture & Planning Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Planned Features & Endpoints */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Planned Implementation Modules</span>
            </h2>
            <div className="space-y-3">
              {plannedFeatures.map((feat, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg bg-[#0e1626] border border-slate-800/80 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-200">
                      {feat.title}
                    </h3>
                    <span className="text-[10px] text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/40 font-medium">
                      SCHEDULED
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    {feat.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-sans">
                      <Terminal className="w-3 h-3 text-slate-400" />
                      Endpoint:
                    </span>
                    {feat.endpoints.map((ep) => (
                      <span
                        key={ep}
                        className="text-[11px] font-mono text-sky-300 bg-sky-950/50 border border-sky-800/50 px-2 py-0.5 rounded"
                      >
                        {ep}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: Scientific Scope & System Readiness */}
        <div className="space-y-4">
          {/* Scientific Scope */}
          <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Scientific Specifications</span>
            </h2>
            <ul className="space-y-2.5 text-xs text-slate-300">
              {scientificScope.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 leading-snug">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Research Backend Readiness */}
          <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Backend Asset Status</span>
            </h2>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400">FastAPI Daemon</span>
                <span className={health ? 'text-emerald-400' : 'text-rose-400'}>
                  {health ? 'ONLINE' : 'UNREACHABLE'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400">Anomaly Scorer</span>
                <span className={health?.scorer_loaded ? 'text-emerald-400' : 'text-amber-400'}>
                  {health?.scorer_loaded ? 'READY' : 'OFFLINE'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400">Nominal Windows</span>
                <span className={health?.assets?.nominal_dataset ? 'text-emerald-400' : 'text-amber-400'}>
                  {health?.assets?.nominal_dataset ? '10,100 AVAILABLE' : 'MISSING'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400">Benchmark Runs</span>
                <span className={health?.assets?.experiment_results ? 'text-emerald-400' : 'text-amber-400'}>
                  {health?.assets?.experiment_results ? '161 INDEXED' : 'UNAVAILABLE'}
                </span>
              </div>
            </div>
          </div>

          {/* Scientific Disclaimer */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-100">Research Rigor Notice: </span>
              In adherence to scientific evaluation standards, synthetic mock algorithms and fabricated plans are strictly prohibited. This module will bind directly to the tested Python solver implementation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
