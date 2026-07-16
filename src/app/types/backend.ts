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

export interface BackendSimulationError {
  type: 'SIMULATION_ERROR';
  simulationId: string;
  simulationComplete: false;
  message: string;
  currentCycle: number;
  batchesProcessed: number;
  collapseLevel: string;
}

export interface BackendConnected {
  type: 'CONNECTED';
  message: string;
  simulationId: string;
}

export interface BackendSimulationStarted {
  type: 'SIMULATION_STARTED';
  simulationId: string;
  activeSimulation: BackendActiveSimulation;
}

export type BackendWsMessage = BackendConnected | BackendSimulationStarted | BackendCycleUpdate | BackendStorageUpdate | BackendSimulationFinished | BackendSimulationError;

export interface BackendActiveSimulation {
  simulationId: string;
  scenario: 'DAY_TO_DAY' | 'PERIOD_SIMULATION' | 'COLLAPSE_SIMULATION' | string;
  scenarioDescription: string;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';
  startDateTime: string | null;
  simulatedTime: string | null;
  currentCycle: number;
  daysElapsed: number;
  K: number;
  Ta: number;
  Sa: number;
  Sc: number;
  connectedClients: number;
  startedAt: string | null;
  finishedAt: string | null;
  canJoin: boolean;
}

export interface BackendSimulationSnapshot {
  activeSimulation: BackendActiveSimulation | null;
  status: BackendSimulationStatus;
}

export interface BackendOperationalState {
  simulationId: string;
  simulatedTime: string | null;
  transportUnits: Array<{
    flightId: string;
    originId: string;
    destinationId: string;
    departureTime: string;
    arrivalTime: string;
    capacity: number;
    bagsCount: number;
    occupancyRatio: number;
    empty: boolean;
    meetsSla: boolean;
  }>;
  warehouses: Array<{
    airportId: string;
    city: string;
    country: string;
    currentBags: number;
    maxCapacity: number;
    occupancyRatio: number;
    semaphore: 'GREEN' | 'AMBER' | 'RED' | string;
  }>;
  shipments: Array<{
    batchId: string;
    clientId: string;
    originId: string;
    destinationId: string;
    quantity: number;
    state: string;
    currentFlightId: string | null;
    meetsSla: boolean;
    progress: number;
    virtualProductStart: string;
    virtualProductEnd: string;
  }>;
}

export type BackendBagState =
  | 'NOT_REGISTERED'
  | 'PENDING_ROUTE'
  | 'AT_ORIGIN'
  | 'AT_TRANSFER'
  | 'IN_FLIGHT'
  | 'DELIVERED'
  | string;

export interface BackendBagEvent {
  type: string;
  airportId: string | null;
  flightId: string | null;
  timestamp: string;
  completed: boolean;
}

export interface BackendBagItem {
  bagId: string;
  sequence: number;
  batchId: string;
  clientId: string;
  originId: string;
  destinationId: string;
  state: BackendBagState;
  currentAirportId: string | null;
  currentFlightId: string | null;
  lastEvent: string | null;
  nextEvent: string | null;
  ingressTime: string;
  deadline: string;
  finalArrivalTime: string | null;
  meetsSla: boolean;
  progress: number;
  events: BackendBagEvent[];
}

export interface BackendBagTraceability {
  simulationId: string;
  simulatedTime: string | null;
  page: number;
  size: number;
  totalItems: number;
  summary: {
    totalBags: number;
    matchedBags: number;
    notRegisteredBags: number;
    pendingRouteBags: number;
    warehouseBags: number;
    inFlightBags: number;
    deliveredBags: number;
    delayedBags: number;
  };
  bags: BackendBagItem[];
}

export interface BackendStartResponse {
  simulationId: string;
  joinedExisting?: boolean;
  activeSimulation?: BackendActiveSimulation;
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
  windowStart?: string | null;
  windowEnd?: string | null;
  routesCompleted: number;
  totalBags?: number;
  batchesOnTime: number;
  batchesDelayed: number;
  batchesCritical: number;
  avgFitness: number;
  collapseLevel: string;
  avgOccupancy?: number;
  replanned?: number;
}

export interface BackendCollapseInfo {
  causeCode: string;        // WAREHOUSE_SATURATION | UNSERVICEABLE_BATCHES | CAPACITY_SATURATION | ALGORITHM_FITNESS
  causeLabel: string;
  reason: string;
  detectedAtReal: string | null;  // ISO-8601 (reloj real)
  detectedAtSim: string | null;   // ISO-8601 (tiempo simulado)
  occupancyPct: number;
  unserviceablePct: number;
  criticalAirports: number;
  totalAirports: number;
  cycle: number;
}

export interface BackendSimulationResults {
  simulationId: string;
  scenario: string;
  startDate: string;
  endDate: string;
  startDateTime?: string | null;
  endDateTime?: string | null;
  completedAt: string;
  fitness: number;
  totalBatches: number;
  routedBatches: number;
  unroutableBatches: number;
  slaCompliancePercent: number;
  totalCycles: number;
  algorithmUsed: string;
  daySnapshots: BackendDaySnapshot[];
  collapseInfo?: BackendCollapseInfo | null;
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

export interface BackendStaticDataUploadResponse {
  message: string;
  airportsFile: string;
  flightsFile: string;
  shipmentFiles: number;
  airportsLoaded: number;
  flightsLoaded: number;
  shipmentsLoaded: number;
  dbAirportsImported: number;
  dbFlightsImported: number;
}

export interface BackendStaticDataBatchStartResponse {
  sessionId: string;
  message: string;
  shipmentFilesStaged: number;
}

export interface BackendStaticDataBatchProgressResponse {
  sessionId: string;
  filesInBatch: number;
  shipmentFilesStaged: number;
  message: string;
}

export interface StaticDataUploadProgress {
  phase: 'starting' | 'shipments' | 'finalizing' | 'done';
  currentBatch: number;
  totalBatches: number;
  filesUploaded: number;
  totalFiles: number;
  message?: string;
}
