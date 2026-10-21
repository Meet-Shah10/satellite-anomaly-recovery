import React from 'react';
import { Battery, Zap, Clock, Activity, Sun, Radio, Cpu, Power } from 'lucide-react';
import type { SpacecraftState, SpacecraftLimits } from '../../api/types';

interface PowerSubsystemPanelProps {
  state: SpacecraftState;
  limits: SpacecraftLimits;
  solarFluxW: number;
}

export const PowerSubsystemPanel: React.FC<PowerSubsystemPanelProps> = ({
  state,
  limits,
  solarFluxW,
}) => {
  // Real power load calculations from SpacecraftParams in spacecraft.py
  const avionicsLoad = state.mode === 'low_power' || state.mode === 'safe_mode' ? 18.0 : 30.0;
  const payloadLoad = state.payload_on ? 40.0 : 0.0;
  const heaterLoad = state.heater_on ? 15.0 : 0.0;
  const transmitterLoad = state.transmitter_on ? 20.0 : 0.0;
  const faultExtraLoad = state.fault_extra_load;
  const totalBusLoad = avionicsLoad + payloadLoad + heaterLoad + transmitterLoad + faultExtraLoad;

  const netPowerW = solarFluxW - totalBusLoad;
  const isCharging = netPowerW >= 0;

  const socPercent = (state.soc * 100).toFixed(1);
  const socRatio = Math.max(0, Math.min(1, state.soc));

  // Determine SoC status
  const isSocCritical = state.soc < limits.soc_hard_min;
  const isSocWarning = state.soc < limits.soc_nominal_min;

  const getModeBadge = (mode: string) => {
    switch (mode) {
      case 'nominal':
        return (
          <span className="px-2.5 py-1 text-xs font-mono font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            NOMINAL
          </span>
        );
      case 'low_power':
        return (
          <span className="px-2.5 py-1 text-xs font-mono font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
            LOW_POWER (18W)
          </span>
        );
      case 'safe_mode':
        return (
          <span className="px-2.5 py-1 text-xs font-mono font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
            SAFE_MODE (TIER-2)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-mono font-bold rounded bg-slate-700 text-slate-300">
            {mode.toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-slate-100 text-base">Battery & Power Subsystem</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Simulation Time:</span>
            <span className="text-slate-100 font-bold">{state.time.toFixed(0)} s</span>
          </div>
          <div>{getModeBadge(state.mode)}</div>
        </div>
      </div>

      {/* Grid: SoC Gauge + Power Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Battery State of Charge (SoC) */}
        <div className="bg-[#0e1626] border border-slate-800/80 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Battery className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono uppercase text-slate-300 tracking-wider">
                Battery State of Charge
              </span>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-2xl font-bold text-slate-100">{socPercent}%</span>
              <span className="text-xs text-slate-400">({(state.soc * 50).toFixed(1)} / 50 Wh)</span>
            </div>
          </div>

          {/* Compact Horizontal Gauge Bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-950 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
              {/* Hard minimum marker (15%) */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
                style={{ left: `${limits.soc_hard_min * 100}%` }}
                title={`Hard Limit Floor (${limits.soc_hard_min * 100}%)`}
              />
              {/* Nominal floor marker (35%) */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
                style={{ left: `${limits.soc_nominal_min * 100}%` }}
                title={`Nominal Floor (${limits.soc_nominal_min * 100}%)`}
              />
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isSocCritical ? 'bg-rose-500' : isSocWarning ? 'bg-amber-400' : 'bg-cyan-400'
                }`}
                style={{ width: `${socRatio * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span className="text-rose-400">Hard Min: 15%</span>
              <span className="text-amber-400">Nominal Floor: 35%</span>
              <span>Capacity: 50 Wh (180 kJ)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 text-slate-300">
            <div className="flex justify-between bg-slate-950/40 px-2 py-1.5 rounded border border-slate-800/60">
              <span className="text-slate-400">Charge Eff:</span>
              <span className="text-slate-200">95%</span>
            </div>
            <div className="flex justify-between bg-slate-950/40 px-2 py-1.5 rounded border border-slate-800/60">
              <span className="text-slate-400">Discharge Eff:</span>
              <span className="text-slate-200">97%</span>
            </div>
          </div>
        </div>

        {/* Net Electrical Power Balance */}
        <div className="bg-[#0e1626] border border-slate-800/80 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-mono uppercase text-slate-300 tracking-wider">
                Net Power Balance
              </span>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span
                className={`text-2xl font-bold ${
                  netPowerW >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {netPowerW >= 0 ? `+${netPowerW.toFixed(1)}` : netPowerW.toFixed(1)} W
              </span>
              <span className="text-xs text-slate-400">
                {isCharging ? '(Charging)' : '(Discharging)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Solar Generation:</span>
              </div>
              <span className="text-slate-100 font-semibold">{solarFluxW.toFixed(1)} W</span>
            </div>

            <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Power className="w-3.5 h-3.5 text-rose-400" />
                <span>Total Bus Load:</span>
              </div>
              <span className="text-slate-100 font-semibold">{totalBusLoad.toFixed(1)} W</span>
            </div>
          </div>

          {/* Subsystem Load Breakdown */}
          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-4 gap-1.5 text-center text-[10px] font-mono">
            <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/50">
              <span className="text-slate-500 block">Avionics</span>
              <span className="text-slate-300 font-semibold">{avionicsLoad} W</span>
            </div>
            <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/50">
              <span className="text-slate-500 block">Payload</span>
              <span className={state.payload_on ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>
                {payloadLoad} W
              </span>
            </div>
            <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/50">
              <span className="text-slate-500 block">RF Tx</span>
              <span className={state.transmitter_on ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>
                {transmitterLoad} W
              </span>
            </div>
            <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/50">
              <span className="text-slate-500 block">Heater</span>
              <span className={state.heater_on ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                {heaterLoad} W
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Subsystem Binary Power & Actuator States */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Payload Switch */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-300">Payload Power</span>
          </div>
          <span
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
              state.payload_on
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {state.payload_on ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Transmitter Switch */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-300">Transmitter</span>
          </div>
          <span
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
              state.transmitter_on
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {state.transmitter_on ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Heater Switch */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-300">Payload Heater</span>
          </div>
          <span
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
              state.heater_on
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {state.heater_on ? 'ON (+15W)' : 'OFF'}
          </span>
        </div>

        {/* Mode Switch Indicator */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-300">Avionics Mode</span>
          </div>
          <span className="text-xs font-mono font-bold text-slate-200">
            {state.mode}
          </span>
        </div>
      </div>
    </div>
  );
};
