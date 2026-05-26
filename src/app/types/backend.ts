// ===================== BACKEND DTO TYPES =====================
// Tipos TypeScript que reflejan los DTOs del backend Spring Boot

export interface BackendAirport {
  id: string;
  city: string;
  country: string;
  continent: string;         // "AMERICA", "EUROPE", "ASIA", etc.
  latitude: number;
  longitude: number;
  storageCapacity: number;
}

export interface BackendSemaphore {
  flights: 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
  storage: 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
  sla:     'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
  flightOccupancy: number;   // 0.0 – 1.0
  storageOccupancy: number;  // 0.0 – 1.0
  slaCompliance: number;     // 0.0 – 100.0
}

export interface BackendBatchSummary {
  onTime: number;
  delayed: number;
  unrouted: number;
}

export interface BackendActiveFlight {
  flightId: string;
  originId: string;
  destinationId: string;
  departureTime: string;  // ISO-8601
  arrivalTime: string;    // ISO-8601
  bagsCount: number;
  meetsSla: boolean;
}

export interface BackendAirportCapacity {
  airportId: string;
  currentBags: number;
  maxCapacity: number;
  occupancyRatio: number;  // 0.0 – 1.0+
}

export interface BackendOperationalMetrics {
  totalAssignedBags: number;
  inFlightBags: number;
  storedBags: number;
  deliveredBags: number;
  pendingDeliveryBags: number;
  notDepartedBags: number;
  activeLoadedFlights: number;
  overloadedAirports: number;
  peakAirportId: string | null;
  peakAirportOccupancyRatio: number;
}

/** Vuelo del plan de vuelos proyectado a un día específico */
export interface BackendFlightPlanFlight {
  flightId: string;
  originId: string;
  destinationId: string;
  departureTime: string;
  arrivalTime: string;
  capacity: number;
  type: string;
}


export interface BackendCycleUpdate {
  type: 'CYCLE_UPDATE';
  simulationId: string;
  cycle: number;
  simulatedTime: string;       // ISO-8601
  daysElapsed: number;         // 0.0 – 5.0
  simulationComplete: boolean;
  fitness: number;
  batchesProcessed: number;
  batchesFailed: number;
  totalRoutes: number;
  totalBags: number;
  semaphores: BackendSemaphore;
  batchSummary: BackendBatchSummary;
  operationalMetrics?: BackendOperationalMetrics;
  activeFlights: BackendActiveFlight[];
  airportCapacities: BackendAirportCapacity[];
}

export interface BackendStorageUpdate {
  type: 'STORAGE_UPDATE';
  simulationId: string;
  cycle: number;
  simulatedTime: string;
  daysElapsed: number;
  airportCapacities: BackendAirportCapacity[];
  operationalMetrics?: BackendOperationalMetrics;
}


export interface BackendSimulationFinished {
  type: 'SIMULATION_FINISHED';
  simulationId: string;
  simulationComplete: boolean;
  finalFitness: number;
  totalCycles: number;
  batchesProcessed: number;
  collapseLevel: string;
}

export interface BackendConnected {
  type: 'CONNECTED';
  message: string;
  simulationId: string;
}

export type BackendWsMessage = BackendConnected | BackendCycleUpdate | BackendStorageUpdate | BackendSimulationFinished;

export interface BackendStartResponse {
  simulationId: string;
  message: string;
  scenario: string;
  K: number;
  Ta: number;
  Sa: number;
  Sc: number;
  simStartTime: string;       // ISO-8601
  totalRealMinutes: number;   // e.g. 60.0
}

export interface BackendDaySnapshot {
  day: number;
  date: string;
  routesCompleted: number;
  batchesOnTime: number;
  batchesDelayed: number;
  batchesCritical: number;
  avgFitness: number;
  collapseLevel: string;
}

export interface BackendSimulationResults {
  simulationId: string;
  scenario: string;
  startDate: string;
  endDate: string;
  completedAt: string;
  fitness: number;
  totalBatches: number;
  routedBatches: number;
  unroutableBatches: number;
  slaCompliancePercent: number;
  totalCycles: number;
  algorithmUsed: string;
  daySnapshots: BackendDaySnapshot[];
}

export interface BackendSimulationStatus {
  simulationId: string;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';
  scenario: string;
  currentCycle: number;
  simulatedTime: string | null;
  batchesProcessed: number;
  batchesFailed: number;
  batchesPending: number;
  currentFitness: number;
  collapseLevel: string;
  isCollapsed: boolean;
  semaphores: BackendSemaphore;
}

export interface BackendFlightSegment {
  flightId: string;
  originId: string;
  destinationId: string;
  departureTime: string;
  arrivalTime: string;
  capacity: number;
}

export interface BackendRoute {
  batchId: string;
  clientId: string;
  originId: string;
  destinationId: string;
  quantity: number;
  meetsSLA: boolean;
  slaSlack: string;
  finalArrivalTime: string;
  flights: BackendFlightSegment[];
}

export interface BackendSolution {
  totalRoutes: number;
  totalBags: number;
  fitness: number;
  routesMeetingSLA: number;
  slaCompliancePercent: number;
  routes: BackendRoute[];
}

export interface BackendShipmentRequest {
  clientId?: string;
  originId: string;
  destinationId: string;
  quantity: number;
  ingressTime?: string;
}

export interface BackendShipmentResponse {
  batchId: string;
  clientId: string;
  originId: string;
  destinationId: string;
  quantity: number;
  ingressTime: string;
  deadline: string;
  status: string;
}

export interface BackendCancellationResult {
  cancelledFlightId: string;
  affectedBatches: number;
  replannedBatches: number;
  unreplannableBatches: number;
  newFitness: number;
  unreplannableBatchIds: string[];
}
