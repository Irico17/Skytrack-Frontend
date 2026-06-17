import type {
  BackendActiveFlight,
  BackendAirport,
  BackendCycleUpdate,
  BackendFlightPlanFlight,
  BackendSimulationResults,
  BackendShipmentResponse,
  BackendSolution,
} from '../types/backend';
import type { Airport, Flight, Shipment } from '../data/mockData';
import type { DaySnapshot } from '../hooks/useSimulation';

// ==================== AIRPORT ====================

/**
 * Convierte un aeropuerto del backend al tipo Airport del frontend.
 * Coordenadas: el frontend usa [longitude, latitude] (formato GeoJSON/react-simple-maps).
 */
export function mapAirport(b: BackendAirport): Airport {
  return {
    id: b.id,
    name: `${b.city} (${b.id})`,
    city: b.city,
    country: b.country,
    coords: [b.longitude, b.latitude],   // [lon, lat] — formato del mapa
    capacity: b.storageCapacity,
    occupancy: 0,
    status: 'normal',
  };
}

export function mapAirports(airports: BackendAirport[]): Airport[] {
  return airports.map(mapAirport);
}

// ==================== SEMAPHORE COLORS ====================

/** Convierte un color de semáforo del backend a clase CSS / color del frontend */
export function mapSemaphoreColor(backendColor: string): string {
  switch (backendColor) {
    case 'GREEN':  return '#00FF9C';
    case 'AMBER':  return '#FFC857';
    case 'RED':    return '#FF4D4D';
    default:       return '#4A6080'; // gris para UNKNOWN
  }
}

/** Convierte estado del semáforo a AirportStatus del frontend */
export function mapSemaphoreToStatus(backendColor: string): 'normal' | 'warning' | 'critical' {
  switch (backendColor) {
    case 'GREEN':  return 'normal';
    case 'AMBER':  return 'warning';
    case 'RED':    return 'critical';
    default:       return 'normal';
  }
}

// ==================== DAY SNAPSHOTS ====================

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2,'0')} ${MONTHS_ES[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

/**
 * Convierte los daySnapshots del backend (del archivo JSON de resultados)
 * al formato DaySnapshot del frontend para mostrar en FiveDayResults.
 */
export function mapDaySnapshots(results: BackendSimulationResults): DaySnapshot[] {
  return results.daySnapshots.map(s => ({
    day: s.day,
    date: formatDate(s.date),
    onTimePct: s.routesCompleted > 0
      ? Math.round((s.batchesOnTime / s.routesCompleted) * 100)
      : 0,
    delayed:   s.batchesDelayed,
    critical:  s.batchesCritical,
    completed: s.routesCompleted,
    totalBags: s.totalBags ?? 0,
    newEvents: 0,
    avgOccupancy: 0,
    replanned: 0,
    keyEvent: `SLA: ${results.slaCompliancePercent.toFixed(1)}% — Fitness: ${results.fitness.toFixed(2)}`,
    severity: s.collapseLevel === 'CRITICAL' ? 'critical'
            : s.collapseLevel === 'WARNING'  ? 'warning'
            : 'normal',
  }));
}

/**
 * Construye un DaySnapshot incremental desde una actualización de ciclo WebSocket.
 * Usado para actualizar el progreso durante la simulación en vivo.
 */
export function buildCycleDaySnapshot(
  update: BackendCycleUpdate,
  startDate: Date
): DaySnapshot | null {
  const day = Math.ceil(update.daysElapsed);
  if (day < 1 || day > 5) return null;

  const d = new Date(startDate);
  d.setDate(d.getDate() + day);

  const total = update.batchSummary.onTime + update.batchSummary.delayed;
  const onTimePct = total > 0
    ? Math.round((update.batchSummary.onTime / total) * 100)
    : 0;

  return {
    day,
    date: `${String(d.getDate()).padStart(2,'0')} ${MONTHS_ES[d.getMonth()]}`,
    onTimePct,
    delayed:   update.batchSummary.delayed,
    critical:  0,
    completed: update.totalRoutes,
    totalBags: update.totalBags,
    newEvents: 0,
    avgOccupancy: Math.round(update.semaphores.storageOccupancy * 100),
    replanned: 0,
    keyEvent:  `Ciclo ${update.cycle} — Fitness: ${update.fitness.toFixed(2)}`,
    severity:  update.semaphores.storage === 'RED' ? 'critical'
             : update.semaphores.storage === 'AMBER' ? 'warning'
             : 'normal',
  };
}

// ==================== FLIGHTS / SOLUTION ====================

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDelivery(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-ES', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}

export function mapFlightPlanFlights(flights: BackendFlightPlanFlight[]): Flight[] {
  return flights.map(f => ({
    id: f.flightId,
    flightNumber: f.flightId,
    from: f.originId,
    to: f.destinationId,
    airlineId: 'PLAN',
    airline: 'Plan de vuelos',
    capacity: f.capacity,
    load: 0,
    status: 'normal',
    departureTime: formatClock(f.departureTime),
    arrivalTime: formatClock(f.arrivalTime),
    isReplanned: false,
  }));
}

export function mergeActiveFlightLoads(flights: Flight[], activeFlights: BackendActiveFlight[]): Flight[] {
  if (!activeFlights || activeFlights.length === 0) return flights;

  const bagsByFlight = new Map(activeFlights.map(f => [f.flightId, f]));
  return flights.map(f => {
    const active = bagsByFlight.get(f.id);
    if (!active) return f;
    const load = active.bagsCount;
    const occupancy = f.capacity > 0 ? load / f.capacity : 0;
    return {
      ...f,
      load,
      status: occupancy >= 0.9 ? 'critical' : occupancy >= 0.7 ? 'warning' : 'normal',
    };
  });
}

export function mapSolutionToShipments(solution: BackendSolution, simulatedTime: Date): Shipment[] {
  const now = simulatedTime.getTime();

  return solution.routes.map(route => {
    const orderedFlights = route.flights
      .map(f => ({
        ...f,
        depMs: new Date(f.departureTime).getTime(),
        arrMs: new Date(f.arrivalTime).getTime(),
      }))
      .sort((a, b) => a.depMs - b.depMs);
    const finalArrival = route.finalArrivalTime;
    const startMs = orderedFlights[0]?.depMs ?? now;
    const endMs = new Date(finalArrival).getTime();
    const progress = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? clamp((now - startMs) / (endMs - startMs))
      : 0;
    const activeFlight = orderedFlights.find(f => now >= f.depMs && now <= f.arrMs)
      ?? orderedFlights.find(f => f.arrMs >= now)
      ?? orderedFlights[orderedFlights.length - 1];

    return {
      id: route.batchId,
      airlineId: route.clientId || 'UI',
      airline: route.clientId || 'Cliente',
      origin: route.originId,
      destination: route.destinationId,
      currentFlightId: activeFlight?.flightId ?? 'PENDING',
      luggageCount: route.quantity,
      status: route.meetsSLA ? 'on-time' : 'delayed',
      progress,
      estimatedDelivery: formatDelivery(finalArrival),
      isReplanned: false,
    };
  });
}

export function mapShipmentResponseToShipment(shipment: BackendShipmentResponse): Shipment {
  return {
    id: shipment.batchId,
    airlineId: shipment.clientId || 'UI',
    airline: shipment.clientId || 'Cliente',
    origin: shipment.originId,
    destination: shipment.destinationId,
    currentFlightId: 'PENDING',
    luggageCount: shipment.quantity,
    status: 'on-time',
    progress: 0,
    estimatedDelivery: formatDelivery(shipment.deadline),
    isReplanned: false,
  };
}
