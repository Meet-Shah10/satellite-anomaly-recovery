/**
 * Centralized API client for communicating with the FastAPI research backend.
 */

import type {
  HealthResponse,
  ScenarioInfo,
  CommandInfo,
  SimulateStepRequest,
  SimulateStepResponse,
  SimulateInitResponse,
  PlanRequest,
  PlanResponse,
  BenchmarkCompareRequest,
  BenchmarkCompareResponse,
  TelemetrySampleResponse,
  ExperimentHistoryResponse,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API Error ${status}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      let detail = 'An unexpected server error occurred';
      try {
        const errorJson = await res.json();
        detail = errorJson.detail || errorJson.message || JSON.stringify(errorJson);
      } catch {
        detail = res.statusText || detail;
      }
      throw new ApiError(res.status, detail);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network failure / Connection refused
    throw new ApiError(0, err instanceof Error ? err.message : 'Unable to connect to the backend server.');
  }
}

export const api = {
  getHealth: () => request<HealthResponse>('/api/health'),

  getScenarios: () => request<ScenarioInfo[]>('/api/scenarios'),

  getCommands: () => request<CommandInfo[]>('/api/commands'),

  simulateInit: (scenario?: string) => {
    const endpoint = scenario ? `/api/simulate/init/${encodeURIComponent(scenario)}` : '/api/simulate/init';
    return request<SimulateInitResponse>(endpoint);
  },

  simulateStep: (req: SimulateStepRequest) =>
    request<SimulateStepResponse>('/api/simulate/step', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  solvePlan: (req: PlanRequest) =>
    request<PlanResponse>('/api/plan/solve', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  benchmarkCompare: (req: BenchmarkCompareRequest) =>
    request<BenchmarkCompareResponse>('/api/benchmark/compare', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  getTelemetrySample: (params?: { window_index?: number; n_windows?: number; seed?: number }) => {
    const query = new URLSearchParams();
    if (params?.window_index !== undefined) query.set('window_index', String(params.window_index));
    if (params?.n_windows !== undefined) query.set('n_windows', String(params.n_windows));
    if (params?.seed !== undefined) query.set('seed', String(params.seed));
    const qs = query.toString();
    return request<TelemetrySampleResponse>(`/api/telemetry/sample${qs ? `?${qs}` : ''}`);
  },

  getExperimentHistory: (params?: {
    scenario?: string;
    algorithm?: string;
    variant?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.scenario) query.set('scenario', params.scenario);
    if (params?.algorithm) query.set('algorithm', params.algorithm);
    if (params?.variant) query.set('variant', params.variant);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return request<ExperimentHistoryResponse>(`/api/experiments/history${qs ? `?${qs}` : ''}`);
  },
};
