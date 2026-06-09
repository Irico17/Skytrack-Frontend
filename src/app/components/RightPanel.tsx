import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Package, AlertTriangle, Warehouse,
  Clock, FileText, Zap, CheckCircle, Activity,
  Plane, Search, ArrowUpDown, MapPin, Luggage
} from 'lucide-react';
import { Airport, Flight, Shipment, SimEvent, getStatusColor, getOccupancyPercent } from '../data/mockData';
import type { BackendActiveFlight, BackendCycleUpdate, BackendFlightPlanFlight } from '../types/backend';

interface MapEntityFilter {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

interface RightPanelProps {
  airports: Airport[];
  flights: Flight[];
  shipments: Shipment[];
  events: SimEvent[];
  isRunning: boolean;
  simulationTime: Date;
  mode?: string;
  activeFlights?: BackendActiveFlight[];
  flightPlanFlights?: BackendFlightPlanFlight[];
  lastCycleUpdate?: BackendCycleUpdate | null;
  activeMapFilter?: MapEntityFilter | null;
  onToggleMapFilter?: (filter: MapEntityFilter) => void;
  onSelectAirport?: (id: string) => void;
  onSelectFlight?: (id: string) => void;
  onSelectShipment?: (id: string) => void;
}

function KPICard({ label, value, unit, color, icon, trend, trendDir }: {
  label: string; value: number | string; unit?: string;
  color: string; icon: React.ReactNode; trend?: string; trendDir?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.08em' }}>{label}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl" style={{ fontWeight: 700, color }}>{value}</span>
        {unit && <span className="text-[11px] text-[#4A6080]">{unit}</span>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-1 text-[10px]
          ${trendDir === 'up' ? 'text-[#00FF9C]' : trendDir === 'down' ? 'text-[#FF4D4D]' : 'text-[#4A6080]'}`}>
          {trendDir === 'up' ? <TrendingUp className="w-3 h-3" /> : trendDir === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
          {trend}
        </div>
      )}
    </div>
  );
}

function TrafficLight({ label, value, max, thresholdWarn, thresholdCrit }: {
  label: string; value: number; max: number; thresholdWarn: number; thresholdCrit: number;
}) {
  const pct = Math.round((value / max) * 100);
  const status = pct >= thresholdCrit ? 'critical' : pct >= thresholdWarn ? 'warning' : 'normal';
  const color = status === 'critical' ? '#FF4D4D' : status === 'warning' ? '#FFC857' : '#00FF9C';

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#1E3058]/50">
      <div className="flex flex-col gap-1">
        <div className={`w-3 h-3 rounded-full ${status === 'normal' ? 'opacity-100' : 'opacity-20'}`} style={{ backgroundColor: '#00FF9C' }} />
        <div className={`w-3 h-3 rounded-full ${status === 'warning' ? 'opacity-100' : 'opacity-20'}`} style={{ backgroundColor: '#FFC857' }} />
        <div className={`w-3 h-3 rounded-full ${status === 'critical' ? 'opacity-100 animate-pulse' : 'opacity-20'}`} style={{ backgroundColor: '#FF4D4D' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#A8C0E0]" style={{ fontWeight: 500 }}>{label}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
          </div>
          <span className="text-[11px] font-mono" style={{ color }}>{pct}%</span>
        </div>
        <div className="text-[10px] text-[#4A6080] mt-0.5">{value} / {max}</div>
      </div>
    </div>
  );
}

const CUSTOM_TOOLTIP_STYLE = {
  backgroundColor: '#0D1E38',
  border: '1px solid #1E3058',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '11px',
  color: '#C8D8F0',
};

const DASH = '—';
const VISIBLE_OPERATIONAL_ROWS = 80;

function ReportRow({ label, value, color = '#C8D8F0' }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1E3058]/40">
      <span className="text-[11px] text-[#4A6080]">{label}</span>
      <span className="text-[11px]" style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CustomBarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const color = val >= 90 ? '#FF4D4D' : val >= 70 ? '#FFC857' : '#00FF9C';
  return (
    <div style={CUSTOM_TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ color }}>{val}% ocupación</div>
    </div>
  );
}

export function RightPanel({
  airports, flights, shipments, events, isRunning, simulationTime,
  mode, activeFlights = [], flightPlanFlights = [], lastCycleUpdate = null,
  activeMapFilter = null, onToggleMapFilter,
  onSelectAirport, onSelectFlight, onSelectShipment,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'kpi' | 'transport' | 'warehouse' | 'shipments' | 'reports'>('kpi');
  const [opsSearch, setOpsSearch] = useState('');
  const [transportSort, setTransportSort] = useState<'load' | 'departure' | 'route'>('load');
  const [shipmentSort, setShipmentSort] = useState<'progress' | 'bags' | 'route'>('progress');
  const isBackendStatsMode = mode === '5day' || mode === 'realtime';
  const hasBackendStats = isBackendStatsMode && lastCycleUpdate != null;
  const backendMetrics = hasBackendStats ? lastCycleUpdate?.operationalMetrics : undefined;

  // KPI calculations
  const totalInTransit = isBackendStatsMode ? backendMetrics?.inFlightBags ?? DASH : shipments.filter(s => s.progress < 1).length;
  const delayedCount = hasBackendStats ? lastCycleUpdate!.batchSummary.delayed : isBackendStatsMode ? 0 : shipments.filter(s => s.status === 'delayed').length;
  const criticalCount = hasBackendStats ? backendMetrics?.overloadedAirports ?? airports.filter(a => a.status === 'critical').length : isBackendStatsMode ? 0 : shipments.filter(s => s.status === 'critical').length;
  const onTimeCount = hasBackendStats ? lastCycleUpdate!.batchSummary.onTime : isBackendStatsMode ? 0 : shipments.filter(s => s.status === 'on-time').length;
  const totalBags = isBackendStatsMode ? backendMetrics?.totalAssignedBags ?? lastCycleUpdate?.totalBags ?? DASH : shipments.reduce((acc, s) => acc + s.luggageCount, 0);
  const deliveredBags = isBackendStatsMode ? backendMetrics?.deliveredBags ?? DASH : shipments.filter(s => s.progress >= 1).reduce((acc, s) => acc + s.luggageCount, 0);
  const pendingBags = isBackendStatsMode ? backendMetrics?.pendingDeliveryBags ?? DASH : shipments.filter(s => s.progress < 1).reduce((acc, s) => acc + s.luggageCount, 0);
  const storedBags = isBackendStatsMode ? backendMetrics?.storedBags ?? DASH : airports.reduce((acc, a) => acc + a.occupancy, 0);
  const replanCount: number | string = isBackendStatsMode ? DASH : shipments.filter(s => s.isReplanned).length;

  const backendSlaTotal = lastCycleUpdate
    ? lastCycleUpdate.batchSummary.onTime + lastCycleUpdate.batchSummary.delayed
    : 0;
  const backendVisibleTotal = lastCycleUpdate
    ? lastCycleUpdate.batchSummary.onTime + lastCycleUpdate.batchSummary.delayed + lastCycleUpdate.batchSummary.unrouted
    : 0;
  const punctualityPct = hasBackendStats
    ? Math.round((onTimeCount / Math.max(backendSlaTotal, 1)) * 100)
    : Math.round((onTimeCount / Math.max(shipments.length, 1)) * 100);
  const avgOccupancy = airports.length > 0
    ? Math.round(airports.reduce((acc, a) => acc + getOccupancyPercent(a.occupancy, a.capacity), 0) / airports.length)
    : 0;
  const criticalAirports = useMemo(() => airports.filter(a => a.status === 'critical'), [airports]);
  const criticalFlights = useMemo(
    () => hasBackendStats ? activeFlights.filter(f => !f.meetsSla) : flights.filter(f => f.status === 'critical'),
    [hasBackendStats, activeFlights, flights]
  );

  // Warehouse data for chart
  const warehouseData = useMemo(() => airports
    .map(a => ({ id: a.id, pct: getOccupancyPercent(a.occupancy, a.capacity), occupancy: a.occupancy, capacity: a.capacity }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8), [airports]);

  // Shipment status distribution
  const statusData = useMemo(() => hasBackendStats
    ? [
        { name: 'A Tiempo', value: onTimeCount, color: '#00FF9C' },
        { name: 'Retrasado', value: delayedCount, color: '#FFC857' },
        { name: 'Sin ruta', value: lastCycleUpdate!.batchSummary.unrouted, color: '#FF4D4D' },
      ].filter(d => d.value > 0)
    : [
        { name: 'A Tiempo', value: onTimeCount, color: '#00FF9C' },
        { name: 'Retrasado', value: delayedCount, color: '#FFC857' },
        { name: 'Crítico', value: criticalCount, color: '#FF4D4D' },
      ].filter(d => d.value > 0), [hasBackendStats, onTimeCount, delayedCount, criticalCount, lastCycleUpdate]);

  const tabs = [
    { id: 'kpi' as const, label: 'KPIs', icon: <Activity className="w-3 h-3" /> },
    { id: 'transport' as const, label: 'UT', icon: <Plane className="w-3 h-3" /> },
    { id: 'warehouse' as const, label: 'Almacén', icon: <Warehouse className="w-3 h-3" /> },
    { id: 'shipments' as const, label: 'Envíos', icon: <Luggage className="w-3 h-3" /> },
    { id: 'reports' as const, label: 'Reportes', icon: <FileText className="w-3 h-3" /> },
  ];

  const recentEvents = useMemo(() => events.slice(0, 6), [events]);
  const recentReplanned = useMemo(() => shipments.filter(s => s.isReplanned), [shipments]);
  const sortedAirports = useMemo(() => [...airports]
    .sort((a, b) => getOccupancyPercent(b.occupancy, b.capacity) - getOccupancyPercent(a.occupancy, a.capacity)), [airports]);

  const activeBagsByFlight = useMemo(() => {
    const map = new Map<string, BackendActiveFlight>();
    activeFlights.forEach(f => map.set(f.flightId, f));
    return map;
  }, [activeFlights]);

  const transportUnits = useMemo(() => {
    if (activeTab !== 'transport') return [];

    const base = flightPlanFlights.length > 0
      ? flightPlanFlights.map(f => {
          const active = activeBagsByFlight.get(f.flightId);
          const bags = active?.bagsCount ?? 0;
          const pct = f.capacity > 0 ? Math.round((bags / f.capacity) * 100) : 0;
          return {
            flightId: f.flightId,
            originId: f.originId,
            destinationId: f.destinationId,
            departureTime: f.departureTime,
            arrivalTime: f.arrivalTime,
            capacity: f.capacity,
            bags,
            pct,
            meetsSla: active?.meetsSla ?? true,
            empty: bags === 0,
          };
        })
      : activeFlights.map(f => ({
          flightId: f.flightId,
          originId: f.originId,
          destinationId: f.destinationId,
          departureTime: f.departureTime,
          arrivalTime: f.arrivalTime,
          capacity: 0,
          bags: f.bagsCount,
          pct: 0,
          meetsSla: f.meetsSla,
          empty: f.bagsCount === 0,
        }));

    const query = opsSearch.trim().toLowerCase();
    return base
      .filter(f => !query || `${f.flightId} ${f.originId} ${f.destinationId}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (transportSort === 'departure') return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
        if (transportSort === 'route') return `${a.originId}-${a.destinationId}`.localeCompare(`${b.originId}-${b.destinationId}`);
        return b.bags - a.bags;
      });
  }, [activeTab, flightPlanFlights, activeFlights, activeBagsByFlight, opsSearch, transportSort]);

  const operationalShipments = useMemo(() => {
    if (activeTab !== 'shipments') return [];

    const query = opsSearch.trim().toLowerCase();
    return shipments
      .filter(s => !query || `${s.id} ${s.origin} ${s.destination} ${s.airlineId}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (shipmentSort === 'bags') return b.luggageCount - a.luggageCount;
        if (shipmentSort === 'route') return `${a.origin}-${a.destination}`.localeCompare(`${b.origin}-${b.destination}`);
        return a.progress - b.progress;
      });
  }, [activeTab, shipments, opsSearch, shipmentSort]);

  const luggageByClient = useMemo(() => {
    if (activeTab !== 'shipments') return [];

    const byClient = new Map<string, { clientId: string; shipmentCount: number; luggageCount: number }>();
    for (const shipment of operationalShipments) {
      const clientId = shipment.airlineId || shipment.airline || 'Cliente';
      const current = byClient.get(clientId) ?? { clientId, shipmentCount: 0, luggageCount: 0 };
      current.shipmentCount += 1;
      current.luggageCount += shipment.luggageCount;
      byClient.set(clientId, current);
    }
    return Array.from(byClient.values())
      .sort((a, b) => b.luggageCount - a.luggageCount)
      .slice(0, 6);
  }, [activeTab, operationalShipments]);

  const isFilterActive = (type: MapEntityFilter['type'], id: string) =>
    activeMapFilter?.type === type && activeMapFilter.id === id;

  const handleMapFilterClick = (filter: MapEntityFilter, fallback?: () => void) => {
    if (onToggleMapFilter) {
      onToggleMapFilter(filter);
    } else {
      fallback?.();
    }
  };

  const mapFilterButtonClass = (active: boolean, size = 'w-7 h-7') => `${size} rounded-lg border flex items-center justify-center transition-colors ${
    active
      ? 'bg-[#4DA6FF]/20 border-[#4DA6FF] text-[#4DA6FF]'
      : 'bg-[#0D1E38] border-[#1E3058] text-[#A8C0E0] hover:text-[#4DA6FF] hover:border-[#4DA6FF]/50'
  }`;

  return (
    <div className="w-80 bg-[#080F1E] border-l border-[#1E3058] flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[#1E3058] px-2 pt-2 gap-1 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] rounded-t-lg transition-colors whitespace-nowrap
              ${activeTab === tab.id
                ? 'text-[#4DA6FF] border-b-2 border-[#4DA6FF] bg-[#4DA6FF]/5'
                : 'text-[#4A6080] hover:text-[#A8C0E0]'
              }`}
            style={{ fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* KPI Tab */}
        {activeTab === 'kpi' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <KPICard
                label={hasBackendStats ? 'MALETAS EN VUELO' : 'EN TRÁNSITO'}
                value={totalInTransit}
                color="#4DA6FF"
                icon={<Package className="w-3.5 h-3.5" />}
                trend={typeof totalBags === 'number' ? `${totalBags.toLocaleString()} maletas asignadas` : undefined}
                trendDir="neutral"
              />
              <KPICard
                label="ENTREGADAS"
                value={deliveredBags}
                color="#00FF9C"
                icon={<CheckCircle className="w-3.5 h-3.5" />}
                trend={hasBackendStats ? 'Llegada a destino confirmada' : undefined}
                trendDir="up"
              />
              <KPICard
                label="POR ENTREGAR"
                value={pendingBags}
                color={delayedCount > 0 ? '#FFC857' : '#00FF9C'}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                trend={hasBackendStats ? `${delayedCount} rutas fuera de SLA` : undefined}
                trendDir={delayedCount > 0 ? 'down' : 'neutral'}
              />
              <KPICard
                label="EN ALMACÉN"
                value={storedBags}
                color={criticalCount > 0 ? '#FF4D4D' : '#00FF9C'}
                icon={<Warehouse className="w-3.5 h-3.5" />}
                trend={hasBackendStats ? `${criticalCount} aeropuertos sobre capacidad` : undefined}
                trendDir={criticalCount > 0 ? 'down' : 'up'}
              />
              <KPICard
                label="PUNTUALIDAD"
                value={punctualityPct}
                unit="%"
                color={punctualityPct >= 85 ? '#00FF9C' : punctualityPct >= 70 ? '#FFC857' : '#FF4D4D'}
                icon={<Clock className="w-3.5 h-3.5" />}
                trend={`${onTimeCount}/${Math.max(hasBackendStats ? backendSlaTotal : shipments.length, 1)} rutas SLA ok`}
                trendDir={punctualityPct >= 85 ? 'up' : 'down'}
              />
              <KPICard
                label="TOTAL MALETAS"
                value={typeof totalBags === 'number' ? totalBags.toLocaleString() : totalBags}
                color="#A8C0E0"
                icon={<Zap className="w-3.5 h-3.5" />}
                trend={hasBackendStats ? `${lastCycleUpdate!.totalRoutes} rutas asignadas` : undefined}
                trendDir="neutral"
              />
            </div>

            {/* Traffic Lights */}
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="text-[10px] text-[#4A6080] mb-3" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                INDICADORES DE SEMÁFORO
              </div>
              <TrafficLight
                label="Ocupación Promedio de Almacén"
                value={avgOccupancy}
                max={100}
                thresholdWarn={70}
                thresholdCrit={90}
              />
              <TrafficLight
                label="Puntualidad de Entrega"
                value={100 - punctualityPct}
                max={100}
                thresholdWarn={15}
                thresholdCrit={30}
              />
              <TrafficLight
                label="Envíos Críticos"
                value={criticalCount}
                max={Math.max(hasBackendStats ? backendVisibleTotal : shipments.length, 1)}
                thresholdWarn={5}
                thresholdCrit={15}
              />
              <TrafficLight
                label={hasBackendStats ? 'Vuelos con Riesgo SLA' : 'Sobrecapacidad de Vuelos'}
                value={criticalFlights.length}
                max={Math.max(hasBackendStats ? activeFlights.length : flights.length, 1)}
                thresholdWarn={10}
                thresholdCrit={25}
              />
              {hasBackendStats && (
                <ReportRow label="Sobrecapacidad de vuelos" value={DASH} color="#4A6080" />
              )}
            </div>

            {/* Shipment status donut */}
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                ESTADO DE ENVÍOS
              </div>
              <div className="flex items-center gap-3">
                <div style={{ width: 90, height: 90 }}>
                  <PieChart width={90} height={90}>
                    <Pie
                      data={statusData}
                      cx={40}
                      cy={40}
                      innerRadius={26}
                      outerRadius={40}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {statusData.map((entry) => (
                        <Cell key={`pie-cell-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
                <div className="flex flex-col gap-1.5">
                  {statusData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-[11px] text-[#A8C0E0]">{d.name}</span>
                      <span className="text-[11px] ml-auto" style={{ color: d.color, fontWeight: 600 }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent events */}
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                EVENTOS RECIENTES
              </div>
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                {recentEvents.map(event => (
                  <div key={event.id} className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0
                      ${event.severity === 'critical' ? 'bg-[#FF4D4D]' :
                        event.severity === 'warning' ? 'bg-[#FFC857]' : 'bg-[#4DA6FF]'}`} />
                    <div>
                      <p className="text-[10px] text-[#A8C0E0] leading-relaxed">{event.message}</p>
                      <p className="text-[9px] text-[#3A5070] mt-0.5">
                        {event.time.toLocaleTimeString('es-ES', { hour12: false })}
                      </p>
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-[11px] text-[#3A5070]">No hay eventos registrados</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Transport Units Tab */}
        {activeTab === 'transport' && (
          <>
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[#4A6080]" />
                  <input
                    value={opsSearch}
                    onChange={e => setOpsSearch(e.target.value)}
                    placeholder="Buscar UT o ruta"
                    className="w-full h-8 rounded-lg bg-[#081426] border border-[#1E3058] pl-7 pr-2 text-[11px] text-[#C8D8F0] outline-none focus:border-[#4DA6FF]/60"
                  />
                </div>
                <button
                  onClick={() => setTransportSort(prev => prev === 'load' ? 'departure' : prev === 'departure' ? 'route' : 'load')}
                  className="w-8 h-8 rounded-lg bg-[#081426] border border-[#1E3058] text-[#A8C0E0] flex items-center justify-center hover:border-[#4DA6FF]/60"
                  title={`Orden: ${transportSort}`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                UNIDADES DE TRANSPORTE · {transportUnits.length}
              </div>
              <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2">
                {transportUnits.slice(0, VISIBLE_OPERATIONAL_ROWS).map(unit => {
                  const color = !unit.meetsSla ? '#FFC857' : unit.pct >= 90 ? '#FF4D4D' : unit.pct >= 70 ? '#FFC857' : unit.empty ? '#4A6080' : '#00FF9C';
                  const departure = new Date(unit.departureTime).toISOString().slice(11, 16);
                  const arrival = new Date(unit.arrivalTime).toISOString().slice(11, 16);
                  const active = isFilterActive('flight', unit.flightId);
                  return (
                    <div key={unit.flightId} className="rounded-lg border border-[#1E3058] bg-[#081426] p-2 hover:border-[#4DA6FF]/40 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{unit.flightId}</span>
                            {unit.empty && <span className="text-[9px] text-[#4A6080] border border-[#1E3058] rounded px-1">VACÍO</span>}
                            {!unit.meetsSla && <span className="text-[9px] text-[#FFC857] border border-[#FFC857]/30 rounded px-1">SLA</span>}
                          </div>
                          <div className="text-[10px] text-[#4A6080] mt-0.5">{unit.originId} → {unit.destinationId} · {departure}-{arrival}</div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
                              <div className="h-full rounded" style={{ width: `${Math.min(unit.pct, 100)}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-[10px] font-mono" style={{ color }}>{unit.capacity > 0 ? `${unit.bags}/${unit.capacity}` : `${unit.bags}`}</span>
                          </div>
                          <div className="text-[10px] text-[#4A6080] mt-1">Producto virtual: {unit.flightId}-B0001</div>
                        </div>
                        <button
                          onClick={() => handleMapFilterClick({ type: 'flight', id: unit.flightId }, () => onSelectFlight?.(unit.flightId))}
                          className={mapFilterButtonClass(active)}
                          title={active ? 'Quitar filtro del mapa' : 'Filtrar UT en mapa'}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {transportUnits.length === 0 && (
                  <div className="text-[11px] text-[#4A6080] px-2 py-4">Sin unidades que coincidan con el filtro</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Shipments Tab */}
        {activeTab === 'shipments' && (
          <>
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[#4A6080]" />
                  <input
                    value={opsSearch}
                    onChange={e => setOpsSearch(e.target.value)}
                    placeholder="Buscar envío, cliente o ruta"
                    className="w-full h-8 rounded-lg bg-[#081426] border border-[#1E3058] pl-7 pr-2 text-[11px] text-[#C8D8F0] outline-none focus:border-[#4DA6FF]/60"
                  />
                </div>
                <button
                  onClick={() => setShipmentSort(prev => prev === 'progress' ? 'bags' : prev === 'bags' ? 'route' : 'progress')}
                  className="w-8 h-8 rounded-lg bg-[#081426] border border-[#1E3058] text-[#A8C0E0] flex items-center justify-center hover:border-[#4DA6FF]/60"
                  title={`Orden: ${shipmentSort}`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <ReportRow label="Planificados" value={lastCycleUpdate?.batchSummary.unrouted ?? 0} color="#FFC857" />
                <ReportRow label="En vuelo" value={backendMetrics?.inFlightBags ?? 0} color="#4DA6FF" />
                <ReportRow label="Entregados" value={backendMetrics?.deliveredBags ?? 0} color="#00FF9C" />
              </div>
              {luggageByClient.length > 0 && (
                <div className="mb-3 rounded-lg border border-[#1E3058] bg-[#081426] p-2">
                  <div className="text-[10px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                    MALETAS POR CLIENTE
                  </div>
                  <div className="flex flex-col gap-1">
                    {luggageByClient.map(client => (
                      <div key={client.clientId} className="flex items-center gap-2 text-[10px]">
                        <span className="w-16 truncate text-[#A8C0E0]" style={{ fontWeight: 600 }}>{client.clientId}</span>
                        <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
                          <div
                            className="h-full rounded bg-[#4DA6FF]"
                            style={{ width: `${Math.max(4, Math.min(100, (client.luggageCount / Math.max(luggageByClient[0].luggageCount, 1)) * 100))}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-[#4DA6FF] font-mono">{client.luggageCount}</span>
                        <span className="w-16 text-right text-[#4A6080]">{client.shipmentCount} env.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                ENVÍOS Y PRODUCTOS · {operationalShipments.length}
              </div>
              <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2">
                {operationalShipments.slice(0, VISIBLE_OPERATIONAL_ROWS).map(shipment => {
                  const color = getStatusColor(shipment.status);
                  const productRange = shipment.luggageCount > 1
                    ? `${shipment.id}-B0001…B${String(shipment.luggageCount).padStart(4, '0')}`
                    : `${shipment.id}-B0001`;
                  const active = isFilterActive('shipment', shipment.id);
                  return (
                    <div key={shipment.id} className="rounded-lg border border-[#1E3058] bg-[#081426] p-2 hover:border-[#4DA6FF]/40 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{shipment.id}</span>
                            <span className="text-[9px] text-[#4A6080] border border-[#1E3058] rounded px-1">{shipment.luggageCount} maletas</span>
                          </div>
                          <div className="text-[10px] text-[#4A6080] mt-0.5">{shipment.origin} → {shipment.destination} · {shipment.currentFlightId}</div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
                              <div className="h-full rounded" style={{ width: `${Math.round(shipment.progress * 100)}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-[10px] font-mono" style={{ color }}>{Math.round(shipment.progress * 100)}%</span>
                          </div>
                          <div className="text-[10px] text-[#4A6080] mt-1 truncate">Maletas virtuales: {productRange}</div>
                        </div>
                        <button
                          onClick={() => handleMapFilterClick({ type: 'shipment', id: shipment.id }, () => onSelectShipment?.(shipment.id))}
                          className={mapFilterButtonClass(active)}
                          title={active ? 'Quitar filtro del mapa' : 'Filtrar envío en mapa'}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {operationalShipments.length === 0 && (
                  <div className="text-[11px] text-[#4A6080] px-2 py-4">
                    {hasBackendStats ? 'La lista detallada se carga desde la solución cuando el ciclo termina.' : 'Sin envíos que coincidan con el filtro'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Warehouse Tab */}
        {activeTab === 'warehouse' && (
          <>
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="text-[10px] text-[#4A6080] mb-3" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                OCUPACIÓN DE ALMACÉN POR AEROPUERTO
              </div>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={warehouseData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={12}>
                    <XAxis dataKey="id" tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <ReTooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(77,166,255,0.05)' }} />
                    <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                      {warehouseData.map((entry) => (
                        <Cell
                          key={`bar-cell-${entry.id}`}
                          fill={entry.pct >= 90 ? '#FF4D4D' : entry.pct >= 70 ? '#FFC857' : '#00FF9C'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Critical airports */}
            {criticalAirports.length > 0 && (
              <div className="bg-[#FF4D4D]/8 rounded-xl p-3 border border-[#FF4D4D]/20">
                <div className="text-[10px] text-[#FF4D4D] mb-2 flex items-center gap-1.5" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                  <AlertTriangle className="w-3 h-3" />
                  ALERTAS DE SOBREECAPACIDAD
                </div>
                {criticalAirports.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-[#FF4D4D]/10">
                    <div>
                      <span className="text-[11px] text-[#FF4D4D]" style={{ fontWeight: 600 }}>{a.id}</span>
                      <span className="text-[11px] text-[#4A6080] ml-1">{a.city}</span>
                    </div>
                    <span className="text-[11px] text-[#FF4D4D]" style={{ fontWeight: 600 }}>
                      {getOccupancyPercent(a.occupancy, a.capacity)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* All airports occupancy list */}
            <div className="bg-[#0D1E38] rounded-xl border border-[#1E3058] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1E3058]">
                <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>TODOS LOS AEROPUERTOS</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {sortedAirports.map(a => {
                    const pct = getOccupancyPercent(a.occupancy, a.capacity);
                    const color = getStatusColor(a.status);
                  const active = isFilterActive('airport', a.id);
                    return (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-b border-[#1E3058]/40 hover:bg-[#1A2E4A]/30">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[11px] text-[#A8C0E0] w-8" style={{ fontWeight: 600 }}>{a.id}</span>
                        <span className="text-[10px] text-[#4A6080] flex-1 truncate">{a.city}</span>
                        <div className="w-16 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-[11px] font-mono w-8 text-right" style={{ color }}>{pct}%</span>
                        <button
                          onClick={() => handleMapFilterClick({ type: 'airport', id: a.id }, () => onSelectAirport?.(a.id))}
                          className={mapFilterButtonClass(active, 'w-6 h-6')}
                          title={active ? 'Quitar filtro del mapa' : 'Filtrar almacén en mapa'}
                        >
                          <MapPin className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <>
            {/* Daily summary */}
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                REPORTE DIARIO — {simulationTime.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: hasBackendStats ? 'Rutas Planificadas' : 'Total Envíos', value: hasBackendStats ? lastCycleUpdate!.totalRoutes : shipments.length, color: '#4DA6FF' },
                  { label: hasBackendStats ? 'Lotes a Tiempo' : 'Completados', value: hasBackendStats ? onTimeCount : shipments.filter(s => s.progress >= 1).length, color: '#00FF9C' },
                  { label: hasBackendStats ? 'Maletas en Vuelo' : 'En Tránsito', value: totalInTransit, color: '#A8C0E0' },
                  { label: 'Maletas Entregadas', value: deliveredBags, color: '#00FF9C' },
                  { label: 'Maletas por Entregar', value: pendingBags, color: '#FFC857' },
                  { label: 'Maletas en Almacén', value: storedBags, color: '#4DA6FF' },
                  { label: 'Retrasados', value: delayedCount, color: '#FFC857' },
                  { label: hasBackendStats ? 'Aeropuertos Sobrecap.' : 'Críticos', value: criticalCount, color: '#FF4D4D' },
                  { label: 'Replanificados', value: replanCount, color: '#A855F7' },
                  { label: 'Total Maletas', value: typeof totalBags === 'number' ? totalBags.toLocaleString() : totalBags, color: '#4DA6FF' },
                  { label: 'Ocupación Prom.', value: `${avgOccupancy}%`, color: getStatusColor(avgOccupancy >= 90 ? 'critical' : avgOccupancy >= 70 ? 'warning' : 'normal') },
                  { label: 'Pico de Aeropuerto', value: backendMetrics?.peakAirportId ? `${backendMetrics.peakAirportId} · ${Math.round(backendMetrics.peakAirportOccupancyRatio * 100)}%` : DASH, color: backendMetrics?.peakAirportId ? '#4DA6FF' : '#4A6080' },
                ].map(row => (
                  <ReportRow key={row.label} label={row.label} value={row.value} color={row.color} />
                ))}
              </div>
            </div>

            {/* Travel plans */}
            <div className="bg-[#0D1E38] rounded-xl border border-[#1E3058] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1E3058] flex items-center gap-2">
                <FileText className="w-3 h-3 text-[#4DA6FF]" />
                <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>PLANES DE VUELO</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {isBackendStatsMode ? flightPlanFlights.slice(0, 80).map(f => (
                  <div key={f.flightId} className="flex items-center justify-between px-3 py-2 border-b border-[#1E3058]/30 hover:bg-[#1A2E4A]/30">
                    <div>
                      <span className="text-[11px] text-[#A8C0E0]" style={{ fontWeight: 500 }}>{f.flightId}</span>
                      <div className="text-[10px] text-[#4A6080]">{f.originId} → {f.destinationId} · {new Date(f.departureTime).toISOString().slice(11, 16)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-[#4A6080]">{DASH}</div>
                      <div className="text-[10px] text-[#4A6080]">cap. {f.capacity}</div>
                    </div>
                  </div>
                )) : flights.map(f => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2 border-b border-[#1E3058]/30 hover:bg-[#1A2E4A]/30">
                    <div>
                      <span className="text-[11px] text-[#A8C0E0]" style={{ fontWeight: 500 }}>{f.flightNumber}</span>
                      <div className="text-[10px] text-[#4A6080]">{f.from} → {f.to} · {f.departureTime}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px]" style={{ color: getStatusColor(f.status) }}>{Math.round((f.load / f.capacity) * 100)}%</div>
                      <div className="text-[10px] text-[#4A6080]">{f.load}/{f.capacity}</div>
                    </div>
                  </div>
                ))}
                {isBackendStatsMode && flightPlanFlights.length === 0 && (
                  <div className="text-[11px] text-[#3A5070] px-3 py-4">{DASH}</div>
                )}
              </div>
            </div>

            {/* Replanned shipments */}
            {hasBackendStats ? (
              <div className="bg-[#0D1E38] rounded-xl border border-[#1E3058] overflow-hidden">
                <div className="px-3 py-2 border-b border-[#1E3058] flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[#4A6080]" />
                  <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>REPLANIFICADOS</span>
                </div>
                <div className="text-[11px] text-[#4A6080] px-3 py-4">{DASH}</div>
              </div>
            ) : recentReplanned.length > 0 && (
              <div className="bg-[#A855F7]/8 rounded-xl border border-[#A855F7]/20 overflow-hidden">
                <div className="px-3 py-2 border-b border-[#A855F7]/15 flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[#A855F7]" />
                  <span className="text-[10px] text-[#A855F7]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>ENVÍOS REPLANIFICADOS</span>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {recentReplanned.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 border-b border-[#A855F7]/10">
                      <div>
                        <span className="text-[11px] text-[#A855F7]" style={{ fontWeight: 500 }}>{s.id}</span>
                        <div className="text-[10px] text-[#4A6080]">{s.origin} → {s.destination}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-[#00FF9C]" />
                        <span className="text-[10px] text-[#00FF9C]">Redirigido</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Events log */}
            <div className="bg-[#0D1E38] rounded-xl border border-[#1E3058] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1E3058]">
                <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>REGISTRO COMPLETO DE EVENTOS</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {events.map(event => (
                  <div key={event.id} className="px-3 py-2 border-b border-[#1E3058]/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                        ${event.severity === 'critical' ? 'bg-[#FF4D4D]' :
                          event.severity === 'warning' ? 'bg-[#FFC857]' : 'bg-[#4DA6FF]'}`} />
                      <span className="text-[10px] text-[#3A5070]">
                        {event.time.toLocaleTimeString('es-ES', { hour12: false })}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#7090B0] mt-0.5 leading-relaxed pl-3">{event.message}</p>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-[11px] text-[#3A5070] px-3 py-4">Aún no hay eventos registrados</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
