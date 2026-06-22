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
import { FiveDayResults } from './components/FiveDayResults';
import { CollapseResults } from './components/CollapseResults';
import { DayToDayResults } from './components/DayToDayResults';
import { ShipmentDetailPanel } from './components/ShipmentDetailPanel';
import { useSimulation } from './hooks/useSimulation';
import { SimulationMode, Shipment } from './data/mockData';

interface SelectedEntity {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

type MapEntityFilter = SelectedEntity;

interface Filters {
  airline: string;
  origin: string;
  destination: string;
}

interface Toggles {
  showRoutes: boolean;
  showWarehouseCapacity: boolean;
  showCongestion: boolean;
}

const MONTHS_ES_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatSimulationClock(date: Date): { date: string; time: string } {
  return {
    date: `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS_ES_SHORT[date.getUTCMonth()]}`,
    time: `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`,
  };
}

function formatApiDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
  const [realClock, setRealClock] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setRealClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [mapFilter, setMapFilter] = useState<MapEntityFilter | null>(null);
  const [filters, setFilters] = useState<Filters>({ airline: '', origin: '', destination: '' });
  const [toggles, setToggles] = useState<Toggles>({
    showRoutes: true,
    showWarehouseCapacity: true,
    showCongestion: true,
  });
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [showCancelFlight, setShowCancelFlight] = useState(false);
  const [showStaticDataUpload, setShowStaticDataUpload] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showCollapseResults, setShowCollapseResults] = useState(false);
  const [showDayToDayResults, setShowDayToDayResults] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Todos los modos usan el reloj simulado interpolado del backend (simClock).
  const displayedSimulationTime = simulation.simClock;

  const simClockDisplay = formatSimulationClock(displayedSimulationTime);
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

  // Solo filtra el mapa: no abre el panel de detalles (eso se hace al hacer clic en la entidad)
  const handleToggleMapFilter = useCallback((filter: MapEntityFilter) => {
    setMapFilter(prev => (sameEntity(prev, filter) ? null : filter));
  }, []);

  const filteredShipments = useMemo(() => {
    if (!filters.airline && !filters.origin && !filters.destination) return simulation.shipments;

    return simulation.shipments.filter(s => {
      if (filters.airline && s.airlineId !== filters.airline) return false;
      if (filters.origin && s.origin !== filters.origin) return false;
      if (filters.destination && s.destination !== filters.destination) return false;
      return true;
    });
  }, [simulation.shipments, filters]);

  const filteredFlights = useMemo(() => {
    if (!filters.airline && !filters.origin && !filters.destination) return simulation.flights;

    return simulation.flights.filter(f => {
      if (filters.airline && f.airlineId !== filters.airline) return false;
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
    if (!mapFilter) return simulation.airports;

    const airportIds = new Set<string>();
    if (mapFilter.type === 'airport') {
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
  }, [mapFilter, mapFilterShipment, simulation.activeFlights, simulation.airports, simulation.flightPlanFlights, simulation.flights]);

  const mapFlights = useMemo(() => {
    if (!mapFilter) return filteredFlights;
    if (mapFilter.type === 'flight') {
      return simulation.flights.filter(f => sameFlightId(f.id, mapFilter.id));
    }
    if (mapFilter.type === 'shipment' && mapFilterShipment?.currentFlightId && mapFilterShipment.currentFlightId !== 'PENDING') {
      return simulation.flights.filter(f => sameFlightId(f.id, mapFilterShipment.currentFlightId));
    }
    return [];
  }, [filteredFlights, mapFilter, mapFilterShipment, simulation.flights]);

  const mapShipments = useMemo(() => {
    if (!mapFilter) return filteredShipments;
    if (mapFilter.type === 'shipment') {
      return simulation.shipments.filter(s => s.id === mapFilter.id);
    }
    if (mapFilter.type === 'flight') {
      return simulation.shipments.filter(s => sameFlightId(s.currentFlightId, mapFilter.id));
    }
    return [];
  }, [filteredShipments, mapFilter, simulation.shipments]);

  const mapFlightPlanFlights = useMemo(() => {
    if (!mapFilter) return filteredFlightPlanFlights;
    if (mapFilter.type === 'flight') {
      return simulation.flightPlanFlights.filter(f => sameFlightId(f.flightId, mapFilter.id));
    }
    if (mapFilter.type === 'shipment' && mapFilterShipment?.currentFlightId && mapFilterShipment.currentFlightId !== 'PENDING') {
      return simulation.flightPlanFlights.filter(f => sameFlightId(f.flightId, mapFilterShipment.currentFlightId));
    }
    return [];
  }, [filteredFlightPlanFlights, mapFilter, mapFilterShipment, simulation.flightPlanFlights]);

  const mapActiveFlights = useMemo(() => {
    if (!mapFilter) return filteredActiveFlights;
    if (mapFilter.type === 'flight') {
      return simulation.activeFlights.filter(f => sameFlightId(f.flightId, mapFilter.id));
    }
    if (mapFilter.type === 'shipment' && mapFilterShipment?.currentFlightId && mapFilterShipment.currentFlightId !== 'PENDING') {
      return simulation.activeFlights.filter(f => sameFlightId(f.flightId, mapFilterShipment.currentFlightId));
    }
    return [];
  }, [filteredActiveFlights, mapFilter, mapFilterShipment, simulation.activeFlights]);

  const criticalCount = useMemo(() =>
    simulation.shipments.filter(s => s.status === 'critical').length,
    [simulation.shipments]
  );

  const handleAddShipment = useCallback(async (data: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => {
    await simulation.addShipment(data);
  }, [simulation]);

  const handleReset = useCallback(() => {
    simulation.reset();
    setMapFilter(null);
    setSelectedEntity(null);
    setShowResults(false);
    setShowCollapseResults(false);
    setShowDayToDayResults(false);
  }, [simulation]);

  return (
    <div className="h-screen w-screen bg-[#060D1F] flex flex-col overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Bar */}
      <TopBar
        isRunning={simulation.isRunning}
        isPaused={simulation.isPaused}
        mode={simulation.mode}
        simulationTime={displayedSimulationTime}
        events={simulation.events}
        onStart={simulation.start}
        onPause={simulation.pause}
        onResume={simulation.resume}
        onReset={handleReset}
        onModeChange={simulation.setMode}
        totalShipments={simulation.shipments.length}
        criticalCount={criticalCount}
        startDisabled={simulation.simulationComplete || simulation.collapseComplete || simulation.dayToDayComplete}
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
            daysElapsed={simulation.daysElapsed}
            simulationComplete={simulation.simulationComplete}
            collapseComplete={simulation.collapseComplete}
            airports={simulation.airports}
            simulationTime={displayedSimulationTime}
            simulationK={simulation.simulationK}
            onStartDateChange={simulation.setStartDate}
            onFilterChange={handleFilterChange}
            onToggleChange={handleToggleChange}
            onAddShipment={() => setShowAddShipment(true)}
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
              airports={mapAirports}
              flights={mapFlights}
              shipments={mapShipments}
              selectedEntity={selectedEntity}
              onSelectAirport={handleSelectAirport}
              onSelectFlight={handleSelectFlight}
              onSelectShipment={handleSelectShipment}
              toggles={toggles}
              simClockRef={simulation.simClockRef}
              activeFlights={mapActiveFlights}
              flightPlanFlights={mapFlightPlanFlights}
              isExpanded={mapExpanded}
              onToggleExpanded={() => setMapExpanded(v => !v)}
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

            {/* ==== RELOJ DUAL: Tiempo simulado + real ==== */}
            {(simulation.isRunning || simulation.mode === '5day') && (
              <div style={{
                position: 'absolute', top: 12, left: 12,
                display: 'flex', flexDirection: 'column', gap: 6,
                zIndex: 10,
              }}>
                {/* Reloj simulado */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', borderRadius: 10,
                  background: 'rgba(13,30,56,0.95)',
                  border: '1px solid rgba(77,166,255,0.35)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4DA6FF', boxShadow: '0 0 6px #4DA6FF', animation: simulation.isRunning ? 'pulse 2s infinite' : 'none' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 9, color: '#4A6080', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Tiempo simulado · K={simulation.simulationK}×</span>
                    <span style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color: '#E2E8F8', letterSpacing: '0.05em' }}>
                      {simClockDisplay.date}
                      {' '}
                      <span style={{ color: '#4DA6FF' }}>
                        {simClockDisplay.time}
                      </span>
                    </span>
                  </div>
                  {simulation.mode === '5day' && simulation.daysElapsed > 0 && (
                    <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: 9, color: '#4A6080' }}>Día {Math.min(Math.ceil(simulation.daysElapsed), 5)}/5</span>
                      <div style={{ width: 48, height: 3, background: '#1E3058', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${(simulation.daysElapsed / 5) * 100}%`, height: '100%', background: '#4DA6FF', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}
                </div>
                {/* Reloj real */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 12px', borderRadius: 8,
                  background: 'rgba(13,30,56,0.80)',
                  border: '1px solid rgba(30,48,88,0.8)',
                  backdropFilter: 'blur(4px)',
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4A6080' }} />
                  <div>
                    <span style={{ fontSize: 9, color: '#4A6080', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Hora real · </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6080A0' }}>
                      {realClock.toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Preparando simulación — antes del primer ciclo del backend */}
            {simulation.isRunning && !simulation.lastCycleUpdate && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[#0D1E38]/95 border border-[#4DA6FF]/40 backdrop-blur-sm shadow-2xl">
                  <div className="w-4 h-4 rounded-full border-2 border-[#4DA6FF]/30 border-t-[#4DA6FF] animate-spin" />
                  <div className="flex flex-col">
                    <span className="text-xs text-[#C8D8F0]" style={{ fontWeight: 600 }}>Preparando simulación…</span>
                    <span className="text-[10px] text-[#4A6080]">Cargando datos y ejecutando la primera planificación</span>
                  </div>
                </div>
              </div>
            )}

            {/* Collapse progress overlay on map */}
            {simulation.mode === 'collapse' && simulation.isRunning && (
              <div className="absolute top-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0D1E38]/90 border border-[#FF4D4D]/30 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D] animate-pulse" />
                <span className="text-[11px] text-[#FF4D4D]">ESCENARIO COLAPSADO</span>
                <span className="text-[11px] font-mono text-[#4A6080]">Degradando red…</span>
              </div>
            )}

            {/* Collapse complete banner */}
            {simulation.collapseComplete && simulation.mode === 'collapse' && !showCollapseResults && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/50 backdrop-blur-sm">
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
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/50 backdrop-blur-sm">
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

            {/* Map entity filter indicator — permite quitar el filtro del mapa */}
            {mapFilter && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 backdrop-blur-sm">
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
            {(filters.airline || filters.origin || filters.destination) && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#4DA6FF]/15 border border-[#4DA6FF]/30 backdrop-blur-sm">
                <span className="text-[11px] text-[#4DA6FF]">
                  Filtros activos: {[
                    filters.airline,
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
              selectedEntity={selectedEntity}
              airports={simulation.airports}
              flights={simulation.flights}
              shipments={simulation.shipments}
              onClearSelection={() => { setSelectedEntity(null); setMapFilter(null); }}
              onSelectShipment={handleSelectShipment}
              onSelectFlight={handleSelectFlight}
              onSelectAirport={handleSelectAirport}
              isRunning={simulation.isRunning}
              mode={simulation.mode}
              activeFlights={filteredActiveFlights}
              flightPlanFlights={filteredFlightPlanFlights}
              lastCycleUpdate={simulation.lastCycleUpdate}
            />
          )}
        </div>

        {/* Right Panel */}
        {!hidePanels && !rightCollapsed && (
          <RightPanel
            simulationId={simulation.simulationId}
            airports={simulation.airports}
            flights={simulation.flights}
            shipments={simulation.shipments}
            events={simulation.events}
            isRunning={simulation.isRunning}
            simulationTime={displayedSimulationTime}
            mode={simulation.mode}
            activeFlights={filteredActiveFlights}
            flightPlanFlights={filteredFlightPlanFlights}
            lastCycleUpdate={simulation.lastCycleUpdate}
            activeMapFilter={mapFilter}
            onToggleMapFilter={handleToggleMapFilter}
            onSelectAirport={handleSelectAirport}
            onSelectFlight={handleSelectFlight}
            onSelectShipment={handleSelectShipment}
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
          flightPlanFlights={filteredFlightPlanFlights.length > 0 ? filteredFlightPlanFlights : simulation.flightPlanFlights}
          activeFlights={filteredActiveFlights.length > 0 ? filteredActiveFlights : simulation.activeFlights}
          defaultDay={formatApiDate(displayedSimulationTime)}
        />
      )}

      {showStaticDataUpload && (
        <StaticDataUploadModal
          onClose={() => setShowStaticDataUpload(false)}
          onUpload={simulation.uploadStaticData}
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