import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Layers,
  Compass,
  AlertCircle,
  Sun,
  Moon,
  Clock,
  Zap,
  RotateCcw,
  ShieldCheck,
  Cpu,
  LineChart,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type {
  ScenarioInfo,
  CommandInfo,
  ExperimentHistoryResponse,
} from '../api/types';
import { useHealth } from '../context/useHealth';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { AssetIndicator } from '../components/common/AssetIndicator';
import { ErrorAlert } from '../components/common/ErrorAlert';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export const MissionOverview: React.FC = () => {
  const { health, loading: healthLoading, error: healthError, refreshHealth } = useHealth();

  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [history, setHistory] = useState<ExperimentHistoryResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('single_thermal');
  const [showLimitations, setShowLimitations] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scenariosData, commandsData, historyData] = await Promise.all([
        api.getScenarios(),
        api.getCommands(),
        api.getExperimentHistory({ limit: 6, offset: 0 }),
      ]);
      setScenarios(scenariosData);
      setCommands(commandsData);
      setHistory(historyData);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Failed to retrieve mission data from API';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [scenariosData, commandsData, historyData] = await Promise.all([
          api.getScenarios(),
          api.getCommands(),
          api.getExperimentHistory({ limit: 6, offset: 0 }),
        ]);
        if (active) {
          setScenarios(scenariosData);
          setCommands(commandsData);
          setHistory(historyData);
        }
      } catch (err) {
        if (active) {
          const msg = err instanceof ApiError ? err.detail : 'Failed to retrieve mission data from API';
          setError(msg);
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
  }, []);

  const handleFullRetry = () => {
    refreshHealth();
    loadData();
  };

  if (loading && healthLoading && !health) {
    return <LoadingSpinner label="Initializing Mission Overview..." />;
  }

  return (
    <div className="space-y-6">
      {/* Hero Header & Research Description */}
      <div className="p-6 rounded-xl bg-[#0b1120] border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2.5 py-0.5 rounded">
                Aerospace Autonomous Recovery
              </span>
              <span className="text-xs text-slate-400">Research Evaluation Platform</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">
              Risk-Aware Dynamic A* for Satellite Anomaly Recovery
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed pt-1">
              An autonomous decision architecture combining discrete-time spacecraft physical models with an unsupervised
              Isolation Forest anomaly scorer. Formulates failure recovery as an informed state-space search that steers the
              spacecraft safely away from hazardous thermal and power envelopes toward a stable nominal mode.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleFullRetry}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              title="Refresh All Backend Telemetry"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sync Telemetry</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connectivity Alert if Backend Down */}
      {(healthError || error) && (
        <ErrorAlert
          title="Backend Disconnected"
          message={
            healthError ||
            error ||
            'Unable to communicate with the FastAPI server on http://127.0.0.1:8000. Ensure uvicorn is running.'
          }
          onRetry={handleFullRetry}
          isRetrying={loading || healthLoading}
        />
      )}

      {/* Core Operational Parameter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Anomaly Scorer"
          value={health?.scorer_loaded ? 'ONLINE' : 'OFFLINE'}
          subtext="Isolation Forest + Empirical CDF [0, 1]"
          icon={<ShieldCheck className="w-4 h-4" />}
          status={health?.scorer_loaded ? 'nominal' : 'critical'}
          highlight
        />

        <MetricCard
          label="Canonical Scenarios"
          value={scenarios.length || '—'}
          unit="scenarios"
          subtext="Thermal, Battery, ADCS & Cascades"
          icon={<AlertCircle className="w-4 h-4" />}
          status="neutral"
        />

        <MetricCard
          label="Command Action Set"
          value={commands.length || '—'}
          unit="actions"
          subtext="Latency & Energy Costed Operations"
          icon={<Zap className="w-4 h-4" />}
          status="neutral"
        />

        <MetricCard
          label="Benchmark Runs"
          value={history?.total_records || '—'}
          unit="records"
          subtext="Published Baseline Benchmark Runs"
          icon={<Activity className="w-4 h-4" />}
          status="neutral"
        />
      </div>

      {/* Workspace Quick-Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/digital-twin"
          className="group p-5 rounded-xl bg-[#0b1120] border border-slate-800 hover:border-sky-500/50 hover:bg-[#0e1628] transition-all duration-200 flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-white group-hover:text-sky-300 transition-colors">
                  Spacecraft Digital Twin
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-mono">
                INTERACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Step through the 3-node thermal RC network and power balance simulator. Dispatch individual recovery commands, inspect battery SoC, and verify physical safety margins in real time.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center text-xs font-medium text-sky-400 group-hover:text-sky-300">
            <span>Explore Digital Twin Simulation</span>
            <ArrowRight className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link
          to="/telemetry-lab"
          className="group p-5 rounded-xl bg-[#0b1120] border border-slate-800 hover:border-sky-500/50 hover:bg-[#0e1628] transition-all duration-200 flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400">
                  <LineChart className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-white group-hover:text-sky-300 transition-colors">
                  Telemetry & Anomaly Lab
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-mono">
                DATASET CONNECTED
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Explore 10,100 nominal telemetry windows, evaluate model empirical CDF anomaly percentile scores R(n), and inspect 8-channel stepped and continuous time series.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center text-xs font-medium text-sky-400 group-hover:text-sky-300">
            <span>Launch Telemetry Lab</span>
            <ArrowRight className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Research Assets & Diagnostics Section */}
      <section className="p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300">
              Research Asset Verification
            </h2>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline">
            Read-only verification of model, dataset & sweep artifacts
          </span>
        </div>

        {health ? (
          <AssetIndicator assets={health.assets} scorerLoaded={health.scorer_loaded} />
        ) : (
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-400 text-center">
            Diagnostics unavailable while research backend is offline.
          </div>
        )}
      </section>

      {/* Research Limitations & Scientific Disclosure (Expandable) */}
      <section className="p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowLimitations(!showLimitations)}>
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300">
              Research Limitations & Scientific Notes
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/50">
              Audited Codebase Characteristics
            </span>
          </div>
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-slate-200"
            aria-label={showLimitations ? 'Collapse limitations' : 'Expand limitations'}
          >
            {showLimitations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          The research platform preserves all original algorithmic and mathematical formulations to ensure experimental reproducibility. Key characteristics documented during codebase audit:
        </p>

        {showLimitations && (
          <div className="pt-2 space-y-3 text-xs text-slate-300 border-t border-slate-800">
            <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-900/40 space-y-1">
              <span className="font-semibold text-amber-300 block">
                1. Heuristic H3 Double-Risk Weighting
              </span>
              <p className="text-slate-300 leading-relaxed">
                In the published research code, variant H3 evaluates edge cost as <code>g(n) = g + c + λ·R(n)</code> while simultaneously computing heuristic estimate <code>h(n) = h_d + λ·R(n)</code>. This causes risk to be accounted for twice along the open frontier. In strict accordance with research integrity, this formulation is preserved unmodified for scientific evaluation.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="font-semibold text-slate-200 block">
                2. Lumped-Parameter RC Thermal Network & Euler Discretization
              </span>
              <p className="text-slate-400 leading-relaxed">
                Simulated thermal states represent three isothermal nodes (Battery, Bus, Payload) connected by conductive heat paths and radiative links to deep space (-90.0 °C). Numerical integration uses discrete 60s Euler time-steps with raised-cosine solar illumination.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="font-semibold text-slate-200 block">
                3. Continuous State Hash Coarsening
              </span>
              <p className="text-slate-400 leading-relaxed">
                To guarantee search termination in continuous state spaces, closed-set duplicate detection discretizes temperatures into 100 uniform bins and state-of-charge into 50 uniform intervals.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Two Column Layout: Scenarios & Commands */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Scenarios (7 cols) */}
        <section className="lg:col-span-7 p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300">
                Canonical Evaluation Scenarios
              </h2>
            </div>
            <StatusBadge label={`${scenarios.length} SCENARIOS`} variant="accent" size="sm" />
          </div>

          <p className="text-xs text-slate-300">
            Canonical benchmark fault scenarios with varying orbital illumination phases and initial failure signatures.
          </p>

          <div className="space-y-2">
            {scenarios.map((sc) => {
              const isSunlit = sc.orbit_phase < 0.65;
              const isSelected = selectedScenario === sc.name;

              return (
                <div
                  key={sc.name}
                  onClick={() => setSelectedScenario(sc.name)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-950/30 border-sky-600/70 shadow-[0_0_12px_rgba(56,189,248,0.08)]'
                      : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-100">
                        {sc.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {sc.fault_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      {isSunlit ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-mono text-[11px]">
                          <Sun className="w-3.5 h-3.5" />
                          Sunlit (ϕ={(sc.orbit_phase).toFixed(2)})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                          <Moon className="w-3.5 h-3.5" />
                          Eclipse (ϕ={(sc.orbit_phase).toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mt-1 leading-snug">{sc.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Recovery Commands (5 cols) */}
        <section className="lg:col-span-5 p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300">
                Command Registry
              </h2>
            </div>
            <StatusBadge label={`${commands.length} ACTIONS`} variant="neutral" size="sm" />
          </div>

          <p className="text-xs text-slate-300">
            Available actions forming the search tree edge set with latency and energy penalties.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-medium">
                  <th className="py-2.5 px-2">Command</th>
                  <th className="py-2.5 px-2 text-right">Latency</th>
                  <th className="py-2.5 px-2 text-right">Energy</th>
                  <th className="py-2.5 px-2 text-right">Cost (g)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {commands.map((cmd) => (
                  <tr key={cmd.name} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-2 font-medium text-slate-200">
                      <code>{cmd.name}</code>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-400">{cmd.latency_s} s</td>
                    <td className="py-2 px-2 text-right text-slate-400">{cmd.energy_j} J</td>
                    <td className="py-2 px-2 text-right text-sky-300 font-semibold">
                      {cmd.nominal_cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Historical Experiment Summary Table */}
      <section className="p-5 rounded-xl bg-[#0b1120] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-300">
              Published Benchmark Experiment Runs (Sample)
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Showing top {history?.records.length || 0} of {history?.total_records || 0} recorded benchmark rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-medium font-sans">
                <th className="py-2.5 px-2">Scenario</th>
                <th className="py-2.5 px-2">Algorithm</th>
                <th className="py-2.5 px-2">Variant</th>
                <th className="py-2.5 px-2 text-right">λ (Risk)</th>
                <th className="py-2.5 px-2 text-center">Status</th>
                <th className="py-2.5 px-2 text-right">Nodes</th>
                <th className="py-2.5 px-2 text-right">Margin</th>
                <th className="py-2.5 px-2 text-right">Cost</th>
                <th className="py-2.5 px-2 text-right">Wall Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history?.records && history.records.length > 0 ? (
                history.records.map((rec, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-2 font-medium text-slate-200">{rec.scenario}</td>
                    <td className="py-2 px-2 text-slate-300">{rec.algorithm}</td>
                    <td className="py-2 px-2 text-sky-300">{rec.heuristic_variant}</td>
                    <td className="py-2 px-2 text-right text-slate-400">{rec.lambda_risk.toFixed(1)}</td>
                    <td className="py-2 px-2 text-center">
                      {rec.success ? (
                        <span className="text-emerald-400 font-semibold">SUCCESS</span>
                      ) : (
                        <span className="text-rose-400 font-semibold">FAILED</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">{rec.nodes_expanded}</td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {rec.safety_margin !== null ? rec.safety_margin.toFixed(4) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">
                      {rec.solution_cost !== null ? rec.solution_cost.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-400">
                      {(rec.wall_time_s * 1000).toFixed(1)} ms
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500 font-mono text-xs">
                    No historical experiment results found in results.csv
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scientific Methodology Disclaimer Footer */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 leading-relaxed flex items-start gap-2.5">
        <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-200">Scientific Rigor Notice: </span>
          All simulation states and telemetry parameters shown originate from the discrete-time 3-node thermal RC network
          and power balance simulator. No telemetry values are fabricated or presented as real on-orbit spacecraft measurements.
        </div>
      </div>
    </div>
  );
};
