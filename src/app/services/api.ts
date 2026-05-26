import type {
  BackendAirport,
  BackendStartResponse,
  BackendSimulationResults,
  BackendFlightPlanFlight,
  BackendSimulationStatus,
  BackendSolution,
  BackendShipmentRequest,
  BackendShipmentResponse,
  BackendCancellationResult,
} from '../types/backend';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ==================== AEROPUERTOS ====================

/** Carga la lista de aeropuertos reales desde los datos del backend. */
export function fetchAirports(): Promise<BackendAirport[]> {
  return request<BackendAirport[]>('/data/airports');
}

// ==================== PLAN DE VUELOS ====================

/** Carga todos los vuelos del plan proyectados a un rango de fechas. */
export async function fetchFlightPlan(startDate: string, days = 5): Promise<BackendFlightPlanFlight[]> {
  const res = await request<{ flights: BackendFlightPlanFlight[]; totalFlights: number }>(
    `/data/flights?startDate=${startDate}&days=${days}`
  );
  return res.flights;
}

// ==================== SIMULACIÓN ====================

/**
 * Inicia una simulación de 5 días.
 * @param startDate Fecha de inicio en formato "yyyy-MM-dd" (o undefined para usar todos los datos)
 */
export function startSimulation(
  scenario: 'PERIOD_SIMULATION' | 'DAY_TO_DAY' | 'COLLAPSE_SIMULATION',
  startDate?: string
): Promise<BackendStartResponse> {
  return request<BackendStartResponse>('/simulations/start', {
    method: 'POST',
    body: JSON.stringify({ scenario, startDate: startDate ?? null }),
  });
}

/** Inicia operación día a día usando la fecha actual de ejecución. */
export function startDayToDaySimulation(startDate: string): Promise<BackendStartResponse> {
  return startSimulation('DAY_TO_DAY', startDate);
}

export function stopSimulation(simId: string): Promise<void> {
  return request<void>(`/simulations/${simId}/stop`, { method: 'POST' });
}

export function pauseSimulation(simId: string): Promise<void> {
  return request<void>(`/simulations/${simId}/pause`, { method: 'POST' });
}

export function resumeSimulation(simId: string): Promise<void> {
  return request<void>(`/simulations/${simId}/resume`, { method: 'POST' });
}

/**
 * Obtiene los resultados finales de una simulación de 5 días.
 * Los datos provienen del archivo JSON exportado por el backend al terminar.
 */
export function getSimulationResults(simId: string): Promise<BackendSimulationResults> {
  return request<BackendSimulationResults>(`/simulations/${simId}/results`);
}

export function getSimulationStatus(simId: string): Promise<BackendSimulationStatus> {
  return request<BackendSimulationStatus>(`/simulations/${simId}/status`);
}

export function getSimulationSolution(simId: string): Promise<BackendSolution> {
  return request<BackendSolution>(`/simulations/${simId}/solution`);
}

export function createShipment(
  simId: string,
  payload: BackendShipmentRequest
): Promise<BackendShipmentResponse> {
  return request<BackendShipmentResponse>(`/simulations/${simId}/shipments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelFlight(
  simId: string,
  flightId: string,
  day: string
): Promise<BackendCancellationResult> {
  return request<BackendCancellationResult>(`/simulations/${simId}/flights/${encodeURIComponent(flightId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ day }),
  });
}
