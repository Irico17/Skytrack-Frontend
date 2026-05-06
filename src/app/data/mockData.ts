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
  coords: [number, number]; // [longitude, latitude]
  capacity: number;
  occupancy: number;
  status: AirportStatus;
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

// ===================== AIRPORTS =====================

export const INITIAL_AIRPORTS: Airport[] = [
  { id: 'JFK', name: 'Aeropuerto Internacional John F. Kennedy', city: 'Nueva York', country: 'EE.UU.', coords: [-73.78, 40.64], capacity: 750, occupancy: 580, status: 'warning' },
  { id: 'LAX', name: 'Aeropuerto Internacional de Los Ángeles', city: 'Los Ángeles', country: 'EE.UU.', coords: [-118.41, 33.94], capacity: 700, occupancy: 420, status: 'normal' },
  { id: 'LHR', name: 'Aeropuerto de Heathrow', city: 'Londres', country: 'Reino Unido', coords: [-0.46, 51.48], capacity: 800, occupancy: 695, status: 'warning' },
  { id: 'CDG', name: 'Aeropuerto Charles de Gaulle', city: 'París', country: 'Francia', coords: [2.55, 49.01], capacity: 720, occupancy: 510, status: 'normal' },
  { id: 'FRA', name: 'Aeropuerto de Fráncfort', city: 'Fráncfort', country: 'Alemania', coords: [8.57, 50.03], capacity: 680, occupancy: 380, status: 'normal' },
  { id: 'DXB', name: 'Aeropuerto Internacional de Dubái', city: 'Dubái', country: 'EAU', coords: [55.36, 25.25], capacity: 800, occupancy: 748, status: 'critical' },
  { id: 'SIN', name: 'Aeropuerto de Changi', city: 'Singapur', country: 'Singapur', coords: [103.99, 1.36], capacity: 650, occupancy: 430, status: 'normal' },
  { id: 'HKG', name: 'Aeropuerto Internacional de Hong Kong', city: 'Hong Kong', country: 'China', coords: [113.92, 22.31], capacity: 700, occupancy: 560, status: 'normal' },
  { id: 'NRT', name: 'Aeropuerto Internacional de Narita', city: 'Tokio', country: 'Japón', coords: [140.39, 35.76], capacity: 720, occupancy: 490, status: 'normal' },
  { id: 'SYD', name: 'Aeropuerto de Sídney', city: 'Sídney', country: 'Australia', coords: [151.18, -33.95], capacity: 600, occupancy: 315, status: 'normal' },
  { id: 'GRU', name: 'Aeropuerto Internacional de Guarulhos', city: 'São Paulo', country: 'Brasil', coords: [-46.47, -23.43], capacity: 580, occupancy: 420, status: 'normal' },
  { id: 'ORD', name: 'Aeropuerto Internacional O\'Hare', city: 'Chicago', country: 'EE.UU.', coords: [-87.91, 41.98], capacity: 750, occupancy: 550, status: 'normal' },
  { id: 'MIA', name: 'Aeropuerto Internacional de Miami', city: 'Miami', country: 'EE.UU.', coords: [-80.29, 25.80], capacity: 620, occupancy: 385, status: 'normal' },
  { id: 'AMS', name: 'Aeropuerto Schiphol', city: 'Ámsterdam', country: 'Países Bajos', coords: [4.76, 52.31], capacity: 700, occupancy: 598, status: 'warning' },
  { id: 'MEX', name: 'Aeropuerto Internacional Benito Juárez', city: 'Ciudad de México', country: 'México', coords: [-99.07, 19.44], capacity: 580, occupancy: 360, status: 'normal' },
  { id: 'PEK', name: 'Aeropuerto Internacional de Pekín', city: 'Pekín', country: 'China', coords: [116.60, 40.08], capacity: 780, occupancy: 640, status: 'warning' },
  { id: 'ICN', name: 'Aeropuerto Internacional de Incheon', city: 'Seúl', country: 'Corea del Sur', coords: [126.45, 37.46], capacity: 700, occupancy: 520, status: 'normal' },
  { id: 'BOM', name: 'Aeropuerto Internacional Chhatrapati Shivaji', city: 'Mumbai', country: 'India', coords: [72.87, 19.09], capacity: 650, occupancy: 480, status: 'normal' },
  { id: 'JNB', name: 'Aeropuerto Internacional O.R. Tambo', city: 'Johannesburgo', country: 'Sudáfrica', coords: [28.23, -26.14], capacity: 550, occupancy: 295, status: 'normal' },
  { id: 'MAD', name: 'Aeropuerto Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'España', coords: [-3.57, 40.49], capacity: 680, occupancy: 455, status: 'normal' },
];

// ===================== FLIGHTS =====================

export const INITIAL_FLIGHTS: Flight[] = [
  { id: 'FL001', flightNumber: 'BA178', from: 'JFK', to: 'LHR', airlineId: 'BA', airline: 'British Airways', capacity: 350, load: 280, status: 'normal', departureTime: '08:00', arrivalTime: '20:00', isReplanned: false },
  { id: 'FL002', flightNumber: 'EK203', from: 'LHR', to: 'DXB', airlineId: 'EK', airline: 'Emirates', capacity: 400, load: 395, status: 'critical', departureTime: '14:00', arrivalTime: '23:30', isReplanned: false },
  { id: 'FL003', flightNumber: 'EK404', from: 'DXB', to: 'SIN', airlineId: 'EK', airline: 'Emirates', capacity: 380, load: 290, status: 'normal', departureTime: '02:00', arrivalTime: '12:00', isReplanned: false },
  { id: 'FL004', flightNumber: 'CX234', from: 'SIN', to: 'HKG', airlineId: 'CX', airline: 'Cathay Pacific', capacity: 300, load: 245, status: 'warning', departureTime: '09:00', arrivalTime: '13:00', isReplanned: false },
  { id: 'FL005', flightNumber: 'CX511', from: 'HKG', to: 'NRT', airlineId: 'CX', airline: 'Cathay Pacific', capacity: 320, load: 180, status: 'normal', departureTime: '16:00', arrivalTime: '21:00', isReplanned: false },
  { id: 'FL006', flightNumber: 'AF448', from: 'JFK', to: 'CDG', airlineId: 'AF', airline: 'Air France', capacity: 360, load: 210, status: 'normal', departureTime: '19:00', arrivalTime: '08:30', isReplanned: false },
  { id: 'FL007', flightNumber: 'LH456', from: 'CDG', to: 'FRA', airlineId: 'LH', airline: 'Lufthansa', capacity: 250, load: 198, status: 'warning', departureTime: '11:00', arrivalTime: '12:30', isReplanned: false },
  { id: 'FL008', flightNumber: 'LH602', from: 'FRA', to: 'DXB', airlineId: 'LH', airline: 'Lufthansa', capacity: 350, load: 260, status: 'normal', departureTime: '13:30', arrivalTime: '20:00', isReplanned: false },
  { id: 'FL009', flightNumber: 'AA175', from: 'LAX', to: 'NRT', airlineId: 'AA', airline: 'American Airlines', capacity: 380, load: 300, status: 'normal', departureTime: '11:00', arrivalTime: '15:00', isReplanned: false },
  { id: 'FL010', flightNumber: 'AA73', from: 'LAX', to: 'SYD', airlineId: 'AA', airline: 'American Airlines', capacity: 350, load: 290, status: 'warning', departureTime: '22:30', arrivalTime: '07:00', isReplanned: false },
  { id: 'FL011', flightNumber: 'AA907', from: 'MIA', to: 'GRU', airlineId: 'AA', airline: 'American Airlines', capacity: 300, load: 210, status: 'normal', departureTime: '23:00', arrivalTime: '08:00', isReplanned: false },
  { id: 'FL012', flightNumber: 'BA297', from: 'ORD', to: 'LHR', airlineId: 'BA', airline: 'British Airways', capacity: 370, load: 315, status: 'warning', departureTime: '17:30', arrivalTime: '07:30', isReplanned: false },
  { id: 'FL013', flightNumber: 'EK150', from: 'AMS', to: 'DXB', airlineId: 'EK', airline: 'Emirates', capacity: 350, load: 240, status: 'normal', departureTime: '09:30', arrivalTime: '18:30', isReplanned: false },
  { id: 'FL014', flightNumber: 'AF843', from: 'CDG', to: 'JNB', airlineId: 'AF', airline: 'Air France', capacity: 320, load: 185, status: 'warning', departureTime: '22:00', arrivalTime: '09:00', isReplanned: false },
  { id: 'FL015', flightNumber: 'CX380', from: 'PEK', to: 'ICN', airlineId: 'CX', airline: 'Cathay Pacific', capacity: 280, load: 190, status: 'normal', departureTime: '07:00', arrivalTime: '11:00', isReplanned: false },
  { id: 'FL016', flightNumber: 'EK501', from: 'BOM', to: 'DXB', airlineId: 'EK', airline: 'Emirates', capacity: 320, load: 305, status: 'critical', departureTime: '03:00', arrivalTime: '05:30', isReplanned: false },
  { id: 'FL017', flightNumber: 'AA882', from: 'MEX', to: 'MIA', airlineId: 'AA', airline: 'American Airlines', capacity: 260, load: 145, status: 'normal', departureTime: '06:00', arrivalTime: '10:30', isReplanned: false },
  { id: 'FL018', flightNumber: 'SQ326', from: 'SIN', to: 'BOM', airlineId: 'SQ', airline: 'Singapore Airlines', capacity: 300, load: 220, status: 'normal', departureTime: '00:30', arrivalTime: '04:00', isReplanned: false },
  { id: 'FL019', flightNumber: 'QR083', from: 'LHR', to: 'MAD', airlineId: 'QR', airline: 'Qatar Airways', capacity: 240, load: 160, status: 'normal', departureTime: '15:00', arrivalTime: '18:00', isReplanned: false },
  { id: 'FL020', flightNumber: 'AF434', from: 'GRU', to: 'CDG', airlineId: 'AF', airline: 'Air France', capacity: 340, load: 270, status: 'normal', departureTime: '21:00', arrivalTime: '12:00', isReplanned: false },
];

// ===================== SHIPMENTS =====================

export const INITIAL_SHIPMENTS: Shipment[] = [
  { id: 'SHP001', airlineId: 'BA', airline: 'British Airways', origin: 'JFK', destination: 'LHR', currentFlightId: 'FL001', luggageCount: 145, status: 'on-time', progress: 0.35, estimatedDelivery: '2026-03-31 20:00', isReplanned: false },
  { id: 'SHP002', airlineId: 'EK', airline: 'Emirates', origin: 'LHR', destination: 'DXB', currentFlightId: 'FL002', luggageCount: 280, status: 'critical', progress: 0.78, estimatedDelivery: '2026-03-31 23:30', isReplanned: false },
  { id: 'SHP003', airlineId: 'EK', airline: 'Emirates', origin: 'DXB', destination: 'SIN', currentFlightId: 'FL003', luggageCount: 190, status: 'on-time', progress: 0.15, estimatedDelivery: '2026-04-01 12:00', isReplanned: false },
  { id: 'SHP004', airlineId: 'CX', airline: 'Cathay Pacific', origin: 'SIN', destination: 'HKG', currentFlightId: 'FL004', luggageCount: 120, status: 'delayed', progress: 0.55, estimatedDelivery: '2026-03-31 14:30', isReplanned: false },
  { id: 'SHP005', airlineId: 'AA', airline: 'American Airlines', origin: 'LAX', destination: 'NRT', currentFlightId: 'FL009', luggageCount: 210, status: 'on-time', progress: 0.62, estimatedDelivery: '2026-04-01 15:00', isReplanned: false },
  { id: 'SHP006', airlineId: 'AF', airline: 'Air France', origin: 'JFK', destination: 'CDG', currentFlightId: 'FL006', luggageCount: 165, status: 'on-time', progress: 0.20, estimatedDelivery: '2026-04-01 08:30', isReplanned: false },
  { id: 'SHP007', airlineId: 'LH', airline: 'Lufthansa', origin: 'FRA', destination: 'DXB', currentFlightId: 'FL008', luggageCount: 198, status: 'on-time', progress: 0.45, estimatedDelivery: '2026-03-31 20:00', isReplanned: false },
  { id: 'SHP008', airlineId: 'EK', airline: 'Emirates', origin: 'BOM', destination: 'DXB', currentFlightId: 'FL016', luggageCount: 245, status: 'critical', progress: 0.88, estimatedDelivery: '2026-03-31 05:30', isReplanned: false },
  { id: 'SHP009', airlineId: 'AA', airline: 'American Airlines', origin: 'LAX', destination: 'SYD', currentFlightId: 'FL010', luggageCount: 175, status: 'delayed', progress: 0.30, estimatedDelivery: '2026-04-01 07:00', isReplanned: false },
  { id: 'SHP010', airlineId: 'BA', airline: 'British Airways', origin: 'ORD', destination: 'LHR', currentFlightId: 'FL012', luggageCount: 220, status: 'delayed', progress: 0.65, estimatedDelivery: '2026-04-01 07:30', isReplanned: false },
  { id: 'SHP011', airlineId: 'EK', airline: 'Emirates', origin: 'AMS', destination: 'DXB', currentFlightId: 'FL013', luggageCount: 140, status: 'on-time', progress: 0.40, estimatedDelivery: '2026-03-31 18:30', isReplanned: false },
  { id: 'SHP012', airlineId: 'AF', airline: 'Air France', origin: 'CDG', destination: 'JNB', currentFlightId: 'FL014', luggageCount: 130, status: 'delayed', progress: 0.25, estimatedDelivery: '2026-04-01 09:00', isReplanned: false },
  { id: 'SHP013', airlineId: 'CX', airline: 'Cathay Pacific', origin: 'HKG', destination: 'NRT', currentFlightId: 'FL005', luggageCount: 95, status: 'on-time', progress: 0.70, estimatedDelivery: '2026-03-31 21:00', isReplanned: false },
  { id: 'SHP014', airlineId: 'AA', airline: 'American Airlines', origin: 'MIA', destination: 'GRU', currentFlightId: 'FL011', luggageCount: 155, status: 'on-time', progress: 0.10, estimatedDelivery: '2026-04-01 08:00', isReplanned: false },
  { id: 'SHP015', airlineId: 'LH', airline: 'Lufthansa', origin: 'CDG', destination: 'FRA', currentFlightId: 'FL007', luggageCount: 88, status: 'delayed', progress: 0.50, estimatedDelivery: '2026-03-31 12:30', isReplanned: false },
  { id: 'SHP016', airlineId: 'SQ', airline: 'Singapore Airlines', origin: 'SIN', destination: 'BOM', currentFlightId: 'FL018', luggageCount: 175, status: 'on-time', progress: 0.80, estimatedDelivery: '2026-04-01 04:00', isReplanned: false },
  { id: 'SHP017', airlineId: 'AA', airline: 'American Airlines', origin: 'MEX', destination: 'MIA', currentFlightId: 'FL017', luggageCount: 98, status: 'on-time', progress: 0.55, estimatedDelivery: '2026-03-31 10:30', isReplanned: false },
  { id: 'SHP018', airlineId: 'QR', airline: 'Qatar Airways', origin: 'LHR', destination: 'MAD', currentFlightId: 'FL019', luggageCount: 112, status: 'on-time', progress: 0.35, estimatedDelivery: '2026-03-31 18:00', isReplanned: false },
  { id: 'SHP019', airlineId: 'AF', airline: 'Air France', origin: 'GRU', destination: 'CDG', currentFlightId: 'FL020', luggageCount: 195, status: 'on-time', progress: 0.22, estimatedDelivery: '2026-04-01 12:00', isReplanned: false },
  { id: 'SHP020', airlineId: 'CX', airline: 'Cathay Pacific', origin: 'PEK', destination: 'ICN', currentFlightId: 'FL015', luggageCount: 130, status: 'on-time', progress: 0.90, estimatedDelivery: '2026-03-31 11:00', isReplanned: false },
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
