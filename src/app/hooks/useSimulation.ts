import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction, startTransition } from 'react';
import {
  Airport, Flight, Shipment, SimEvent, SimulationMode,
  getOccupancyStatus,
} from '../data/mockData';
import {
  fetchAirports,
  fetchFlightPlan,
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  getActiveSimulation,
  getSimulationResults,
  getSimulationStatus,
  getSimulationSolution,
  createShipment,
  cancelFlight as cancelFlightRequest,
  uploadStaticDatasetBatched,
  uploadStaticDatasetPartialBatched,
  uploadShipmentsFileToSimulation,
} from '../services/api';
import { SimulationWebSocket } from '../services/websocket';
import {
  mapAirports,
  mapDaySnapshots,
  buildCycleDaySnapshot,
  mapFlightPlanFlights,
  mapSolutionToShipments,
  mapShipmentResponseToShipment,
} from '../services/mapper';
import type { BackendCycleUpdate, BackendSimulationFinished, BackendSimulationError, BackendActiveFlight, BackendFlightPlanFlight, BackendStorageUpdate, BackendAirportCapacity, BackendSolution, BackendStaticDataUploadResponse, BackendSimulationResults, BackendSimulationStatus, BackendActiveSimulation, StaticDataUploadProgress } from '../types/backend';
import { computeCancellationTargetDay, findFlightById } from '../utils/cancellationDay';
import { formatLocalDateTime, parseApiInstant, toApiInstant } from '../utils/simulationTime';

/** Factor de aceleración del tiempo simulado: 1 min real = K min simulados.
 *  Fallback; el valor real llega del backend (PERIOD/COLLAPSE K=120). */
export const SIMULATION_K = 120;

export interface DaySnapshot {
  day: number;
  date: string;
  onTimePct: number;
  delayed: number;
  critical: number;
  completed: number;
  totalBags: number;
  newEvents: number;
  avgOccupancy: number;
  replanned: number;
  keyEvent: string;
  severity: 'normal' | 'warning' | 'critical';
}

export interface CollapseConditions {
  causeCode: string;
  causeLabel: string;
  reason: string;
  detectedAtReal: string | null;
  detectedAtSim: string | null;
  occupancyPct: number;
  unserviceablePct: number;
  criticalAirports: number;
  totalAirports: number;
  cycle: number;
  lastCycleBatches: number;
  lastCycleBags: number;
  lastCycleBatchesUnrouted: number;
  lastCycleBagsUnrouted: number;
  lastCycleSlaExpired: number;
}

export interface CollapseMetrics {
  timeToCollapse: string;
  resilienceScore: number;
  affectedAirports: number;
  totalAirports: number;
  shipmentsDelayed: number;
  shipmentsLost: number;
  totalShipments: number;
  peakCongestion: number;
  peakAirport: string;
  recoveryTime: string;
  replannedRoutes: number;
  cascadeEvents: number;
  /** Condiciones reales del colapso (cuándo, qué lo provocó y por qué). Null si no se reportaron. */
  conditions: CollapseConditions | null;
}

interface SimulationState {
  airports: Airport[];
  flights: Flight[];
  shipments: Shipment[];
  isRunning: boolean;
  isPaused: boolean;
  mode: SimulationMode;
  simulationTime: Date;
  events: SimEvent[];
  hasReplanned: boolean;
  daySnapshots: DaySnapshot[];
  simulationComplete: boolean;
  dayToDayComplete: boolean;
  daysElapsed: number;
  collapseComplete: boolean;
  collapseMetrics: CollapseMetrics | null;
  simulationResults: BackendSimulationResults | null;
}

interface UseSimulationReturn extends SimulationState {
  simulationId: string | null;
  startDate: Date;
  setStartDate: Dispatch<SetStateAction<Date>>;
  setMode: (mode: SimulationMode) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  closeOperations: () => void;
  replan: () => void;
  addShipment: (shipment: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => Promise<void>;
  cancelFlight: (flightId: string, day: string) => Promise<void>;
  uploadStaticData: (
    airportsFile: File,
    flightsFile: File,
    shipmentFiles: File[],
    onProgress?: (progress: StaticDataUploadProgress) => void
  ) => Promise<BackendStaticDataUploadResponse>;
  /** Carga PARCIAL: cualquier subconjunto de aeropuertos/vuelos/envíos, sin exigir los 3. */
  uploadStaticDataPartial: (
    airportsFile: File | null,
    flightsFile: File | null,
    shipmentFiles?: File[],
    shipmentsMode?: 'append' | 'replace',
    onProgress?: (progress: StaticDataUploadProgress) => void
  ) => Promise<BackendStaticDataUploadResponse>;
  /** Carga un archivo de envíos contra la operación día a día ACTIVA. */
  uploadShipmentsFile: (file: File, originId?: string) => Promise<{ originId: string; registered: number; failed: number; errors?: string[] }>;
  setAirports: Dispatch<SetStateAction<Airport[]>>;
  setFlights: Dispatch<SetStateAction<Flight[]>>;
  setShipments: Dispatch<SetStateAction<Shipment[]>>;
  /** Reloj del tiempo simulado, actualizado en tiempo real (corre a K× velocidad) */
  simClock: Date;
  /** Reloj mutable para animaciones canvas sin forzar render de React */
  simClockRef: { current: Date };
  /** Factor K activo recibido del backend */
  simulationK: number;
  /** Vuelos activos del backend con sus tiempos de salida/llegada */
  activeFlights: BackendActiveFlight[];
  /** Todos los vuelos proyectados del plan para animacion independiente del planificador */
  flightPlanFlights: BackendFlightPlanFlight[];
  /** Último ciclo recibido del backend para KPIs reales */
  lastCycleUpdate: BackendCycleUpdate | null;
  /** Progreso del warm-up (envíos cargados, ciclo 1 en curso); null fuera del warm-up. */
  preparationMessage: string | null;
  /** Clientes WebSocket conectados a la simulación activa (NAV-01). */
  viewerCount: number;
  /** IDs de vuelos cancelados (con sufijo -D{n}) para marcar/ocultar en UI y mapa. */
  cancelledFlightIds: Set<string>;
  /** Timestamp real (wall-clock) al iniciar la simulación; null si no ha arrancado. */
  realStartedAt: Date | null;
}

// ==================== CONSTANTES DE REPRODUCCIÓN / RELOJ ====================

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const PLAYBACK_DELAY_MS = 100;
// El backend envía reloj cada ~0.5 s (1 s durante planning). Entre frames el navegador
// extrapola con K para que el canvas conserve movimiento continuo.
const PLAYBACK_MAX_EXTRAPOLATION_REAL_MS = 3_000;
const PLAYBACK_BACKWARD_JITTER_TOLERANCE_MS = 5_000;
const PLAYBACK_MAX_FRAMES = 240;
const CLOCK_STATE_COMMIT_MS = 250;
const SOLUTION_REFRESH_DELAY_MS = 2_500;
const SOLUTION_MAPPING_CHUNK_SIZE = 100;
const ACTIVE_SIM_STORAGE_KEY = 'skytrack.activeSimulation.v1';

type BackendPlaybackMessage = BackendCycleUpdate | BackendStorageUpdate;

interface PlaybackFrame {
  receivedAtMs: number;
  simulatedMs: number;
  simulatedTime: string;
  daysElapsed: number;
  cycle: number;
  airportCapacities: BackendAirportCapacity[];
  operationalMetrics?: BackendCycleUpdate['operationalMetrics'];
  cycleUpdate?: BackendCycleUpdate;
}

interface StoredActiveSimulation {
  simulationId: string;
  mode: SimulationMode;
  startDateTime: string;
  K: number;
  savedAt: number;
}

function readStoredActiveSimulation(): StoredActiveSimulation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SIM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredActiveSimulation>;
    if (!parsed.simulationId || !parsed.mode || !parsed.startDateTime) return null;
    return {
      simulationId: parsed.simulationId,
      mode: parsed.mode,
      startDateTime: parsed.startDateTime,
      K: parsed.K ?? SIMULATION_K,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

function storeActiveSimulation(session: StoredActiveSimulation): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_SIM_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredActiveSimulation(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_SIM_STORAGE_KEY);
}

function isBackendMode(mode: SimulationMode): boolean {
  // Los tres escenarios usan el backend real. El colapso ya no es mock local.
  return mode === 'realtime' || mode === '5day' || mode === 'collapse';
}

/** Mapea el modo de UI al ScenarioType del backend. */
function modeToScenario(mode: SimulationMode): 'DAY_TO_DAY' | 'PERIOD_SIMULATION' | 'COLLAPSE_SIMULATION' {
  if (mode === 'realtime') return 'DAY_TO_DAY';
  if (mode === 'collapse') return 'COLLAPSE_SIMULATION';
  return 'PERIOD_SIMULATION';
}

function parseBackendSimMs(value?: string | null): number | null {
  if (!value) return null;
  try {
    return parseApiInstant(value).getTime();
  } catch {
    return null;
  }
}

function yieldToBrowser(): Promise<void> {
  // Ceder explícitamente un frame de pintura. setTimeout(0) puede encadenar varios
  // chunks antes de que el navegador pinte y producía una pausa al cerrar cada ciclo.
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

async function mapSolutionToShipmentsCooperatively(solution: BackendSolution, simulatedTime: Date): Promise<Shipment[]> {
  if (solution.routes.length <= SOLUTION_MAPPING_CHUNK_SIZE) {
    return mapSolutionToShipments(solution, simulatedTime);
  }

  const mapped: Shipment[] = [];
  for (let start = 0; start < solution.routes.length; start += SOLUTION_MAPPING_CHUNK_SIZE) {
    const chunk = solution.routes.slice(start, start + SOLUTION_MAPPING_CHUNK_SIZE);
    mapped.push(...mapSolutionToShipments({ ...solution, routes: chunk }, simulatedTime));
    if (start + SOLUTION_MAPPING_CHUNK_SIZE < solution.routes.length) {
      await yieldToBrowser();
    }
  }
  return mapped;
}

type MappedSolutionResult = { mapped: Shipment[]; empty: boolean };

/** Fallback en hilo principal si el Worker no está disponible. */
async function fetchAndMapSolutionOnMainThread(
  simId: string,
  simulatedTime: Date,
): Promise<MappedSolutionResult> {
  const solution = await getSimulationSolution(simId);
  if (solution.routes.length === 0 && (solution.totalRoutes ?? 0) === 0) {
    return { mapped: [], empty: true };
  }
  const mapped = await mapSolutionToShipmentsCooperatively(solution, simulatedTime);
  return { mapped, empty: false };
}

function fetchAndMapSolutionViaWorker(
  worker: Worker,
  seq: number,
  simId: string,
  simulatedTimeMs: number,
): Promise<MappedSolutionResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; seq?: number; mapped?: Shipment[]; empty?: boolean; message?: string };
      if (!data || data.seq !== seq) return;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (data.type === 'error') {
        reject(new Error(data.message || 'Error en solutionWorker'));
        return;
      }
      resolve({ mapped: data.mapped ?? [], empty: Boolean(data.empty) });
    };
    const onError = (event: ErrorEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(event.error instanceof Error ? event.error : new Error(event.message || 'Worker error'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({
      type: 'fetch',
      seq,
      simId,
      simulatedTimeMs,
    });
  });
}

function stripProjectedDaySuffix(flightId: string): string {
  return flightId.replace(/-D\d+$/, '');
}

function scenarioToMode(scenario?: string | null): SimulationMode {
  if (scenario === 'DAY_TO_DAY') return 'realtime';
  if (scenario === 'COLLAPSE_SIMULATION') return 'collapse';
  return '5day';
}

function activeSimulationToStored(active: BackendActiveSimulation): StoredActiveSimulation | null {
  if (!active.simulationId || !active.canJoin) return null;
  const startDateTime = active.startDateTime ?? active.simulatedTime;
  if (!startDateTime) return null;
  return {
    simulationId: active.simulationId,
    mode: scenarioToMode(active.scenario),
    startDateTime,
    K: active.K || SIMULATION_K,
    savedAt: Date.now(),
  };
}

function buildInitEvents(startDate: Date): SimEvent[] {
  const h = (m: number) => new Date(startDate.getTime() + m * 60000);
  return [
    { id:'init1', type:'alert', message:'Sistema listo para simulación de 5 días', time:h(0), severity:'info' },
    { id:'init2', type:'info', message:'Cargando datos del backend...', time:h(1), severity:'info' },
  ];
}

/** Sc del escenario de colapso = Sa(45s) × K(120) = 90 min simulados por ciclo. */
const COLLAPSE_SC_MIN = 90;

/**
 * Construye las métricas de colapso a partir de los resultados REALES del backend
 * (sin datos mock). Los campos de aeropuertos (afectados/pico) se recalculan en
 * CollapseResults usando los aeropuertos reales recibidos por WebSocket.
 */
function buildCollapseMetricsFromResults(
  results: BackendSimulationResults,
  finished: BackendSimulationFinished
): CollapseMetrics {
  const delayed = results.daySnapshots.reduce((acc, s) => acc + (s.batchesDelayed ?? 0), 0);
  const totalSimMin = results.totalCycles * COLLAPSE_SC_MIN;
  const totalSimHours = Math.max(1, Math.round(totalSimMin / 60));
  const ci = results.collapseInfo;
  return {
    timeToCollapse: `${totalSimHours} h sim · ${results.totalCycles} ciclos`,
    resilienceScore: Math.round(results.slaCompliancePercent),
    affectedAirports: 0,
    totalAirports: 0,
    shipmentsDelayed: delayed,
    shipmentsLost: results.unroutableBatches,
    totalShipments: results.totalBatches,
    peakCongestion: 0,
    peakAirport: '—',
    recoveryTime: 'N/A',
    replannedRoutes: 0,
    cascadeEvents: delayed + results.unroutableBatches,
    conditions: ci
      ? {
          causeCode: ci.causeCode,
          causeLabel: ci.causeLabel,
          reason: ci.reason,
          detectedAtReal: ci.detectedAtReal,
          detectedAtSim: ci.detectedAtSim,
          occupancyPct: ci.occupancyPct,
          unserviceablePct: ci.unserviceablePct,
          criticalAirports: ci.criticalAirports,
          totalAirports: ci.totalAirports,
          cycle: ci.cycle,
          lastCycleBatches: ci.lastCycleBatches,
          lastCycleBags: ci.lastCycleBags,
          lastCycleBatchesUnrouted: ci.lastCycleBatchesUnrouted,
          lastCycleBagsUnrouted: ci.lastCycleBagsUnrouted,
          lastCycleSlaExpired: ci.lastCycleSlaExpired,
        }
      : null,
  };
}

// ==================== HOOK PRINCIPAL ====================

export function useSimulation(): UseSimulationReturn {
  const today = new Date();
  today.setHours(8, 0, 0, 0);

  const [startDate, setStartDate] = useState<Date>(today);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mode, setMode] = useState<SimulationMode>('5day');
  const [simulationTime, setSimulationTime] = useState<Date>(today);
  const [events, setEvents] = useState<SimEvent[]>(() => buildInitEvents(today));
  const [hasReplanned, setHasReplanned] = useState(false);
  const [daySnapshots, setDaySnapshots] = useState<DaySnapshot[]>([]);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [dayToDayComplete, setDayToDayComplete] = useState(false);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [collapseComplete, setCollapseComplete] = useState(false);
  const [collapseMetrics, setCollapseMetrics] = useState<CollapseMetrics | null>(null);
  const [simulationResults, setSimulationResults] = useState<BackendSimulationResults | null>(null);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [realStartedAt, setRealStartedAt] = useState<Date | null>(null);

  // Refs para el modo 5day (backend)
  const simIdRef  = useRef<string | null>(null);
  const wsRef     = useRef<SimulationWebSocket | null>(null);
  const wsSimulationIdRef = useRef<string | null>(null);
  const activeDiscoveryWsRef = useRef<SimulationWebSocket | null>(null);
  const activeDiscoveryInFlightRef = useRef(false);

  // ===== VENTANA DE PLAN DE VUELOS PARA COLAPSO (sin fecha de fin fija) =====
  // 5 días pide la ventana UNA vez porque la simulación dura exactamente 5 días. Colapso
  // NO tiene fin fijo (puede durar muchos más días simulados) — sin esto, el plan de vuelos
  // proyectado se agotaba al pasar el día 5 y el mapa se veía vacío aunque el backend
  // siguiera funcionando bien. Se refresca la ventana cuando el reloj simulado se acerca
  // al borde de lo ya cargado, igual que 5 días pero repitiéndolo indefinidamente.
  const flightPlanWindowEndRef = useRef<Date | null>(null);
  const flightPlanRefreshInFlightRef = useRef(false);

  // Secuencia para clientIds autogenerados en operación día a día (único por ejecución).
  const uiClientSeqRef = useRef(0);
  const nextUiClientId = useCallback(() => {
    const seq = uiClientSeqRef.current++;
    // Rango 9000000+ para no colisionar con los clientes del dataset (≤ ~0032767).
    return String(9_000_000 + seq).padStart(7, '0');
  }, []);

  // ===== RELOJ SIMULADO (corre a K× en tiempo real) =====
  const [simClock, setSimClock] = useState<Date>(today);
  const [simulationK, setSimulationK] = useState(SIMULATION_K);
  // Base interpolada del reloj: el backend la reancla y el frontend suaviza entre updates.
  const clockBaseRef = useRef<{ simMs: number; realMs: number; K: number } | null>(null);
  const simClockRef = useRef<Date>(today);
  const playbackBufferRef = useRef<PlaybackFrame[]>([]);
  const lastAppliedPlaybackKeyRef = useRef<string | null>(null);
  // El visualizador (reloj/mapa) no avanza hasta el PRIMER ciclo del algoritmo (no con STORAGE).
  const hasFirstCycleRef = useRef(false);
  const solutionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solutionRefreshSeqRef = useRef(0);
  const solutionWorkerRef = useRef<Worker | null>(null);
  const solutionWorkerUnavailableRef = useRef(false);
  const backendAirportsRef = useRef<Airport[]>([]);
  const backendAirportsLoadedRef = useRef(false);
  const lastClockStateCommitRef = useRef(0);
  const hasHydratedStoredSessionRef = useRef(false);
  const isResyncingRef = useRef(false);

  // Vuelos activos (con maletas) del backend
  const [activeFlights, setActiveFlights] = useState<BackendActiveFlight[]>([]);

  // TODOS los vuelos del plan de vuelos (independientes del planificador)
  const [flightPlanFlights, setFlightPlanFlights] = useState<BackendFlightPlanFlight[]>([]);
  const [lastCycleUpdate, setLastCycleUpdate] = useState<BackendCycleUpdate | null>(null);
  // Mensaje de warm-up del backend (PREPARATION_PROGRESS); se limpia al primer ciclo.
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);
  // IDs de vuelos cancelados (con sufijo -D{n}) para marcarlos/ocultarlos en UI y mapa.
  const [cancelledFlightIds, setCancelledFlightIds] = useState<Set<string>>(() => new Set());

  // K dinámico recibido del backend
  const simKRef = useRef(SIMULATION_K);

  const applyAirportCapacities = useCallback((capacities: BackendAirportCapacity[], daysElapsedVal?: number) => {
    if (!capacities || capacities.length === 0) return;
    const currentDay = daysElapsedVal !== undefined ? Math.max(1, Math.floor(daysElapsedVal) + 1) : 1;
    setAirports(prev => {
      const capacityMap = new Map(capacities.map(c => [c.airportId, c]));
      return prev.map(a => {
        const cap = capacityMap.get(a.id);
        if (!cap) return a;
        const pct = cap.occupancyRatio;
        const status = pct >= 0.9 ? 'critical' as const
                     : pct >= 0.7 ? 'warning' as const : 'normal' as const;
        const currentOccupancy = cap.currentBags;
        const previousPeak = a.peakOccupancy ?? 0;
        const peakOccupancy = Math.max(previousPeak, currentOccupancy);

        const overloadedDaysSet = new Set(a.overloadedDaysList ?? []);
        if (pct >= 0.9) {
          overloadedDaysSet.add(currentDay);
        }
        const overloadedDaysList = Array.from(overloadedDaysSet);
        const daysOverloaded = overloadedDaysList.length;

        return {
          ...a,
          occupancy: currentOccupancy,
          capacity: cap.maxCapacity,
          status,
          peakOccupancy,
          overloadedDaysList,
          daysOverloaded,
        };
      });
    });
  }, []);

  const commitBackendAirports = useCallback((mappedAirports: Airport[]) => {
    backendAirportsRef.current = mappedAirports;
    backendAirportsLoadedRef.current = mappedAirports.length > 0;
    setAirports(mappedAirports);
  }, []);

  const ensureBackendAirports = useCallback(async () => {
    if (backendAirportsLoadedRef.current && backendAirportsRef.current.length > 0) {
      setAirports(backendAirportsRef.current);
      return backendAirportsRef.current;
    }

    const data = await fetchAirports();
    const mapped = mapAirports(data);
    commitBackendAirports(mapped);
    return mapped;
  }, [commitBackendAirports]);

  const resetPlaybackBuffer = useCallback(() => {
    playbackBufferRef.current = [];
    lastAppliedPlaybackKeyRef.current = null;
  }, []);

  const commitClockState = useCallback((nextDate: Date, force = false) => {
    const now = Date.now();
    if (!force && now - lastClockStateCommitRef.current < CLOCK_STATE_COMMIT_MS) {
      return false;
    }
    lastClockStateCommitRef.current = now;
    setSimulationTime(nextDate);
    setSimClock(prev => Math.abs(prev.getTime() - nextDate.getTime()) < 1 ? prev : nextDate);
    return true;
  }, []);

  const pushPlaybackFrame = useCallback((update: BackendPlaybackMessage) => {
    const parsedSimulatedMs = parseBackendSimMs(update.simulatedTime);
    if (parsedSimulatedMs === null) return null;

    const buffer = playbackBufferRef.current;
    const last = buffer[buffer.length - 1];
    // CYCLE_UPDATE y el STORAGE inmediato pueden diferir unos milisegundos por cómo se
    // capturan ambos relojes. No reiniciar el buffer por ese jitter; sí hacerlo ante un
    // salto real hacia atrás (reset/resync de la simulación).
    const simulatedMs = last
      && parsedSimulatedMs < last.simulatedMs
      && last.simulatedMs - parsedSimulatedMs <= PLAYBACK_BACKWARD_JITTER_TOLERANCE_MS
        ? last.simulatedMs
        : parsedSimulatedMs;

    const frame: PlaybackFrame = {
      receivedAtMs: Date.now(),
      simulatedMs,
      simulatedTime: update.simulatedTime,
      daysElapsed: update.daysElapsed,
      cycle: update.cycle,
      airportCapacities: update.airportCapacities ?? [],
      operationalMetrics: update.operationalMetrics,
      cycleUpdate: update.type === 'CYCLE_UPDATE' ? update : undefined,
    };

    if (last && simulatedMs < last.simulatedMs) {
      buffer.length = 0;
      lastAppliedPlaybackKeyRef.current = null;
    }

    const previous = buffer[buffer.length - 1];
    if (previous
        && previous.simulatedMs === frame.simulatedMs
        && previous.cycle === frame.cycle
        && Boolean(previous.cycleUpdate) === Boolean(frame.cycleUpdate)) {
      buffer[buffer.length - 1] = frame;
    } else {
      buffer.push(frame);
    }

    if (buffer.length > PLAYBACK_MAX_FRAMES) {
      const removed = buffer.splice(0, buffer.length - PLAYBACK_MAX_FRAMES);
      let lastDroppedCycleUpdate: BackendCycleUpdate | undefined;
      for (let i = removed.length - 1; i >= 0; i--) {
        if (removed[i].cycleUpdate) {
          lastDroppedCycleUpdate = removed[i].cycleUpdate;
          break;
        }
      }
      if (lastDroppedCycleUpdate && buffer.length > 0) {
        // Preservar el último CYCLE_UPDATE en el frame más viejo que queda, para no perder los activeFlights
        buffer[0] = { ...buffer[0], cycleUpdate: lastDroppedCycleUpdate };
      }
    }

    return new Date(simulatedMs);
  }, []);

  const applyMappedShipments = useCallback((mapped: Shipment[]) => {
    startTransition(() => {
      setShipments(prev => {
        const mappedIds = new Set(mapped.map(s => s.id));
        const pending = prev.filter(s => s.currentFlightId === 'PENDING' && !mappedIds.has(s.id));
        return [...pending, ...mapped];
      });
    });
  }, []);

  const cancelScheduledSolutionRefresh = useCallback(() => {
    solutionRefreshSeqRef.current += 1;
    if (solutionRefreshTimerRef.current) {
      clearTimeout(solutionRefreshTimerRef.current);
      solutionRefreshTimerRef.current = null;
    }
  }, []);

  const terminateSolutionWorker = useCallback(() => {
    if (solutionWorkerRef.current) {
      solutionWorkerRef.current.terminate();
      solutionWorkerRef.current = null;
    }
  }, []);

  const ensureSolutionWorker = useCallback((): Worker | null => {
    if (solutionWorkerUnavailableRef.current) return null;
    if (typeof Worker === 'undefined') {
      solutionWorkerUnavailableRef.current = true;
      return null;
    }
    if (solutionWorkerRef.current) return solutionWorkerRef.current;
    try {
      const worker = new Worker(
        new URL('../workers/solutionWorker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onerror = () => {
        // Fallo de carga/runtime: marcar unavailable y volver al hilo principal.
        solutionWorkerUnavailableRef.current = true;
        terminateSolutionWorker();
      };
      solutionWorkerRef.current = worker;
      return worker;
    } catch (err) {
      console.warn('Solution worker no disponible; se usa el hilo principal:', err);
      solutionWorkerUnavailableRef.current = true;
      return null;
    }
  }, [terminateSolutionWorker]);

  const fetchAndMapSolution = useCallback(async (
    simId: string,
    simulatedTime: Date,
    seq: number,
  ): Promise<MappedSolutionResult> => {
    const worker = ensureSolutionWorker();
    if (!worker) {
      return fetchAndMapSolutionOnMainThread(simId, simulatedTime);
    }
    try {
      return await fetchAndMapSolutionViaWorker(
        worker,
        seq,
        simId,
        simulatedTime.getTime(),
      );
    } catch (err) {
      console.warn('Fallo del solution worker; fallback al hilo principal:', err);
      solutionWorkerUnavailableRef.current = true;
      terminateSolutionWorker();
      return fetchAndMapSolutionOnMainThread(simId, simulatedTime);
    }
  }, [ensureSolutionWorker, terminateSolutionWorker]);

  const scheduleSolutionRefresh = useCallback((simulatedTime: Date) => {
    const id = simIdRef.current;
    if (!id) return;

    cancelScheduledSolutionRefresh();
    const seq = solutionRefreshSeqRef.current;
    solutionRefreshTimerRef.current = setTimeout(() => {
      solutionRefreshTimerRef.current = null;
      const clockTime = new Date(simClockRef.current.getTime() || simulatedTime.getTime());
      fetchAndMapSolution(id, clockTime, seq)
        .then(result => {
          if (seq !== solutionRefreshSeqRef.current) return;
          if (result.empty) {
            startTransition(() => setShipments(prev => prev.length > 0 ? prev : []));
            return;
          }
          applyMappedShipments(result.mapped);
        })
        .catch(err => console.warn('No se pudo refrescar la solución:', err));
    }, SOLUTION_REFRESH_DELAY_MS);
  }, [applyMappedShipments, cancelScheduledSolutionRefresh, fetchAndMapSolution]);

  useEffect(() => () => {
    cancelScheduledSolutionRefresh();
    terminateSolutionWorker();
  }, [cancelScheduledSolutionRefresh, terminateSolutionWorker]);

  // ===== CARGAR AEROPUERTOS REALES PARA MODOS BACKEND =====
  useEffect(() => {
    if (isBackendMode(mode)) {
      ensureBackendAirports()
        .catch(err => console.warn('No se pudieron cargar aeropuertos del backend:', err));
    }
  }, [mode, ensureBackendAirports]);

  useEffect(() => {
    if (isRunning) return;
    // Todos los modos usan datos reales del backend; al estar inactivo se limpian
    // vuelos/envíos (los aeropuertos se cargan vía ensureBackendAirports).
    setFlights([]);
    setShipments([]);
  }, [mode, isRunning]);

  // Sync tiempo y eventos cuando cambia startDate
  useEffect(() => {
    const nextStart = new Date(startDate);
    setSimulationTime(nextStart);
    if (!clockBaseRef.current) {
      simClockRef.current = nextStart;
      setSimClock(nextStart);
    }
    setEvents(buildInitEvents(startDate));
  }, [startDate]);

  const FLIGHT_PLAN_REFRESH_WINDOW_DAYS = 5;
  // Margen de seguridad: refrescar cuando quede menos de 1 día de plan de vuelos cargado,
  // para que la ventana nueva llegue ANTES de que la actual se agote (sin parpadeo).
  const FLIGHT_PLAN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

  /**
   * Para COLAPSO: si el reloj simulado se acerca al borde de la ventana de plan de vuelos
   * ya cargada, pide la siguiente ventana de 5 días desde ese punto — la misma lógica de
   * 5 días, pero repetida indefinidamente en vez de una sola vez (porque colapso no tiene
   * fecha de fin fija).
   */
  const refreshCollapseFlightPlanIfNeeded = useCallback((currentSimTime: Date) => {
    if (mode !== 'collapse') return;
    if (flightPlanRefreshInFlightRef.current) return;
    const windowEnd = flightPlanWindowEndRef.current;
    if (windowEnd && currentSimTime.getTime() < windowEnd.getTime() - FLIGHT_PLAN_REFRESH_MARGIN_MS) {
      return; // todavía hay margen cargado, no hace falta refrescar
    }

    flightPlanRefreshInFlightRef.current = true;
    fetchFlightPlan(toApiInstant(currentSimTime), FLIGHT_PLAN_REFRESH_WINDOW_DAYS)
      .then(projectedFlights => {
        setFlightPlanFlights(projectedFlights);
        setFlights(mapFlightPlanFlights(projectedFlights));
        flightPlanWindowEndRef.current = new Date(
          currentSimTime.getTime() + FLIGHT_PLAN_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
        );
      })
      .catch(err => console.warn('No se pudo refrescar el plan de vuelos de colapso:', err))
      .finally(() => { flightPlanRefreshInFlightRef.current = false; });
  }, [mode]);

  // ===== MODO 5DAY — WebSocket handler =====

  const handle5DayWsMessage = useCallback((msg: any) => {
    if (msg.type === 'PREPARATION_PROGRESS') {
      // Warm-up: los envíos ya están cargados y el ciclo 1 se está calculando.
      setPreparationMessage(msg.message);
      setEvents(prev => [{
        id: `prep-${Date.now()}`,
        type: 'info',
        message: msg.message,
        time: new Date(),
        severity: 'info',
      }, ...prev.slice(0, 19)]);

    } else if (msg.type === 'CYCLE_UPDATE') {
      const update = msg as BackendCycleUpdate;
      setIsRunning(true);
      setPreparationMessage(null);
      // El tiempo de ejecución comienza con la solución inicial lista, no mientras
      // el backend todavía está preparando el primer ciclo.
      setRealStartedAt(previous => previous ?? new Date());
      hasFirstCycleRef.current = true; // primer ciclo recibido → el visualizador puede arrancar
      const t = pushPlaybackFrame(update);

      // Actualizar snapshot del día para la simulación de 5 días
      const snap = mode === '5day' ? buildCycleDaySnapshot(update, startDate) : null;
      // Snapshots y eventos no deben competir con el frame del mapa que aplica el ciclo.
      startTransition(() => {
        if (snap) {
          setDaySnapshots(prev => {
            const exists = prev.find(s => s.day === snap.day);
            if (exists) {
              return prev.map(s => s.day === snap.day ? snap : s);
            }
            return [...prev, snap];
          });
        }

        setEvents(prev => [{
          id: `cycle-${update.cycle}`,
          type: 'info',
          message: mode === '5day'
            ? `Ciclo ${update.cycle} — Día ${update.daysElapsed.toFixed(1)}/5 — ${update.totalRoutes} rutas`
            : mode === 'collapse'
            ? `Ciclo ${update.cycle} — Colapso (${update.daysElapsed.toFixed(1)} días) — ${update.totalRoutes} rutas`
            : `Ciclo ${update.cycle} — Operación día a día — ${update.totalRoutes} rutas`,
          time: new Date(),
          severity: update.semaphores.sla === 'RED' ? 'critical'
                  : update.semaphores.sla === 'AMBER' ? 'warning' : 'info',
        }, ...prev.slice(0, 19)]);
      });

      scheduleSolutionRefresh(t ?? new Date());
      refreshCollapseFlightPlanIfNeeded(t ?? new Date());

    } else if (msg.type === 'STORAGE_UPDATE') {
      const update = msg as BackendStorageUpdate;
      pushPlaybackFrame(update);

    } else if (msg.type === 'SIMULATION_ERROR') {
      const failed = msg as BackendSimulationError;
      setIsRunning(false);
      setIsPaused(false);
      setPreparationMessage(null);
      setSimulationComplete(false);
      clockBaseRef.current = null;
      clearStoredActiveSimulation();
      cancelScheduledSolutionRefresh();
      resetPlaybackBuffer();

      setEvents(prev => [{
        id: `sim-error-${Date.now()}`,
        type: 'alert',
        message: `Simulación detenida por error — ciclo ${failed.currentCycle}: ${failed.message}`,
        time: new Date(),
        severity: 'critical',
      }, ...prev.slice(0, 19)]);

      wsRef.current?.disconnect();
      wsSimulationIdRef.current = null;

    } else if (msg.type === 'SIMULATION_FINISHED') {
      const finished = msg as BackendSimulationFinished;
      setIsRunning(false);
      setIsPaused(false);
      setPreparationMessage(null);
      setSimulationComplete(mode === '5day');
      setCollapseComplete(mode === 'collapse');
      setDaysElapsed(mode === '5day'
        ? 5
        : Math.max(0, (simClockRef.current.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
      clockBaseRef.current = null; // parar el reloj
      clearStoredActiveSimulation();
      cancelScheduledSolutionRefresh();
      resetPlaybackBuffer();

      if (mode === '5day') {
        const finalTime = new Date(startDate.getTime() + FIVE_DAYS_MS);
        simClockRef.current = finalTime;
        commitClockState(finalTime, true);
      }

      setEvents(prev => [{
        id: `finish-${Date.now()}`,
        type: mode === 'collapse' ? 'alert' : 'info',
        message: mode === 'collapse'
          ? `Colapso logístico detectado — nivel ${finished.collapseLevel} — ${finished.batchesProcessed} lotes en ${finished.totalCycles} ciclos`
          : `Simulación completada — ${finished.batchesProcessed} lotes procesados en ${finished.totalCycles} ciclos`,
        time: new Date(),
        severity: mode === 'collapse' ? 'critical' : 'info',
      }, ...prev.slice(0, 19)]);

      // Cargar resultados finales del archivo JSON (5 días y colapso exportan JSON)
      const id = simIdRef.current;
      if (id && (mode === '5day' || mode === 'collapse')) {
        getSimulationResults(id)
          .then(results => {
            setSimulationResults(results);
            if (mode === '5day') {
              setDaySnapshots(mapDaySnapshots(results));
            } else {
              setCollapseMetrics(buildCollapseMetricsFromResults(results, finished));
            }
          })
          .catch(err => console.warn('No se pudieron cargar resultados finales:', err));

        // Poblar los envíos con la solución final para los reportes (aerolíneas/clientes).
        const finalTime = mode === '5day'
          ? new Date(startDate.getTime() + FIVE_DAYS_MS)
          : simClockRef.current;
        const seq = solutionRefreshSeqRef.current;
        fetchAndMapSolution(id, finalTime, seq)
          .then(result => {
            if (seq !== solutionRefreshSeqRef.current) return;
            if (result.empty) return;
            applyMappedShipments(result.mapped);
          })
          .catch(err => console.warn('No se pudo cargar la solución final para el reporte:', err));
      }

      // Desconectar WebSocket
      wsRef.current?.disconnect();
      wsSimulationIdRef.current = null;
    }
  }, [startDate, mode, pushPlaybackFrame, resetPlaybackBuffer, scheduleSolutionRefresh, refreshCollapseFlightPlanIfNeeded, cancelScheduledSolutionRefresh, commitClockState, applyMappedShipments, fetchAndMapSolution]);

  const connectSimulationStream = useCallback((simulationId = simIdRef.current) => {
    if (!simulationId) return;
    if (wsRef.current?.isConnected && wsSimulationIdRef.current === simulationId) return;
    wsRef.current?.disconnect();
    const ws = new SimulationWebSocket(simulationId);
    wsRef.current = ws;
    wsSimulationIdRef.current = simulationId;
    ws.onMessage(handle5DayWsMessage);
    ws.connect();
  }, [handle5DayWsMessage]);

  const disconnectActiveDiscoveryStream = useCallback(() => {
    activeDiscoveryWsRef.current?.disconnect();
    activeDiscoveryWsRef.current = null;
  }, []);

  const applyBackendStatusClock = useCallback((status: BackendSimulationStatus) => {
    if (!status.simulatedTime) return;
    let statusTime: Date;
    try {
      statusTime = parseApiInstant(status.simulatedTime);
    } catch {
      return;
    }
    simClockRef.current = statusTime;
    commitClockState(statusTime, true);

    // El endpoint /status no trae daysElapsed (solo lo llevan los mensajes WS de
    // CYCLE_UPDATE/STORAGE_UPDATE, vía pushPlaybackFrame). Sin esto, "Tiempo Transcurrido"
    // se quedaba en 00:00:00 al reconectar/unirse a una simulación ya iniciada (reload,
    // segunda pestaña, resync por foco/visibilidad) hasta que llegara el próximo ciclo por WS.
    const rawDaysElapsed = (statusTime.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
    if (Number.isFinite(rawDaysElapsed)) {
      setDaysElapsed(mode === '5day' ? Math.min(5, Math.max(0, rawDaysElapsed)) : Math.max(0, rawDaysElapsed));
    }
  }, [commitClockState, startDate, mode]);

  const loadProjectedFlightPlan = useCallback(async (startDateTimeStr: string, selectedMode: SimulationMode) => {
    // Colapso usa la MISMA ventana que 5 días (5 días): la diferencia es que colapso la
    // refresca indefinidamente (refreshCollapseFlightPlanIfNeeded) porque no tiene fin fijo.
    const days = selectedMode === 'realtime' ? 1 : 5;
    const projectedFlights = await fetchFlightPlan(startDateTimeStr, days);
    setFlightPlanFlights(projectedFlights);
    setFlights(mapFlightPlanFlights(projectedFlights));
    if (selectedMode === 'collapse') {
      const base = parseApiInstant(startDateTimeStr);
      flightPlanWindowEndRef.current = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    }
    return projectedFlights;
  }, []);

  const recoverFinishedSimulation = useCallback((simulationId: string, selectedMode: SimulationMode) => {
    if (selectedMode !== '5day') return;
    getSimulationResults(simulationId)
      .then(results => {
        setSimulationResults(results);
        setDaySnapshots(mapDaySnapshots(results));
        setSimulationComplete(true);
        setDaysElapsed(5);
      })
      .catch(err => console.warn('No se pudieron recuperar resultados finales:', err));
  }, []);

  const refreshSolution = useCallback(async (time = simClockRef.current) => {
    const id = simIdRef.current;
    if (!id) return;

    const seq = ++solutionRefreshSeqRef.current;
    const result = await fetchAndMapSolution(id, time, seq);
    if (seq !== solutionRefreshSeqRef.current) return;
    if (result.empty) {
      startTransition(() => setShipments(prev => prev.length > 0 ? prev : []));
      return;
    }
    applyMappedShipments(result.mapped);
  }, [applyMappedShipments, fetchAndMapSolution]);

  const restoreBackendSession = useCallback(async (session: StoredActiveSimulation, sourceLabel: string) => {
    disconnectActiveDiscoveryStream();
    const restoredStartDate = parseApiInstant(session.startDateTime);
    setMode(session.mode);
    setStartDate(restoredStartDate);
    setSimulationComplete(false);
    setSimulationResults(null);
    setLastCycleUpdate(null);
    setActiveFlights([]);
    simIdRef.current = session.simulationId;
    setSimulationId(session.simulationId);
    simKRef.current = session.K;
    setSimulationK(session.K);
    simClockRef.current = restoredStartDate;
    commitClockState(restoredStartDate, true);
    cancelScheduledSolutionRefresh();
    resetPlaybackBuffer();

    setEvents(prev => [{
      id: `restore-${Date.now()}`,
      type: 'info',
      message: `Uniéndose a simulación ${sourceLabel}...`,
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);

    try {
      const statusPromise = getSimulationStatus(session.simulationId);
      void ensureBackendAirports().catch(err => console.warn('No se pudieron restaurar aeropuertos:', err));
      void loadProjectedFlightPlan(session.startDateTime, session.mode)
        .catch(err => console.warn('No se pudo restaurar el plan de vuelos:', err));

      const status = await statusPromise;
      applyBackendStatusClock(status);

      if (status.status === 'RUNNING' || status.status === 'PAUSED') {
        setIsRunning(status.status === 'RUNNING');
        setIsPaused(status.status === 'PAUSED');
        if (status.status === 'PAUSED') {
          clockBaseRef.current = null;
        }
        connectSimulationStream(session.simulationId);
        storeActiveSimulation({ ...session, savedAt: Date.now() });

        // Puente hasta el próximo CYCLE_UPDATE del WebSocket: sin esto, tras recargar la
        // página (o reconectarse desde otra pestaña) la UI queda en "INICIANDO…" y "0
        // Envíos" hasta el SIGUIENTE ciclo del backend — hasta Sa minutos (5 en día a día)
        // aunque ya haya toneladas de envíos ruteados esperando. Se pobla de una vez con
        // lo que YA existe (status + solución actual), y el próximo CYCLE_UPDATE real
        // simplemente lo reemplaza con datos más frescos.
        if (status.currentCycle > 0) {
          hasFirstCycleRef.current = true;
          setRealStartedAt(previous => previous ?? new Date());
          setLastCycleUpdate({
            type: 'CYCLE_UPDATE',
            simulationId: session.simulationId,
            cycle: status.currentCycle,
            simulatedTime: status.simulatedTime ?? session.startDateTime,
            daysElapsed: 0,
            simulationComplete: false,
            fitness: status.currentFitness,
            batchesProcessed: status.batchesProcessed,
            batchesFailed: status.batchesFailed,
            totalRoutes: 0,
            totalBags: 0,
            semaphores: status.semaphores,
            batchSummary: { onTime: status.batchesProcessed, delayed: status.batchesFailed, unrouted: status.batchesPending },
            activeFlights: [],
            airportCapacities: [],
          });
          void refreshSolution(restoredStartDate).catch(err => console.warn('No se pudo refrescar la solución al restaurar:', err));
        }
      } else {
        setIsRunning(false);
        setIsPaused(false);
        clockBaseRef.current = null;
        wsRef.current?.disconnect();
        wsSimulationIdRef.current = null;
        clearStoredActiveSimulation();
        if (status.status === 'COMPLETED' || status.status === 'STOPPED') {
          recoverFinishedSimulation(session.simulationId, session.mode);
        }
      }
    } catch (err) {
      console.warn('No se pudo restaurar la simulación activa:', err);
      clearStoredActiveSimulation();
      simIdRef.current = null;
      setSimulationId(null);
      setIsRunning(false);
    }
  }, [applyBackendStatusClock, cancelScheduledSolutionRefresh, commitClockState, connectSimulationStream, disconnectActiveDiscoveryStream, ensureBackendAirports, loadProjectedFlightPlan, recoverFinishedSimulation, refreshSolution, resetPlaybackBuffer]);

  // Badge multi-navegador (TASK-031): poll connectedClients del backend.
  useEffect(() => {
    const id = simIdRef.current;
    if (!id || !isBackendMode(mode)) {
      setViewerCount(0);
      return;
    }
    const refresh = () => {
      void getActiveSimulation()
        .then(active => {
          if (active?.simulationId === simIdRef.current) {
            setViewerCount(active.connectedClients);
          }
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [mode, simulationId, isRunning]);

  const joinActiveSimulationFromBackend = useCallback(async (sourceLabel: string) => {
    if (simIdRef.current || activeDiscoveryInFlightRef.current) return;
    activeDiscoveryInFlightRef.current = true;
    try {
      const active = await getActiveSimulation();
      const activeSession = active ? activeSimulationToStored(active) : null;
      if (activeSession && isBackendMode(activeSession.mode)) {
        setViewerCount(active?.connectedClients ?? 0);
        await restoreBackendSession(activeSession, sourceLabel);
      }
    } catch (err) {
      console.warn('No se pudo unir a la simulación compartida anunciada:', err);
    } finally {
      activeDiscoveryInFlightRef.current = false;
    }
  }, [restoreBackendSession]);

  const connectActiveDiscoveryStream = useCallback(() => {
    if (activeDiscoveryWsRef.current || simIdRef.current || !isBackendMode(mode)) return;

    const ws = new SimulationWebSocket(null);
    activeDiscoveryWsRef.current = ws;
    ws.onMessage(msg => {
      if (simIdRef.current) return;
      if (msg.type === 'SIMULATION_STARTED') {
        const announced = activeSimulationToStored(msg.activeSimulation);
        if (announced && isBackendMode(announced.mode)) {
          void restoreBackendSession(announced, 'iniciada en otro cliente');
        }
        return;
      }
      if (msg.type === 'CONNECTED' && msg.simulationId && msg.simulationId !== 'N/A') {
        void joinActiveSimulationFromBackend('activa compartida');
        return;
      }
      if (msg.type === 'CYCLE_UPDATE' || msg.type === 'STORAGE_UPDATE') {
        void joinActiveSimulationFromBackend('activa compartida');
      }
    });
    ws.connect();
  }, [joinActiveSimulationFromBackend, mode, restoreBackendSession]);

  useEffect(() => {
    if (isBackendMode(mode) && !isRunning && !simIdRef.current) {
      connectActiveDiscoveryStream();
    } else {
      disconnectActiveDiscoveryStream();
    }
  }, [mode, isRunning, connectActiveDiscoveryStream, disconnectActiveDiscoveryStream]);

  useEffect(() => () => disconnectActiveDiscoveryStream(), [disconnectActiveDiscoveryStream]);

  const hydrateStoredSimulation = useCallback(async () => {
    if (hasHydratedStoredSessionRef.current || simIdRef.current) return;
    hasHydratedStoredSessionRef.current = true;

    try {
      const active = await getActiveSimulation();
      const activeSession = active ? activeSimulationToStored(active) : null;
      if (activeSession && isBackendMode(activeSession.mode)) {
        await restoreBackendSession(activeSession, 'activa compartida');
        return;
      }
    } catch (err) {
      console.warn('No se pudo consultar la simulación activa del backend:', err);
    }

    const stored = readStoredActiveSimulation();
    if (!stored || !isBackendMode(stored.mode)) return;
    await restoreBackendSession(stored, 'guardada localmente');
  }, [restoreBackendSession]);

  useEffect(() => {
    void hydrateStoredSimulation();
  }, [hydrateStoredSimulation]);

  const resyncActiveBackendSimulation = useCallback(async (_reason: 'visible' | 'focus' = 'visible') => {
    const id = simIdRef.current;
    if (!id || !isBackendMode(mode) || isResyncingRef.current) return;
    isResyncingRef.current = true;

    try {
      const status = await getSimulationStatus(id);

      if (status.status === 'RUNNING') {
        setIsRunning(true);
        setIsPaused(false);
        connectSimulationStream();
        storeActiveSimulation({
          simulationId: id,
          mode,
          startDateTime: toApiInstant(startDate),
          K: simKRef.current,
          savedAt: Date.now(),
        });

        // No forzar el reloj ni vaciar el buffer de playback mientras la simulación
        // ya está reproduciendo frames WS: eso hacía saltar el tiempo atrás (aviones
        // que "llegan y retroceden") o congelarlo hasta el próximo STORAGE/CYCLE.
        // Solo re-anclar si aún no hubo primer ciclo o el buffer está vacío.
        if (status.currentCycle > 0
            && (!hasFirstCycleRef.current || playbackBufferRef.current.length === 0)) {
          applyBackendStatusClock(status);
          if (status.simulatedTime) {
            hasFirstCycleRef.current = true;
            setRealStartedAt(previous => previous ?? new Date());
            pushPlaybackFrame({
              type: 'STORAGE_UPDATE',
              simulationId: id,
              cycle: status.currentCycle ?? 0,
              simulatedTime: status.simulatedTime,
              daysElapsed: Math.max(0, (parseApiInstant(status.simulatedTime).getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
              airportCapacities: [],
            } as BackendStorageUpdate);
          }
        }
      } else if (status.status === 'PAUSED') {
        applyBackendStatusClock(status);
        setIsRunning(false);
        setIsPaused(true);
        clockBaseRef.current = null;
      } else if (status.status === 'COMPLETED' || status.status === 'STOPPED') {
        applyBackendStatusClock(status);
        setIsRunning(false);
        setIsPaused(false);
        clockBaseRef.current = null;
        wsRef.current?.disconnect();
        clearStoredActiveSimulation();
        recoverFinishedSimulation(id, mode);
      }

      if (backendAirportsRef.current.length === 0) {
        void ensureBackendAirports().catch(err => console.warn('No se pudieron recargar aeropuertos:', err));
      }
      if (flightPlanFlights.length === 0) {
        void loadProjectedFlightPlan(toApiInstant(startDate), mode)
          .catch(err => console.warn('No se pudo recargar el plan de vuelos:', err));
      }
    } catch (err) {
      // 404 = el backend ya no conoce esta simulación (típicamente se reinició, p. ej.
      // OOM-kill en la VM). Sin esto el frontend queda spameando /status para siempre
      // y la pantalla "Preparando…" nunca sale.
      if (err instanceof Error && err.message.startsWith('HTTP 404')) {
        console.warn('La simulación ya no existe en el backend (¿reinicio del servidor?):', err);
        setIsRunning(false);
        setIsPaused(false);
        setPreparationMessage(null);
        clockBaseRef.current = null;
        wsRef.current?.disconnect();
        wsSimulationIdRef.current = null;
        simIdRef.current = null;
        setSimulationId(null);
        clearStoredActiveSimulation();
        cancelScheduledSolutionRefresh();
        resetPlaybackBuffer();
        setEvents(prev => [{
          id: `sim-lost-${Date.now()}`,
          type: 'alert',
          message: 'Se perdió la simulación: el backend ya no la reconoce (posible reinicio del servidor). Vuelve a iniciarla.',
          time: new Date(),
          severity: 'critical',
        }, ...prev.slice(0, 19)]);
      } else {
        console.warn('No se pudo resincronizar la simulación activa:', err);
      }
    } finally {
      isResyncingRef.current = false;
    }
  }, [mode, startDate, flightPlanFlights.length, applyBackendStatusClock, connectSimulationStream, ensureBackendAirports, loadProjectedFlightPlan, recoverFinishedSimulation, pushPlaybackFrame, cancelScheduledSolutionRefresh, resetPlaybackBuffer]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        void resyncActiveBackendSimulation('visible');
      }
    };
    const handleFocus = () => {
      void resyncActiveBackendSimulation('focus');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [resyncActiveBackendSimulation]);

  // En modos backend, el mapa y los almacenes se renderizan desde el mismo frame atrasado.
  useEffect(() => {
    if (!isBackendMode(mode) || !isRunning) return;

    let animationFrameId = 0;
    const tick = () => {
      animationFrameId = window.requestAnimationFrame(tick);
      // No avanzar el reloj ni el mapa hasta recibir el primer CYCLE_UPDATE (no con STORAGE).
      if (!hasFirstCycleRef.current) return;
      const buffer = playbackBufferRef.current;
      if (buffer.length === 0) return;

      const renderAtMs = Date.now() - PLAYBACK_DELAY_MS;
      let nextIndex = buffer.findIndex(frame => frame.receivedAtMs > renderAtMs);
      let frame: PlaybackFrame;
      let renderSimMs: number;

      if (nextIndex > 0) {
        const previousFrame = buffer[nextIndex - 1];
        const nextFrame = buffer[nextIndex];
        const frameSpanMs = Math.max(1, nextFrame.receivedAtMs - previousFrame.receivedAtMs);
        const ratio = Math.min(Math.max((renderAtMs - previousFrame.receivedAtMs) / frameSpanMs, 0), 1);
        frame = previousFrame;
        renderSimMs = previousFrame.simulatedMs + (nextFrame.simulatedMs - previousFrame.simulatedMs) * ratio;
      } else if (nextIndex === 0) {
        frame = buffer[0];
        renderSimMs = frame.simulatedMs;
      } else {
        frame = buffer[buffer.length - 1];
        // Sin un frame futuro, no congelar en el último dato. El reloj backend avanza
        // linealmente a K×; extrapolar unos segundos mantiene el avión fluido durante
        // el intervalo normal de WebSocket y durante el planning liviano.
        const realSinceFrameMs = Math.min(
          Math.max(renderAtMs - frame.receivedAtMs, 0),
          PLAYBACK_MAX_EXTRAPOLATION_REAL_MS,
        );
        renderSimMs = frame.simulatedMs + realSinceFrameMs * simKRef.current;
      }

      let skippedCycleUpdate: BackendCycleUpdate | undefined;
      while (buffer.length > 2 && buffer[1].receivedAtMs <= renderAtMs) {
        const removed = buffer.shift();
        if (removed && removed.cycleUpdate) {
          skippedCycleUpdate = removed.cycleUpdate;
        }
      }

      const nextDate = new Date(renderSimMs);
      simClockRef.current = nextDate;
      if (commitClockState(nextDate)) {
        const elapsedDays = Math.max(
          0,
          (renderSimMs - startDate.getTime()) / (24 * 60 * 60 * 1000),
        );
        setDaysElapsed(mode === '5day' ? Math.min(5, elapsedDays) : elapsedDays);
      }

      const frameKey = `${frame.cycle}:${frame.simulatedMs}:${frame.cycleUpdate ? 'cycle' : 'storage'}:${frame.operationalMetrics?.deliveredBags ?? ''}:${frame.airportCapacities.length}`;
      if (lastAppliedPlaybackKeyRef.current === frameKey && !skippedCycleUpdate) return;
      lastAppliedPlaybackKeyRef.current = frameKey;

      if (frame.cycleUpdate) {
        startTransition(() => {
          setLastCycleUpdate(frame.cycleUpdate!);
          setActiveFlights(frame.cycleUpdate?.activeFlights ?? []);
        });
      } else if (skippedCycleUpdate) {
        startTransition(() => {
          setLastCycleUpdate(skippedCycleUpdate);
          setActiveFlights(skippedCycleUpdate.activeFlights ?? []);
        });
      } else if (frame.operationalMetrics) {
        setLastCycleUpdate(prev => prev
          ? {
              ...prev,
              simulatedTime: frame.simulatedTime,
              daysElapsed: frame.daysElapsed,
              airportCapacities: frame.airportCapacities,
              operationalMetrics: frame.operationalMetrics,
            }
          : prev
        );
      }

      applyAirportCapacities(frame.airportCapacities, frame.daysElapsed);
    };
    animationFrameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [mode, isRunning, startDate, applyAirportCapacities, commitClockState]);


  // ===== ACCIONES PRINCIPALES =====

  const start = useCallback(async () => {
    if (isBackendMode(mode)) {
      disconnectActiveDiscoveryStream();
      const isFiveDay = mode === '5day';
      const runDate = startDate;
      const startDateTimeStr = toApiInstant(runDate);
      const optimisticStart = new Date(runDate.getTime());

      setIsRunning(true);
      setIsPaused(false);
      setRealStartedAt(null);
      setSimulationComplete(false);
      setDayToDayComplete(false);
      setCollapseComplete(false);
      setCollapseMetrics(null);
      setDaysElapsed(0);
      setDaySnapshots([]);
      setSimulationResults(null);
      setActiveFlights([]);
      setLastCycleUpdate(null);
      setHasReplanned(false);
      setShipments([]);
      simClockRef.current = optimisticStart;
      commitClockState(optimisticStart, true);
      clockBaseRef.current = null;
      hasFirstCycleRef.current = false; // espera al primer ciclo antes de animar
      cancelScheduledSolutionRefresh();
      resetPlaybackBuffer();

      try {
        setEvents(prev => [{
          id: `loading-${Date.now()}`,
          type: 'info',
          message: isFiveDay
            ? 'Cargando aeropuertos y plan de vuelos para 5 días...'
            : 'Cargando operación día a día con datos reales...',
          time: new Date(),
          severity: 'info',
        }, ...prev.slice(0, 19)]);

        // 1. Cargar datos base en paralelo, pero pintar cada uno apenas llegue.
        //    Día a día proyecta 1 día; 5 días y colapso proyectan una ventana de 5 días.
        const flightPlanDays = mode === 'realtime' ? 1 : 5;
        void ensureBackendAirports()
          .then(mappedAirports => {
            setEvents(prev => [{
              id: `progress-airports-${Date.now()}`,
              type: 'info',
              message: `✓ Aeropuertos listos (${mappedAirports.length})`,
              time: new Date(),
              severity: 'info',
            }, ...prev.slice(0, 19)]);
            return mappedAirports;
          })
          .catch(err => {
            console.warn('No se pudieron cargar aeropuertos del backend:', err);
            setEvents(prev => [{
              id: `progress-airports-error-${Date.now()}`,
              type: 'alert',
              message: 'No se pudieron cargar aeropuertos reales todavía; se reintentará al recibir datos',
              time: new Date(),
              severity: 'warning',
            }, ...prev.slice(0, 19)]);
          });
        const flightPlanPromise = fetchFlightPlan(startDateTimeStr, flightPlanDays)
          .then(projectedFlights => {
            setFlightPlanFlights(projectedFlights);
            setFlights(mapFlightPlanFlights(projectedFlights));
            if (mode === 'collapse') {
              flightPlanWindowEndRef.current = new Date(
                parseApiInstant(startDateTimeStr).getTime() + flightPlanDays * 24 * 60 * 60 * 1000
              );
            }
            console.log(`✓ Cargados ${projectedFlights.length} vuelos del plan de vuelos`);
            setEvents(prev => [{
              id: `progress-flights-${Date.now()}`,
              type: 'info',
              message: `✓ Plan de vuelos cargado (${projectedFlights.length})`,
              time: new Date(),
              severity: 'info',
            }, ...prev.slice(0, 19)]);
            return projectedFlights;
          })
          .catch(err => {
            console.warn('No se pudo cargar el plan de vuelos proyectado:', err);
            setFlightPlanFlights([]);
            setFlights([]);
            return [];
          });
        void flightPlanPromise;

        setEvents(prev => [{
          id: `progress-sim-${Date.now()}`,
          type: 'info',
          message: 'Iniciando motor de simulación...',
          time: new Date(),
          severity: 'info',
        }, ...prev.slice(0, 19)]);

        // 2. Iniciar simulación en el backend (retorna K, simStartTime, etc.)
        const res = await startSimulation(modeToScenario(mode), startDateTimeStr);
        simIdRef.current = res.simulationId;
        setSimulationId(res.simulationId);

        // 3. Guardar K del backend y anclar el reloj
        const K = res.K ?? SIMULATION_K;
        simKRef.current = K;
        setSimulationK(K);
        const simStartMs = parseApiInstant(res.simStartTime).getTime();
        const simStartDate = new Date(simStartMs);
        // Se ancla al recibir CYCLE_UPDATE 1; antes de eso la pantalla sigue en
        // "Preparando simulación…" con el tiempo estático de inicio.
        clockBaseRef.current = null;
        simClockRef.current = simStartDate;
        commitClockState(simStartDate, true);
        storeActiveSimulation({
          simulationId: res.simulationId,
          mode,
          startDateTime: startDateTimeStr,
          K,
          savedAt: Date.now(),
        });

        // 4. Abrir WebSocket
        connectSimulationStream();

        setEvents(prev => [{
          id: `progress-ws-${Date.now()}`,
          type: 'info',
          message: '✓ Motor iniciado y canal WebSocket solicitado',
          time: new Date(),
          severity: 'info',
        }, ...prev.slice(0, 19)]);

        setEvents(prev => [{
          id: `start-${Date.now()}`,
          type: 'info',
          message: isFiveDay
            // res.Sa/res.Ta llegan en SEGUNDOS desde el backend; res.Sc en minutos simulados.
            ? `Simulación iniciada — K=${K}× — Sa=${res.Sa ?? '?'}s — Sc=${res.Sc ? `${(res.Sc / 60).toFixed(1).replace(/\.0$/, '')} h` : '?'} — Duración: ${res.totalRealMinutes?.toFixed(0) ?? '?'} min reales`
            : mode === 'collapse'
            ? `Simulación de colapso iniciada — ${formatLocalDateTime(runDate)} — K=${K}×`
            : `Operación día a día iniciada — ${formatLocalDateTime(runDate)} — K=${K}×`,
          time: new Date(),
          severity: 'info',
        }, ...prev.slice(0, 19)]);

        getSimulationStatus(res.simulationId)
          .then(status => {
            if (status.simulatedTime) {
              const statusTime = parseApiInstant(status.simulatedTime);
              simClockRef.current = statusTime;
              commitClockState(statusTime, true);
            }
          })
          .catch(err => console.warn('No se pudo cargar estado inicial:', err));

      } catch (err) {
        console.error('Error iniciando simulación:', err);
        setIsRunning(false);
        setRealStartedAt(null);
        clearStoredActiveSimulation();
        clockBaseRef.current = null;
        cancelScheduledSolutionRefresh();
        resetPlaybackBuffer();
        setEvents(prev => [{
          id: `err-${Date.now()}`,
          type: 'alert',
          message: `Error conectando al backend: ${err instanceof Error ? err.message : String(err)}`,
          time: new Date(),
          severity: 'critical',
        }, ...prev.slice(0, 19)]);
      }
    }
  }, [mode, startDate, resetPlaybackBuffer, cancelScheduledSolutionRefresh, disconnectActiveDiscoveryStream, ensureBackendAirports, commitClockState, connectSimulationStream]);

  const pause = useCallback(async () => {
    if (isBackendMode(mode) && simIdRef.current) {
      await pauseSimulation(simIdRef.current).catch(console.warn);
      const currentClock = simClockRef.current;
      commitClockState(currentClock, true);
      clockBaseRef.current = null;
      cancelScheduledSolutionRefresh();
      resetPlaybackBuffer();
      setIsPaused(true);
    }
    setIsRunning(false);
  }, [mode, resetPlaybackBuffer, cancelScheduledSolutionRefresh, commitClockState]);

  const resume = useCallback(async () => {
    if (isBackendMode(mode) && simIdRef.current) {
      await resumeSimulation(simIdRef.current).catch(console.warn);
      const currentClock = simClockRef.current;
      clockBaseRef.current = { simMs: currentClock.getTime(), realMs: Date.now(), K: simKRef.current };
      connectSimulationStream();
      setIsPaused(false);
      setIsRunning(true);
    }
  }, [mode, connectSimulationStream]);

  const reset = useCallback(async () => {
    if (isBackendMode(mode) && simIdRef.current) {
      await stopSimulation(simIdRef.current).catch(console.warn);
      wsRef.current?.disconnect();
      wsSimulationIdRef.current = null;
      simIdRef.current = null;
      setSimulationId(null);
      wsRef.current = null;
      wsSimulationIdRef.current = null;
    }

    clearStoredActiveSimulation();
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    setIsRunning(false);
    setIsPaused(false);
    setRealStartedAt(null);
    setSimulationId(null);
    setShipments([]);
    setFlights([]);
    setActiveFlights([]);
    setFlightPlanFlights([]);
    setCancelledFlightIds(new Set());
    flightPlanWindowEndRef.current = null;
    clockBaseRef.current = null;
    hasFirstCycleRef.current = false;
    cancelScheduledSolutionRefresh();
    resetPlaybackBuffer();
    setSimulationK(SIMULATION_K);
    ensureBackendAirports()
      .catch(() => {
        backendAirportsRef.current = [];
        backendAirportsLoadedRef.current = false;
        setAirports([]);
      });
    setStartDate(now);
    simClockRef.current = now;
    commitClockState(now, true);
    setHasReplanned(false);
    setDaySnapshots([]);
    setSimulationResults(null);
    setLastCycleUpdate(null);
    setSimulationComplete(false);
    setDayToDayComplete(false);
    setDaysElapsed(0);
    setCollapseComplete(false);
    setCollapseMetrics(null);
    setEvents(buildInitEvents(now));
  }, [mode, resetPlaybackBuffer, cancelScheduledSolutionRefresh, ensureBackendAirports, commitClockState]);

  // ESC-02: cierra la operación día a día, detiene el motor y carga el reporte JSON.
  const closeOperations = useCallback(async () => {
    const id = simIdRef.current;
    if (!id || mode !== 'realtime') return;
    await stopSimulation(id).catch(console.warn);
    wsRef.current?.disconnect();
    wsSimulationIdRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
    clockBaseRef.current = null;
    cancelScheduledSolutionRefresh();
    resetPlaybackBuffer();
    clearStoredActiveSimulation();
    setEvents(prev => [{
      id: `close-${Date.now()}`,
      type: 'info',
      message: 'Operación día a día cerrada — generando reporte de la última planificación estable...',
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);
    try {
      const results = await getSimulationResults(id);
      setSimulationResults(results);
    } catch (err) {
      console.warn('No se pudo cargar el reporte día a día:', err);
    }
    setDayToDayComplete(true);
  }, [mode, cancelScheduledSolutionRefresh, resetPlaybackBuffer]);

  const replan = useCallback(() => {
    if (isBackendMode(mode)) {
      setEvents(prev => [{
        id: `replan-info-${Date.now()}`,
        type: 'info',
        message: 'La replanificación real se ejecuta al cancelar un vuelo específico',
        time: new Date(),
        severity: 'info',
      }, ...prev.slice(0, 19)]);
      return;
    }

    setHasReplanned(true);
    setShipments(prev => prev.map(s => s.status !== 'on-time' ? { ...s, isReplanned: true, status: 'on-time' as const } : s));
    setFlights(prev => prev.map(f => f.status !== 'normal' ? { ...f, isReplanned: true, status: 'normal' as const, load: Math.floor(f.load * 0.82) } : f));
    setAirports(prev => prev.map(a => {
      if (a.status === 'critical') {
        const newOcc = Math.floor(a.occupancy * 0.85);
        return { ...a, occupancy: newOcc, status: getOccupancyStatus(Math.round(newOcc / a.capacity * 100)) };
      }
      return a;
    }));
    setEvents(prev => [{ id:`replan-${Date.now()}`, type:'replan', message:'Replanificación de rutas completa', time:new Date(), severity:'info' }, ...prev.slice(0,19)]);
  }, [mode]);

  // (refreshSolution se movió arriba, antes de restoreBackendSession, que la necesita en
  // su lista de dependencias — useCallback evalúa el array de deps de inmediato, no de forma
  // diferida, así que debía estar ya inicializada en ese punto del cuerpo del componente.)

  const addShipment = useCallback(async (data: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => {
    if (!simIdRef.current || !isRunning) {
      throw new Error('Inicia la operación día a día antes de registrar maletas');
    }

    // clientId: usar el ingresado por el usuario o autogenerar uno único por ejecución
    // (formato numérico de 7 dígitos como el dataset, en un rango que no colisiona).
    const providedClient = data.airlineId?.trim();
    const clientId = providedClient && providedClient !== 'UI'
      ? providedClient
      : nextUiClientId();

    const response = await createShipment(simIdRef.current, {
      clientId,
      originId: data.origin,
      destinationId: data.destination,
      quantity: data.luggageCount,
    });

    const shipment = mapShipmentResponseToShipment(response);
    setShipments(prev => [shipment, ...prev.filter(s => s.id !== shipment.id)]);
    setEvents(prev => [{
      id: `shipment-${response.batchId}`,
      type: 'info',
      message: `${response.quantity} maletas registradas ${response.originId}→${response.destinationId} (cliente ${response.clientId})`,
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);

    await refreshSolution(simClockRef.current).catch(err => console.warn('Solución aún no disponible para el nuevo lote:', err));
  }, [isRunning, refreshSolution]);

  const cancelFlight = useCallback(async (flightId: string, day: string) => {
    if (!isBackendMode(mode)) {
      setEvents(prev => [{
        id: `cancel-mock-${Date.now()}`,
        type: 'alert',
        message: `Vuelo ${flightId} marcado como cancelado en modo local`,
        time: new Date(),
        severity: 'warning',
      }, ...prev.slice(0, 19)]);
      setHasReplanned(true);
      return;
    }

    if (!simIdRef.current || !isRunning) {
      throw new Error('Inicia una simulación activa antes de cancelar vuelos');
    }

    const baseFlightId = stripProjectedDaySuffix(flightId);
    const flight = findFlightById(flightId, flightPlanFlights, activeFlights);
    const resolvedDay = flight
      ? computeCancellationTargetDay(simClockRef.current, flight.departureTime)
      : day;
    const result = await cancelFlightRequest(simIdRef.current, baseFlightId, resolvedDay);
    setHasReplanned(true);
    if (result.cancelledFlightId) {
      setCancelledFlightIds(prev => {
        const next = new Set(prev);
        next.add(result.cancelledFlightId);
        return next;
      });
    }
    setFlights(prev => prev.map(f => f.id === flightId || f.id === result.cancelledFlightId
      ? { ...f, status: 'critical', isReplanned: true }
      : f
    ));
    setEvents(prev => [{
      id: `cancel-${Date.now()}`,
      type: 'replan',
      message: `Vuelo ${baseFlightId} cancelado — ${result.replannedBatches} lotes replanificados`,
      time: new Date(),
      severity: result.unreplannableBatches > 0 ? 'warning' : 'info',
    }, ...prev.slice(0, 19)]);

    const [status] = await Promise.all([
      getSimulationStatus(simIdRef.current),
      refreshSolution(simClockRef.current),
    ]);
    if (status.simulatedTime) {
      const statusTime = parseApiInstant(status.simulatedTime);
      simClockRef.current = statusTime;
      commitClockState(statusTime, true);
    }
  }, [mode, isRunning, refreshSolution, commitClockState, flightPlanFlights, activeFlights]);

  const uploadStaticData = useCallback(async (
    airportsFile: File,
    flightsFile: File,
    shipmentFiles: File[],
    onProgress?: (progress: StaticDataUploadProgress) => void
  ): Promise<BackendStaticDataUploadResponse> => {
    if (isRunning) {
      throw new Error('Deten la simulación antes de reemplazar datos estáticos');
    }

    const response = await uploadStaticDatasetBatched(airportsFile, flightsFile, shipmentFiles, onProgress);
    const backendAirports = await fetchAirports();
    commitBackendAirports(mapAirports(backendAirports));
    setShipments([]);
    setActiveFlights([]);
    setDaySnapshots([]);
    setSimulationResults(null);
    setLastCycleUpdate(null);
    setSimulationComplete(false);
    setCollapseComplete(false);
    setCollapseMetrics(null);

    if (isBackendMode(mode)) {
      // Colapso usa la MISMA ventana que 5 días (no 1 día): se refresca sola después
      // mientras la simulación corre (refreshCollapseFlightPlanIfNeeded).
      const planDate = mode === 'realtime' ? new Date() : startDate;
      const days = mode === 'realtime' ? 1 : 5;
      const projectedFlights = await fetchFlightPlan(toApiInstant(planDate), days);
      setFlightPlanFlights(projectedFlights);
      setFlights(mapFlightPlanFlights(projectedFlights));
      if (mode === 'collapse') {
        flightPlanWindowEndRef.current = new Date(
          planDate.getTime() + days * 24 * 60 * 60 * 1000
        );
      }
    }

    setEvents(prev => [{
      id: `static-data-${Date.now()}`,
      type: 'info',
      message: `Dataset actualizado — ${response.airportsLoaded} aeropuertos, ${response.flightsLoaded} vuelos, ${response.shipmentsLoaded} envíos`,
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);

    return response;
  }, [isRunning, mode, startDate, commitBackendAirports]);

  /**
   * Carga PARCIAL de datos estáticos: solo se reemplaza lo que se sube (solo aeropuertos,
   * solo vuelos, o combinaciones), sin exigir los 3 archivos ni borrar los envíos existentes.
   * Necesario para la prueba de operaciones día a día: "En preparación, se agrega los planes
   * de vuelo ajustados a la hora" — solo el plan de vuelos, sin tocar aeropuertos/envíos.
   */
  const uploadStaticDataPartial = useCallback(async (
    airportsFile: File | null,
    flightsFile: File | null,
    shipmentFiles: File[] = [],
    shipmentsMode: 'append' | 'replace' = 'append',
    onProgress?: (progress: StaticDataUploadProgress) => void
  ): Promise<BackendStaticDataUploadResponse> => {
    if (isRunning) {
      throw new Error('Detén la simulación antes de actualizar datos estáticos');
    }
    // Por lotes (igual que el reemplazo total): mandar muchos archivos de envíos en UNA
    // sola petición puede chocar con límites de un proxy delante del backend (413 con
    // cuerpo vacío, visto en despliegue real) aunque nginx/Spring acepten el tamaño total.
    const response = await uploadStaticDatasetPartialBatched(airportsFile, flightsFile, shipmentFiles, shipmentsMode, onProgress);

    if (airportsFile) {
      const backendAirports = await fetchAirports();
      commitBackendAirports(mapAirports(backendAirports));
    }
    if (isBackendMode(mode) && (airportsFile || flightsFile)) {
      const planDate = mode === 'realtime' ? new Date() : startDate;
      const days = mode === 'realtime' ? 1 : 5;
      const projectedFlights = await fetchFlightPlan(toApiInstant(planDate), days);
      setFlightPlanFlights(projectedFlights);
      setFlights(mapFlightPlanFlights(projectedFlights));
      if (mode === 'collapse') {
        flightPlanWindowEndRef.current = new Date(
          planDate.getTime() + days * 24 * 60 * 60 * 1000
        );
      }
    }

    setEvents(prev => [{
      id: `static-data-partial-${Date.now()}`,
      type: 'info',
      message: response.message,
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);

    return response;
  }, [isRunning, mode, startDate, commitBackendAirports]);

  /**
   * Carga un ARCHIVO de envíos contra la operación día a día ACTIVA (prueba del curso:
   * "Durante la ejecución, se realiza la carga del archivo de envíos"). El backend registra
   * cada línea como si fuera un POST manual — los envíos entran al ciclo siguiente.
   */
  const uploadShipmentsFile = useCallback(async (file: File, originId?: string) => {
    if (!simIdRef.current) {
      throw new Error('No hay una operación día a día activa');
    }
    return uploadShipmentsFileToSimulation(simIdRef.current, file, originId);
  }, []);

  return {
    simulationId,
    startDate, setStartDate,
    airports, flights, shipments,
    isRunning, isPaused, mode, simulationTime, events,
    hasReplanned, daySnapshots, simulationComplete, dayToDayComplete, daysElapsed,
    collapseComplete, collapseMetrics, simulationResults,
    setMode, start, pause: pause as () => void, resume: resume as () => void, reset,
    closeOperations: closeOperations as () => void,
    replan, addShipment, cancelFlight, uploadStaticData, uploadStaticDataPartial, uploadShipmentsFile,
    setAirports, setFlights, setShipments,
    simClock, simClockRef, activeFlights, flightPlanFlights,
    simulationK,
    lastCycleUpdate,
    preparationMessage,
    viewerCount,
    cancelledFlightIds,
    realStartedAt,
  };
}