import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Battery, Thermometer, Info } from 'lucide-react';
import type { SpacecraftState, SpacecraftLimits } from '../../api/types';

export interface RecordedSnapshot {
  stepIndex: number;
  time: number;
  command: string | null;
  state: SpacecraftState;
  cost?: number;
  safetyMargin?: number | null;
}

interface TelemetryChartsProps {
  history: RecordedSnapshot[];
  limits: SpacecraftLimits;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({ history, limits }) => {
  // Map real recorded snapshots directly to chart points — strictly no fabrication or interpolation
  const chartData = history.map((snap) => ({
    time: Math.round(snap.time),
    step: snap.stepIndex,
    command: snap.command || 'Initial State',
    temp_battery: Number(snap.state.temp_battery.toFixed(2)),
    temp_payload: Number(snap.state.temp_payload.toFixed(2)),
    temp_bus: Number(snap.state.temp_bus.toFixed(2)),
    soc_pct: Number((snap.state.soc * 100).toFixed(2)),
    safety_margin: snap.safetyMargin ?? snap.state.safety_margin ?? null,
  }));

  const pointCount = history.length;
  const isSinglePoint = pointCount <= 1;

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-slate-100 text-base">
            Session Measurements Time-Series
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Recorded Transitions:</span>
          <span className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-bold border border-cyan-800/60">
            {pointCount} {pointCount === 1 ? 'Point (Initial)' : 'Recorded Points'}
          </span>
        </div>
      </div>

      {isSinglePoint && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Displaying the initial condition snapshot. Execute recovery commands from the console above to record and track state transitions over simulation time.
          </span>
        </div>
      )}

      {/* Temperature Time-Series Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-rose-400" />
            <span className="text-slate-200 font-bold">Three-Node Temperatures (°C)</span>
          </div>
          <span className="text-slate-500 text-[11px]">
            Dashed reference lines = Nominal upper limits
          </span>
        </div>

        <div className="h-64 w-full bg-[#080d1a] border border-slate-800/80 rounded-lg p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 15, right: 25, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                unit="s"
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                unit="°C"
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0d1322',
                  borderColor: '#1e293b',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
                labelStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                formatter={(value: unknown, name: unknown) => {
                  const valNum = Number(value);
                  const nameStr = String(name ?? '');
                  if (nameStr === 'temp_battery') return [`${valNum.toFixed(2)} °C`, 'Battery Temp'];
                  if (nameStr === 'temp_payload') return [`${valNum.toFixed(2)} °C`, 'Payload Temp'];
                  if (nameStr === 'temp_bus') return [`${valNum.toFixed(2)} °C`, 'Bus Temp'];
                  return [`${valNum}`, nameStr];
                }}
                labelFormatter={(label) => `Time: ${label}s`}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '6px' }}
                formatter={(val) => {
                  if (val === 'temp_battery') return 'Battery (°C)';
                  if (val === 'temp_payload') return 'Payload (°C)';
                  if (val === 'temp_bus') return 'Bus (°C)';
                  return val;
                }}
              />

              {/* Documented Nominal Limit Reference Lines */}
              <ReferenceLine
                y={limits.temp_pay_nominal_max}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{
                  value: `Pay Max (${limits.temp_pay_nominal_max}°C)`,
                  fill: '#f43f5e',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
              <ReferenceLine
                y={limits.temp_bat_nominal_max}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: `Bat Max (${limits.temp_bat_nominal_max}°C)`,
                  fill: '#f59e0b',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />

              <Line
                type="monotone"
                dataKey="temp_battery"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f59e0b' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="temp_payload"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f43f5e' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="temp_bus"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ r: 3, fill: '#06b6d4' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* State of Charge (SoC) Time-Series Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <Battery className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-200 font-bold">Battery State of Charge (%)</span>
          </div>
          <span className="text-slate-500 text-[11px]">
            Floor: 35% nominal, 15% hard cutoff
          </span>
        </div>

        <div className="h-48 w-full bg-[#080d1a] border border-slate-800/80 rounded-lg p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 15, right: 25, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                unit="s"
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                unit="%"
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0d1322',
                  borderColor: '#1e293b',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
                labelStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                formatter={(value: unknown) => [`${Number(value).toFixed(2)} %`, 'SoC']}
                labelFormatter={(label) => `Time: ${label}s`}
              />
              <ReferenceLine
                y={limits.soc_nominal_min * 100}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: 'Nominal Floor (35%)',
                  fill: '#f59e0b',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
              <ReferenceLine
                y={limits.soc_hard_min * 100}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{
                  value: 'Hard Floor (15%)',
                  fill: '#ef4444',
                  fontSize: 10,
                  position: 'insideBottomRight',
                }}
              />
              <Line
                type="monotone"
                dataKey="soc_pct"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ r: 3, fill: '#38bdf8' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
