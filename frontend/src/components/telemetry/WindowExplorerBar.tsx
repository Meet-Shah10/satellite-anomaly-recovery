import React, { useState } from 'react';
import { Search, Shuffle, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Sparkles, Filter } from 'lucide-react';

interface WindowExplorerBarProps {
  totalWindows: number;
  currentIndex: number;
  nWindows: number;
  seed: number | null;
  isLoading: boolean;
  onLoadWindow: (index: number, count: number) => Promise<void>;
  onLoadSeeded: (seed: number, count: number) => Promise<void>;
}

export const WindowExplorerBar: React.FC<WindowExplorerBarProps> = ({
  totalWindows,
  currentIndex,
  nWindows,
  seed,
  isLoading,
  onLoadWindow,
  onLoadSeeded,
}) => {
  const [inputIndex, setInputIndex] = useState<string>(String(currentIndex));
  const [inputCount, setInputCount] = useState<number>(nWindows);
  const [inputSeed, setInputSeed] = useState<string>(seed !== null ? String(seed) : '42');
  const [useSeedMode, setUseSeedMode] = useState<boolean>(seed !== null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const maxValidIndex = totalWindows > 0 ? totalWindows - 1 : 10099;

  const handleSubmitIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (useSeedMode) {
      const parsedSeed = parseInt(inputSeed, 10);
      if (isNaN(parsedSeed) || parsedSeed < 0) {
        setValidationError('Random seed must be a non-negative integer (e.g. 0, 42, 100).');
        return;
      }
      await onLoadSeeded(parsedSeed, inputCount);
      return;
    }

    const parsedIndex = parseInt(inputIndex, 10);
    if (isNaN(parsedIndex)) {
      setValidationError('Please enter a valid numerical window index.');
      return;
    }

    if (parsedIndex < 0 || parsedIndex > maxValidIndex) {
      setValidationError(`Window index must be between 0 and ${maxValidIndex}. (Requested: ${parsedIndex})`);
      return;
    }

    if (parsedIndex + inputCount > totalWindows) {
      setValidationError(
        `Range [${parsedIndex}, ${parsedIndex + inputCount - 1}] exceeds total available windows (${totalWindows}).`
      );
      return;
    }

    await onLoadWindow(parsedIndex, inputCount);
  };

  const handleStep = async (delta: number) => {
    setValidationError(null);
    setUseSeedMode(false);
    const target = Math.max(0, Math.min(maxValidIndex - inputCount + 1, currentIndex + delta));
    setInputIndex(String(target));
    await onLoadWindow(target, inputCount);
  };

  const handleRandom = async () => {
    setValidationError(null);
    const randomSeed = Math.floor(Math.random() * 100000);
    setInputSeed(String(randomSeed));
    setUseSeedMode(true);
    await onLoadSeeded(randomSeed, inputCount);
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Telemetry Window Explorer</h3>
          <span className="text-xs font-mono text-slate-400">
            (Total Windows: <strong className="text-slate-200">{totalWindows.toLocaleString()}</strong>)
          </span>
        </div>

        {/* Mode Toggle: Direct Index vs Seeded Sample */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => {
              setUseSeedMode(false);
              setValidationError(null);
            }}
            className={`px-2.5 py-1 rounded transition-colors font-medium cursor-pointer ${
              !useSeedMode ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Direct Index
          </button>
          <button
            type="button"
            onClick={() => {
              setUseSeedMode(true);
              setValidationError(null);
            }}
            className={`px-2.5 py-1 rounded transition-colors font-medium cursor-pointer ${
              useSeedMode ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Seeded Sample
          </button>
        </div>
      </div>

      {/* Control Form */}
      <form onSubmit={handleSubmitIndex} className="flex flex-wrap items-center gap-3">
        {!useSeedMode ? (
          /* Direct Window Index Input */
          <div className="flex items-center gap-2">
            <label htmlFor="window-index-input" className="text-xs text-slate-300 font-medium">
              Window Index:
            </label>
            <div className="relative">
              <input
                id="window-index-input"
                type="number"
                min={0}
                max={maxValidIndex}
                value={inputIndex}
                onChange={(e) => {
                  setInputIndex(e.target.value);
                  setValidationError(null);
                }}
                disabled={isLoading}
                className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <span className="text-[11px] font-mono text-slate-400">/ {maxValidIndex}</span>
          </div>
        ) : (
          /* Seeded Input */
          <div className="flex items-center gap-2">
            <label htmlFor="seed-input" className="text-xs text-slate-300 font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              RNG Seed:
            </label>
            <input
              id="seed-input"
              type="number"
              min={0}
              value={inputSeed}
              onChange={(e) => {
                setInputSeed(e.target.value);
                setValidationError(null);
              }}
              disabled={isLoading}
              className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}

        {/* Windows Count (1 to 10) */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <label htmlFor="window-count-select" className="text-xs text-slate-300 font-medium">
            Batch Count:
          </label>
          <select
            id="window-count-select"
            value={inputCount}
            onChange={(e) => setInputCount(parseInt(e.target.value, 10))}
            disabled={isLoading}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
          >
            {[1, 2, 3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'window' : 'windows'}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Step Controls */}
          {!useSeedMode && (
            <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => handleStep(-1)}
                disabled={isLoading || currentIndex <= 0}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="Previous Window (Index - 1)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStep(1)}
                disabled={isLoading || currentIndex >= maxValidIndex}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="Next Window (Index + 1)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Randomizer */}
          <button
            type="button"
            onClick={handleRandom}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Sample reproducible random seed"
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-400" />
            <span>Random</span>
          </button>

          {/* Load / Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Fetch Window</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Validation Warning */}
      {validationError && (
        <div className="bg-rose-950/40 border border-rose-500/70 rounded-lg p-2.5 text-xs text-rose-300 flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
