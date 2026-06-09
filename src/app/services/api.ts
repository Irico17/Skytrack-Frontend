import type {
  BackendAirport,
  BackendActiveSimulation,
  BackendStartResponse,
  BackendSimulationResults,
  BackendFlightPlanFlight,
  BackendSimulationStatus,
  BackendOperationalState,
  BackendSolution,
  BackendShipmentRequest,
  BackendShipmentResponse,
  BackendCancellationResult,
  BackendStaticDataUploadResponse,
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

/** Carga todos los vuelos del plan proyectados a un rango de fecha/hora. */
export async function fetchFlightPlan(startDateTime: string, days = 5): Promise<BackendFlightPlanFlight[]> {
  const res = await request<{ flights: BackendFlightPlanFlight[]; totalFlights: number }>(
    `/data/flights?startDateTime=${encodeURIComponent(startDateTime)}&days=${days}`
  );
  return res.flights;
}

// ==================== SIMULACIÓN ====================

/**
 * Inicia una simulación de 5 días.
 * @param startDateTime Fecha/hora de inicio en formato "yyyy-MM-ddTHH:mm" (o undefined para usar todos los datos)
 */
export function startSimulation(
  scenario: 'PERIOD_SIMULATION' | 'DAY_TO_DAY' | 'COLLAPSE_SIMULATION',
  startDateTime?: string,
  replace = false
): Promise<BackendStartResponse> {
  const query = replace ? '?replace=true' : '';
  return request<BackendStartResponse>(`/simulations/start${query}`, {
    method: 'POST',
    body: JSON.stringify({
      scenario,
      startDateTime: startDateTime ?? null,
      startDate: startDateTime ? startDateTime.slice(0, 10) : null,
    }),
  });
}

/** Inicia operación día a día usando la fecha actual de ejecución. */
export function startDayToDaySimulation(startDateTime: string): Promise<BackendStartResponse> {
  return startSimulation('DAY_TO_DAY', startDateTime);
}

export async function getActiveSimulation(): Promise<BackendActiveSimulation | null> {
  const res = await fetch(`${BASE}/simulations/active`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return await res.json() as BackendActiveSimulation;
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

export function getOperationalState(simId: string, limit = 100): Promise<BackendOperationalState> {
  return request<BackendOperationalState>(`/simulations/${simId}/operational-state?limit=${limit}`);
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

export async function uploadStaticDataset(
  airportsFile: File,
  flightsFile: File,
  shipmentFiles: File[]
): Promise<BackendStaticDataUploadResponse> {
  const form = new FormData();
  form.append('airports', airportsFile);
  form.append('flights', flightsFile);
  shipmentFiles.forEach(file => form.append('shipments', file));

  const res = await fetch(`${BASE}/data/static`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return await res.json() as BackendStaticDataUploadResponse;
}
