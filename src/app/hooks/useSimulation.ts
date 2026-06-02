import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction, startTransition } from 'react';
import {
  Airport, Flight, Shipment, SimEvent, SimulationMode,
  INITIAL_AIRPORTS, INITIAL_FLIGHTS, INITIAL_SHIPMENTS,
  getOccupancyStatus,
} from '../data/mockData';
import {
  fetchAirports,
  fetchFlightPlan,
  startSimulation,
  startDayToDaySimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  getSimulationResults,
  getSimulationStatus,
  getSimulationSolution,
  createShipment,
  cancelFlight as cancelFlightRequest,
  uploadStaticDataset,
} from '../services/api';
import { SimulationWebSocket } from '../services/websocket';
import {
  mapAirports,
  mapDaySnapshots,
  buildCycleDaySnapshot,
  mapFlightPlanFlights,
  mergeActiveFlightLoads,
  mapSolutionToShipments,
  mapShipmentResponseToShipment,
} from '../services/mapper';
import type { BackendCycleUpdate, BackendSimulationFinished, BackendSimulationError, BackendActiveFlight, BackendFlightPlanFlight, BackendStorageUpdate, BackendAirportCapacity, BackendSolution, BackendStaticDataUploadResponse, BackendSimulationResults } from '../types/backend';

/** Factor de aceleración del tiempo simulado: 1 min real = K min simulados */
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
}

interface SimulationState {
  airports: Airport[];
  flights: Flight[];
  shipments: Shipment[];
  isRunning: boolean;
  mode: SimulationMode;
  simulationTime: Date;
  events: SimEvent[];
  hasReplanned: boolean;
  daySnapshots: DaySnapshot[];
  simulationComplete: boolean;
  daysElapsed: number;
  collapseComplete: boolean;
  collapseMetrics: CollapseMetrics | null;
  simulationResults: BackendSimulationResults | null;
}

interface UseSimulationReturn extends SimulationState {
  startDate: Date;
  setStartDate: Dispatch<SetStateAction<Date>>;
  setMode: (mode: SimulationMode) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  replan: () => void;
  skipToComplete: () => void;
  skipToCollapseComplete: () => void;
  addShipment: (shipment: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => Promise<void>;
  cancelFlight: (flightId: string, day: string) => Promise<void>;
  uploadStaticData: (airportsFile: File, flightsFile: File, shipmentFiles: File[]) => Promise<BackendStaticDataUploadResponse>;
  setAirports: Dispatch<SetStateAction<Airport[]>>;
  setFlights: Dispatch<SetStateAction<Flight[]>>;
  setShipments: Dispatch<SetStateAction<Shipment[]>>;
  /** Reloj del tiempo simulado, actualizado en tiempo real (corre a K× velocidad) */
  simClock: Date;
  /** Factor K activo recibido del backend */
  simulationK: number;
  /** Vuelos activos del backend con sus tiempos de salida/llegada */
  activeFlights: BackendActiveFlight[];
  /** Todos los vuelos proyectados del plan para animacion independiente del planificador */
  flightPlanFlights: BackendFlightPlanFlight[];
  /** Último ciclo recibido del backend para KPIs reales */
  lastCycleUpdate: BackendCycleUpdate | null;
}

// ==================== MOCK HELPERS (para modos realtime y collapse) ====================

const DISRUPTION_MESSAGES = [
  'Retraso reportado en manejo de equipaje',
  'Disrupción climática afectando ruta',
  'Escasez de personal de tierra detectada',
  'Inspección aduanera causando retrasos',
  'Problema técnico en punto de transferencia',
];

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const PLAYBACK_DELAY_MS = 500;
const PLAYBACK_TICK_MS = 50;
const PLAYBACK_MAX_FRAMES = 240;
const SOLUTION_REFRESH_DELAY_MS = 1_200;
const SOLUTION_MAPPING_CHUNK_SIZE = 250;
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

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

function isBackendMode(mode: SimulationMode): boolean {
  return mode === 'realtime' || mode === '5day';
}

function formatApiDateTime(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseApiDateTimeAsUtc(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const parsed = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? new Date(value) : parsed;
}

function parseBackendSimMs(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/\[[^\]]+\]$/, '');
  const parsed = new Date(normalized);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, 0));
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

function stripProjectedDaySuffix(flightId: string): string {
  return flightId.replace(/-D\d+$/, '');
}

function buildPresetSnapshots(startDate: Date): DaySnapshot[] {
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')} ${MONTHS_ES[d.getMonth()]}`;
  const offset = (n: number) => { const d = new Date(startDate); d.setDate(d.getDate() + n); return d; };
  return [
    { day:1, date:fmt(offset(1)), onTimePct:80, delayed:4, critical:1, completed:3, totalBags:2840, newEvents:5, avgOccupancy:71, replanned:0, keyEvent:'Almacén DXB al 94%', severity:'warning' },
    { day:2, date:fmt(offset(2)), onTimePct:68, delayed:7, critical:3, completed:6, totalBags:3120, newEvents:11, avgOccupancy:79, replanned:0, keyEvent:'Disrupción climática: vuelos retrasados', severity:'warning' },
    { day:3, date:fmt(offset(3)), onTimePct:54, delayed:8, critical:5, completed:8, totalBags:3450, newEvents:18, avgOccupancy:87, replanned:3, keyEvent:'CRÍTICO: Suspensión parcial del hub', severity:'critical' },
    { day:4, date:fmt(offset(4)), onTimePct:71, delayed:5, critical:2, completed:14, totalBags:3890, newEvents:9, avgOccupancy:76, replanned:9, keyEvent:'Replanificación completa activada', severity:'normal' },
    { day:5, date:fmt(offset(5)), onTimePct:83, delayed:3, critical:1, completed:20, totalBags:4280, newEvents:4, avgOccupancy:67, replanned:12, keyEvent:'Operaciones normalizadas', severity:'normal' },
  ];
}

function buildInitEvents(startDate: Date): SimEvent[] {
  const h = (m: number) => new Date(startDate.getTime() + m * 60000);
  return [
    { id:'init1', type:'alert', message:'Sistema listo para simulación de 5 días', time:h(0), severity:'info' },
    { id:'init2', type:'info', message:'Cargando datos del backend...', time:h(1), severity:'info' },
  ];
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
  const [mode, setMode] = useState<SimulationMode>('5day');
  const [simulationTime, setSimulationTime] = useState<Date>(today);
  const [events, setEvents] = useState<SimEvent[]>(() => buildInitEvents(today));
  const [hasReplanned, setHasReplanned] = useState(false);
  const [daySnapshots, setDaySnapshots] = useState<DaySnapshot[]>([]);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [collapseComplete, setCollapseComplete] = useState(false);
  const [collapseMetrics, setCollapseMetrics] = useState<CollapseMetrics | null>(null);
  const [simulationResults, setSimulationResults] = useState<BackendSimulationResults | null>(null);

  // Refs para el modo 5day (backend)
  const simIdRef  = useRef<string | null>(null);
  const wsRef     = useRef<SimulationWebSocket | null>(null);

  // Refs para el mock (realtime / collapse)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickCountRef   = useRef(0);
  const lastDayRef     = useRef(0);
  const collapseTickRef= useRef(0);

  // ===== RELOJ SIMULADO (corre a K× en tiempo real) =====
  const [simClock, setSimClock] = useState<Date>(today);
  const [simulationK, setSimulationK] = useState(SIMULATION_K);
  // Base interpolada del reloj: el backend la reancla y el frontend suaviza entre updates.
  const clockBaseRef = useRef<{ simMs: number; realMs: number; K: number } | null>(null);
  const playbackBufferRef = useRef<PlaybackFrame[]>([]);
  const lastAppliedPlaybackKeyRef = useRef<string | null>(null);
  const solutionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solutionRefreshSeqRef = useRef(0);

  // Vuelos activos (con maletas) del backend
  const [activeFlights, setActiveFlights] = useState<BackendActiveFlight[]>([]);

  // TODOS los vuelos del plan de vuelos (independientes del planificador)
  const [flightPlanFlights, setFlightPlanFlights] = useState<BackendFlightPlanFlight[]>([]);
  const [lastCycleUpdate, setLastCycleUpdate] = useState<BackendCycleUpdate | null>(null);

  // K dinámico recibido del backend
  const simKRef = useRef(SIMULATION_K);

  const applyAirportCapacities = useCallback((capacities: BackendAirportCapacity[], daysElapsedVal?: number) => {
    if (!capacities || capacities.length === 0) return;
    const currentDay = daysElapsedVal !== undefined ? Math.ceil(daysElapsedVal) : 1;
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

  const resetPlaybackBuffer = useCallback(() => {
    playbackBufferRef.current = [];
    lastAppliedPlaybackKeyRef.current = null;
  }, []);

  const pushPlaybackFrame = useCallback((update: BackendPlaybackMessage) => {
    const simulatedMs = parseBackendSimMs(update.simulatedTime);
    if (simulatedMs === null) return null;

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

    const buffer = playbackBufferRef.current;
    const last = buffer[buffer.length - 1];
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
      buffer.splice(0, buffer.length - PLAYBACK_MAX_FRAMES);
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

  const scheduleSolutionRefresh = useCallback((simulatedTime: Date) => {
    const id = simIdRef.current;
    if (!id) return;

    cancelScheduledSolutionRefresh();
    const seq = solutionRefreshSeqRef.current;
    solutionRefreshTimerRef.current = setTimeout(() => {
      solutionRefreshTimerRef.current = null;
      getSimulationSolution(id)
        .then(async solution => {
          if (seq !== solutionRefreshSeqRef.current) return;
          if (solution.routes.length === 0 && solution.totalRoutes === 0) {
            startTransition(() => setShipments(prev => prev.length > 0 ? prev : []));
            return;
          }
          const mapped = await mapSolutionToShipmentsCooperatively(solution, simulatedTime);
          if (seq !== solutionRefreshSeqRef.current) return;
          applyMappedShipments(mapped);
        })
        .catch(err => console.warn('No se pudo refrescar la solución:', err));
    }, SOLUTION_REFRESH_DELAY_MS);
  }, [applyMappedShipments, cancelScheduledSolutionRefresh]);

  useEffect(() => () => cancelScheduledSolutionRefresh(), [cancelScheduledSolutionRefresh]);

  // ===== CARGAR AEROPUERTOS REALES PARA MODOS BACKEND =====
  useEffect(() => {
    if (isBackendMode(mode)) {
      fetchAirports()
        .then(data => setAirports(mapAirports(data)))
        .catch(err => console.warn('No se pudieron cargar aeropuertos del backend:', err));
    }
  }, [mode]);

  useEffect(() => {
    if (isRunning) return;
    if (mode === 'collapse') {
      setAirports(INITIAL_AIRPORTS);
      setFlights(INITIAL_FLIGHTS);
      setShipments(INITIAL_SHIPMENTS);
      return;
    }
    setFlights([]);
    setShipments([]);
  }, [mode, isRunning]);

  // Sync tiempo y eventos cuando cambia startDate
  useEffect(() => {
    setSimulationTime(new Date(startDate));
    if (!clockBaseRef.current) {
      setSimClock(new Date(startDate));
    }
    setEvents(buildInitEvents(startDate));
  }, [startDate]);

  // ===== MODO 5DAY — WebSocket handler =====

  const handle5DayWsMessage = useCallback((msg: any) => {
    if (msg.type === 'CYCLE_UPDATE') {
      const update = msg as BackendCycleUpdate;
      const t = pushPlaybackFrame(update);

      // Actualizar snapshot del día para la simulación de 5 días
      const snap = mode === '5day' ? buildCycleDaySnapshot(update, startDate) : null;
      if (snap) {
        setDaySnapshots(prev => {
          const exists = prev.find(s => s.day === snap.day);
          if (exists) {
            return prev.map(s => s.day === snap.day ? snap : s);
          }
          return [...prev, snap];
        });
      }

      // Agregar evento al panel de eventos
      setEvents(prev => [{
        id: `cycle-${update.cycle}`,
        type: 'info',
        message: mode === '5day'
          ? `Ciclo ${update.cycle} — Día ${update.daysElapsed.toFixed(1)}/5 — ${update.totalRoutes} rutas`
          : `Ciclo ${update.cycle} — Operación día a día — ${update.totalRoutes} rutas`,
        time: new Date(),
        severity: update.semaphores.sla === 'RED' ? 'critical'
                : update.semaphores.sla === 'AMBER' ? 'warning' : 'info',
      }, ...prev.slice(0, 19)]);

      scheduleSolutionRefresh(t ?? new Date());

    } else if (msg.type === 'STORAGE_UPDATE') {
      const update = msg as BackendStorageUpdate;
      pushPlaybackFrame(update);

    } else if (msg.type === 'SIMULATION_ERROR') {
      const failed = msg as BackendSimulationError;
      setIsRunning(false);
      setSimulationComplete(false);
      clockBaseRef.current = null;
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

    } else if (msg.type === 'SIMULATION_FINISHED') {
      const finished = msg as BackendSimulationFinished;
      setIsRunning(false);
      setSimulationComplete(mode === '5day');
      setDaysElapsed(mode === '5day' ? 5 : daysElapsed);
      clockBaseRef.current = null; // parar el reloj
      cancelScheduledSolutionRefresh();
      resetPlaybackBuffer();

      if (mode === '5day') {
        const finalTime = new Date(parseApiDateTimeAsUtc(formatApiDateTime(startDate)).getTime() + FIVE_DAYS_MS);
        setSimulationTime(finalTime);
        setSimClock(finalTime);
      }

      setEvents(prev => [{
        id: `finish-${Date.now()}`,
        type: 'info',
        message: `Simulación completada — ${finished.batchesProcessed} lotes procesados en ${finished.totalCycles} ciclos`,
        time: new Date(),
        severity: 'info',
      }, ...prev.slice(0, 19)]);

      // Cargar resultados finales del archivo JSON
      const id = simIdRef.current;
      if (id && mode === '5day') {
        getSimulationResults(id)
          .then(results => {
            setSimulationResults(results);
            setDaySnapshots(mapDaySnapshots(results));
          })
          .catch(err => console.warn('No se pudieron cargar resultados finales:', err));
      }

      // Desconectar WebSocket
      wsRef.current?.disconnect();
    }
  }, [startDate, mode, daysElapsed, pushPlaybackFrame, resetPlaybackBuffer, scheduleSolutionRefresh, cancelScheduledSolutionRefresh]);

  // En modos backend, el mapa y los almacenes se renderizan desde el mismo frame atrasado.
  useEffect(() => {
    if (!isBackendMode(mode) || !isRunning) return;

    const tick = setInterval(() => {
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
        renderSimMs = frame.simulatedMs;
      }

      while (buffer.length > 2 && buffer[1].receivedAtMs <= renderAtMs) {
        buffer.shift();
      }

      const nextDate = new Date(renderSimMs);
      setSimulationTime(nextDate);
      setSimClock(prev => Math.abs(prev.getTime() - renderSimMs) < 1 ? prev : nextDate);
      setDaysElapsed(frame.daysElapsed);

      const frameKey = `${frame.cycle}:${frame.simulatedMs}:${frame.cycleUpdate ? 'cycle' : 'storage'}:${frame.operationalMetrics?.deliveredBags ?? ''}:${frame.airportCapacities.length}`;
      if (lastAppliedPlaybackKeyRef.current === frameKey) return;
      lastAppliedPlaybackKeyRef.current = frameKey;

      if (frame.cycleUpdate) {
        setLastCycleUpdate(frame.cycleUpdate);
        setActiveFlights(frame.cycleUpdate.activeFlights ?? []);
        startTransition(() => {
          setFlights(prev => mergeActiveFlightLoads(prev, frame.cycleUpdate?.activeFlights ?? []));
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
    }, PLAYBACK_TICK_MS);

    return () => clearInterval(tick);
  }, [mode, isRunning, applyAirportCapacities]);


  // ===== MOCK LOOP (collapse) =====

  const simStartMs = startDate.getTime();
  const presets    = buildPresetSnapshots(startDate);

  const getSpeed    = useCallback(() => mode === 'collapse' ? 0.006 : 0.0006, [mode]);
  const getTimeStep = useCallback(() => mode === 'collapse' ? 900000 : 60000, [mode]);

  useEffect(() => {
    if (!isRunning || mode !== 'collapse') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      tickCountRef.current += 1;
      const speed    = getSpeed();
      const timeStep = getTimeStep();

      setSimulationTime(prev => {
        const next = new Date(prev.getTime() + timeStep);

        if (mode === 'collapse') {
          collapseTickRef.current += 1;
          const collapseDuration = 200;
          const recoveryDuration = 150;
          const totalDuration    = collapseDuration + recoveryDuration;

          if (collapseTickRef.current >= totalDuration) {
            setCollapseComplete(true);
            setIsRunning(false);
            setAirports(ap => {
              const criticalCount = ap.filter(a => a.status === 'critical').length;
              const peakAirport   = ap.reduce((max, a) => (a.occupancy/a.capacity) > (max.occupancy/max.capacity) ? a : max, ap[0]);
              const peakPct       = Math.round((peakAirport.occupancy / peakAirport.capacity) * 100);
              setShipments(sp => {
                const delayed = sp.filter(s => s.status === 'delayed').length;
                const lost    = sp.filter(s => s.progress < 0.3 && s.status === 'critical').length;
                const resilienceScore = Math.round(
                  ((sp.filter(s => s.status === 'on-time').length / sp.length) * 50) +
                  (((ap.length - criticalCount) / ap.length) * 30) +
                  (hasReplanned ? 20 : 5)
                );
                setCollapseMetrics({
                  timeToCollapse: `${Math.round(collapseDuration*(timeStep/100)/60)} min`,
                  resilienceScore, affectedAirports: criticalCount, totalAirports: ap.length,
                  shipmentsDelayed: delayed, shipmentsLost: lost, totalShipments: sp.length,
                  peakCongestion: peakPct, peakAirport: peakAirport.id,
                  recoveryTime: `${Math.round(recoveryDuration*(timeStep/100)/60)} min`,
                  replannedRoutes: hasReplanned ? Math.floor(sp.length*0.6) : 0,
                  cascadeEvents: Math.floor(criticalCount*3 + delayed*1.5),
                });
                return sp;
              });
              return ap;
            });
            return new Date(simStartMs + totalDuration * timeStep);
          }
        }
        return next;
      });

      setShipments(prev => prev.map(s => {
        if (s.progress >= 1) return s;
        const newProgress = Math.min(s.progress + speed, 1);
        let newStatus = s.status;
        if (!hasReplanned && Math.random() < 0.0008 && s.status === 'on-time') {
          newStatus = 'delayed';
          const msg = DISRUPTION_MESSAGES[Math.floor(Math.random() * DISRUPTION_MESSAGES.length)];
          setEvents(prev => [{ id:`ev-${Date.now()}`, type:'delay', message:`${s.airline} ${s.origin}→${s.destination}: ${msg}`, time:new Date(), severity:'warning' }, ...prev.slice(0,19)]);
        }
        return { ...s, progress: newProgress, status: newStatus };
      }));

      if (tickCountRef.current % 50 === 0 && Math.random() < 0.3) {
        setAirports(prev => {
          const idx = Math.floor(Math.random() * prev.length);
          const airport = prev[idx];
          const delta = mode === 'collapse' ? Math.floor(Math.random()*50)+5 : Math.floor(Math.random()*30)-10;
          const newOccupancy = Math.max(0, Math.min(airport.capacity, airport.occupancy + delta));
          const pct = newOccupancy / airport.capacity;
          const newStatus = pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warning' : 'normal';
          const previousPeak = airport.peakOccupancy ?? 0;
          const peakOccupancy = Math.max(previousPeak, newOccupancy);
          const updated = [...prev];
          updated[idx] = { ...airport, occupancy: newOccupancy, status: newStatus, peakOccupancy };
          return updated;
        });
      }
    }, 100);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, mode, hasReplanned, getSpeed, getTimeStep]);

  // ===== ACCIONES PRINCIPALES =====

  const start = useCallback(async () => {
    if (isBackendMode(mode)) {
      const isFiveDay = mode === '5day';
      const runDate = startDate;
      const startDateTimeStr = formatApiDateTime(runDate);
      const optimisticStart = parseApiDateTimeAsUtc(startDateTimeStr);

      setIsRunning(true);
      setSimulationComplete(false);
      setDaysElapsed(0);
      setDaySnapshots([]);
      setSimulationResults(null);
      setActiveFlights([]);
      setFlightPlanFlights([]);
      setLastCycleUpdate(null);
      setHasReplanned(false);
      setShipments([]);
      setFlights([]);
      setAirports([]);
      setSimClock(optimisticStart);
      setSimulationTime(optimisticStart);
      clockBaseRef.current = null;
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
        const flightPlanDays = isFiveDay ? 5 : 1;
        const airportsPromise = fetchAirports()
          .then(backendAirports => {
            setAirports(mapAirports(backendAirports));
            return backendAirports;
          });
        const flightPlanPromise = fetchFlightPlan(startDateTimeStr, flightPlanDays)
          .then(projectedFlights => {
            setFlightPlanFlights(projectedFlights);
            setFlights(mapFlightPlanFlights(projectedFlights));
            console.log(`✓ Cargados ${projectedFlights.length} vuelos del plan de vuelos`);
            return projectedFlights;
          })
          .catch(err => {
            console.warn('No se pudo cargar el plan de vuelos proyectado:', err);
            setFlightPlanFlights([]);
            setFlights([]);
            return [];
          });
        void flightPlanPromise;

        await airportsPromise;

        // 2. Iniciar simulación en el backend (retorna K, simStartTime, etc.)
        const res = isFiveDay
          ? await startSimulation('PERIOD_SIMULATION', startDateTimeStr)
          : await startDayToDaySimulation(startDateTimeStr);
        simIdRef.current = res.simulationId;

        // 3. Guardar K del backend y anclar el reloj
        const K = res.K ?? SIMULATION_K;
        simKRef.current = K;
        setSimulationK(K);
        const simStartMs = new Date(res.simStartTime).getTime();
        clockBaseRef.current = { simMs: simStartMs, realMs: Date.now(), K };
        setSimClock(new Date(simStartMs));
        setSimulationTime(new Date(simStartMs));

        // 4. Abrir WebSocket
        const ws = new SimulationWebSocket();
        wsRef.current = ws;
        ws.onMessage(handle5DayWsMessage);
        ws.connect();

        setEvents(prev => [{
          id: `start-${Date.now()}`,
          type: 'info',
          message: isFiveDay
            ? `Simulación iniciada — K=${K}× — Sa=${res.Sa ?? '?'} min — Sc=${res.Sc ? `${Math.round(res.Sc / 60)} h` : '?'} — Duración: ${res.totalRealMinutes?.toFixed(0) ?? '?'} min reales`
            : `Operación día a día iniciada — ${startDateTimeStr} — K=${K}×`,
          time: new Date(),
          severity: 'info',
        }, ...prev.slice(0, 19)]);

        getSimulationStatus(res.simulationId)
          .then(status => {
            if (status.simulatedTime) {
              setSimulationTime(new Date(status.simulatedTime));
            }
          })
          .catch(err => console.warn('No se pudo cargar estado inicial:', err));

      } catch (err) {
        console.error('Error iniciando simulación:', err);
        setIsRunning(false);
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
    } else {
      // Modo collapse — lógica local original
      setIsRunning(true);
    }
  }, [mode, startDate, handle5DayWsMessage, resetPlaybackBuffer, cancelScheduledSolutionRefresh]);

  const pause = useCallback(async () => {
    if (isBackendMode(mode) && simIdRef.current) {
      await pauseSimulation(simIdRef.current).catch(console.warn);
      setSimulationTime(simClock);
      clockBaseRef.current = null;
      cancelScheduledSolutionRefresh();
      resetPlaybackBuffer();
    }
    setIsRunning(false);
  }, [mode, simClock, resetPlaybackBuffer, cancelScheduledSolutionRefresh]);

  const resume = useCallback(async () => {
    if (isBackendMode(mode) && simIdRef.current) {
      await resumeSimulation(simIdRef.current).catch(console.warn);
      clockBaseRef.current = { simMs: simClock.getTime(), realMs: Date.now(), K: simKRef.current };
    }
    setIsRunning(true);
  }, [mode, simClock]);

  const reset = useCallback(async () => {
    if (isBackendMode(mode) && simIdRef.current) {
      await stopSimulation(simIdRef.current).catch(console.warn);
      wsRef.current?.disconnect();
      simIdRef.current = null;
      wsRef.current = null;
    }

    const now = new Date();
    now.setHours(8, 0, 0, 0);
    setIsRunning(false);
    setShipments(mode === 'collapse' ? INITIAL_SHIPMENTS : []);
    setFlights(mode === 'collapse' ? INITIAL_FLIGHTS : []);
    setActiveFlights([]);
    setFlightPlanFlights([]);
    clockBaseRef.current = null;
    cancelScheduledSolutionRefresh();
    resetPlaybackBuffer();
    setSimulationK(SIMULATION_K);
    if (mode === 'collapse') {
      setAirports(INITIAL_AIRPORTS);
    } else {
      fetchAirports()
        .then(data => setAirports(mapAirports(data)))
        .catch(() => setAirports([]));
    }
    setStartDate(now);
    setSimulationTime(now);
    setSimClock(now);
    setHasReplanned(false);
    setDaySnapshots([]);
    setSimulationResults(null);
    setLastCycleUpdate(null);
    setSimulationComplete(false);
    setDaysElapsed(0);
    setCollapseComplete(false);
    setCollapseMetrics(null);
    lastDayRef.current = 0;
    tickCountRef.current = 0;
    collapseTickRef.current = 0;
    setEvents(buildInitEvents(now));
  }, [mode, resetPlaybackBuffer, cancelScheduledSolutionRefresh]);

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

  const skipToComplete = useCallback(() => {
    // Solo aplica para modos mock; en 5day real no hay skip
    if (mode !== '5day') {
      const endTime = new Date(startDate.getTime() + FIVE_DAYS_MS);
      setIsRunning(false);
      setSimulationTime(endTime);
      setDaysElapsed(5);
      setDaySnapshots(presets);
      setSimulationComplete(true);
      setHasReplanned(true);
      lastDayRef.current = 5;
    }
  }, [mode, startDate, presets]);

  const skipToCollapseComplete = useCallback(() => {
    setIsRunning(false);
    setCollapseComplete(true);
    collapseTickRef.current = 350;
    setAirports(ap => {
      const updated = ap.map((a, i) => {
        const occupancy = i < 6 ? Math.floor(a.capacity * 0.96) : i < 12 ? Math.floor(a.capacity * 0.85) : a.occupancy;
        const status = occupancy / a.capacity >= 0.9 ? 'critical' as const : occupancy / a.capacity >= 0.7 ? 'warning' as const : 'normal' as const;
        return {
          ...a,
          occupancy,
          status,
          peakOccupancy: Math.max(a.peakOccupancy ?? 0, occupancy)
        };
      });
      const criticalCount = updated.filter(a => a.status === 'critical').length;
      const peakAirport = updated.reduce((max, a) => (a.occupancy/a.capacity) > (max.occupancy/max.capacity) ? a : max, updated[0]);
      const peakPct = Math.round((peakAirport.occupancy/peakAirport.capacity)*100);
      setShipments(sp => {
        const updatedShipments = sp.map((s, i) => {
          if (i < 4)  return { ...s, progress:0.15, status:'critical' as const };
          if (i < 10) return { ...s, progress:0.4, status:'delayed' as const };
          if (i < 16) return { ...s, progress:0.7, status:'on-time' as const, isReplanned:true };
          return { ...s, progress:0.9, status:'on-time' as const };
        });
        const delayed = updatedShipments.filter(s => s.status === 'delayed').length;
        const lost    = updatedShipments.filter(s => s.status === 'critical').length;
        setCollapseMetrics({ timeToCollapse:'12 min', resilienceScore:58, affectedAirports:criticalCount, totalAirports:updated.length, shipmentsDelayed:delayed, shipmentsLost:lost, totalShipments:updatedShipments.length, peakCongestion:peakPct, peakAirport:peakAirport.id, recoveryTime:'9 min', replannedRoutes:12, cascadeEvents:24 });
        return updatedShipments;
      });
      return updated;
    });
  }, []);

  const refreshSolution = useCallback(async (time = simulationTime) => {
    const id = simIdRef.current;
    if (!id) return;

    const solution = await getSimulationSolution(id);
    const mapped = await mapSolutionToShipmentsCooperatively(solution, time);
    applyMappedShipments(mapped);
  }, [simulationTime, applyMappedShipments]);

  const addShipment = useCallback(async (data: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => {
    if (isBackendMode(mode)) {
      if (!simIdRef.current || !isRunning) {
        throw new Error('Inicia la operación día a día antes de registrar maletas');
      }

      const response = await createShipment(simIdRef.current, {
        clientId: data.airlineId || 'UI',
        originId: data.origin,
        destinationId: data.destination,
        quantity: data.luggageCount,
      });

      const shipment = mapShipmentResponseToShipment(response);
      setShipments(prev => [shipment, ...prev.filter(s => s.id !== shipment.id)]);
      setEvents(prev => [{
        id: `shipment-${response.batchId}`,
        type: 'info',
        message: `${response.quantity} maletas registradas ${response.originId}→${response.destinationId}`,
        time: new Date(),
        severity: 'info',
      }, ...prev.slice(0, 19)]);

      await refreshSolution(simClock).catch(err => console.warn('Solución aún no disponible para el nuevo lote:', err));
      return;
    }

    const found = INITIAL_FLIGHTS.find(f => f.from === data.origin && f.to === data.destination) || INITIAL_FLIGHTS[0];
    const now = new Date(simulationTime);
    now.setHours(now.getHours() + 8);
    const newShipment: Shipment = {
      ...data,
      id: `SHP${String(Math.floor(Math.random()*900)+100)}`,
      currentFlightId: found.id,
      progress: 0,
      isReplanned: false,
      estimatedDelivery: now.toISOString().slice(0,16).replace('T',' '),
    };
    setShipments(prev => [newShipment, ...prev]);
  }, [mode, isRunning, simClock, simulationTime, refreshSolution]);

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
    const result = await cancelFlightRequest(simIdRef.current, baseFlightId, day);
    setHasReplanned(true);
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
      refreshSolution(simClock),
    ]);
    if (status.simulatedTime) {
      setSimulationTime(new Date(status.simulatedTime));
    }
  }, [mode, isRunning, simClock, refreshSolution]);

  const uploadStaticData = useCallback(async (
    airportsFile: File,
    flightsFile: File,
    shipmentFiles: File[]
  ): Promise<BackendStaticDataUploadResponse> => {
    if (isRunning) {
      throw new Error('Deten la simulación antes de reemplazar datos estáticos');
    }

    const response = await uploadStaticDataset(airportsFile, flightsFile, shipmentFiles);
    const backendAirports = await fetchAirports();
    setAirports(mapAirports(backendAirports));
    setShipments([]);
    setActiveFlights([]);
    setDaySnapshots([]);
    setSimulationResults(null);
    setLastCycleUpdate(null);
    setSimulationComplete(false);
    setCollapseComplete(false);
    setCollapseMetrics(null);

    if (isBackendMode(mode)) {
      const planDate = mode === '5day' ? startDate : new Date();
      const days = mode === '5day' ? 5 : 1;
      const projectedFlights = await fetchFlightPlan(formatApiDateTime(planDate), days);
      setFlightPlanFlights(projectedFlights);
      setFlights(mapFlightPlanFlights(projectedFlights));
    }

    setEvents(prev => [{
      id: `static-data-${Date.now()}`,
      type: 'info',
      message: `Dataset actualizado — ${response.airportsLoaded} aeropuertos, ${response.flightsLoaded} vuelos, ${response.shipmentsLoaded} envíos`,
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);

    return response;
  }, [isRunning, mode, startDate]);

  return {
    startDate, setStartDate,
    airports, flights, shipments,
    isRunning, mode, simulationTime, events,
    hasReplanned, daySnapshots, simulationComplete, daysElapsed,
    collapseComplete, collapseMetrics, simulationResults,
    setMode, start, pause: pause as () => void, reset,
    replan, skipToComplete, skipToCollapseComplete, addShipment, cancelFlight, uploadStaticData,
    setAirports, setFlights, setShipments,
    simClock, activeFlights, flightPlanFlights,
    simulationK,
    lastCycleUpdate,
  };
}