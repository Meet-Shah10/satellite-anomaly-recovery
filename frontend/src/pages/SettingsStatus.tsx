import React, { useState } from 'react';
import { Settings, RefreshCw, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Terminal, Server } from 'lucide-react';
import { useHealth } from '../context/useHealth';
import { api } from '../api/client';

export const SettingsStatus: React.FC = () => {
  const { health, loading, refreshHealth } = useHealth();
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pinging, setPinging] = useState<boolean>(false);

  const testConnection = async () => {
    setPinging(true);
    setPingResult(null);
    const start = performance.now();
    try {
      await api.getHealth();
      const elapsed = Math.round(performance.now() - start);
      setPingResult(`Success: Responded in ${elapsed}ms`);
    } catch (err: unknown) {
      setPingResult(`Failed: ${(err as Error).message || 'API unreachable'}`);
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded">
              System Diagnostics
            </span>
            <span className="text-xs text-slate-400">Environment Verification</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-sky-400" />
            <span>Settings & System Status</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Runtime diagnostics, scientific asset verification, environment configuration, and direct communication testing with the FastAPI backend.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testConnection}
            disabled={pinging}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pinging ? 'animate-spin' : ''}`} />
            <span>{pinging ? 'Pinging...' : 'Ping Backend API'}</span>
          </button>
        </div>
      </div>

      {pingResult && (
        <div
          className={`p-3.5 rounded-xl text-xs font-mono border flex items-center gap-2.5 ${
            pingResult.startsWith('Success')
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/30 border-rose-800/60 text-rose-300'
          }`}
        >
          {pingResult.startsWith('Success') ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{pingResult}</span>
        </div>
      )}

      {/* Grid of Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backend Diagnostic Card */}
        <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-4">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300 flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-400" />
            <span>FastAPI Server Diagnostics</span>
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 font-sans">Endpoint Target</span>
              <span className="text-slate-200 font-mono">http://127.0.0.1:8000</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 font-sans">Connection State</span>
              <span className={health ? 'text-emerald-400 font-semibold font-mono' : 'text-rose-400 font-semibold font-mono'}>
                {loading ? 'CHECKING...' : health ? 'CONNECTED (HEALTHY)' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 font-sans">Python Version</span>
              <span className="text-slate-200 font-mono">{health?.python_version || 'Unavailable'}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 font-sans">Backend App Version</span>
              <span className="text-slate-200 font-mono">v{health?.app_version || '1.0.0'}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 font-sans">Vite Proxy Route</span>
              <span className="text-slate-200 font-mono">/api -&gt; http://127.0.0.1:8000/api</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => refreshHealth()}
              className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh Health Payload</span>
            </button>
          </div>
        </div>

        {/* Research Assets Status */}
        <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-4">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Research Files & Asset Verification</span>
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <div className="text-slate-200 font-mono">isolation_forest.joblib</div>
                <div className="text-[11px] text-slate-400 font-sans">200-tree Isolation Forest model</div>
              </div>
              <span className={health?.scorer_loaded ? 'text-emerald-400 font-mono font-semibold' : 'text-rose-400 font-mono font-semibold'}>
                {health?.scorer_loaded ? 'LOADED' : 'MISSING'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <div className="text-slate-200 font-mono">nominal_windows.npy</div>
                <div className="text-[11px] text-slate-400 font-sans">10,100 windows × 10 steps × 8 channels</div>
              </div>
              <span className={health?.assets?.nominal_dataset ? 'text-emerald-400 font-mono font-semibold' : 'text-rose-400 font-mono font-semibold'}>
                {health?.assets?.nominal_dataset ? 'VALIDATED' : 'MISSING'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <div className="text-slate-200 font-mono">results.csv</div>
                <div className="text-[11px] text-slate-400 font-sans">161 published benchmark runs</div>
              </div>
              <span className={health?.assets?.experiment_results ? 'text-emerald-400 font-mono font-semibold' : 'text-rose-400 font-mono font-semibold'}>
                {health?.assets?.experiment_results ? 'INDEXED' : 'MISSING'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scientific Inconsistencies & Caveats Card */}
      <div className="p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-400" />
          <span>Scientific Implementation Notes (Reported by Backend)</span>
        </h2>

        {health?.known_issues && health.known_issues.length > 0 ? (
          <div className="space-y-2">
            {health.known_issues.map((issue, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-900/40 text-xs text-amber-300/90 flex items-start gap-2.5 leading-relaxed font-sans"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{issue}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
            {health ? 'No known implementation anomalies reported by backend.' : 'Backend offline.'}
          </div>
        )}
      </div>
    </div>
  );
};
