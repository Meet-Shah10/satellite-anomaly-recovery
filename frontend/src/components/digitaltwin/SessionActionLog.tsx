import React from 'react';
import { History, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { RecordedSnapshot } from './TelemetryCharts';

interface SessionActionLogProps {
  history: RecordedSnapshot[];
  onClear: () => void;
}

export const SessionActionLog: React.FC<SessionActionLogProps> = ({ history, onClear }) => {
  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-slate-100 text-base">Current Interactive Session Action Log</h3>
            <span className="text-[11px] text-slate-400">
              Interactive session transitions only — not permanent research experiment history
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400">
            Total Steps: <strong className="text-cyan-300">{history.length}</strong>
          </span>
          {history.length > 1 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-mono text-slate-400 hover:text-slate-200 underline decoration-slate-600 transition-colors cursor-pointer"
            >
              Reset Session
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="p-6 text-center text-xs font-mono text-slate-500 bg-slate-950/40 rounded-lg border border-slate-800/60">
          No commands executed yet in this session.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider bg-slate-950/60">
                <th className="py-2.5 px-3">Step</th>
                <th className="py-2.5 px-3">Command</th>
                <th className="py-2.5 px-3">Sim Time</th>
                <th className="py-2.5 px-3">Cost g(a)</th>
                <th className="py-2.5 px-3">SoC</th>
                <th className="py-2.5 px-3">T_bat / T_pay / T_bus</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3">Margin</th>
                <th className="py-2.5 px-3 text-right">Resulting Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history.map((item, idx) => {
                const isInitial = item.stepIndex === 0;
                const inNominal = item.state.in_nominal_band ?? false;
                const isInfeasible = item.state.violates_hard_constraints ?? false;

                return (
                  <tr
                    key={`${item.stepIndex}-${item.time}`}
                    className={`hover:bg-slate-900/60 transition-colors ${
                      idx === history.length - 1 ? 'bg-cyan-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-slate-400 font-bold">
                      #{item.stepIndex}
                      {idx === history.length - 1 && (
                        <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                          LATEST
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {isInitial ? (
                        <span className="text-slate-400 italic">[Initial State]</span>
                      ) : (
                        <span className="text-cyan-300 font-bold">{item.command}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{item.time.toFixed(0)} s</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {item.cost !== undefined && item.cost > 0 ? item.cost.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">
                      {(item.state.soc * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {item.state.temp_battery.toFixed(1)}° / {item.state.temp_payload.toFixed(1)}° /{' '}
                      {item.state.temp_bus.toFixed(1)}°
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{item.state.mode}</td>
                    <td className="py-2.5 px-3">
                      {item.safetyMargin !== null && item.safetyMargin !== undefined ? (
                        <span
                          className={
                            item.safetyMargin > 0 ? 'text-emerald-400' : 'text-rose-400 font-bold'
                          }
                        >
                          {item.safetyMargin >= 0 ? '+' : ''}
                          {item.safetyMargin.toFixed(3)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isInfeasible ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30 font-semibold">
                          <ShieldAlert className="w-3 h-3" /> INFEASIBLE
                        </span>
                      ) : inNominal ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 font-semibold">
                          <ShieldCheck className="w-3 h-3" /> NOMINAL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
                          <AlertTriangle className="w-3 h-3" /> OUT OF BAND
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
