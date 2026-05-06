import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import {
  Airport, Flight, Shipment, SimEvent, SimulationMode,
  INITIAL_AIRPORTS, INITIAL_FLIGHTS, INITIAL_SHIPMENTS,
  getOccupancyStatus,
} from '../data/mockData';

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
  addShipment: (shipment: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => void;
  setAirports: Dispatch<SetStateAction<Airport[]>>;
  setFlights: Dispatch<SetStateAction<Flight[]>>;
  setShipments: Dispatch<SetStateAction<Shipment[]>>;
}

const DISRUPTION_MESSAGES = [
  'Retraso reportado en manejo de equipaje',
  'Disrupción climática afectando ruta',
  'Escasez de personal de tierra detectada',
  'Inspección aduanera causando retrasos',
  'Problema técnico en punto de transferencia',
  'Falla en carrusel de equipaje',
  'Retraso de vuelo en cascada a envíos',
];

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function buildPresetSnapshots(startDate: Date): DaySnapshot[] {
  return [
    { day: 1, date: formatDate(startDate, 1), onTimePct: 80, delayed: 4, critical: 1, completed: 3, totalBags: 2840, newEvents: 5, avgOccupancy: 71, replanned: 0, keyEvent: 'Almacén DXB al 94% — alerta de congestión emitida', severity: 'warning' },
    { day: 2, date: formatDate(startDate, 2), onTimePct: 68, delayed: 7, critical: 3, completed: 6, totalBags: 3120, newEvents: 11, avgOccupancy: 79, replanned: 0, keyEvent: 'Disrupción climática: BA297 y LH456 retrasados 4h en Atlántico Norte', severity: 'warning' },
    { day: 3, date: formatDate(startDate, 3), onTimePct: 54, delayed: 8, critical: 5, completed: 8, totalBags: 3450, newEvents: 18, avgOccupancy: 87, replanned: 3, keyEvent: 'CRÍTICO: Suspensión parcial del hub DXB — redireccionamiento de emergencia activado', severity: 'critical' },
    { day: 4, date: formatDate(startDate, 4), onTimePct: 71, delayed: 5, critical: 2, completed: 14, totalBags: 3890, newEvents: 9, avgOccupancy: 76, replanned: 9, keyEvent: 'Replanificación completa — 12 envíos redirigidos vía AMS y DOH', severity: 'normal' },
    { day: 5, date: formatDate(startDate, 5), onTimePct: 83, delayed: 3, critical: 1, completed: 20, totalBags: 4280, newEvents: 4, avgOccupancy: 67, replanned: 12, keyEvent: 'Operaciones normalizadas — tasa de puntualidad recuperada al 83%', severity: 'normal' },
  ];
}

function formatDate(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]}`;
}

function buildInitEvents(startDate: Date): SimEvent[] {
  const h = (offsetMin: number) => new Date(startDate.getTime() + offsetMin * 60000);
  return [
    { id: 'init1', type: 'alert', message: 'Almacén DXB acercándose a capacidad crítica (93%)', time: h(-15), severity: 'critical' },
    { id: 'init2', type: 'delay', message: 'EK203 LHR→DXB: Riesgo de sobrecarga de equipaje — 395/400 capacidad', time: h(-10), severity: 'critical' },
    { id: 'init3', type: 'info', message: 'Sistema inicializado — 20 envíos activos rastreados', time: h(0), severity: 'info' },
  ];
}

export function useSimulation(): UseSimulationReturn {
  const today = new Date();
  today.setHours(8, 0, 0, 0);
  const [startDate, setStartDate] = useState<Date>(today);
  const [airports, setAirports] = useState<Airport[]>(INITIAL_AIRPORTS);
  const [flights, setFlights] = useState<Flight[]>(INITIAL_FLIGHTS);
  const [shipments, setShipments] = useState<Shipment[]>(INITIAL_SHIPMENTS);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<SimulationMode>('realtime');
  const [simulationTime, setSimulationTime] = useState<Date>(today);
  const [events, setEvents] = useState<SimEvent[]>(() => buildInitEvents(today));
  const [hasReplanned, setHasReplanned] = useState(false);
  const [daySnapshots, setDaySnapshots] = useState<DaySnapshot[]>([]);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [collapseComplete, setCollapseComplete] = useState(false);
  const [collapseMetrics, setCollapseMetrics] = useState<CollapseMetrics | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickCountRef = useRef(0);
  const lastDayRef = useRef(0);
  const collapseTickRef = useRef(0);

  // Sync simulationTime and events when startDate changes
  useEffect(() => {
    setSimulationTime(new Date(startDate));
    setEvents(buildInitEvents(startDate));
  }, [startDate]);

  const simStartMs = startDate.getTime();
  const presets = buildPresetSnapshots(startDate);

  const getSpeed = useCallback((): number => {
    switch (mode) {
      case 'realtime': return 0.0006;
      case '5day': return 0.002;
      case 'collapse': return 0.006;
      default: return 0.0006;
    }
  }, [mode]);

  const getTimeStep = useCallback((): number => {
    switch (mode) {
      case 'realtime': return 60000;
      case '5day': return 300000;
      case 'collapse': return 900000;
      default: return 60000;
    }
  }, [mode]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      tickCountRef.current += 1;
      const speed = getSpeed();
      const timeStep = getTimeStep();

      setSimulationTime(prev => {
        const next = new Date(prev.getTime() + timeStep);

        // 5-day completion detection
        if (mode === '5day') {
          const elapsed = next.getTime() - simStartMs;
          const days = elapsed / (24 * 60 * 60 * 1000);
          setDaysElapsed(Math.min(days, 5));

          const dayInt = Math.floor(days);
          if (dayInt > lastDayRef.current && dayInt <= 5) {
            const snapshotIdx = dayInt - 1;
            if (snapshotIdx >= 0 && snapshotIdx < presets.length) {
              setDaySnapshots(prev => {
                const exists = prev.find(s => s.day === dayInt);
                if (exists) return prev;
                return [...prev, presets[snapshotIdx]];
              });
            }
            lastDayRef.current = dayInt;
          }

          if (elapsed >= FIVE_DAYS_MS) {
            const endTime = new Date(simStartMs + FIVE_DAYS_MS);
            setSimulationComplete(true);
            setIsRunning(false);
            setDaySnapshots(presets);
            return endTime;
          }
        }

        // Collapse mode: progressive degradation
        if (mode === 'collapse') {
          collapseTickRef.current += 1;
          const collapseDuration = 200;
          const recoveryDuration = 150;
          const totalDuration = collapseDuration + recoveryDuration;

          if (collapseTickRef.current >= totalDuration) {
            setCollapseComplete(true);
            setIsRunning(false);

            setAirports(ap => {
              const criticalCount = ap.filter(a => a.status === 'critical').length;
              const peakAirport = ap.reduce((max, a) => {
                const pct = a.occupancy / a.capacity;
                return pct > (max.occupancy / max.capacity) ? a : max;
              }, ap[0]);
              const peakPct = Math.round((peakAirport.occupancy / peakAirport.capacity) * 100);

              setShipments(sp => {
                const delayed = sp.filter(s => s.status === 'delayed').length;
                const lost = sp.filter(s => s.progress < 0.3 && s.status === 'critical').length;
                const resilienceScore = Math.round(
                  ((sp.filter(s => s.status === 'on-time').length / sp.length) * 50) +
                  (((ap.length - criticalCount) / ap.length) * 30) +
                  (hasReplanned ? 20 : 5)
                );

                setCollapseMetrics({
                  timeToCollapse: `${Math.round(collapseDuration * (timeStep / 100) / 60)} min`,
                  resilienceScore,
                  affectedAirports: criticalCount,
                  totalAirports: ap.length,
                  shipmentsDelayed: delayed,
                  shipmentsLost: lost,
                  totalShipments: sp.length,
                  peakCongestion: peakPct,
                  peakAirport: peakAirport.id,
                  recoveryTime: `${Math.round(recoveryDuration * (timeStep / 100) / 60)} min`,
                  replannedRoutes: hasReplanned ? Math.floor(sp.length * 0.6) : 0,
                  cascadeEvents: Math.floor(criticalCount * 3 + delayed * 1.5),
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
          setEvents(prev => [{
            id: `ev-${Date.now()}-${Math.random()}`,
            type: 'delay',
            message: `${s.airline} ${s.origin}→${s.destination}: ${msg}`,
            time: new Date(),
            severity: 'warning',
          }, ...prev.slice(0, 19)]);
        }

        if (!hasReplanned && Math.random() < 0.0002 && s.status !== 'critical') {
          newStatus = 'critical';
          setEvents(prev => [{
            id: `ev-${Date.now()}-${Math.random()}`,
            type: 'alert',
            message: `CRÍTICO: envío ${s.id} de ${s.airline} requiere intervención inmediata`,
            time: new Date(),
            severity: 'critical',
          }, ...prev.slice(0, 19)]);
        }

        return { ...s, progress: newProgress, status: newStatus };
      }));

      if (tickCountRef.current % 50 === 0 && Math.random() < 0.3) {
        setAirports(prev => {
          const idx = Math.floor(Math.random() * prev.length);
          const airport = prev[idx];
          // Collapse mode: aggressive congestion
          const delta = mode === 'collapse'
            ? Math.floor(Math.random() * 50) + 5
            : Math.floor(Math.random() * 30) - 10;
          const newOccupancy = Math.max(0, Math.min(airport.capacity, airport.occupancy + delta));
          const pct = newOccupancy / airport.capacity;
          const newStatus = pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warning' : 'normal';
          if (pct >= 0.9 && airport.status !== 'critical') {
            setEvents(prev => [{
              id: `ev-${Date.now()}-${Math.random()}`,
              type: 'congestion',
              message: `Almacén ${airport.id} al ${Math.round(pct * 100)}% de capacidad — alerta de congestión`,
              time: new Date(),
              severity: 'critical',
            }, ...prev.slice(0, 19)]);
          }
          const updated = [...prev];
          updated[idx] = { ...airport, occupancy: newOccupancy, status: newStatus };
          return updated;
        });
      }

      if (tickCountRef.current % 30 === 0) {
        setFlights(prev => prev.map(f => {
          const delta = Math.floor(Math.random() * 20) - 8;
          const newLoad = Math.max(0, Math.min(f.capacity, f.load + delta));
          const pct = newLoad / f.capacity;
          const newStatus: Flight['status'] = pct >= 0.95 ? 'critical' : pct >= 0.8 ? 'warning' : 'normal';
          return { ...f, load: newLoad, status: newStatus };
        }));
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, mode, hasReplanned, getSpeed, getTimeStep]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    setIsRunning(false);
    setShipments(INITIAL_SHIPMENTS);
    setFlights(INITIAL_FLIGHTS);
    setAirports(INITIAL_AIRPORTS);
    setStartDate(now);
    setSimulationTime(now);
    setHasReplanned(false);
    setDaySnapshots([]);
    setSimulationComplete(false);
    setDaysElapsed(0);
    setCollapseComplete(false);
    setCollapseMetrics(null);
    lastDayRef.current = 0;
    tickCountRef.current = 0;
    collapseTickRef.current = 0;
    setEvents(buildInitEvents(now));
  }, []);

  const replan = useCallback(() => {
    setHasReplanned(true);
    setShipments(prev => prev.map(s =>
      s.status !== 'on-time'
        ? { ...s, isReplanned: true, status: 'on-time' as const }
        : s
    ));
    setFlights(prev => prev.map(f =>
      f.status !== 'normal'
        ? { ...f, isReplanned: true, status: 'normal' as const, load: Math.floor(f.load * 0.82) }
        : f
    ));
    setAirports(prev => prev.map(a => {
      if (a.status === 'critical') {
        const newOcc = Math.floor(a.occupancy * 0.85);
        return { ...a, occupancy: newOcc, status: getOccupancyStatus(Math.round(newOcc / a.capacity * 100)) };
      }
      return a;
    }));
    setEvents(prev => [{
      id: `replan-${Date.now()}`,
      type: 'replan',
      message: 'Replanificación de rutas completa — todos los envíos afectados redirigidos por rutas alternativas',
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);
  }, []);

  const skipToComplete = useCallback(() => {
    const endTime = new Date(startDate.getTime() + FIVE_DAYS_MS);
    setIsRunning(false);
    setSimulationTime(endTime);
    setDaysElapsed(5);
    setDaySnapshots(presets);
    setSimulationComplete(true);
    setHasReplanned(true);
    lastDayRef.current = 5;
    setShipments(INITIAL_SHIPMENTS.map((s, i) => ({
      ...s,
      progress: 1,
      status: (i < 17 ? 'on-time' : i < 19 ? 'delayed' : 'critical') as Shipment['status'],
      isReplanned: i >= 7 && i < 15,
    })));
    setFlights(prev => prev.map(f => ({ ...f, status: 'normal' as const, isReplanned: false })));
    setEvents(prev => [{
      id: `complete-${Date.now()}`,
      type: 'info',
      message: 'Simulación de 5 días completada — los 20 envíos procesados. Generando reporte…',
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);
  }, []);

  const skipToCollapseComplete = useCallback(() => {
    setIsRunning(false);
    setCollapseComplete(true);
    collapseTickRef.current = 350;

    setAirports(ap => {
      const updated = ap.map((a, i) => {
        if (i < 6) return { ...a, occupancy: Math.floor(a.capacity * 0.96), status: 'critical' as const };
        if (i < 12) return { ...a, occupancy: Math.floor(a.capacity * 0.85), status: 'warning' as const };
        return a;
      });

      const criticalCount = updated.filter(a => a.status === 'critical').length;
      const peakAirport = updated.reduce((max, a) => {
        const pct = a.occupancy / a.capacity;
        return pct > (max.occupancy / max.capacity) ? a : max;
      }, updated[0]);
      const peakPct = Math.round((peakAirport.occupancy / peakAirport.capacity) * 100);

      setShipments(sp => {
        const updatedShipments = sp.map((s, i) => {
          if (i < 4) return { ...s, progress: 0.15, status: 'critical' as const };
          if (i < 10) return { ...s, progress: 0.4, status: 'delayed' as const };
          if (i < 16) return { ...s, progress: 0.7, status: 'on-time' as const, isReplanned: true };
          return { ...s, progress: 0.9, status: 'on-time' as const };
        });

        const delayed = updatedShipments.filter(s => s.status === 'delayed').length;
        const lost = updatedShipments.filter(s => s.status === 'critical').length;
        const resilienceScore = 58;

        setCollapseMetrics({
          timeToCollapse: '12 min',
          resilienceScore,
          affectedAirports: criticalCount,
          totalAirports: updated.length,
          shipmentsDelayed: delayed,
          shipmentsLost: lost,
          totalShipments: updatedShipments.length,
          peakCongestion: peakPct,
          peakAirport: peakAirport.id,
          recoveryTime: '9 min',
          replannedRoutes: 12,
          cascadeEvents: 24,
        });

        return updatedShipments;
      });

      return updated;
    });

    setFlights(prev => prev.map((f, i) => {
      if (i < 5) return { ...f, load: Math.floor(f.capacity * 0.98), status: 'critical' as const };
      if (i < 12) return { ...f, load: Math.floor(f.capacity * 0.9), status: 'warning' as const, isReplanned: true };
      return f;
    }));

    setEvents(prev => [{
      id: `collapse-${Date.now()}`,
      type: 'alert',
      message: 'Escenario de colapso completado — 6 aeropuertos en estado crítico, 12 rutas replanificadas',
      time: new Date(),
      severity: 'critical',
    }, ...prev.slice(0, 19)]);
  }, []);

  const addShipment = useCallback((data: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => {
    const found = INITIAL_FLIGHTS.find(f => f.from === data.origin && f.to === data.destination) ||
      INITIAL_FLIGHTS.find(f => f.from === data.origin) ||
      INITIAL_FLIGHTS[0];
    const now = new Date(simulationTime);
    now.setHours(now.getHours() + 8);
    const newShipment: Shipment = {
      ...data,
      id: `SHP${String(Math.floor(Math.random() * 900) + 100)}`,
      currentFlightId: found.id,
      progress: 0,
      isReplanned: false,
      estimatedDelivery: now.toISOString().slice(0, 16).replace('T', ' '),
    };
    setShipments(prev => [newShipment, ...prev]);
    setEvents(prev => [{
      id: `add-${Date.now()}`,
      type: 'info',
      message: `Nuevo envío registrado: ${data.airline} — ${data.luggageCount} bolsas ${data.origin}→${data.destination}`,
      time: new Date(),
      severity: 'info',
    }, ...prev.slice(0, 19)]);
  }, [simulationTime]);

  return {
    startDate,
    setStartDate,
    airports,
    flights,
    shipments,
    isRunning,
    mode,
    simulationTime,
    events,
    hasReplanned,
    daySnapshots,
    simulationComplete,
    daysElapsed,
    collapseComplete,
    collapseMetrics,
    setMode,
    start,
    pause,
    reset,
    replan,
    skipToComplete,
    skipToCollapseComplete,
    addShipment,
    setAirports,
    setFlights,
    setShipments,
  };
}