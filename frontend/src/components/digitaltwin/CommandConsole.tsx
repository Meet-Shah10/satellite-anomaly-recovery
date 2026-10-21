import React, { useState } from 'react';
import { Terminal, Play, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { CommandInfo, SpacecraftState } from '../../api/types';

interface CommandConsoleProps {
  commands: CommandInfo[];
  currentState: SpacecraftState;
  onExecute: (commandName: string) => Promise<void>;
  isExecuting: boolean;
  commandError: string | null;
  lastExecutionFeedback: {
    command: string;
    cost: number;
    inNominal: boolean;
    isInfeasible: boolean;
    margin: number | null;
  } | null;
}

const COMMAND_SCIENCE_NOTES: Record<
  string,
  { summary: string; cascade: string; preDesc: string }
> = {
  payload_off: {
    summary: 'Shed primary payload load (saves ≈ 40 W).',
    cascade: 'Cools payload node (removes 14 W dissipation); lower payload temp reduces conductive heat flux to bus node.',
    preDesc: 'Payload must currently be powered ON.',
  },
  payload_on: {
    summary: 'Restore payload power and operations (+40 W load).',
    cascade: 'Generates 14 W internal electronics heat (35% fraction); couples heat back into bus. Illegal in safe_mode.',
    preDesc: 'Payload must be OFF and spacecraft cannot be in SAFE_MODE.',
  },
  heater_on: {
    summary: 'Activate payload thermal heater (+15 W electrical draw).',
    cascade: 'Injects direct 15 W thermal power into payload node; increases battery discharge rate.',
    preDesc: 'Payload heater must currently be OFF.',
  },
  heater_off: {
    summary: 'Deactivate payload thermal heater (saves 15 W electrical draw).',
    cascade: 'Halts 15 W heater injection; payload node will cool toward radiative space sink (-90 °C).',
    preDesc: 'Payload heater must currently be ON.',
  },
  low_power_mode: {
    summary: 'Throttle avionics from 30 W to 18 W (Tier-1 load shed).',
    cascade: 'Reduces bus joule heating (12% of total load) and preserves battery SoC.',
    preDesc: 'Operating mode must currently be NOMINAL.',
  },
  resume_nominal: {
    summary: 'Exit low-power mode and restore avionics to full 30 W baseline.',
    cascade: 'Increases avionics power draw and bus dissipation.',
    preDesc: 'Operating mode must currently be LOW_POWER.',
  },
  transmitter_off: {
    summary: 'Shed 20 W RF transmitter load (Tier-1 load shed).',
    cascade: 'Immediate 20 W bus relief; halts telemetry downlink.',
    preDesc: 'Transmitter must currently be powered ON.',
  },
  safe_mode: {
    summary: 'Maximum power preservation (Tier-2 emergency shed).',
    cascade: 'Forces low avionics (18 W), sheds payload, and sheds transmitter. Watch for bus freezing.',
    preDesc: 'Spacecraft must not already be in SAFE_MODE.',
  },
};

export const CommandConsole: React.FC<CommandConsoleProps> = ({
  commands,
  currentState,
  onExecute,
  isExecuting,
  commandError,
  lastExecutionFeedback,
}) => {
  const [selectedCommand, setSelectedCommand] = useState<string>('payload_off');

  // Check preconditions matching satellite_recovery/simulator/commands.py
  const checkPrecondition = (name: string): { isLegal: boolean; reason: string } => {
    switch (name) {
      case 'payload_off':
        return currentState.payload_on
          ? { isLegal: true, reason: 'Legal: Payload is ON' }
          : { isLegal: false, reason: 'Illegal: Payload is already OFF' };
      case 'payload_on':
        if (currentState.mode === 'safe_mode') {
          return { isLegal: false, reason: 'Illegal: Cannot activate payload in SAFE_MODE' };
        }
        return !currentState.payload_on
          ? { isLegal: true, reason: 'Legal: Payload is OFF & mode != safe_mode' }
          : { isLegal: false, reason: 'Illegal: Payload is already ON' };
      case 'heater_on':
        return !currentState.heater_on
          ? { isLegal: true, reason: 'Legal: Heater is OFF' }
          : { isLegal: false, reason: 'Illegal: Heater is already ON' };
      case 'heater_off':
        return currentState.heater_on
          ? { isLegal: true, reason: 'Legal: Heater is ON' }
          : { isLegal: false, reason: 'Illegal: Heater is already OFF' };
      case 'low_power_mode':
        return currentState.mode === 'nominal'
          ? { isLegal: true, reason: 'Legal: Mode is currently NOMINAL' }
          : { isLegal: false, reason: `Illegal: Mode is '${currentState.mode}' (must be 'nominal')` };
      case 'resume_nominal':
        return currentState.mode === 'low_power'
          ? { isLegal: true, reason: 'Legal: Mode is currently LOW_POWER' }
          : { isLegal: false, reason: `Illegal: Mode is '${currentState.mode}' (must be 'low_power')` };
      case 'transmitter_off':
        return currentState.transmitter_on
          ? { isLegal: true, reason: 'Legal: Transmitter is ON' }
          : { isLegal: false, reason: 'Illegal: Transmitter is already OFF' };
      case 'safe_mode':
        return currentState.mode !== 'safe_mode'
          ? { isLegal: true, reason: 'Legal: Spacecraft not in SAFE_MODE' }
          : { isLegal: false, reason: 'Illegal: Already in SAFE_MODE' };
      default:
        return { isLegal: false, reason: 'Unknown command' };
    }
  };

  const activeCmdObj = commands.find((c) => c.name === selectedCommand);
  const activeLegalStatus = checkPrecondition(selectedCommand);
  const activeNotes = COMMAND_SCIENCE_NOTES[selectedCommand] || {
    summary: 'Spacecraft recovery action.',
    cascade: 'Modifies spacecraft configuration.',
    preDesc: 'Standard flight software precondition.',
  };

  const handleExecuteClick = async () => {
    if (!activeLegalStatus.isLegal || isExecuting) return;
    await onExecute(selectedCommand);
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-slate-100 text-base">Recovery Command Console</h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Backend Simulator Transition: <span className="text-cyan-300">x&apos; = step(apply(x, a))</span>
        </span>
      </div>

      {/* Grid of Commands */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {commands.map((cmd) => {
          const check = checkPrecondition(cmd.name);
          const isSelected = selectedCommand === cmd.name;

          return (
            <button
              key={cmd.name}
              type="button"
              onClick={() => setSelectedCommand(cmd.name)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                  : 'bg-[#0e1626] border-slate-800/90 hover:border-slate-700 hover:bg-[#121c30]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-bold text-slate-100 truncate">
                  {cmd.name}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    check.isLegal ? 'bg-emerald-400 ring-2 ring-emerald-500/20' : 'bg-slate-600'
                  }`}
                  title={check.reason}
                />
              </div>

              <div className="text-[10px] font-mono text-slate-400 space-y-0.5">
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="text-slate-300">{cmd.latency_s}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Energy:</span>
                  <span className="text-slate-300">{cmd.energy_j}J</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-cyan-400">Cost g(a):</span>
                  <span className="text-slate-200">{cmd.nominal_cost.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-2 text-[10px] font-mono">
                {check.isLegal ? (
                  <span className="text-emerald-400">Legal</span>
                ) : (
                  <span className="text-slate-500">Inapplicable</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Command Inspection & Execution Bar */}
      {activeCmdObj && (
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-mono text-sm font-bold text-cyan-300">{activeCmdObj.name}</h4>
                {activeLegalStatus.isLegal ? (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    PRECONDITIONS MET
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    BLOCKED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1">{activeNotes.summary}</p>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="bg-slate-950/60 px-3 py-1.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Latency (τ)</span>
                <span className="text-slate-100 font-bold">{activeCmdObj.latency_s} s</span>
              </div>
              <div className="bg-slate-950/60 px-3 py-1.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Energy (ε)</span>
                <span className="text-slate-100 font-bold">{activeCmdObj.energy_j} J</span>
              </div>
              <div className="bg-slate-950/60 px-3 py-1.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Cost g(a) = ατ + βε</span>
                <span className="text-cyan-400 font-bold">{activeCmdObj.nominal_cost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Scientific Cascade Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/60">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                Thermal & Power Cascade:
              </span>
              <p className="text-slate-300 text-[11px] leading-relaxed">{activeNotes.cascade}</p>
            </div>

            <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/60">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                Precondition Status:
              </span>
              <p
                className={`text-[11px] font-mono leading-relaxed ${
                  activeLegalStatus.isLegal ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {activeLegalStatus.reason}
              </p>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-400">
              Dispatches <code className="text-cyan-300 font-mono">POST /api/simulate/step</code> to advance simulation physics by Δt = 60s.
            </div>

            <button
              type="button"
              onClick={handleExecuteClick}
              disabled={!activeLegalStatus.isLegal || isExecuting}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeLegalStatus.isLegal && !isExecuting
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.35)] cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              {isExecuting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Integrating Physics (Δt=60s)...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Command: {activeCmdObj.name}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Precondition Rejection or Execution Error Alert */}
      {commandError && (
        <div className="bg-rose-950/40 border border-rose-500/80 rounded-lg p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-mono font-bold block mb-0.5">Command Rejected by Simulator:</span>
            <span>{commandError}</span>
            <span className="block text-[11px] text-rose-400/80 mt-1">
              The spacecraft state was retained unchanged.
            </span>
          </div>
        </div>
      )}

      {/* Last Command Successful Feedback */}
      {lastExecutionFeedback && !commandError && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-2 font-mono">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">
              Executed: <strong className="text-cyan-300">{lastExecutionFeedback.command}</strong>
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">
              Cost: <strong className="text-slate-200">{lastExecutionFeedback.cost.toFixed(2)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                lastExecutionFeedback.inNominal
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}
            >
              {lastExecutionFeedback.inNominal ? 'NOMINAL' : 'OUT OF BAND'}
            </span>
            {lastExecutionFeedback.isInfeasible && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                INFEASIBLE
              </span>
            )}
            {lastExecutionFeedback.margin !== null && (
              <span className="text-slate-400 text-[11px]">
                Margin: <strong className="text-slate-200">{lastExecutionFeedback.margin.toFixed(4)}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
