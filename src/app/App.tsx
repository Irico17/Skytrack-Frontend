import React, { useState, useMemo, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { WorldMap } from './components/WorldMap';
import { BottomPanel } from './components/BottomPanel';
import { RightPanel } from './components/RightPanel';
import { AddShipmentModal } from './components/AddShipmentModal';
import { CancelFlightModal } from './components/CancelFlightModal';
import { StaticDataUploadModal } from './components/StaticDataUploadModal';
import { UploadShipmentsFileModal } from './components/UploadShipmentsFileModal';
import { FiveDayResults } from './components/FiveDayResults';
import { CollapseResults } from './components/CollapseResults';
import { DayToDayResults } from './components/DayToDayResults';
import { ShipmentDetailPanel } from './components/ShipmentDetailPanel';
import { SimulationClocksPanel } from './components/SimulationClocksPanel';
import { useSimulation } from './hooks/useSimulation';
import { Shipment } from './data/mockData';

interface SelectedEntity {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

type MapEntityFilter = SelectedEntity;

interface Filters {
  origin: string;
  destination: string;
}

interface Toggles {
  showRoutes: boolean;
  showWarehouseCapacity: boolean;
  showCongestion: boolean;
}

const DEFAULT_FILTERS: Filters = { origin: '', destination: '' };
const DEFAULT_TOGGLES: Toggles = {
  showRoutes: true,
  showWarehouseCapacity: true,
  showCongestion: true,
};

function sameEntity(a: SelectedEntity | null, b: SelectedEntity | null): boolean {
  return Boolean(a && b && a.type === b.type && a.id === b.id);
}

function stripProjectedDaySuffix(flightId: string): string {
  return flightId.replace(/-D\d+$/, '');
}

function sameFlightId(candidate: string, selected: string): boolean {
  return candidate === selected || stripProjectedDaySuffix(candidate) === stripProjectedDaySuffix(selected);
}

export default function App() {
  const simulation = useSimulation();

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [mapFilter, setMapFilter] = useState<MapEntityFilter | null>(null);
  // Traza de maleta/envío: resalta en el mapa la ruta completa (UTs + almacenes de escala).
  const [mapTrace, setMapTrace] = useState<{ label: string; flightIds: Set<string>; airportIds: Set<string> } | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES);
  const [mapViewRevision, setMapViewRevision] = useState(0);
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [showCancelFlight, setShowCancelFlight] = useState(false);
  const [showStaticDataUpload, setShowStaticDataUpload] = useState(false);
  const [showUploadShipmentsFile, setShowUploadShipmentsFile] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showCollapseResults, setShowCollapseResults] = useState(false);
  const [showDayToDayResults, setShowDayToDayResults] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [clocksCollapsed, setClocksCollapsed] = useState(false);
  // Default 'all' (decisión PO): el mapa muestra TODOS los vuelos; la fluidez se controla
  // con el selector de densidad del mapa (100/50/25%) y el LOD adaptativo del canvas.
  const [utFilter, setUtFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  // Filtro por región/continente de almacenes — compartido para que afecte mapa Y panel.
  const [warehouseContinent, setWarehouseContinent] = useState('all');

  // Todos los modos usan el reloj simulado interpolado del backend (simClock).
  const displayedSimulationTime = simulation.simClock;

  // Al iniciar: colapsar left y abrir right (salvo mapa expandido). handleReset reabre left al cancelar.
  const wasRunningRef = React.useRef(false);
  React.useEffect(() => {
    if (simulation.isRunning && !wasRunningRef.current && !mapExpanded) {
      setLeftCollapsed(true);
      setRightCollapsed(false);
    }
    wasRunningRef.current = simulation.isRunning;
  }, [simulation.isRunning, mapExpanded]);

  const hidePanels = mapExpanded;

  // Auto-show results when 5day simulation completes
  React.useEffect(() => {
    if (simulation.simulationComplete && simulation.mode === '5day') {
      const timer = setTimeout(() => setShowResults(true), 600);
      return () => clearTimeout(timer);
    }
  }, [simulation.simulationComplete, simulation.mode]);

  // Auto-show collapse results when collapse completes
  React.useEffect(() => {
    if (simulation.collapseComplete && simulation.mode === 'collapse') {
      const timer = setTimeout(() => setShowCollapseResults(true), 800);
      return () => clearTimeout(timer);
    }
  }, [simulation.collapseComplete, simulation.mode]);

  // Auto-show day-to-day report when operations are closed
  React.useEffect(() => {
    if (simulation.dayToDayComplete && simulation.mode === 'realtime') {
      const timer = setTimeout(() => setShowDayToDayResults(true), 400);
      return () => clearTimeout(timer);
    }
  }, [simulation.dayToDayComplete, simulation.mode]);

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleToggleChange = useCallback((key: keyof Toggles) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const handleToggleMapExpanded = useCallback(() => setMapExpanded(value => !value), []);

  const handleSelectAirport = useCallback((id: string) => {
    setSelectedEntity(prev =>
      prev?.type === 'airport' && prev.id === id ? null : { type: 'airport', id }
    );
  }, []);

  const handleSelectFlight = useCallback((id: string) => {
    setSelectedEntity(prev =>
      prev?.type === 'flight' && prev.id === id ? null : { type: 'flight', id }
    );
  }, []);

  const handleSelectShipment = useCallback((id: string) => {
    setSelectedEntity(prev =>
      prev?.type === 'shipment' && prev.id === id ? null : { type: 'shipment', id }
    );
  }, []);

  // Filtra y enfoca el mapa sin abrir el inspector del panel derecho.
  const handleToggleMapFilter = useCallback((filter: MapEntityFilter) => {
    setMapFilter(prev => (sameEntity(prev, filter) ? null : filter));
    setMapTrace(null);
    setSelectedEntity(null);
  }, []);

  const filteredShipments = useMemo(() => {
    if (!filters.origin && !filters.destination) return simulation.shipments;

    return simulation.shipments.filter(s => {
      if (filters.origin && s.origin !== filters.origin) return false;
      if (filters.destination && s.destination !== filters.destination) return false;
      return true;
    });
  }, [simulation.shipments, filters]);

  const filteredFlights = useMemo(() => {
    if (!filters.origin && !filters.destination) return simulation.flights;

    return simulation.flights.filter(f => {
      if (filters.origin && f.from !== filters.origin) return false;
      if (filters.destination && f.to !== filters.destination) return false;
      return true;
    });
  }, [simulation.flights, filters]);

  const filteredFlightPlanFlights = useMemo(() => {
    if (!filters.origin && !filters.destination) return simulation.flightPlanFlights;

    return simulation.flightPlanFlights.filter(f => {
      if (filters.origin && f.originId !== filters.origin) return false;
      if (filters.destination && f.destinationId !== filters.destination) return false;
      return true;
    });
  }, [simulation.flightPlanFlights, filters.origin, filters.destination]);

  const filteredActiveFlights = useMemo(() => {
    if (!filters.origin && !filters.destination) return simulation.activeFlights;

    return simulation.activeFlights.filter(f => {
      if (filters.origin && f.originId !== filters.origin) return false;
      if (filters.destination && f.destinationId !== filters.destination) return false;
      return true;
    });
  }, [simulation.activeFlights, filters.origin, filters.destination]);

  const mapFilterShipment = useMemo(() => (
    mapFilter?.type === 'shipment'
      ? simulation.shipments.find(s => s.id === mapFilter.id) ?? null
      : null
  ), [mapFilter, simulation.shipments]);

  const mapAirports = useMemo(() => {
    if (mapTrace) return simulation.airports.filter(a => mapTrace.airportIds.has(a.id));
    if (!mapFilter && !filters.origin && !filters.destination) return simulation.airports;

    const airportIds = new Set<string>();
    if (!mapFilter) {
      if (filters.origin) airportIds.add(filters.origin);
      if (filters.destination) airportIds.add(filters.destination);
      for (const flight of filteredFlightPlanFlights) {
        airportIds.add(flight.originId);
        airportIds.add(flight.destinationId);
      }
      for (const shipment of filteredShipments) {
        airportIds.add(shipment.origin);
        airportIds.add(shipment.destination);
      }
    } else if (mapFilter.type === 'airport') {
      airportIds.add(mapFilter.id);
    } else if (mapFilter.type === 'flight') {
      const planned = simulation.flightPlanFlights.find(f => sameFlightId(f.flightId, mapFilter.id));
      const active = simulation.activeFlights.find(f => sameFlightId(f.flightId, mapFilter.id));
      const local = simulation.flights.find(f => sameFlightId(f.id, mapFilter.id));
      const originId = planned?.originId ?? active?.originId ?? local?.from;
      const destinationId = planned?.destinationId ?? active?.destinationId ?? local?.to;
      if (originId) airportIds.add(originId);
      if (destinationId) airportIds.add(destinationId);
    } else if (mapFilterShipment) {
      airportIds.add(mapFilterShipment.origin);
      airportIds.add(mapFilterShipment.destination);
    }

    return simulation.airports.filter(a => airportIds.has(a.id));
  }, [filters, filteredFlightPlanFlights, filteredShipments, mapFilter, mapTrace, mapFilterShipment, simulation.activeFlights, simulation.airports, simulation.flightPlanFlights, simulation.flights]);

  const mapFlights = useMemo(() => {
    if (mapTrace) return [];
    if (!mapFilter) return filteredFlights;
    if (mapFilter.type === 'airport') {
      return simulation.flights.filter(f => f.from === mapFilter.id || f.to === mapFilter.id);
    }
    if (mapFilter.type === 'flight') {
      return simulation.flights.filter(f => sameFlightId(f.id, mapFilter.id));
    }
    if (mapFilter.type === 'shipment' && mapFilterShipment?.currentFlightId && mapFilterShipment.currentFlightId !== 'PENDING') {
      return simulation.flights.filter(f => sameFlightId(f.id, mapFilterShipment.currentFlightId));
    }
    return [];
  }, [filteredFlights, mapFilter, mapTrace, mapFilterShipment, simulation.flights]);

  const mapShipments = useMemo(() => {
    if (mapTrace) return [];
    if (!mapFilter) return filteredShipments;
    if (mapFilter.type === 'airport') {
      return simulation.shipments.filter(s => s.origin === mapFilter.id || s.destination === mapFilter.id);
    }
    if (mapFilter.type === 'shipment') {
      return simulation.shipments.filter(s => s.id === mapFilter.id);
    }
    if (mapFilter.type === 'flight') {
      return simulation.shipments.filter(s => sameFlightId(s.currentFlightId, mapFilter.id));
    }
    return [];
  }, [filteredShipments, mapFilter, mapTrace, simulation.shipments]);

  const mapFlightPlanFlights = useMemo(() => {
    if (mapTrace) return simulation.flightPlanFlights.filter(f => mapTrace.flightIds.has(f.flightId));
    if (!mapFilter) return filteredFlightPlanFlights;
    if (mapFilter.type === 'airport') {
      return simulation.flightPlanFlights.filter(f => f.originId === mapFilter.id || f.destinationId === mapFilter.id);
    }
    if (mapFilter.type === 'flight') {
      return simulation.flightPlanFlights.filter(f => sameFlightId(f.flightId, mapFilter.id));
    }
    if (mapFilter.type === 'shipment' && mapFilterShipment?.currentFlightId && mapFilterShipment.currentFlightId !== 'PENDING') {
      return simulation.flightPlanFlights.filter(f => sameFlightId(f.flightId, mapFilterShipment.currentFlightId));
    }
    return [];
  }, [filteredFlightPlanFlights, mapFilter, mapTrace, mapFilterShipment, simulation.flightPlanFlights]);

  const mapActiveFlights = useMemo(() => {
    if (mapTrace) return simulation.activeFlights.filter(f => mapTrace.flightIds.has(f.flightId));
    if (!mapFilter) return filteredActiveFlights;
    if (mapFilter.type === 'airport') {
      return simulation.activeFlights.filter(f => f.originId === mapFilter.id || f.destinationId === mapFilter.id);
    }
    if (mapFilter.type === 'flight') {
      return simulation.activeFlights.filter(f => sameFlightId(f.flightId, mapFilter.id));
    }
    if (mapFilter.type === 'shipment' && mapFilterShipment?.currentFlightId && mapFilterShipment.currentFlightId !== 'PENDING') {
      return simulation.activeFlights.filter(f => sameFlightId(f.flightId, mapFilterShipment.currentFlightId));
    }
    return [];
  }, [filteredActiveFlights, mapFilter, mapTrace, mapFilterShipment, simulation.activeFlights]);

  const handleTraceRoute = useCallback((label: string, flightIds: string[], airportIds: string[]) => {
    setMapTrace({ label, flightIds: new Set(flightIds), airportIds: new Set(airportIds) });
    setMapFilter(null);
    // Limpia la selección para que el overlay dibuje TODOS los tramos de la ruta (no solo uno).
    setSelectedEntity(null);
  }, []);

  const criticalCount = useMemo(() =>
    simulation.shipments.filter(s => s.status === 'critical').length,
    [simulation.shipments]
  );
  const liveStorageOccupancyPct = useMemo(() => {
    const totals = simulation.airports.reduce(
      (sum, airport) => ({
        occupied: sum.occupied + airport.occupancy,
        capacity: sum.capacity + airport.capacity,
      }),
      { occupied: 0, capacity: 0 },
    );
    return totals.capacity > 0 ? Math.round((totals.occupied / totals.capacity) * 100) : null;
  }, [simulation.airports]);

  const handleAddShipment = useCallback(async (data: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => {
    await simulation.addShipment(data);
  }, [simulation]);

  const resetViewState = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setToggles(DEFAULT_TOGGLES);
    setUtFilter('all');
    setWarehouseFilter('all');
    setWarehouseContinent('all');
    setMapFilter(null);
    setMapTrace(null);
    setSelectedEntity(null);
    setMapViewRevision(value => value + 1);
  }, []);

  const handleReset = useCallback(() => {
    simulation.reset();
    resetViewState();
    setShowResults(false);
    setShowCollapseResults(false);
    setShowDayToDayResults(false);
    setLeftCollapsed(false);
  }, [resetViewState, simulation]);

  const handleModeChange = useCallback((nextMode: Parameters<typeof simulation.setMode>[0]) => {
    resetViewState();
    simulation.setMode(nextMode);
  }, [resetViewState, simulation]);

  return (
    <div className="h-screen w-screen bg-[#060D1F] flex flex-col overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Bar */}
      <TopBar
        isRunning={simulation.isRunning}
        isPaused={simulation.isPaused}
        isStarting={simulation.isRunning && !simulation.lastCycleUpdate}
        mode={simulation.mode}
        simulationTime={displayedSimulationTime}
        events={simulation.events}
        onStart={simulation.start}
        onReset={handleReset}
        onModeChange={handleModeChange}
        totalShipments={simulation.shipments.length}
        criticalCount={criticalCount}
        viewerCount={simulation.viewerCount}
        startDisabled={simulation.simulationComplete || simulation.collapseComplete || simulation.dayToDayComplete}
        kpis={simulation.lastCycleUpdate ? {
          warehouseOccupancyPct: Math.round((simulation.lastCycleUpdate.semaphores?.storageOccupancy ?? 0) * 100),
          flightOccupancyPct: Math.round((simulation.lastCycleUpdate.semaphores?.flightOccupancy ?? 0) * 100),
        } : null}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {!hidePanels && !leftCollapsed && (
          <LeftSidebar
            mode={simulation.mode}
            startDate={simulation.startDate}
            filters={filters}
            toggles={toggles}
            isRunning={simulation.isRunning}
            isStarting={simulation.isRunning && !simulation.lastCycleUpdate}
            isPaused={simulation.isPaused}
            currentCycle={simulation.lastCycleUpdate?.cycle ?? null}
            storageOccupancyPct={simulation.lastCycleUpdate ? liveStorageOccupancyPct : null}
            daysElapsed={simulation.daysElapsed}
            simulationComplete={simulation.simulationComplete}
            collapseComplete={simulation.collapseComplete}
            airports={simulation.airports}
            simulationTime={displayedSimulationTime}
            simulationK={simulation.simulationK}
            onStartDateChange={simulation.setStartDate}
            onFilterChange={handleFilterChange}
            onClearFilters={() => setFilters(DEFAULT_FILTERS)}
            onToggleChange={handleToggleChange}
            onResetView={resetViewState}
            onAddShipment={() => setShowAddShipment(true)}
            onUploadShipmentsFile={() => setShowUploadShipmentsFile(true)}
            onCancelFlight={() => setShowCancelFlight(true)}
            onUploadStaticData={() => setShowStaticDataUpload(true)}
            onCloseOperations={simulation.closeOperations}
            onViewResults={() => setShowResults(true)}
            onViewCollapseResults={() => setShowCollapseResults(true)}
            onViewDayToDayResults={() => setShowDayToDayResults(true)}
            dayToDayComplete={simulation.dayToDayComplete}
          />
        )}

        {/* Center: Map + Bottom Panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* World Map */}
          <div className="flex-1 overflow-hidden relative">
            <WorldMap
              key={`${simulation.mode}:${mapViewRevision}`}
              airports={mapAirports}
              allAirports={simulation.airports}
              flights={mapFlights}
              shipments={mapShipments}
              selectedEntity={selectedEntity ?? mapFilter}
              onSelectAirport={handleSelectAirport}
              onSelectFlight={handleSelectFlight}
              onSelectShipment={handleSelectShipment}
              toggles={toggles}
              simClockRef={simulation.simClockRef}
              activeFlights={mapActiveFlights}
              flightPlanFlights={mapFlightPlanFlights}
              utFilter={utFilter}
              warehouseFilter={warehouseFilter}
              warehouseContinent={warehouseContinent}
              onUtFilterChange={setUtFilter}
              onWarehouseFilterChange={setWarehouseFilter}
              cancelledFlightIds={simulation.cancelledFlightIds}
              isExpanded={mapExpanded}
              onToggleExpanded={handleToggleMapExpanded}
            />

            {!hidePanels && (
              <div className="absolute top-3 right-3 z-20 flex gap-1.5">
                <button
                  onClick={() => setLeftCollapsed(v => !v)}
                  className="w-8 h-8 rounded-lg bg-[#0D1E38]/90 border border-[#1E3058] text-[#A8C0E0] flex items-center justify-center hover:border-[#4DA6FF]/60 hover:text-[#4DA6FF] transition-colors"
                  title={leftCollapsed ? 'Mostrar panel izquierdo' : 'Ocultar panel izquierdo'}
                >
                  {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setBottomCollapsed(v => !v)}
                  className="w-8 h-8 rounded-lg bg-[#0D1E38]/90 border border-[#1E3058] text-[#A8C0E0] flex items-center justify-center hover:border-[#4DA6FF]/60 hover:text-[#4DA6FF] transition-colors"
                  title={bottomCollapsed ? 'Mostrar panel inferior' : 'Ocultar panel inferior'}
                >
                  {bottomCollapsed ? <PanelBottomOpen className="w-4 h-4" /> : <PanelBottomClose className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setRightCollapsed(v => !v)}
                  className="w-8 h-8 rounded-lg bg-[#0D1E38]/90 border border-[#1E3058] text-[#A8C0E0] flex items-center justify-center hover:border-[#4DA6FF]/60 hover:text-[#4DA6FF] transition-colors"
                  title={rightCollapsed ? 'Mostrar panel derecho' : 'Ocultar panel derecho'}
                >
                  {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                </button>
              </div>
            )}

            {/* Relojes flotantes — solo UI; no empuja ticks del mapa */}
            {(simulation.isRunning || simulation.mode === '5day' || simulation.mode === 'collapse' || simulation.realStartedAt) && (
              <SimulationClocksPanel
                simClock={displayedSimulationTime}
                simClockRef={simulation.simClockRef}
                realStartedAt={simulation.realStartedAt}
                startDate={simulation.startDate}
                daysElapsed={simulation.daysElapsed}
                simulationK={simulation.simulationK}
                isRunning={simulation.isRunning}
                mode={simulation.mode}
                onCollapsedChange={setClocksCollapsed}
              />
            )}

            {/* Preparando simulación — antes del primer ciclo del backend */}
            {simulation.isRunning && !simulation.lastCycleUpdate && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[#0D1E38]/95 border border-[#4DA6FF]/40 backdrop-blur-sm shadow-2xl">
                  <div className="w-4 h-4 rounded-full border-2 border-[#4DA6FF]/30 border-t-[#4DA6FF] animate-spin" />
                  <div className="flex flex-col">
                    <span className="text-xs text-[#C8D8F0]" style={{ fontWeight: 600 }}>Preparando simulación…</span>
                    <span className="text-[10px] text-[#4A6080]">
                      {simulation.preparationMessage ?? 'Cargando datos y ejecutando la primera planificación'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Collapse progress overlay on map — desplazado para no solapar relojes */}
            {simulation.mode === 'collapse' && simulation.isRunning && (
              <div
                className="absolute top-3 z-20 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0D1E38]/90 border border-[#FF4D4D]/30 backdrop-blur-sm"
                style={{ left: clocksCollapsed ? 120 : 300 }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D] animate-pulse" />
                <span className="text-[11px] text-[#FF4D4D]">ESCENARIO COLAPSADO</span>
                <span className="text-[11px] font-mono text-[#4A6080]">Degradando red…</span>
              </div>
            )}

            {/* Collapse complete banner */}
            {simulation.collapseComplete && simulation.mode === 'collapse' && !showCollapseResults && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/50 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-[#FF4D4D]" />
                <span className="text-xs text-[#FF4D4D]" style={{ fontWeight: 600 }}>Colapso completado — red comprometida</span>
                <button
                  onClick={() => setShowCollapseResults(true)}
                  className="px-3 py-1 rounded-lg bg-[#FF4D4D]/20 text-[#FF4D4D] text-xs hover:bg-[#FF4D4D]/30 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  Ver Análisis →
                </button>
              </div>
            )}

            {/* Simulation complete banner */}
            {simulation.simulationComplete && simulation.mode === '5day' && !showResults && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/50 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-[#00FF9C]" />
                <span className="text-xs text-[#00FF9C]" style={{ fontWeight: 600 }}>Simulación de 5 días completada</span>
                <button
                  onClick={() => setShowResults(true)}
                  className="px-3 py-1 rounded-lg bg-[#00FF9C]/20 text-[#00FF9C] text-xs hover:bg-[#00FF9C]/30 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  Ver Resultados →
                </button>
              </div>
            )}

            {/* Traza de maleta/envío activa — ruta completa resaltada */}
            {mapTrace && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/40 backdrop-blur-sm">
                <span className="text-[11px] text-[#A855F7]">
                  Ruta en mapa: {mapTrace.label} · {mapTrace.flightIds.size} tramo(s)
                </span>
                <button
                  onClick={() => setMapTrace(null)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#A855F7]/20 text-[11px] text-[#A855F7] hover:bg-[#A855F7]/30 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  ✕ Quitar ruta
                </button>
              </div>
            )}

            {/* Map entity filter indicator — permite quitar el filtro del mapa */}
            {mapFilter && !mapTrace && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 backdrop-blur-sm">
                <span className="text-[11px] text-[#4DA6FF]">
                  Mapa filtrado: {mapFilter.type === 'airport' ? 'Almacén' : mapFilter.type === 'flight' ? 'UT' : 'Envío'} {mapFilter.id}
                </span>
                <button
                  onClick={() => setMapFilter(null)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#4DA6FF]/20 text-[11px] text-[#4DA6FF] hover:bg-[#4DA6FF]/30 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  ✕ Quitar filtro
                </button>
              </div>
            )}

            {/* Active filters indicator */}
            {(filters.origin || filters.destination) && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#4DA6FF]/15 border border-[#4DA6FF]/30 backdrop-blur-sm">
                <span className="text-[11px] text-[#4DA6FF]">
                  Filtros activos: {[
                    filters.origin && `desde ${filters.origin}`,
                    filters.destination && `hacia ${filters.destination}`
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}

            {/* Replanned indicator */}
            {simulation.hasReplanned && (
              <div className="absolute bottom-16 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/30 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
                <span className="text-[11px] text-[#A855F7]">Rutas replanificadas — líneas punteadas muestran nuevas rutas</span>
              </div>
            )}
          </div>

          {/* Bottom Panel */}
          {!hidePanels && !bottomCollapsed && (
            <BottomPanel
              key={`${simulation.mode}:${mapViewRevision}`}
              selectedEntity={selectedEntity}
              airports={simulation.airports}
              flights={simulation.flights}
              shipments={simulation.shipments}
              onClearSelection={() => { setSelectedEntity(null); setMapFilter(null); }}
              onSelectShipment={handleSelectShipment}
              onSelectFlight={handleSelectFlight}
              onSelectAirport={handleSelectAirport}
              isRunning={simulation.isRunning}
              simulationTime={displayedSimulationTime}
              mode={simulation.mode}
              activeFlights={simulation.activeFlights}
              flightPlanFlights={simulation.flightPlanFlights}
              lastCycleUpdate={simulation.lastCycleUpdate}
            />
          )}
        </div>

        {/* Right Panel */}
        {!hidePanels && !rightCollapsed && (
          <RightPanel
            key={`${simulation.mode}:${mapViewRevision}`}
            simulationId={simulation.simulationId}
            airports={simulation.airports}
            flights={simulation.flights}
            shipments={simulation.shipments}
            events={simulation.events}
            isRunning={simulation.isRunning}
            simulationTime={displayedSimulationTime}
            mode={simulation.mode}
            activeFlights={simulation.activeFlights}
            flightPlanFlights={simulation.flightPlanFlights}
            lastCycleUpdate={simulation.lastCycleUpdate}
            activeMapFilter={mapFilter}
            selectedEntity={selectedEntity}
            onToggleMapFilter={handleToggleMapFilter}
            onTraceRoute={handleTraceRoute}
            onSelectAirport={handleSelectAirport}
            onSelectFlight={handleSelectFlight}
            onSelectShipment={handleSelectShipment}
            utFilter={utFilter}
            warehouseFilter={warehouseFilter}
            warehouseContinent={warehouseContinent}
            onUtFilterChange={setUtFilter}
            onWarehouseFilterChange={setWarehouseFilter}
            onWarehouseContinentChange={setWarehouseContinent}
            viewerCount={simulation.viewerCount}
            cancelledFlightIds={simulation.cancelledFlightIds}
          />
        )}
      </div>

      {/* Add Shipment Modal */}
      {showAddShipment && (
        <AddShipmentModal
          onClose={() => setShowAddShipment(false)}
          onAdd={handleAddShipment}
          airports={simulation.airports}
        />
      )}

      {showCancelFlight && (
        <CancelFlightModal
          onClose={() => setShowCancelFlight(false)}
          onCancel={simulation.cancelFlight}
          flightPlanFlights={simulation.flightPlanFlights}
          activeFlights={simulation.activeFlights}
          simulationTime={displayedSimulationTime}
        />
      )}

      {showStaticDataUpload && (
        <StaticDataUploadModal
          onClose={() => setShowStaticDataUpload(false)}
          onUpload={simulation.uploadStaticData}
          onUploadPartial={simulation.uploadStaticDataPartial}
        />
      )}

      {showUploadShipmentsFile && (
        <UploadShipmentsFileModal
          onClose={() => setShowUploadShipmentsFile(false)}
          onUpload={simulation.uploadShipmentsFile}
        />
      )}

      {/* 5-Day Results Screen */}
      {showResults && (
        <FiveDayResults
          startDate={simulation.startDate}
          daySnapshots={simulation.daySnapshots}
          shipments={simulation.shipments}
          events={simulation.events}
          airports={simulation.airports}
          lastCycleUpdate={simulation.lastCycleUpdate}
          results={simulation.simulationResults}
          onClose={() => setShowResults(false)}
          onReset={handleReset}
        />
      )}

      {/* Day-to-Day Operations Report */}
      {showDayToDayResults && (
        <DayToDayResults
          results={simulation.simulationResults}
          lastCycleUpdate={simulation.lastCycleUpdate}
          airports={simulation.airports}
          shipments={simulation.shipments}
          events={simulation.events}
          simulationTime={displayedSimulationTime}
          onClose={() => setShowDayToDayResults(false)}
          onReset={handleReset}
        />
      )}

      {/* Collapse Results Screen */}
      {showCollapseResults && simulation.collapseMetrics && (
        <CollapseResults
          collapseMetrics={simulation.collapseMetrics}
          shipments={simulation.shipments}
          events={simulation.events}
          airports={simulation.airports}
          lastCycleUpdate={simulation.lastCycleUpdate}
          onClose={() => setShowCollapseResults(false)}
          onReset={handleReset}
        />
      )}

      {/* Shipment Detail Side Panel */}
      {selectedEntity?.type === 'shipment' && (() => {
        const selShipment = simulation.shipments.find(s => s.id === selectedEntity.id);
        if (!selShipment) return null;
        return (
          <ShipmentDetailPanel
            shipment={selShipment}
            flights={simulation.flights}
            airports={simulation.airports}
            onClose={() => setSelectedEntity(null)}
            simulationTime={displayedSimulationTime}
            simulationId={simulation.simulationId}
          />
        );
      })()}
    </div>
  );
}