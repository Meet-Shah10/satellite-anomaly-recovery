import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { ArrowUpDown, Eye, Sun, Moon, BarChart2, Info, Check } from 'lucide-react';
import type { TelemetryWindow } from '../../api/types';

interface WindowComparisonViewProps {
  windows: TelemetryWindow[];
  activeWindowIndex: number;
  onSelectWindow: (index: number) => void;
  isSeeded: boolean;
  seed: number | null;
}

export const WindowComparisonView: React.FC<WindowComparisonViewProps> = ({
  windows,
  activeWindowIndex,
  onSelectWindow,
  isSeeded,
  seed,
}) => {
  const [sortOrder, setSortOrder] = useState<'default' | 'score_desc' | 'score_asc'>('default');

  if (windows.length <= 1) {
    return null;
  }

  // Calculate sample-specific statistics — strictly from retrieved sample
  const scores = windows
    .map((w) => w.anomaly_score)
    .filter((s): s is number => s !== null && s !== undefined);

  const minScore = scores.length > 0 ? Math.min(...scores) : null;
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;
  const meanScore =
    scores.length > 0 ? scores.reduce((acc, v) => acc + v, 0) / scores.length : null;

  // Sorting
  const sortedWindows = [...windows].sort((a, b) => {
    if (sortOrder === 'score_desc') {
      return (b.anomaly_score ?? 0) - (a.anomaly_score ?? 0);
    }
    if (sortOrder === 'score_asc') {
      return (a.anomaly_score ?? 0) - (b.anomaly_score ?? 0);
    }
    return a.window_index - b.window_index;
  });

  // Data for sample score comparison bar chart
  const barChartData = sortedWindows.map((w) => ({
    name: `#${w.window_index}`,
    index: w.window_index,
    score: w.anomaly_score !== null && w.anomaly_score !== undefined ? Number(w.anomaly_score.toFixed(4)) : 0,
    isActive: w.window_index === activeWindowIndex,
  }));

  const getBarColor = (score: number, isActive: boolean) => {
    if (isActive) return '#06b6d4'; // Active highlighted cyan
    if (score > 0.95) return '#f43f5e'; // Elevated outlier
    if (score > 0.85) return '#f59e0b'; // Moderate
    return '#3b82f6'; // Low / Typical
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-slate-100 text-base">Batch Window Comparison</h3>
            <span className="text-xs font-mono text-slate-400">
              Retrieved batch: {windows.length} windows ({isSeeded ? `Seeded sample: seed=${seed}` : 'Sequential indices'})
            </span>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 text-xs font-sans">
          <button
            type="button"
            onClick={() => {
              setSortOrder((prev) =>
                prev === 'default' ? 'score_desc' : prev === 'score_desc' ? 'score_asc' : 'default'
              );
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Sort:{' '}
              {sortOrder === 'default'
                ? 'Index Order'
                : sortOrder === 'score_desc'
                ? 'Score (Highest First)'
                : 'Score (Lowest First)'}
            </span>
          </button>
        </div>
      </div>

      {/* Sample Overview Statistics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px] font-sans uppercase font-medium">Sample Size</span>
          <span className="text-slate-100 font-bold font-mono text-base">{windows.length} windows</span>
          <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">(of 10,100 dataset)</span>
        </div>

        <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px] font-sans uppercase font-medium">Sample Mean</span>
          <span className="text-cyan-300 font-bold font-mono text-base">
            {meanScore !== null ? meanScore.toFixed(4) : '—'}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">Average R(n) in sample</span>
        </div>

        <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px] font-sans uppercase font-medium">Sample Min</span>
          <span className="text-emerald-400 font-bold font-mono text-base">
            {minScore !== null ? minScore.toFixed(4) : '—'}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">Lowest outlier rank</span>
        </div>

        <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px] font-sans uppercase font-medium">Sample Max</span>
          <span className="text-amber-400 font-bold font-mono text-base">
            {maxScore !== null ? maxScore.toFixed(4) : '—'}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">Highest outlier rank</span>
        </div>
      </div>

      {/* Sample Score Distribution Bar Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Anomaly Score R(n) Distribution across Sampled Windows</span>
          <span className="text-cyan-300 text-[11px]">Click a bar or table row to inspect</span>
        </div>

        <div className="h-44 w-full bg-[#080d1a] border border-slate-800 rounded-lg p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }} />
              <YAxis stroke="#64748b" domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0d1322', borderColor: '#1e293b', fontSize: '12px', fontFamily: 'monospace' }}
                formatter={(val: unknown) => [`${Number(val).toFixed(4)}`, 'Anomaly Score R(n)']}
                labelFormatter={(lbl) => `Window ${lbl}`}
              />
              <Bar
                dataKey="score"
                onClick={(entry: unknown) => {
                  const item = entry as { index?: number };
                  if (typeof item?.index === 'number') {
                    onSelectWindow(item.index);
                  }
                }}
                className="cursor-pointer"
              >
                {barChartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={getBarColor(entry.score, entry.isActive)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider font-medium bg-slate-950/60 font-sans">
              <th className="py-2.5 px-3">Window Index</th>
              <th className="py-2.5 px-3">Anomaly Score R(n)</th>
              <th className="py-2.5 px-3">Orbit Phase (ϕ)</th>
              <th className="py-2.5 px-3">Initial SoC</th>
              <th className="py-2.5 px-3">Initial Payload T</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sortedWindows.map((w) => {
              const isActive = w.window_index === activeWindowIndex;
              const meta = w.meta || {};
              const orbitPhase = meta.orbit_phase !== undefined ? meta.orbit_phase : null;
              const inEclipse = orbitPhase !== null && orbitPhase >= 0.65;
              const initSoc = meta.initial_soc !== undefined ? (meta.initial_soc * 100).toFixed(1) : null;
              const initTemp = meta.initial_temp_payload !== undefined ? meta.initial_temp_payload.toFixed(1) : null;

              return (
                <tr
                  key={w.window_index}
                  className={`hover:bg-slate-900/60 transition-colors ${
                    isActive ? 'bg-cyan-950/25 border-l-2 border-cyan-400' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-bold text-slate-200">
                    #{w.window_index}
                    {isActive && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                        ACTIVE
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-cyan-300">
                        {w.anomaly_score !== null && w.anomaly_score !== undefined
                          ? w.anomaly_score.toFixed(4)
                          : '—'}
                      </span>
                      {w.anomaly_score !== null && w.anomaly_score !== undefined && (
                        <div className="w-16 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-cyan-400"
                            style={{ width: `${w.anomaly_score * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    {orbitPhase !== null ? (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <span>{orbitPhase.toFixed(2)}</span>
                        {inEclipse ? (
                          <span title="Eclipse Arc" className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Moon className="w-3 h-3 text-slate-400" />
                            <span>Eclipse</span>
                          </span>
                        ) : (
                          <span title="Sunlit Arc" className="flex items-center gap-1 text-[10px] text-amber-400">
                            <Sun className="w-3 h-3 text-amber-400" />
                            <span>Sunlit</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {initSoc !== null ? `${initSoc}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {initTemp !== null ? `${initTemp} °C` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectWindow(w.window_index)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1 ml-auto transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Inspecting</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-400 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span>
          Sample metrics apply only to the {windows.length} retrieved windows. Highest-scoring sampled window does not represent a confirmed satellite failure.
        </span>
      </div>
    </div>
  );
};
