import type { BackendAirport, BackendCycleUpdate, BackendSimulationResults } from '../types/backend';
import type { Airport, Shipment } from '../data/mockData';
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
    occupancy: Math.round(b.storageCapacity * 0.5), // valor inicial neutral 50%
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
    onTimePct: results.totalBatches > 0
      ? Math.round((s.batchesOnTime / results.totalBatches) * 100)
      : 0,
    delayed:   s.batchesDelayed,
    critical:  s.batchesCritical,
    completed: s.routesCompleted,
    totalBags: 0,  // no tenemos este dato por día en el resumen
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

  const total = update.batchesProcessed + update.batchSummary.unrouted;
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
