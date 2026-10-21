import React from 'react';
import { Database, Layers } from 'lucide-react';
import type { TelemetryChannel } from '../../api/types';

interface ChannelCatalogPanelProps {
  channels: TelemetryChannel[];
}

export const ChannelCatalogPanel: React.FC<ChannelCatalogPanelProps> = ({ channels }) => {
  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-slate-100 text-base">Channel Catalog & Feature Engineering</h3>
            <span className="text-xs font-mono text-slate-400">
              Verified 8-channel telemetry specification from backend metadata
            </span>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-400">
          State Vector: <span className="text-cyan-300">x ∈ ℝ⁸</span> | Window Feature Space: <span className="text-cyan-300">X ∈ ℝ³²</span>
        </div>
      </div>

      {/* Channel Specification Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider font-medium bg-slate-950/60 font-sans">
              <th className="py-2.5 px-3">Index</th>
              <th className="py-2.5 px-3">Field Name</th>
              <th className="py-2.5 px-3">Display Name</th>
              <th className="py-2.5 px-3">Unit</th>
              <th className="py-2.5 px-3">Domain Interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {channels.map((ch) => (
              <tr key={ch.name} className="hover:bg-slate-900/40 transition-colors">
                <td className="py-2.5 px-3 text-slate-500 font-bold font-mono">#{ch.index}</td>
                <td className="py-2.5 px-3 text-cyan-300 font-bold font-mono"><code>{ch.name}</code></td>
                <td className="py-2.5 px-3 text-slate-200 font-medium">{ch.display_name}</td>
                <td className="py-2.5 px-3 text-amber-300 font-mono text-[11px]">{ch.unit}</td>
                <td className="py-2.5 px-3 text-slate-300">{ch.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Feature Engineering Technical Details */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>32-Dimensional Rolling Window Transformation</span>
        </div>
        <p className="text-slate-300 text-xs leading-relaxed">
          The Isolation Forest anomaly scorer does not process raw, unaligned time sequences. For each 10-step window (W = 10, Δt = 60s), each of the 8 telemetry channels is transformed into 4 summary statistics:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] pt-1">
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
            <span className="text-cyan-300 font-bold block">1. mean</span>
            <span className="text-slate-400 text-[10px]">Central tendency across 10 steps</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
            <span className="text-amber-300 font-bold block">2. std</span>
            <span className="text-slate-400 text-[10px]">Sample standard deviation variability</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
            <span className="text-rose-300 font-bold block">3. slope</span>
            <span className="text-slate-400 text-[10px]">Least-squares linear rate-of-change</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
            <span className="text-emerald-300 font-bold block">4. last</span>
            <span className="text-slate-400 text-[10px]">Terminal state value at step 9</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-slate-500 pt-1">
          Feature vector: X = [soc_mean, soc_std, ..., mode_code_last] ∈ ℝ³².
        </div>
      </div>
    </div>
  );
};
