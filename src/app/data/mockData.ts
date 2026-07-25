// ===================== TYPES =====================

export type AirportStatus = 'normal' | 'warning' | 'critical';
export type ShipmentStatus = 'on-time' | 'delayed' | 'critical';
export type FlightStatus = 'normal' | 'warning' | 'critical';
export type SimulationMode = 'realtime' | '5day' | 'collapse';
export type EventType = 'delay' | 'congestion' | 'replan' | 'info' | 'alert';

export interface Airport {
  id: string;
  name: string;
  city: string;
  country: string;
  continent?: string;          // "AMERICA", "EUROPE", "ASIA", etc. (del backend)
  coords: [number, number]; // [longitude, latitude]
  capacity: number;
  occupancy: number;
  status: AirportStatus;
  peakOccupancy?: number;
  daysOverloaded?: number;
  overloadedDaysList?: number[];
}

export interface Flight {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  airlineId: string;
  airline: string;
  capacity: number;
  load: number;
  status: FlightStatus;
  departureTime: string;
  arrivalTime: string;
  isReplanned: boolean;
}

export interface Shipment {
  id: string;
  airlineId: string;
  airline: string;
  origin: string;
  destination: string;
  currentFlightId: string;
  luggageCount: number;
  status: ShipmentStatus;
  progress: number;
  estimatedDelivery: string;
  /** ISO-8601 de aterrizaje del último vuelo (ENV-03). NO es la entrega al cliente —
   *  usar {@link deliveredTime} para eso; este campo solo sirve para animar el tramo final. */
  finalArrivalTime?: string | null;
  /** ISO-8601 del instante real de entrega al cliente (aterrizaje + ventana de recojo). */
  deliveredTime?: string | null;
  /** ISO-8601 de la PRIMERA salida del viaje. Permite interpolar el progreso en vivo
   *  en el panel (misma fórmula que el backend) sin recargar la solución. */
  journeyStartTime?: string | null;
  /** Itinerario compacto (tramos, tiempos en ms) para DERIVAR el estado/posición en vivo
   *  en el panel (en vuelo / transferencia / en origen / entregado) sin recargar la solución
   *  ni esperar al siguiente ciclo. Se calcula una vez al mapear; el render solo lo lee. */
  legs?: { id: string; from: string; to: string; dep: number; arr: number }[];
  deliveredAt?: string | null;
  isReplanned: boolean;
}

export interface Airline {
  id: string;
  name: string;
  code: string;
}

export interface SimEvent {
  id: string;
  type: EventType;
  message: string;
  time: Date;
  severity: 'info' | 'warning' | 'critical';
}

// ===================== CONSTANTS =====================

export const STATUS_COLORS = {
  normal: '#00FF9C',
  warning: '#FFC857',
  critical: '#FF4D4D',
  'on-time': '#00FF9C',
  delayed: '#FFC857',
} as const;

export const ROUTE_COLORS = {
  normal: '#4DA6FF',
  warning: '#FFC857',
  critical: '#FF4D4D',
  replanned: '#A855F7',
} as const;

// ===================== AIRLINES =====================

export const AIRLINES: Airline[] = [
  { id: 'BA', name: 'British Airways', code: 'BA' },
  { id: 'EK', name: 'Emirates', code: 'EK' },
  { id: 'LH', name: 'Lufthansa', code: 'LH' },
  { id: 'SQ', name: 'Singapore Airlines', code: 'SQ' },
  { id: 'AA', name: 'American Airlines', code: 'AA' },
  { id: 'AF', name: 'Air France', code: 'AF' },
  { id: 'CX', name: 'Cathay Pacific', code: 'CX' },
  { id: 'QR', name: 'Qatar Airways', code: 'QR' },
];

// ===================== HELPER FUNCTIONS =====================

export function getStatusColor(status: AirportStatus | ShipmentStatus | FlightStatus): string {
  switch (status) {
    case 'critical': return '#FF4D4D';
    case 'warning':
    case 'delayed': return '#FFC857';
    case 'normal':
    case 'on-time': return '#00FF9C';
    default: return '#00FF9C';
  }
}

export function getRouteColor(status: FlightStatus, isReplanned: boolean): string {
  if (isReplanned) return '#A855F7';
  switch (status) {
    case 'critical': return '#FF4D4D';
    case 'warning': return '#FFC857';
    default: return '#4DA6FF';
  }
}

export function interpolateCoords(
  from: [number, number],
  to: [number, number],
  t: number
): [number, number] {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

export function getOccupancyPercent(occupancy: number, capacity: number): number {
  return Math.round((occupancy / capacity) * 100);
}

/**
 * Umbrales del semáforo de ocupación (almacenes y UT). ÚNICA fuente de verdad.
 *
 * Antes convivían dos escalas: `getOccupancyStatus` pintaba crítico a partir de 80%
 * y advertencia a partir de 50%, mientras que el mapeo del backend (`mapper.ts`),
 * el mapa, los filtros y la barra superior usaban 90/70. Resultado: en la pestaña
 * Almacén la barra de un aeropuerto al 82% salía roja en la gráfica y verde en la
 * lista de abajo, con el mismo dato. Se deja 90/70 (el criterio del backend) en un
 * solo sitio para que no se vuelva a desincronizar.
 */
export const OCCUPANCY_CRITICAL_PCT = 90;
export const OCCUPANCY_WARNING_PCT = 70;

export function getOccupancyStatus(percent: number): AirportStatus {
  if (percent >= OCCUPANCY_CRITICAL_PCT) return 'critical';
  if (percent >= OCCUPANCY_WARNING_PCT) return 'warning';
  return 'normal';
}

/** Color del semáforo de ocupación. `empty` se pinta gris para distinguir 0% de "carga baja". */
export function occupancyColor(percent: number, empty = false): string {
  if (empty) return '#4A6080';
  return getStatusColor(getOccupancyStatus(percent));
}
