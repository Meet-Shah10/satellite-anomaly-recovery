import React, { useState } from 'react';
import {
  Battery,
  Cpu,
  Radio,
  Thermometer,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Info,
  Flame,
} from 'lucide-react';
import type { SpacecraftState, SpacecraftLimits } from '../../api/types';

interface ThreeNodeSchematicProps {
  state: SpacecraftState;
  limits: SpacecraftLimits;
  lastCommand: string | null;
}

type NodeStatus = 'normal' | 'warning' | 'critical';

export const ThreeNodeSchematic: React.FC<ThreeNodeSchematicProps> = ({
  state,
  limits,
  lastCommand,
}) => {
  const [showModelDetails, setShowModelDetails] = useState<boolean>(false);

  // Derive status from real constraints
  const getBatteryStatus = (): NodeStatus => {
    if (state.temp_battery < limits.temp_bat_hard_min || state.temp_battery > limits.temp_bat_hard_max) {
      return 'critical';
    }
    if (state.temp_battery < limits.temp_bat_nominal_min || state.temp_battery > limits.temp_bat_nominal_max) {
      return 'warning';
    }
    return 'normal';
  };

  const getPayloadStatus = (): NodeStatus => {
    if (state.temp_payload < limits.temp_pay_hard_min || state.temp_payload > limits.temp_pay_hard_max) {
      return 'critical';
    }
    if (state.temp_payload < limits.temp_pay_nominal_min || state.temp_payload > limits.temp_pay_nominal_max) {
      return 'warning';
    }
    return 'normal';
  };

  const getBusStatus = (): NodeStatus => {
    if (state.temp_bus < limits.temp_bus_hard_min || state.temp_bus > limits.temp_bus_hard_max) {
      return 'critical';
    }
    if (state.temp_bus < limits.temp_bus_nominal_min || state.temp_bus > limits.temp_bus_nominal_max) {
      return 'warning';
    }
    return 'normal';
  };

  const batStatus = getBatteryStatus();
  const payStatus = getPayloadStatus();
  const busStatus = getBusStatus();

  // Identify affected node based on last command
  const isPayloadAffected = Boolean(lastCommand?.includes('payload') || lastCommand?.includes('heater'));
  const isBusAffected = Boolean(lastCommand?.includes('power') || lastCommand?.includes('transmitter') || lastCommand === 'safe_mode' || lastCommand === 'resume_nominal');
  const isBatteryAffected = Boolean(lastCommand === 'safe_mode' || lastCommand?.includes('power'));

  const getStatusStyles = (status: NodeStatus, isAffected: boolean) => {
    const base = 'relative rounded-xl border p-4.5 transition-all duration-300 flex flex-col justify-between';
    const highlight = isAffected ? 'ring-1.5 ring-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.15)]' : '';
    switch (status) {
      case 'critical':
        return `${base} bg-rose-950/30 border-rose-500/70 text-rose-200 ${highlight}`;
      case 'warning':
        return `${base} bg-amber-950/25 border-amber-500/60 text-amber-200 ${highlight}`;
      case 'normal':
      default:
        return `${base} bg-[#0e1626] border-slate-800 text-slate-200 ${highlight}`;
    }
  };

  const getBadge = (status: NodeStatus) => {
    switch (status) {
      case 'critical':
        return <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">CRITICAL</span>;
      case 'warning':
        return <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">OUT OF BAND</span>;
      case 'normal':
      default:
        return <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">NOMINAL</span>;
    }
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-800 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-slate-100 text-base">Three-Node Spacecraft Thermal Schematic</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Lumped-parameter conductive RC network coupled with radiative heat dissipation to deep space
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400">Radiative Sink:</span>
            <span className="text-cyan-300 font-bold">-90.0 °C</span>
          </div>
          <button
            type="button"
            onClick={() => setShowModelDetails(!showModelDetails)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
            title="Toggle secondary thermal equations and physical parameters"
          >
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <span>Model Details</span>
            {showModelDetails ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* 3 Node Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5 relative items-stretch">
        {/* Node 1: Battery Node */}
        <div className={getStatusStyles(batStatus, isBatteryAffected)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Battery className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-medium tracking-wider">Node 1</span>
                  <h4 className="font-semibold text-sm text-slate-100">Battery Pack</h4>
                </div>
              </div>
              {getBadge(batStatus)}
            </div>

            {/* Prominent Temperature Display */}
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-sans">Core Temperature</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-mono font-bold text-white">
                  {state.temp_battery.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-400">°C</span>
              </div>
            </div>

            {/* Thermal Operational Bands */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Nominal Band</span>
                <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                  [{limits.temp_bat_nominal_min}, {limits.temp_bat_nominal_max}] °C
                </span>
              </div>
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Hard Limits</span>
                <span className="text-rose-400 font-mono text-[11px] font-semibold">
                  [{limits.temp_bat_hard_min}, {limits.temp_bat_hard_max}] °C
                </span>
              </div>
            </div>

            {/* Dynamic Node Status */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Fault Heat:</span>
                <span className={state.fault_heat_battery > 0 ? 'text-amber-400 font-mono font-semibold' : 'text-slate-500 font-mono'}>
                  {state.fault_heat_battery > 0 ? `+${state.fault_heat_battery.toFixed(1)} W` : '0.0 W'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Charge Level:</span>
                <span className="text-sky-300 font-mono font-semibold">
                  {(state.soc * 100).toFixed(1)}% SoC
                </span>
              </div>
            </div>
          </div>

          {/* Conductive link to Bus */}
          <div className="mt-3.5 text-[10px] font-mono py-1 px-2 rounded bg-slate-950/60 border border-slate-800 text-cyan-400 flex items-center justify-center gap-1.5">
            <ArrowRightLeft className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>Conducts to Bus: UA = 0.10 W/°C</span>
          </div>
        </div>

        {/* Node 3: Electronics Bus (Central Structural Node) */}
        <div className={getStatusStyles(busStatus, isBusAffected)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-medium tracking-wider">Node 3 (Hub)</span>
                  <h4 className="font-semibold text-sm text-slate-100">Electronics Bus</h4>
                </div>
              </div>
              {getBadge(busStatus)}
            </div>

            {/* Prominent Temperature Display */}
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-sans">Core Temperature</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-mono font-bold text-white">
                  {state.temp_bus.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-400">°C</span>
              </div>
            </div>

            {/* Thermal Operational Bands */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Nominal Band</span>
                <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                  [{limits.temp_bus_nominal_min}, {limits.temp_bus_nominal_max}] °C
                </span>
              </div>
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Hard Limits</span>
                <span className="text-rose-400 font-mono text-[11px] font-semibold">
                  [{limits.temp_bus_hard_min}, {limits.temp_bus_hard_max}] °C
                </span>
              </div>
            </div>

            {/* Dynamic Node Status */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Transmitter:</span>
                <span className={state.transmitter_on ? 'text-cyan-400 font-mono font-semibold' : 'text-slate-500 font-mono'}>
                  {state.transmitter_on ? '20 W (ON)' : 'OFF'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Joule Heat:</span>
                <span className="text-slate-300 font-mono">12% electrical load</span>
              </div>
            </div>
          </div>

          {/* Central thermal junction tag */}
          <div className="mt-3.5 text-[10px] font-mono py-1 px-2 rounded bg-slate-950/60 border border-slate-800 text-slate-400 flex items-center justify-center gap-1.5">
            <span>Thermal Junction: Bat & Pay Couples</span>
          </div>
        </div>

        {/* Node 2: Payload Node */}
        <div className={getStatusStyles(payStatus, isPayloadAffected)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-medium tracking-wider">Node 2</span>
                  <h4 className="font-semibold text-sm text-slate-100">Science Payload</h4>
                </div>
              </div>
              {getBadge(payStatus)}
            </div>

            {/* Prominent Temperature Display */}
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-sans">Core Temperature</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-mono font-bold text-white">
                  {state.temp_payload.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-400">°C</span>
              </div>
            </div>

            {/* Thermal Operational Bands */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Nominal Band</span>
                <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                  [{limits.temp_pay_nominal_min}, {limits.temp_pay_nominal_max}] °C
                </span>
              </div>
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800/60">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Hard Limits</span>
                <span className="text-rose-400 font-mono text-[11px] font-semibold">
                  [{limits.temp_pay_hard_min}, {limits.temp_pay_hard_max}] °C
                </span>
              </div>
            </div>

            {/* Dynamic Node Status */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Payload Power:</span>
                <span className={state.payload_on ? 'text-purple-400 font-mono font-semibold' : 'text-slate-500 font-mono'}>
                  {state.payload_on ? '14 W (ON)' : 'OFF'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Heater Relay:</span>
                <span className={state.heater_on ? 'text-amber-400 font-mono font-semibold flex items-center gap-1' : 'text-slate-500 font-mono'}>
                  {state.heater_on && <Flame className="w-3 h-3 text-amber-400" />}
                  {state.heater_on ? '+15 W (HEATER ON)' : 'OFF'}
                </span>
              </div>
              {state.fault_heat_payload > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-rose-400">Fault Heat Input:</span>
                  <span className="text-rose-400 font-mono font-semibold">+{state.fault_heat_payload.toFixed(1)} W</span>
                </div>
              )}
            </div>
          </div>

          {/* Conductive link to Bus */}
          <div className="mt-3.5 text-[10px] font-mono py-1 px-2 rounded bg-slate-950/60 border border-slate-800 text-cyan-400 flex items-center justify-center gap-1.5">
            <ArrowRightLeft className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>Conducts to Bus: UA = 0.20 W/°C</span>
          </div>
        </div>
      </div>

      {/* Collapsible Secondary Physical Parameters & Equations */}
      {showModelDetails && (
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-3">
          <div className="font-semibold text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-400" />
            <span>Thermal RC Network Governing Equations & Parameters</span>
          </div>

          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-sky-300 overflow-x-auto">
            C_i · (dT_i / dt) = Σ Q_in,i - UA_space,i · (T_i - T_sink) - Σ_j UA_ij · (T_i - T_j)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <span className="font-semibold text-slate-200 block mb-1">Battery (Node 1)</span>
              <ul className="space-y-1 text-slate-400 text-[11px] font-mono">
                <li>C_bat = 500 J/°C</li>
                <li>UA_space = 0.50 W/°C</li>
                <li>UA_bus = 0.10 W/°C</li>
              </ul>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <span className="font-semibold text-slate-200 block mb-1">Electronics Bus (Node 3)</span>
              <ul className="space-y-1 text-slate-400 text-[11px] font-mono">
                <li>C_bus = 800 J/°C</li>
                <li>UA_space = 0.80 W/°C</li>
                <li>Joule heat = 12% load</li>
              </ul>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <span className="font-semibold text-slate-200 block mb-1">Payload (Node 2)</span>
              <ul className="space-y-1 text-slate-400 text-[11px] font-mono">
                <li>C_pay = 1000 J/°C</li>
                <li>UA_space = 0.30 W/°C</li>
                <li>UA_bus = 0.20 W/°C</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Distinction Note */}
      <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
        <span className="text-[11px]">
          Conductive thermal paths model physical chassis diffusion; electrical bus loads dynamically inject Joule heating into Node 3.
        </span>
        <span className="font-mono text-slate-500 text-[11px] shrink-0 ml-2">
          Euler Δt = 60s
        </span>
      </div>
    </div>
  );
};
