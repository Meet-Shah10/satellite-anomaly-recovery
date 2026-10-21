import React, { useState } from 'react';
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
import {
  Layers,
  Thermometer,
  Zap,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import type { TelemetryDataPoint, TelemetryChannel } from '../../api/types';

interface MultiChannelChartProps {
  points: TelemetryDataPoint[];
  channels: TelemetryChannel[];
  windowIndex: number;
}

type ViewMode = 'thermal' | 'power' | 'actuators' | 'single';

const CHANNEL_COLORS: Record<string, string> = {
  soc: '#38bdf8',            // Sky Blue
  temp_battery: '#f59e0b',   // Amber
  temp_payload: '#f43f5e',   // Rose
  temp_bus: '#06b6d4',       // Cyan
  heater_on: '#eab308',      // Yellow
  payload_on: '#a855f7',     // Purple
  transmitter_on: '#3b82f6', // Blue
  mode_code: '#10b981',      // Emerald
};

export const MultiChannelChart: React.FC<MultiChannelChartProps> = ({
  points,
  channels,
  windowIndex,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('thermal');
  const [selectedSingleChannel, setSelectedSingleChannel] = useState<string>('temp_payload');

  // Format real points for Recharts — strictly no interpolation or synthetic samples
  const chartData = points.map((pt) => {
    const vals = pt.values || {};
    return {
      step: pt.step_index,
      time: pt.time_offset_s,
      soc: vals.soc !== undefined ? Number((vals.soc * 100).toFixed(2)) : null,
      temp_battery: vals.temp_battery !== undefined ? Number(vals.temp_battery.toFixed(2)) : null,
      temp_payload: vals.temp_payload !== undefined ? Number(vals.temp_payload.toFixed(2)) : null,
      temp_bus: vals.temp_bus !== undefined ? Number(vals.temp_bus.toFixed(2)) : null,
      heater_on: vals.heater_on !== undefined ? Math.round(vals.heater_on) : null,
      payload_on: vals.payload_on !== undefined ? Math.round(vals.payload_on) : null,
      transmitter_on: vals.transmitter_on !== undefined ? Math.round(vals.transmitter_on) : null,
      mode_code: vals.mode_code !== undefined ? Math.round(vals.mode_code) : null,
    };
  });

  const activeChannelMeta = channels.find((c) => c.name === selectedSingleChannel);

  if (points.length === 0) {
    return (
      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-8 text-center text-slate-400 font-mono text-xs">
        No telemetry data points available for window #{windowIndex}.
      </div>
    );
  }

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* View Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-slate-100 text-base">Multichannel Telemetry Profiles</h3>
            <span className="text-xs font-mono text-slate-400">
              Window #{windowIndex} (10 discrete steps, Δt = 60s, Horizon: 0 to 540s)
            </span>
          </div>
        </div>

        {/* View Mode Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-sans">
          <button
            type="button"
            onClick={() => setViewMode('thermal')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'thermal'
                ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>Thermal Subsystem (°C)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('power')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'power'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Electrical Power (SoC %)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('actuators')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'actuators'
                ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Actuators & Modes</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('single')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'single'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Single Channel</span>
          </button>
        </div>
      </div>

      {/* View: Thermal Subsystem (°C) */}
      {viewMode === 'thermal' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Thermal node profiles (Euler integration, UA couplings, deep space sink -90°C)</span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-0.5 bg-amber-400" /> Battery (T_bat)
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-0.5 bg-rose-400" /> Payload (T_pay)
              </span>
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2.5 h-0.5 bg-cyan-400" /> Bus (T_bus)
              </span>
            </div>
          </div>

          <div className="h-72 w-full bg-[#080d1a] border border-slate-800 rounded-lg p-2">
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
                  labelFormatter={(label) => `Time Offset: ${label}s`}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
                  formatter={(val) => {
                    if (val === 'temp_battery') return 'Battery Temperature (°C)';
                    if (val === 'temp_payload') return 'Payload Temperature (°C)';
                    if (val === 'temp_bus') return 'Electronics Bus Temperature (°C)';
                    return val;
                  }}
                />

                {/* Documented Nominal Limit Reference Lines */}
                <ReferenceLine
                  y={55.0}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{ value: 'Pay Nominal Max (55°C)', fill: '#f43f5e', fontSize: 10, position: 'insideTopRight' }}
                />
                <ReferenceLine
                  y={40.0}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'Bat Nominal Max (40°C)', fill: '#f59e0b', fontSize: 10, position: 'insideTopLeft' }}
                />

                <Line
                  type="monotone"
                  dataKey="temp_battery"
                  stroke={CHANNEL_COLORS.temp_battery}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHANNEL_COLORS.temp_battery }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="temp_payload"
                  stroke={CHANNEL_COLORS.temp_payload}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHANNEL_COLORS.temp_payload }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="temp_bus"
                  stroke={CHANNEL_COLORS.temp_bus}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHANNEL_COLORS.temp_bus }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* View: Power Subsystem (SoC %) */}
      {viewMode === 'power' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Battery State-of-Charge tracking (50 Wh capacity, asymmetric charge/discharge efficiencies)</span>
            <span className="text-[11px] text-cyan-400">Nominal Goal Floor: ≥ 35%</span>
          </div>

          <div className="h-72 w-full bg-[#080d1a] border border-slate-800 rounded-lg p-2">
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
                  formatter={(val: unknown) => [`${Number(val).toFixed(2)} %`, 'Battery State of Charge']}
                  labelFormatter={(label) => `Time Offset: ${label}s`}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
                  formatter={() => 'Battery State of Charge (%)'}
                />

                <ReferenceLine
                  y={35.0}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'Nominal Goal Floor (35%)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
                />
                <ReferenceLine
                  y={15.0}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: 'Hard Cutoff (15%)', fill: '#ef4444', fontSize: 10, position: 'insideBottomRight' }}
                />

                <Line
                  type="monotone"
                  dataKey="soc"
                  stroke={CHANNEL_COLORS.soc}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHANNEL_COLORS.soc }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* View: Actuators & Mode Codes (Handled discretely, not continuous) */}
      {viewMode === 'actuators' && (
        <div className="space-y-4">
          <div className="text-xs font-mono text-slate-400">
            Discrete switch relays and flight operating mode codes plotted using stepped transitions
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Binary Switch Relays */}
            <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-mono font-bold text-slate-200 block">
                Binary Switch Relays (0 = OFF, 1 = ON)
              </span>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} unit="s" />
                    <YAxis stroke="#64748b" domain={[-0.2, 1.2]} ticks={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0d1322', borderColor: '#1e293b', fontSize: '11px', fontFamily: 'monospace' }}
                      formatter={(val: unknown, name: unknown) => [Number(val) === 1 ? '1 (ON)' : '0 (OFF)', String(name)]}
                      labelFormatter={(lbl) => `Time: ${lbl}s`}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
                    <Line type="stepAfter" dataKey="heater_on" name="Heater Relay" stroke={CHANNEL_COLORS.heater_on} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    <Line type="stepAfter" dataKey="payload_on" name="Payload Power" stroke={CHANNEL_COLORS.payload_on} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    <Line type="stepAfter" dataKey="transmitter_on" name="Transmitter Power" stroke={CHANNEL_COLORS.transmitter_on} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Categorical Mode Code */}
            <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-200">
                  Operating Mode (0=nominal, 1=low_power, 2=safe_mode)
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} unit="s" />
                    <YAxis
                      stroke="#64748b"
                      domain={[-0.2, 2.2]}
                      ticks={[0, 1, 2]}
                      tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
                      tickFormatter={(v) => (v === 0 ? 'Nominal' : v === 1 ? 'LowPwr' : v === 2 ? 'SafeMode' : String(v))}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0d1322', borderColor: '#1e293b', fontSize: '11px', fontFamily: 'monospace' }}
                      formatter={(val: unknown) => {
                        const code = Number(val);
                        const label = code === 0 ? '0 (Nominal Avionics - 30W)' : code === 1 ? '1 (Low Power Avionics - 18W)' : '2 (Safe Mode - 18W)';
                        return [label, 'Mode'];
                      }}
                      labelFormatter={(lbl) => `Time: ${lbl}s`}
                    />
                    <Line type="stepAfter" dataKey="mode_code" name="Mode Code" stroke={CHANNEL_COLORS.mode_code} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View: Single Channel Deep-Dive */}
      {viewMode === 'single' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0e1626] p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <label htmlFor="channel-select" className="text-xs font-mono font-semibold text-slate-300">
                Select Channel:
              </label>
              <select
                id="channel-select"
                value={selectedSingleChannel}
                onChange={(e) => setSelectedSingleChannel(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                {channels.map((ch) => (
                  <option key={ch.name} value={ch.name}>
                    {ch.name} — {ch.display_name} ({ch.unit})
                  </option>
                ))}
              </select>
            </div>

            {activeChannelMeta && (
              <div className="text-xs font-mono text-slate-400">
                Unit: <span className="text-slate-200 font-bold">{activeChannelMeta.unit}</span> |{' '}
                <span className="text-slate-300">{activeChannelMeta.description}</span>
              </div>
            )}
          </div>

          <div className="h-72 w-full bg-[#080d1a] border border-slate-800 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 15, right: 25, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }} unit="s" />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  unit={activeChannelMeta?.unit === '°C' ? '°C' : activeChannelMeta?.name === 'soc' ? '%' : ''}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1322', borderColor: '#1e293b', fontSize: '12px', fontFamily: 'monospace' }}
                  formatter={(val: unknown) => [
                    `${val} ${activeChannelMeta?.unit || ''}`,
                    activeChannelMeta?.display_name || selectedSingleChannel,
                  ]}
                  labelFormatter={(lbl) => `Time Offset: ${lbl}s`}
                />
                <Line
                  type={selectedSingleChannel.includes('on') || selectedSingleChannel.includes('code') ? 'stepAfter' : 'monotone'}
                  dataKey={selectedSingleChannel}
                  stroke={CHANNEL_COLORS[selectedSingleChannel] || '#38bdf8'}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHANNEL_COLORS[selectedSingleChannel] || '#38bdf8' }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
