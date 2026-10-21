import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  RotateCcw,
  AlertTriangle,
  Sun,
  Moon,
  Layers,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type {
  ScenarioInfo,
  CommandInfo,
  SpacecraftState,
  SpacecraftLimits,
  SimulateInitResponse,
} from '../api/types';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorAlert } from '../components/common/ErrorAlert';
import { ThreeNodeSchematic } from '../components/digitaltwin/ThreeNodeSchematic';
import { PowerSubsystemPanel } from '../components/digitaltwin/PowerSubsystemPanel';
import { CommandConsole } from '../components/digitaltwin/CommandConsole';
import { TelemetryCharts, type RecordedSnapshot } from '../components/digitaltwin/TelemetryCharts';
import { SafetyFeedback } from '../components/digitaltwin/SafetyFeedback';
import { SessionActionLog } from '../components/digitaltwin/SessionActionLog';

export const DigitalTwin: React.FC = () => {
  // Scenario and Command metadata
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('single_thermal');

  // Simulation State
  const [initData, setInitData] = useState<SimulateInitResponse | null>(null);
  const [currentState, setCurrentState] = useState<SpacecraftState | null>(null);
  const [limits, setLimits] = useState<SpacecraftLimits | null>(null);
  const [solarFluxW, setSolarFluxW] = useState<number>(0.0);

  // Session Transition History
  const [sessionHistory, setSessionHistory] = useState<RecordedSnapshot[]>([]);
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  // Execution & Feedback State
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<{
    command: string;
    cost: number;
    inNominal: boolean;
    isInfeasible: boolean;
    margin: number | null;
  } | null>(null);

  // Page level lifecycle
  const [loading, setLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Initialize a scenario
  const initializeScenario = useCallback(async (scenarioName: string) => {
    setCommandError(null);
    setLastFeedback(null);
    setLastCommand(null);

    const data = await api.simulateInit(scenarioName);
    setInitData(data);
    setCurrentState(data.initial_state);
    setLimits(data.limits);
    setSolarFluxW(data.solar_flux_w);

    // Initial snapshot point
    const initialSnapshot: RecordedSnapshot = {
      stepIndex: 0,
      time: data.initial_state.time,
      command: null,
      state: data.initial_state,
      cost: 0,
      safetyMargin: data.initial_state.safety_margin,
    };
    setSessionHistory([initialSnapshot]);
  }, []);

  // Initial Data Fetch
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setPageError(null);
      try {
        const [scenariosList, commandsList] = await Promise.all([
          api.getScenarios(),
          api.getCommands(),
        ]);

        if (active) {
          setScenarios(scenariosList);
          setCommands(commandsList);
          const defaultScenario = scenariosList[0]?.name || 'single_thermal';
          setSelectedScenario(defaultScenario);
          await initializeScenario(defaultScenario);
        }
      } catch (err) {
        if (active) {
          const msg =
            err instanceof ApiError ? err.detail : 'Failed to connect to simulation backend';
          setPageError(msg);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [initializeScenario]);

  // Handle Scenario Switch
  const handleScenarioChange = async (newScenario: string) => {
    setSelectedScenario(newScenario);
    setIsResetting(true);
    try {
      await initializeScenario(newScenario);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : `Failed to initialize scenario '${newScenario}'`;
      setCommandError(msg);
    } finally {
      setIsResetting(false);
    }
  };

  // Reset current scenario to initial conditions
  const handleReset = async () => {
    setIsResetting(true);
    try {
      await initializeScenario(selectedScenario);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : 'Failed to reset simulation state';
      setCommandError(msg);
    } finally {
      setIsResetting(false);
    }
  };

  // Execute Command
  const handleExecuteCommand = async (commandName: string) => {
    if (!currentState || isExecuting) return;

    setIsExecuting(true);
    setCommandError(null);

    try {
      const res = await api.simulateStep({
        state: currentState,
        command: commandName,
        orbit_phase: initData?.orbit_phase,
      });

      // Update current state only upon backend confirmation
      setCurrentState(res.next_state);
      setLastCommand(commandName);

      // Record in session transition history
      setSessionHistory((prev) => [
        ...prev,
        {
          stepIndex: prev.length,
          time: res.next_state.time,
          command: commandName,
          state: res.next_state,
          cost: res.command_cost,
          safetyMargin: res.safety_margin,
        },
      ]);

      setLastFeedback({
        command: commandName,
        cost: res.command_cost,
        inNominal: res.in_nominal,
        isInfeasible: res.is_infeasible,
        margin: res.safety_margin,
      });
    } catch (err) {
      // Retain last valid state on rejection
      const msg =
        err instanceof ApiError
          ? err.detail
          : 'Simulation step execution failed. State retained.';
      setCommandError(msg);
    } finally {
      setIsExecuting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner label="Initializing Spacecraft Digital Twin..." />;
  }

  if (pageError || !currentState || !limits || !initData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Spacecraft Digital Twin
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Explore the simulated spacecraft&apos;s thermal and power state, issue legal recovery commands, and observe the resulting state transitions.
            </p>
          </div>
        </div>
        <ErrorAlert
          title="Digital Twin Initialization Error"
          message={pageError || 'Backend simulation service is unavailable.'}
          onRetry={() => handleScenarioChange(selectedScenario)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Simulation Disclaimer Banner */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-950/60 border border-sky-800/60 text-sky-400 shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Spacecraft Digital Twin
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Explore simulated spacecraft thermal and power states, issue legal recovery commands, and observe state transitions.
              </p>
            </div>
          </div>

          {/* Prominent Simulation Label */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/40 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>SIMULATION — NOT LIVE SPACECRAFT TELEMETRY</span>
            </span>
          </div>
        </div>

        {/* Active Scenario Selector & Configuration Bar */}
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-md">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <label htmlFor="scenario-select" className="text-xs font-mono font-semibold text-slate-300">
                Scenario:
              </label>
              <select
                id="scenario-select"
                value={selectedScenario}
                onChange={(e) => handleScenarioChange(e.target.value)}
                disabled={isResetting || isExecuting}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                {scenarios.map((sc) => (
                  <option key={sc.name} value={sc.name}>
                    {sc.name} — {sc.fault_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-slate-500">Fault:</span>
              <span className="text-rose-400 font-bold">{initData.fault_name}</span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-slate-500">Orbit Phase (ϕ):</span>
              <span className="text-slate-200">{initData.orbit_phase.toFixed(2)}</span>
              {initData.orbit_phase >= 0.65 ? (
                <span title="Eclipse Arc">
                  <Moon className="w-3.5 h-3.5 text-slate-400" />
                </span>
              ) : (
                <span title="Sunlit Arc">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden xl:inline">
              {initData.description}
            </span>
            <button
              type="button"
              onClick={handleReset}
              disabled={isResetting || isExecuting}
              className="px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Reset current scenario back to deterministic initial conditions"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>Reset State</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Section 1: Three-Node Spacecraft Thermal Schematic */}
      <ThreeNodeSchematic
        state={currentState}
        limits={limits}
        lastCommand={lastCommand}
      />

      {/* Main Section 2: Battery & Power Subsystem Panel */}
      <PowerSubsystemPanel
        state={currentState}
        limits={limits}
        solarFluxW={solarFluxW}
      />

      {/* Main Section 3: Interactive Recovery Command Console */}
      <CommandConsole
        commands={commands}
        currentState={currentState}
        onExecute={handleExecuteCommand}
        isExecuting={isExecuting}
        commandError={commandError}
        lastExecutionFeedback={lastFeedback}
      />

      {/* Main Section 4: Safety & Constraint Feedback */}
      <SafetyFeedback
        state={currentState}
        limits={limits}
        commandError={commandError}
      />

      {/* Main Section 5: Real Time-Series Measurements & Recharts */}
      <TelemetryCharts
        history={sessionHistory}
        limits={limits}
      />

      {/* Main Section 6: Current Interactive Session Action Log */}
      <SessionActionLog
        history={sessionHistory}
        onClear={handleReset}
      />
    </div>
  );
};
