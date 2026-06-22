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
  /** ISO-8601 delivery instant from backend route (ENV-03). */
  finalArrivalTime?: string | null;
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

export function getOccupancyStatus(percent: number): AirportStatus {
  if (percent >= 90) return 'critical';
  if (percent >= 70) return 'warning';
  return 'normal';
}
