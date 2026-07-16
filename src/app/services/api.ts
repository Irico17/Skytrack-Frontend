import type {
  BackendAirport,
  BackendActiveSimulation,
  BackendStartResponse,
  BackendSimulationResults,
  BackendFlightPlanFlight,
  BackendSimulationStatus,
  BackendOperationalState,
  BackendBagTraceability,
  BackendSolution,
  BackendShipmentRequest,
  BackendShipmentResponse,
  BackendCancellationResult,
  BackendStaticDataUploadResponse,
  BackendStaticDataBatchStartResponse,
  BackendStaticDataBatchProgressResponse,
  StaticDataUploadProgress,
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

export function getBagTraceability(
  simId: string,
  params: {
    page?: number;
    size?: number;
    query?: string;
    state?: string;
    clientId?: string;
    batchId?: string;
  } = {}
): Promise<BackendBagTraceability> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 0));
  search.set('size', String(params.size ?? 50));
  if (params.query?.trim()) search.set('query', params.query.trim());
  if (params.state?.trim()) search.set('state', params.state.trim());
  if (params.clientId?.trim()) search.set('clientId', params.clientId.trim());
  if (params.batchId?.trim()) search.set('batchId', params.batchId.trim());
  return request<BackendBagTraceability>(`/simulations/${simId}/bags?${search.toString()}`);
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

/**
 * Carga PARCIAL de datos estáticos: solo se reemplaza lo que se envía (aeropuertos,
 * vuelos y/o envíos). Los envíos se AGREGAN por nombre sin borrar los existentes,
 * salvo shipmentsMode='replace'.
 */
export async function uploadStaticDatasetPartial(
  airportsFile: File | null,
  flightsFile: File | null,
  shipmentFiles: File[],
  shipmentsMode: 'append' | 'replace' = 'append'
): Promise<BackendStaticDataUploadResponse> {
  const form = new FormData();
  if (airportsFile) form.append('airports', airportsFile);
  if (flightsFile) form.append('flights', flightsFile);
  shipmentFiles.forEach(file => form.append('shipments', file));

  const res = await fetch(`${BASE}/data/static?shipmentsMode=${shipmentsMode}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return await res.json() as BackendStaticDataUploadResponse;
}

/**
 * Carga un ARCHIVO de envíos contra una operación día a día ACTIVA (prueba del curso:
 * "Durante la ejecución, se realiza la carga del archivo de envíos").
 * El origen se deduce del nombre `_envios_XXXX_.txt` o se pasa explícito.
 */
export async function uploadShipmentsFileToSimulation(
  simId: string,
  file: File,
  originId?: string
): Promise<{ originId: string; registered: number; failed: number; errors?: string[] }> {
  const form = new FormData();
  form.append('file', file);
  const qs = originId ? `?originId=${encodeURIComponent(originId)}` : '';
  const res = await fetch(`${BASE}/simulations/${simId}/shipments/upload${qs}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return await res.json();
}

const SHIPMENT_BATCH_SIZE = 5;

async function postMultipart<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return await res.json() as T;
}

export async function startStaticDataBatch(
  airportsFile: File,
  flightsFile: File,
  sessionId?: string
): Promise<BackendStaticDataBatchStartResponse> {
  const form = new FormData();
  if (sessionId) form.append('sessionId', sessionId);
  form.append('airports', airportsFile);
  form.append('flights', flightsFile);
  return postMultipart<BackendStaticDataBatchStartResponse>('/data/static/batch/start', form);
}

export async function appendStaticDataBatchShipments(
  sessionId: string,
  shipmentFiles: File[]
): Promise<BackendStaticDataBatchProgressResponse> {
  const form = new FormData();
  form.append('sessionId', sessionId);
  shipmentFiles.forEach(file => form.append('shipments', file));
  return postMultipart<BackendStaticDataBatchProgressResponse>('/data/static/batch/shipments', form);
}

export async function finalizeStaticDataBatch(
  sessionId: string
): Promise<BackendStaticDataUploadResponse> {
  return request<BackendStaticDataUploadResponse>('/data/static/batch/finalize', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export async function cancelStaticDataBatch(sessionId: string): Promise<void> {
  await request<void>('/data/static/batch/cancel', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

/** Igual que startStaticDataBatch pero aeropuertos/vuelos son OPCIONALES (carga parcial). */
export async function startPartialStaticDataBatch(
  airportsFile: File | null,
  flightsFile: File | null,
  sessionId?: string
): Promise<BackendStaticDataBatchStartResponse> {
  const form = new FormData();
  if (sessionId) form.append('sessionId', sessionId);
  if (airportsFile) form.append('airports', airportsFile);
  if (flightsFile) form.append('flights', flightsFile);
  return postMultipart<BackendStaticDataBatchStartResponse>('/data/static/batch/partial/start', form);
}

export async function finalizePartialStaticDataBatch(
  sessionId: string,
  shipmentsMode: 'append' | 'replace' = 'append'
): Promise<BackendStaticDataUploadResponse> {
  return request<BackendStaticDataUploadResponse>('/data/static/batch/partial/finalize', {
    method: 'POST',
    body: JSON.stringify({ sessionId, shipmentsMode }),
  });
}

/** Carga por lotes: aeropuertos+vuelos primero, envíos en grupos de 10, swap atómico al finalizar. */
export async function uploadStaticDatasetBatched(
  airportsFile: File,
  flightsFile: File,
  shipmentFiles: File[],
  onProgress?: (progress: StaticDataUploadProgress) => void
): Promise<BackendStaticDataUploadResponse> {
  const totalFiles = shipmentFiles.length;
  const totalBatches = Math.max(1, Math.ceil(totalFiles / SHIPMENT_BATCH_SIZE));

  onProgress?.({
    phase: 'starting',
    currentBatch: 0,
    totalBatches,
    filesUploaded: 0,
    totalFiles,
    message: 'Iniciando sesión de carga…',
  });

  const started = await startStaticDataBatch(airportsFile, flightsFile);
  const sessionId = started.sessionId;
  let filesUploaded = 0;

  try {
    for (let i = 0; i < totalBatches; i++) {
      const batch = shipmentFiles.slice(i * SHIPMENT_BATCH_SIZE, (i + 1) * SHIPMENT_BATCH_SIZE);
      if (batch.length === 0) continue;

      onProgress?.({
        phase: 'shipments',
        currentBatch: i + 1,
        totalBatches,
        filesUploaded,
        totalFiles,
        message: `Subiendo lote ${i + 1} de ${totalBatches}…`,
      });

      const progress = await appendStaticDataBatchShipments(sessionId, batch);
      filesUploaded = progress.shipmentFilesStaged;

      onProgress?.({
        phase: 'shipments',
        currentBatch: i + 1,
        totalBatches,
        filesUploaded,
        totalFiles,
        message: `Lote ${i + 1} de ${totalBatches} completado`,
      });
    }

    onProgress?.({
      phase: 'finalizing',
      currentBatch: totalBatches,
      totalBatches,
      filesUploaded,
      totalFiles,
      message: 'Validando y aplicando cambios…',
    });

    const result = await finalizeStaticDataBatch(sessionId);

    onProgress?.({
      phase: 'done',
      currentBatch: totalBatches,
      totalBatches,
      filesUploaded: totalFiles,
      totalFiles,
      message: 'Carga completada',
    });

    return result;
  } catch (err) {
    try {
      await cancelStaticDataBatch(sessionId);
    } catch {
      // Ignorar error de limpieza; propagar el error original.
    }
    throw err;
  }
}

/**
 * Carga PARCIAL por lotes: aeropuertos/vuelos opcionales, envíos en grupos de
 * SHIPMENT_BATCH_SIZE. Evita mandar todos los archivos de envíos en una sola petición
 * gigante — vista en despliegue real: un proxy delante del backend puede cortarla (413
 * con cuerpo vacío) aunque nginx y Spring ya acepten el tamaño total.
 */
export async function uploadStaticDatasetPartialBatched(
  airportsFile: File | null,
  flightsFile: File | null,
  shipmentFiles: File[],
  shipmentsMode: 'append' | 'replace' = 'append',
  onProgress?: (progress: StaticDataUploadProgress) => void
): Promise<BackendStaticDataUploadResponse> {
  const totalFiles = shipmentFiles.length;
  const totalBatches = Math.max(1, Math.ceil(totalFiles / SHIPMENT_BATCH_SIZE));

  onProgress?.({
    phase: 'starting',
    currentBatch: 0,
    totalBatches,
    filesUploaded: 0,
    totalFiles,
    message: 'Iniciando sesión de carga…',
  });

  const started = await startPartialStaticDataBatch(airportsFile, flightsFile);
  const sessionId = started.sessionId;
  let filesUploaded = 0;

  try {
    for (let i = 0; i < totalBatches; i++) {
      const batch = shipmentFiles.slice(i * SHIPMENT_BATCH_SIZE, (i + 1) * SHIPMENT_BATCH_SIZE);
      if (batch.length === 0) continue;

      onProgress?.({
        phase: 'shipments',
        currentBatch: i + 1,
        totalBatches,
        filesUploaded,
        totalFiles,
        message: `Subiendo lote ${i + 1} de ${totalBatches}…`,
      });

      const progress = await appendStaticDataBatchShipments(sessionId, batch);
      filesUploaded = progress.shipmentFilesStaged;

      onProgress?.({
        phase: 'shipments',
        currentBatch: i + 1,
        totalBatches,
        filesUploaded,
        totalFiles,
        message: `Lote ${i + 1} de ${totalBatches} completado`,
      });
    }

    onProgress?.({
      phase: 'finalizing',
      currentBatch: totalBatches,
      totalBatches,
      filesUploaded,
      totalFiles,
      message: 'Validando y aplicando cambios…',
    });

    const result = await finalizePartialStaticDataBatch(sessionId, shipmentsMode);

    onProgress?.({
      phase: 'done',
      currentBatch: totalBatches,
      totalBatches,
      filesUploaded: totalFiles,
      totalFiles,
      message: 'Carga completada',
    });

    return result;
  } catch (err) {
    try {
      await cancelStaticDataBatch(sessionId);
    } catch {
      // Ignorar error de limpieza; propagar el error original.
    }
    throw err;
  }
}
