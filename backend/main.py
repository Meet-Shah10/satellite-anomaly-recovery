"""
FastAPI entry point for Risk-Aware Dynamic A* Satellite Anomaly Recovery.

Provides REST API endpoints for:
- System health & asset status verification
- Spacecraft scenario & command catalog introspection
- Step-by-step interactive physical simulation
- State-space recovery planning with trajectory serialization
- Multi-algorithm comparative benchmarking
- Nominal training telemetry inspection
- Historical experiment results querying
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .schemas import (
    HealthResponse,
    PlanRequest,
    PlanResponse,
    ScenarioInfoSchema,
    CommandInfoSchema,
    SimulateStepRequest,
    SimulateStepResponse,
    SimulateInitResponse,
    BenchmarkCompareRequest,
    BenchmarkCompareResponse,
    TelemetrySampleResponse,
    ExperimentHistoryResponse,
)
from .services import service

# Configure module logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("satellite_backend")

# Create FastAPI application
app = FastAPI(
    title="Risk-Aware Dynamic A* for Satellite Anomaly Recovery API",
    description=(
        "Aerospace research backend delivering state-space search planners "
        "(Dynamic A*, IDA*, RBFS, Local Search) integrated with unsupervised "
        "Isolation Forest anomaly detection for autonomous spacecraft recovery."
    ),
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for future frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    log.warning("Validation error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(KeyError)
async def key_error_handler(request: Request, exc: KeyError):
    log.warning("Key error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": f"Resource not found: {exc}"},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    log.error("Internal error processing %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal error occurred during request execution."},
    )


# ---------------------------------------------------------------------------
# Core Endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/api/health",
    response_model=HealthResponse,
    summary="System Health & Asset Status",
    description="Reports API operational status, Python environment, and research asset availability.",
)
async def get_health() -> HealthResponse:
    data = service.get_health_status()
    return HealthResponse(**data)


@app.get(
    "/api/scenarios",
    response_model=list[ScenarioInfoSchema],
    summary="List Evaluation Scenarios",
    description="Enumerates available canonical spacecraft anomaly scenarios and orbit parameters.",
)
async def list_scenarios() -> list[ScenarioInfoSchema]:
    return service.list_scenarios()


@app.get(
    "/api/commands",
    response_model=list[CommandInfoSchema],
    summary="List Recovery Commands",
    description="Enumerates the 8 recovery commands with latencies, energy costs, and nominal metrics.",
)
async def list_commands() -> list[CommandInfoSchema]:
    return service.list_commands()


@app.get(
    "/api/simulate/init",
    response_model=SimulateInitResponse,
    summary="Initialize Spacecraft Simulation for Scenario",
    description="Returns the deterministic initial spacecraft state, scenario parameters, and physical limits.",
)
async def simulate_init_query(
    scenario: str = Query('single_thermal', description="Named evaluation scenario to initialize")
) -> SimulateInitResponse:
    try:
        data = service.init_simulation(scenario)
        return SimulateInitResponse(**data)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        log.error("Simulation init failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation init failed: {exc}",
        )


@app.get(
    "/api/simulate/init/{scenario_name}",
    response_model=SimulateInitResponse,
    summary="Initialize Spacecraft Simulation for Scenario (Path Parameter)",
    description="Returns the deterministic initial spacecraft state, scenario parameters, and physical limits.",
)
async def simulate_init_path(scenario_name: str) -> SimulateInitResponse:
    try:
        data = service.init_simulation(scenario_name)
        return SimulateInitResponse(**data)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        log.error("Simulation init failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation init failed: {exc}",
        )


@app.post(
    "/api/simulate/step",
    response_model=SimulateStepResponse,
    summary="Advance Simulation by One Command",
    description="Executes a legal recovery command on a given spacecraft state using the simulator's physics integration.",
)
async def simulate_step(request: SimulateStepRequest) -> SimulateStepResponse:
    try:
        result_data = service.step_simulation(request)
        return SimulateStepResponse(**result_data)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        log.error("Simulation step execution failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation step failed: {exc}",
        )


@app.post(
    "/api/plan/solve",
    response_model=PlanResponse,
    summary="Execute Recovery Planning Search",
    description="Dispatches state-space search algorithm to solve the selected anomaly recovery scenario.",
)
async def solve_plan(request: PlanRequest) -> PlanResponse:
    try:
        # Offload CPU-bound search algorithm to a worker thread
        result_data = await asyncio.to_thread(service.solve_recovery_plan, request)
        return PlanResponse(**result_data)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        log.error("Planning execution failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Algorithm execution failed: {exc}",
        )


@app.post(
    "/api/benchmark/compare",
    response_model=BenchmarkCompareResponse,
    summary="Benchmark Algorithms Head-to-Head",
    description="Executes multiple search algorithms on a scenario and returns comparative metrics.",
)
async def benchmark_compare(request: BenchmarkCompareRequest) -> BenchmarkCompareResponse:
    try:
        # Offload CPU-bound multi-algorithm benchmark to a worker thread
        result_data = await asyncio.to_thread(service.benchmark_compare, request)
        return BenchmarkCompareResponse(**result_data)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        log.error("Benchmark comparison failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Benchmark comparison failed: {exc}",
        )


@app.get(
    "/api/telemetry/sample",
    response_model=TelemetrySampleResponse,
    summary="Sample Nominal Telemetry Data",
    description="Returns verified 10-step trajectory windows from the offline nominal training dataset.",
)
async def get_telemetry_sample(
    window_index: Optional[int] = Query(None, ge=0, description="Specific window index (0 to 20199)"),
    n_windows: int = Query(1, ge=1, le=10, description="Number of consecutive windows to return"),
    seed: Optional[int] = Query(None, ge=0, description="Seed for reproducible pseudo-random sampling"),
) -> TelemetrySampleResponse:
    try:
        data = service.get_telemetry_sample(
            window_index=window_index,
            n_windows=n_windows,
            seed=seed,
        )
        return TelemetrySampleResponse(**data)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(fnf))


@app.get(
    "/api/experiments/history",
    response_model=ExperimentHistoryResponse,
    summary="Query Historical Experiment Results",
    description="Queries historical sweep records from experiments/results/results.csv in read-only mode.",
)
async def get_experiment_history(
    scenario: Optional[str] = Query(None, description="Filter by scenario name"),
    algorithm: Optional[str] = Query(None, description="Filter by algorithm name"),
    variant: Optional[str] = Query(None, description="Filter by heuristic variant (H0-H4)"),
    limit: int = Query(100, ge=1, le=500, description="Maximum records to return"),
    offset: int = Query(0, ge=0, description="Record pagination offset"),
) -> ExperimentHistoryResponse:
    data = service.get_experiment_history(
        scenario=scenario,
        algorithm=algorithm,
        variant=variant,
        limit=limit,
        offset=offset,
    )
    return ExperimentHistoryResponse(**data)
