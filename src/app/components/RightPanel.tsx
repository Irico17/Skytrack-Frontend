import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Package, AlertTriangle, Warehouse,
  Clock, FileText, Zap, CheckCircle, Activity,
  Plane, Search, MapPin, Luggage, Users, ArrowLeft, X, ChevronDown
} from 'lucide-react';
import { Airport, Flight, Shipment, SimEvent, getStatusColor, getOccupancyPercent } from '../data/mockData';
import { getBagTraceability } from '../services/api';
import type { BackendActiveFlight, BackendBagItem, BackendBagTraceability, BackendCycleUpdate, BackendFlightPlanFlight } from '../types/backend';

interface MapEntityFilter {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

interface RightPanelProps {
  simulationId?: string | null;
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

interface TransportUnit {
  flightId: string;
  originId: string;
  destinationId: string;
  departureTime: string;
  arrivalTime: string;
  capacity: number;
  bags: number;
  pct: number;
  meetsSla: boolean;
  empty: boolean;
  inFlight: boolean;
}

type InspectorTarget =
  | { kind: 'ut'; id: string }
  | { kind: 'warehouse'; id: string }
  | { kind: 'shipment'; id: string }
  | { kind: 'client'; id: string };

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
const BAG_PAGE_SIZE = 50;
const INSPECTOR_BAG_PAGE_SIZE = 25;

const BAG_STATE_OPTIONS = [
  { id: 'ALL', label: 'Todas' },
  { id: 'PENDING_ROUTE', label: 'Sin ruta' },
  { id: 'AT_ORIGIN', label: 'Origen' },
  { id: 'AT_TRANSFER', label: 'Transfer' },
  { id: 'IN_FLIGHT', label: 'Vuelo' },
  { id: 'DELIVERED', label: 'Entregadas' },
];

const UT_FILTER_OPTIONS = [
  { id: 'all', label: 'Todas' },
  { id: 'inflight', label: 'En vuelo' },
  { id: 'loaded', label: 'Con carga' },
  { id: 'empty', label: 'Vacías' },
  { id: 'sla', label: 'Riesgo SLA' },
];

const WAREHOUSE_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'normal', label: 'Normal' },
  { id: 'warning', label: 'Advertencia' },
  { id: 'critical', label: 'Crítico' },
];

const SHIPMENT_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'on-time', label: 'A tiempo' },
  { id: 'delayed', label: 'Retrasado' },
  { id: 'critical', label: 'Crítico' },
];

const BAG_STATE_LABELS: Record<string, string> = {
  NOT_REGISTERED: 'No registrada',
  PENDING_ROUTE: 'Sin ruta',
  AT_ORIGIN: 'Almacén origen',
  AT_TRANSFER: 'Almacén transferencia',
  IN_FLIGHT: 'En vuelo',
  DELIVERED: 'Entregada',
};

const BAG_EVENT_LABELS: Record<string, string> = {
  REGISTERED: 'Registrada',
  WAREHOUSE_IN: 'Ingreso almacén',
  LOADED: 'Cargada',
  ARRIVED: 'Arribó',
  DELIVERED: 'Entregada',
};

function bagStateLabel(state: string): string {
  return BAG_STATE_LABELS[state] ?? state;
}

function bagEventLabel(type: string): string {
  return BAG_EVENT_LABELS[type] ?? type;
}

function bagStateColor(state: string): string {
  if (state === 'DELIVERED') return '#00FF9C';
  if (state === 'IN_FLIGHT') return '#4DA6FF';
  if (state === 'PENDING_ROUTE') return '#FF4D4D';
  if (state === 'AT_TRANSFER') return '#FFC857';
  return '#A8C0E0';
}

function formatTraceTime(value?: string | null): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatHourUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(11, 16);
}

function stripProjectedDaySuffix(flightId: string): string {
  return flightId.replace(/-D\d+$/, '');
}

function sameFlightId(candidate: string, selected: string): boolean {
  return candidate === selected || stripProjectedDaySuffix(candidate) === stripProjectedDaySuffix(selected);
}

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

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex-1 relative">
      <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[#4A6080]" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 rounded-lg bg-[#081426] border border-[#1E3058] pl-7 pr-2 text-[11px] text-[#C8D8F0] outline-none focus:border-[#4DA6FF]/60"
      />
    </div>
  );
}

function FilterChips({ options, value, onChange }: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {options.map(option => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={`h-7 px-2 rounded-lg border text-[10px] whitespace-nowrap transition-colors flex-shrink-0 ${active
              ? 'bg-[#4DA6FF]/15 border-[#4DA6FF] text-[#4DA6FF]'
              : 'bg-[#081426] border-[#1E3058] text-[#4A6080] hover:text-[#A8C0E0] hover:border-[#4DA6FF]/40'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SortSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative flex-shrink-0">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 rounded-lg bg-[#081426] border border-[#1E3058] pl-2 pr-6 text-[10px] text-[#A8C0E0] appearance-none outline-none focus:border-[#4DA6FF]/60 cursor-pointer"
        title="Ordenar"
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-[#0D1E38]">{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4A6080] pointer-events-none" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
      {children}
    </div>
  );
}

function UtCard({ unit, mapActive, onOpen, onMapFilter }: {
  unit: TransportUnit;
  mapActive: boolean;
  onOpen?: () => void;
  onMapFilter?: () => void;
}) {
  const color = !unit.meetsSla ? '#FFC857' : unit.pct >= 90 ? '#FF4D4D' : unit.pct >= 70 ? '#FFC857' : unit.empty ? '#4A6080' : '#00FF9C';
  return (
    <div
      onClick={onOpen}
      className={`rounded-lg border border-[#1E3058] bg-[#081426] p-2 hover:border-[#4DA6FF]/40 transition-colors ${onOpen ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{unit.flightId}</span>
            {unit.inFlight && <span className="text-[9px] text-[#4DA6FF] border border-[#4DA6FF]/30 rounded px-1">EN VUELO</span>}
            {unit.empty && <span className="text-[9px] text-[#4A6080] border border-[#1E3058] rounded px-1">VACÍO</span>}
            {!unit.meetsSla && <span className="text-[9px] text-[#FFC857] border border-[#FFC857]/30 rounded px-1">SLA</span>}
          </div>
          <div className="text-[10px] text-[#4A6080] mt-0.5">
            {unit.originId} → {unit.destinationId} · {formatHourUtc(unit.departureTime)}-{formatHourUtc(unit.arrivalTime)}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
              <div className="h-full rounded" style={{ width: `${Math.min(unit.pct, 100)}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-mono" style={{ color }}>{unit.capacity > 0 ? `${unit.bags}/${unit.capacity}` : `${unit.bags}`}</span>
          </div>
        </div>
        {onMapFilter && (
          <button
            onClick={e => { e.stopPropagation(); onMapFilter(); }}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${mapActive
              ? 'bg-[#4DA6FF]/20 border-[#4DA6FF] text-[#4DA6FF]'
              : 'bg-[#0D1E38] border-[#1E3058] text-[#A8C0E0] hover:text-[#4DA6FF] hover:border-[#4DA6FF]/50'
            }`}
            title={mapActive ? 'Quitar filtro del mapa' : 'Filtrar UT en mapa'}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ShipmentCard({ shipment, mapActive, onOpen, onMapFilter }: {
  shipment: Shipment;
  mapActive: boolean;
  onOpen?: () => void;
  onMapFilter?: () => void;
}) {
  const color = getStatusColor(shipment.status);
  return (
    <div
      onClick={onOpen}
      className={`rounded-lg border border-[#1E3058] bg-[#081426] p-2 hover:border-[#4DA6FF]/40 transition-colors ${onOpen ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{shipment.id}</span>
            <span className="text-[9px] text-[#4A6080] border border-[#1E3058] rounded px-1 flex-shrink-0">{shipment.luggageCount} maletas</span>
          </div>
          <div className="text-[10px] text-[#4A6080] mt-0.5 truncate">
            {shipment.origin} → {shipment.destination} · {shipment.currentFlightId}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
              <div className="h-full rounded" style={{ width: `${Math.round(shipment.progress * 100)}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-mono" style={{ color }}>{Math.round(shipment.progress * 100)}%</span>
          </div>
        </div>
        {onMapFilter && (
          <button
            onClick={e => { e.stopPropagation(); onMapFilter(); }}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${mapActive
              ? 'bg-[#4DA6FF]/20 border-[#4DA6FF] text-[#4DA6FF]'
              : 'bg-[#0D1E38] border-[#1E3058] text-[#A8C0E0] hover:text-[#4DA6FF] hover:border-[#4DA6FF]/50'
            }`}
            title={mapActive ? 'Quitar filtro del mapa' : 'Filtrar envío en mapa'}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Lista de maletas reutilizable (con paginación) consultando la trazabilidad del backend.
 * Permite saltar al envío / UT / cliente de cada maleta.
 */
function BagListSection({ simulationId, query, clientId, batchId, title, refreshKey, onOpenShipment, onOpenUt, onOpenClient }: {
  simulationId: string | null;
  query?: string;
  clientId?: string;
  batchId?: string;
  title: string;
  refreshKey?: number;
  onOpenShipment?: (batchId: string) => void;
  onOpenUt?: (flightId: string) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<BackendBagTraceability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('ALL');
  const [expandedBagId, setExpandedBagId] = useState<string | null>(null);

  useEffect(() => {
    setPage(0);
  }, [simulationId, query, clientId, batchId, stateFilter]);

  useEffect(() => {
    if (!simulationId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      getBagTraceability(simulationId, {
        page,
        size: INSPECTOR_BAG_PAGE_SIZE,
        query,
        clientId,
        batchId,
        state: stateFilter === 'ALL' ? undefined : stateFilter,
      })
        .then(d => { if (!cancelled) setData(d); })
        .catch(err => {
          if (cancelled) return;
          setData(null);
          setError(err instanceof Error ? err.message : 'No se pudo cargar la trazabilidad');
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [simulationId, page, query, clientId, batchId, stateFilter, refreshKey]);

  return (
    <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>{title}{data ? ` · ${data.totalItems.toLocaleString()}` : ''}</SectionLabel>
        {loading && <span className="text-[10px] text-[#4A6080]">Cargando...</span>}
      </div>

      <FilterChips options={BAG_STATE_OPTIONS} value={stateFilter} onChange={setStateFilter} />

      {!simulationId && (
        <div className="text-[11px] text-[#4A6080] px-1 py-3">Inicia o únete a una simulación para consultar las maletas</div>
      )}
      {error && <div className="text-[11px] text-[#FF4D4D] px-1 py-3">{error}</div>}

      {simulationId && data && (
        <>
          <div className="max-h-[280px] overflow-y-auto flex flex-col gap-2 mt-2">
            {data.bags.map(bag => {
              const color = bagStateColor(bag.state);
              const expanded = expandedBagId === bag.bagId;
              return (
                <div key={bag.bagId} className={`rounded-lg border bg-[#081426] transition-colors ${expanded ? 'border-[#4DA6FF]' : 'border-[#1E3058] hover:border-[#4DA6FF]/40'}`}>
                  <button
                    onClick={() => setExpandedBagId(prev => prev === bag.bagId ? null : bag.bagId)}
                    className="w-full text-left p-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{bag.bagId}</span>
                          <span className="text-[9px] border rounded px-1 flex-shrink-0" style={{ color, borderColor: `${color}55` }}>{bagStateLabel(bag.state)}</span>
                        </div>
                        <div className="text-[10px] text-[#4A6080] mt-0.5 truncate">
                          {bag.clientId} · {bag.originId} → {bag.destinationId}
                        </div>
                        <div className="text-[10px] text-[#4A6080] mt-0.5 truncate">
                          {bag.currentFlightId ? `Vuelo ${bag.currentFlightId}` : `Almacén ${bag.currentAirportId ?? DASH}`} · {Math.round(bag.progress * 100)}%
                        </div>
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-2 pb-2 border-t border-[#1E3058]/60 pt-2">
                      <div className="grid grid-cols-2 gap-x-3">
                        <ReportRow label="Lote" value={bag.batchId} color="#A8C0E0" />
                        <ReportRow label="Cliente" value={bag.clientId} color="#A8C0E0" />
                        <ReportRow label="Ingreso" value={formatTraceTime(bag.ingressTime)} color="#A8C0E0" />
                        <ReportRow label="SLA" value={formatTraceTime(bag.deadline)} color={bag.meetsSla ? '#00FF9C' : '#FFC857'} />
                      </div>
                      <div className="flex flex-col gap-1 mt-2">
                        {bag.events.map((event, index) => (
                          <div key={`${event.type}-${event.timestamp}-${index}`} className="flex items-center gap-2 text-[10px]">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: event.completed ? '#00FF9C' : '#1E3058' }} />
                            <span className={event.completed ? 'text-[#A8C0E0]' : 'text-[#4A6080]'} style={{ fontWeight: event.completed ? 600 : 400 }}>
                              {bagEventLabel(event.type)}
                            </span>
                            <span className="text-[#4A6080] truncate flex-1">
                              {event.flightId ? `${event.flightId} · ` : ''}{event.airportId ?? DASH}
                            </span>
                            <span className="text-[#4A6080] font-mono">{formatTraceTime(event.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {onOpenShipment && (
                          <button
                            onClick={() => onOpenShipment(bag.batchId)}
                            className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                          >
                            Ver envío
                          </button>
                        )}
                        {onOpenUt && bag.currentFlightId && (
                          <button
                            onClick={() => onOpenUt(bag.currentFlightId!)}
                            className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                          >
                            Ver UT
                          </button>
                        )}
                        {onOpenClient && (
                          <button
                            onClick={() => onOpenClient(bag.clientId)}
                            className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                          >
                            Ver cliente
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && data.bags.length === 0 && (
              <div className="text-[11px] text-[#4A6080] px-1 py-3">No hay maletas que coincidan con el filtro</div>
            )}
          </div>

          {data.totalItems > INSPECTOR_BAG_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={data.page <= 0 || loading}
                className="h-7 px-2 rounded-lg bg-[#081426] border border-[#1E3058] text-[10px] text-[#A8C0E0] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#4DA6FF]/50"
              >
                Anterior
              </button>
              <span className="text-[10px] text-[#4A6080]">
                {Math.min((data.page + 1) * data.size, data.totalItems).toLocaleString()} / {data.totalItems.toLocaleString()}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(data.page + 1) * data.size >= data.totalItems || loading}
                className="h-7 px-2 rounded-lg bg-[#081426] border border-[#1E3058] text-[10px] text-[#A8C0E0] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#4DA6FF]/50"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RightPanel({
  simulationId = null,
  airports, flights, shipments, events, isRunning, simulationTime,
  mode, activeFlights = [], flightPlanFlights = [], lastCycleUpdate = null,
  activeMapFilter = null, onToggleMapFilter,
  onSelectAirport, onSelectFlight, onSelectShipment,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'kpi' | 'transport' | 'warehouse' | 'shipments' | 'clients' | 'bags' | 'reports'>('kpi');
  const [opsSearch, setOpsSearch] = useState('');
  const [transportSort, setTransportSort] = useState<'load' | 'departure' | 'route'>('load');
  const [utFilter, setUtFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [warehouseSort, setWarehouseSort] = useState<'occupancy' | 'occupancyAsc' | 'code' | 'city'>('occupancy');
  const [shipmentSort, setShipmentSort] = useState<'progress' | 'bags' | 'route'>('progress');
  const [shipmentFilter, setShipmentFilter] = useState('all');
  const [bagStateFilter, setBagStateFilter] = useState('ALL');
  const [bagPage, setBagPage] = useState(0);
  const [bagTraceability, setBagTraceability] = useState<BackendBagTraceability | null>(null);
  const [bagTraceLoading, setBagTraceLoading] = useState(false);
  const [bagTraceError, setBagTraceError] = useState<string | null>(null);
  const [selectedBagId, setSelectedBagId] = useState<string | null>(null);
  // Drill-down: pila de navegación para trazabilidad encadenada (UT → envío → maletas, etc.)
  const [inspectorStack, setInspectorStack] = useState<InspectorTarget[]>([]);
  const [inspectorSearch, setInspectorSearch] = useState('');
  const [warehouseFlow, setWarehouseFlow] = useState<'all' | 'out' | 'in'>('all');
  const isBackendStatsMode = mode === '5day' || mode === 'realtime';
  const hasBackendStats = isBackendStatsMode && lastCycleUpdate != null;
  const backendMetrics = hasBackendStats ? lastCycleUpdate?.operationalMetrics : undefined;

  const openInspector = useCallback((target: InspectorTarget) => {
    setInspectorStack(prev => {
      const top = prev[prev.length - 1];
      if (top && top.kind === target.kind && top.id === target.id) return prev;
      return [...prev, target];
    });
    setInspectorSearch('');
    setWarehouseFlow('all');
  }, []);

  const popInspector = useCallback(() => {
    setInspectorStack(prev => prev.slice(0, -1));
    setInspectorSearch('');
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorStack([]);
    setInspectorSearch('');
  }, []);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    closeInspector();
  };

  const currentInspector = inspectorStack[inspectorStack.length - 1] ?? null;

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
    { id: 'clients' as const, label: 'Clientes', icon: <Users className="w-3 h-3" /> },
    { id: 'bags' as const, label: 'Maletas', icon: <Package className="w-3 h-3" /> },
    { id: 'reports' as const, label: 'Reportes', icon: <FileText className="w-3 h-3" /> },
  ];

  const recentEvents = useMemo(() => events.slice(0, 6), [events]);
  const recentReplanned = useMemo(() => shipments.filter(s => s.isReplanned), [shipments]);

  const activeBagsByFlight = useMemo(() => {
    const map = new Map<string, BackendActiveFlight>();
    activeFlights.forEach(f => map.set(f.flightId, f));
    return map;
  }, [activeFlights]);

  // Base de UTs (sin filtros): se usa tanto en la pestaña UT como en los drill-downs
  const baseTransportUnits = useMemo<TransportUnit[]>(() => {
    if (flightPlanFlights.length > 0) {
      return flightPlanFlights.map(f => {
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
          inFlight: active != null,
        };
      });
    }
    return activeFlights.map(f => ({
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
      inFlight: true,
    }));
  }, [flightPlanFlights, activeFlights, activeBagsByFlight]);

  const transportUnits = useMemo(() => {
    if (activeTab !== 'transport') return [];

    const query = opsSearch.trim().toLowerCase();
    return baseTransportUnits
      .filter(f => !query || `${f.flightId} ${f.originId} ${f.destinationId}`.toLowerCase().includes(query))
      .filter(f => {
        if (utFilter === 'inflight') return f.inFlight;
        if (utFilter === 'loaded') return f.bags > 0;
        if (utFilter === 'empty') return f.empty;
        if (utFilter === 'sla') return !f.meetsSla;
        return true;
      })
      .sort((a, b) => {
        if (transportSort === 'departure') return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
        if (transportSort === 'route') return `${a.originId}-${a.destinationId}`.localeCompare(`${b.originId}-${b.destinationId}`);
        return b.bags - a.bags;
      });
  }, [activeTab, baseTransportUnits, opsSearch, transportSort, utFilter]);

  const filteredWarehouses = useMemo(() => {
    if (activeTab !== 'warehouse') return [];

    const query = opsSearch.trim().toLowerCase();
    return airports
      .filter(a => !query || `${a.id} ${a.city} ${a.country} ${a.name}`.toLowerCase().includes(query))
      .filter(a => warehouseFilter === 'all' || a.status === warehouseFilter)
      .sort((a, b) => {
        if (warehouseSort === 'occupancyAsc') return getOccupancyPercent(a.occupancy, a.capacity) - getOccupancyPercent(b.occupancy, b.capacity);
        if (warehouseSort === 'code') return a.id.localeCompare(b.id);
        if (warehouseSort === 'city') return a.city.localeCompare(b.city);
        return getOccupancyPercent(b.occupancy, b.capacity) - getOccupancyPercent(a.occupancy, a.capacity);
      });
  }, [activeTab, airports, opsSearch, warehouseFilter, warehouseSort]);

  const operationalShipments = useMemo(() => {
    if (activeTab !== 'shipments') return [];

    const query = opsSearch.trim().toLowerCase();
    return shipments
      .filter(s => !query || `${s.id} ${s.origin} ${s.destination} ${s.airlineId} ${s.airline} ${s.currentFlightId}`.toLowerCase().includes(query))
      .filter(s => shipmentFilter === 'all' || s.status === shipmentFilter)
      .sort((a, b) => {
        if (shipmentSort === 'bags') return b.luggageCount - a.luggageCount;
        if (shipmentSort === 'route') return `${a.origin}-${a.destination}`.localeCompare(`${b.origin}-${b.destination}`);
        return a.progress - b.progress;
      });
  }, [activeTab, shipments, opsSearch, shipmentSort, shipmentFilter]);

  const luggageByClient = useMemo(() => {
    if (activeTab !== 'clients') return [];

    const query = opsSearch.trim().toLowerCase();
    const byClient = new Map<string, { clientId: string; shipmentCount: number; luggageCount: number; deliveredCount: number }>();
    for (const shipment of shipments) {
      const clientId = shipment.airlineId || shipment.airline || 'Cliente';
      const searchable = `${clientId} ${shipment.id} ${shipment.origin} ${shipment.destination}`.toLowerCase();
      if (query && !searchable.includes(query)) continue;

      const current = byClient.get(clientId) ?? { clientId, shipmentCount: 0, luggageCount: 0, deliveredCount: 0 };
      current.shipmentCount += 1;
      current.luggageCount += shipment.luggageCount;
      if (shipment.progress >= 1) current.deliveredCount += shipment.luggageCount;
      byClient.set(clientId, current);
    }
    return Array.from(byClient.values())
      .sort((a, b) => b.luggageCount - a.luggageCount)
      .slice(0, VISIBLE_OPERATIONAL_ROWS);
  }, [activeTab, shipments, opsSearch]);

  const isFilterActive = (type: MapEntityFilter['type'], id: string) =>
    activeMapFilter?.type === type && activeMapFilter.id === id;

  useEffect(() => {
    if (activeTab === 'bags') {
      setBagPage(0);
    }
  }, [activeTab, opsSearch, bagStateFilter, simulationId]);

  useEffect(() => {
    if (activeTab !== 'bags' || currentInspector) return;
    if (!simulationId) {
      setBagTraceability(null);
      setBagTraceError(null);
      setBagTraceLoading(false);
      setSelectedBagId(null);
      return;
    }

    let cancelled = false;
    setBagTraceLoading(true);
    setBagTraceError(null);
    const timer = window.setTimeout(() => {
      getBagTraceability(simulationId, {
        page: bagPage,
        size: BAG_PAGE_SIZE,
        query: opsSearch,
        state: bagStateFilter === 'ALL' ? undefined : bagStateFilter,
      })
        .then(data => {
          if (cancelled) return;
          setBagTraceability(data);
          setSelectedBagId(prev => {
            if (prev && data.bags.some(bag => bag.bagId === prev)) return prev;
            return data.bags[0]?.bagId ?? null;
          });
        })
        .catch(err => {
          if (cancelled) return;
          setBagTraceability(null);
          setSelectedBagId(null);
          setBagTraceError(err instanceof Error ? err.message : 'No se pudo cargar la trazabilidad');
        })
        .finally(() => {
          if (!cancelled) setBagTraceLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, simulationId, bagPage, opsSearch, bagStateFilter, lastCycleUpdate?.cycle, currentInspector]);

  const selectedBag = useMemo<BackendBagItem | null>(() => (
    bagTraceability?.bags.find(bag => bag.bagId === selectedBagId) ?? null
  ), [bagTraceability, selectedBagId]);

  const handleMapFilterClick = (filter: MapEntityFilter, fallback?: () => void) => {
    if (onToggleMapFilter) {
      onToggleMapFilter(filter);
    } else {
      fallback?.();
    }
  };

  const mapFilterButtonClass = (active: boolean, size = 'w-7 h-7') => `${size} rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${
    active
      ? 'bg-[#4DA6FF]/20 border-[#4DA6FF] text-[#4DA6FF]'
      : 'bg-[#0D1E38] border-[#1E3058] text-[#A8C0E0] hover:text-[#4DA6FF] hover:border-[#4DA6FF]/50'
  }`;

  // ==================== DRILL-DOWN (INSPECTOR) ====================

  const inspectorTitles: Record<InspectorTarget['kind'], string> = {
    ut: 'UNIDAD DE TRANSPORTE',
    warehouse: 'ALMACÉN',
    shipment: 'ENVÍO',
    client: 'CLIENTE',
  };

  function renderInspectorHeader(target: InspectorTarget) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={popInspector}
          className="w-7 h-7 rounded-lg bg-[#0D1E38] border border-[#1E3058] text-[#A8C0E0] flex items-center justify-center hover:border-[#4DA6FF]/60 hover:text-[#4DA6FF] flex-shrink-0"
          title="Volver"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] text-[#4A6080]" style={{ letterSpacing: '0.12em' }}>{inspectorTitles[target.kind]}</div>
          <div className="text-[13px] text-white truncate" style={{ fontWeight: 700 }}>{target.id}</div>
        </div>
        <button
          onClick={closeInspector}
          className="w-7 h-7 rounded-lg bg-[#0D1E38] border border-[#1E3058] text-[#4A6080] flex items-center justify-center hover:text-[#A8C0E0] flex-shrink-0"
          title="Cerrar detalle"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  function renderUtInspector(id: string) {
    const unit = baseTransportUnits.find(u => u.flightId === id)
      ?? baseTransportUnits.find(u => sameFlightId(u.flightId, id))
      ?? null;
    const utShipments = shipments.filter(s => sameFlightId(s.currentFlightId, id));
    const utColor = unit ? (!unit.meetsSla ? '#FFC857' : unit.pct >= 90 ? '#FF4D4D' : unit.empty ? '#4A6080' : '#00FF9C') : '#4A6080';
    const originAirport = unit ? airports.find(a => a.id === unit.originId) : null;
    const destAirport = unit ? airports.find(a => a.id === unit.destinationId) : null;

    return (
      <>
        {renderInspectorHeader({ kind: 'ut', id })}

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          {unit ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#C8D8F0]" style={{ fontWeight: 600 }}>
                    {unit.originId} → {unit.destinationId}
                  </div>
                  <div className="text-[10px] text-[#4A6080] truncate">
                    {(originAirport?.city ?? unit.originId)} → {(destAirport?.city ?? unit.destinationId)}
                  </div>
                </div>
                <button
                  onClick={() => handleMapFilterClick({ type: 'flight', id }, () => onSelectFlight?.(id))}
                  className={mapFilterButtonClass(isFilterActive('flight', id))}
                  title="Filtrar UT en mapa"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 mt-2">
                <ReportRow label="Salida" value={formatHourUtc(unit.departureTime)} color="#A8C0E0" />
                <ReportRow label="Llegada" value={formatHourUtc(unit.arrivalTime)} color="#A8C0E0" />
                <ReportRow label="Carga" value={unit.capacity > 0 ? `${unit.bags}/${unit.capacity}` : `${unit.bags}`} color={utColor} />
                <ReportRow label="Estado" value={unit.inFlight ? 'En vuelo' : unit.empty ? 'Vacío' : 'Programado'} color={unit.inFlight ? '#4DA6FF' : '#A8C0E0'} />
                <ReportRow label="SLA" value={unit.meetsSla ? 'OK' : 'En riesgo'} color={unit.meetsSla ? '#00FF9C' : '#FFC857'} />
                <ReportRow label="Ocupación" value={unit.capacity > 0 ? `${unit.pct}%` : DASH} color={utColor} />
              </div>
            </>
          ) : (
            <div className="text-[11px] text-[#4A6080]">UT no encontrada en el plan de vuelos actual</div>
          )}
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <SectionLabel>ENVÍOS EN ESTA UT · {utShipments.length}</SectionLabel>
          <div className="max-h-[220px] overflow-y-auto flex flex-col gap-2">
            {utShipments.slice(0, VISIBLE_OPERATIONAL_ROWS).map(s => (
              <ShipmentCard
                key={s.id}
                shipment={s}
                mapActive={isFilterActive('shipment', s.id)}
                onOpen={() => openInspector({ kind: 'shipment', id: s.id })}
                onMapFilter={() => handleMapFilterClick({ type: 'shipment', id: s.id }, () => onSelectShipment?.(s.id))}
              />
            ))}
            {utShipments.length === 0 && (
              <div className="text-[11px] text-[#4A6080] px-1 py-2">Sin envíos asignados actualmente a esta UT</div>
            )}
          </div>
        </div>

        <BagListSection
          simulationId={simulationId}
          query={stripProjectedDaySuffix(id)}
          title="MALETAS EN ESTA UT"
          refreshKey={lastCycleUpdate?.cycle}
          onOpenShipment={batchId => openInspector({ kind: 'shipment', id: batchId })}
          onOpenClient={clientId => openInspector({ kind: 'client', id: clientId })}
        />
      </>
    );
  }

  function renderWarehouseInspector(id: string) {
    const airport = airports.find(a => a.id === id) ?? null;
    const pct = airport ? getOccupancyPercent(airport.occupancy, airport.capacity) : 0;
    const color = airport ? getStatusColor(airport.status) : '#4A6080';
    const localQuery = inspectorSearch.trim().toLowerCase();

    const relatedUts = baseTransportUnits
      .filter(u => {
        if (warehouseFlow === 'out') return u.originId === id;
        if (warehouseFlow === 'in') return u.destinationId === id;
        return u.originId === id || u.destinationId === id;
      })
      .filter(u => !localQuery || `${u.flightId} ${u.originId} ${u.destinationId}`.toLowerCase().includes(localQuery))
      .sort((a, b) => b.bags - a.bags);

    const relatedShipments = shipments
      .filter(s => s.origin === id || s.destination === id)
      .filter(s => !localQuery || `${s.id} ${s.origin} ${s.destination} ${s.airlineId}`.toLowerCase().includes(localQuery));

    return (
      <>
        {renderInspectorHeader({ kind: 'warehouse', id })}

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          {airport ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#C8D8F0] truncate" style={{ fontWeight: 600 }}>{airport.city}, {airport.country}</div>
                  <div className="text-[10px] text-[#4A6080] truncate">{airport.name}</div>
                </div>
                <button
                  onClick={() => handleMapFilterClick({ type: 'airport', id }, () => onSelectAirport?.(id))}
                  className={mapFilterButtonClass(isFilterActive('airport', id))}
                  title="Filtrar almacén en mapa"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 rounded-full bg-[#1E3058] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                </div>
                <span className="text-[11px] font-mono" style={{ color }}>{pct}%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 mt-1">
                <ReportRow label="Ocupación" value={`${airport.occupancy} / ${airport.capacity}`} color={color} />
                <ReportRow label="Estado" value={airport.status === 'critical' ? 'Crítico' : airport.status === 'warning' ? 'Advertencia' : 'Normal'} color={color} />
              </div>
            </>
          ) : (
            <div className="text-[11px] text-[#4A6080]">Almacén no encontrado</div>
          )}
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="flex items-center gap-2 mb-2">
            <SearchBox value={inspectorSearch} onChange={setInspectorSearch} placeholder="Filtrar UTs o envíos" />
          </div>
          <FilterChips
            options={[
              { id: 'all', label: 'Todas' },
              { id: 'out', label: 'Salidas' },
              { id: 'in', label: 'Llegadas' },
            ]}
            value={warehouseFlow}
            onChange={v => setWarehouseFlow(v as 'all' | 'out' | 'in')}
          />
          <div className="mt-2">
            <SectionLabel>UTS DE ESTE ALMACÉN · {relatedUts.length}</SectionLabel>
          </div>
          <div className="max-h-[220px] overflow-y-auto flex flex-col gap-2">
            {relatedUts.slice(0, VISIBLE_OPERATIONAL_ROWS).map(u => (
              <UtCard
                key={u.flightId}
                unit={u}
                mapActive={isFilterActive('flight', u.flightId)}
                onOpen={() => openInspector({ kind: 'ut', id: u.flightId })}
                onMapFilter={() => handleMapFilterClick({ type: 'flight', id: u.flightId }, () => onSelectFlight?.(u.flightId))}
              />
            ))}
            {relatedUts.length === 0 && (
              <div className="text-[11px] text-[#4A6080] px-1 py-2">Sin UTs que coincidan</div>
            )}
          </div>
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <SectionLabel>ENVÍOS CON ORIGEN/DESTINO AQUÍ · {relatedShipments.length}</SectionLabel>
          <div className="max-h-[220px] overflow-y-auto flex flex-col gap-2">
            {relatedShipments.slice(0, VISIBLE_OPERATIONAL_ROWS).map(s => (
              <ShipmentCard
                key={s.id}
                shipment={s}
                mapActive={isFilterActive('shipment', s.id)}
                onOpen={() => openInspector({ kind: 'shipment', id: s.id })}
                onMapFilter={() => handleMapFilterClick({ type: 'shipment', id: s.id }, () => onSelectShipment?.(s.id))}
              />
            ))}
            {relatedShipments.length === 0 && (
              <div className="text-[11px] text-[#4A6080] px-1 py-2">Sin envíos que coincidan</div>
            )}
          </div>
        </div>

        <BagListSection
          simulationId={simulationId}
          query={id}
          title="MALETAS RELACIONADAS"
          refreshKey={lastCycleUpdate?.cycle}
          onOpenShipment={batchId => openInspector({ kind: 'shipment', id: batchId })}
          onOpenUt={flightId => openInspector({ kind: 'ut', id: flightId })}
          onOpenClient={clientId => openInspector({ kind: 'client', id: clientId })}
        />
      </>
    );
  }

  function renderShipmentInspector(id: string) {
    const shipment = shipments.find(s => s.id === id) ?? null;
    const color = shipment ? getStatusColor(shipment.status) : '#4A6080';
    const hasUt = shipment && shipment.currentFlightId && shipment.currentFlightId !== 'PENDING';

    return (
      <>
        {renderInspectorHeader({ kind: 'shipment', id })}

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          {shipment ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#C8D8F0]" style={{ fontWeight: 600 }}>
                    {shipment.origin} → {shipment.destination}
                  </div>
                  <div className="text-[10px] text-[#4A6080] truncate">Entrega estimada: {shipment.estimatedDelivery}</div>
                </div>
                <button
                  onClick={() => handleMapFilterClick({ type: 'shipment', id }, () => onSelectShipment?.(id))}
                  className={mapFilterButtonClass(isFilterActive('shipment', id))}
                  title="Filtrar envío en mapa"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 rounded-full bg-[#1E3058] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.round(shipment.progress * 100)}%`, backgroundColor: color }} />
                </div>
                <span className="text-[11px] font-mono" style={{ color }}>{Math.round(shipment.progress * 100)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 mt-1">
                <ReportRow label="Maletas" value={shipment.luggageCount} color="#4DA6FF" />
                <ReportRow
                  label="Estado"
                  value={shipment.status === 'on-time' ? 'A tiempo' : shipment.status === 'delayed' ? 'Retrasado' : 'Crítico'}
                  color={color}
                />
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <button
                  onClick={() => openInspector({ kind: 'client', id: shipment.airlineId || shipment.airline })}
                  className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                >
                  Cliente: {shipment.airlineId || shipment.airline}
                </button>
                {hasUt && (
                  <button
                    onClick={() => openInspector({ kind: 'ut', id: shipment.currentFlightId })}
                    className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                  >
                    UT actual: {shipment.currentFlightId}
                  </button>
                )}
                <button
                  onClick={() => openInspector({ kind: 'warehouse', id: shipment.origin })}
                  className="h-6 px-2 rounded border border-[#1E3058] text-[10px] text-[#A8C0E0] hover:border-[#4DA6FF]/40"
                >
                  Origen: {shipment.origin}
                </button>
                <button
                  onClick={() => openInspector({ kind: 'warehouse', id: shipment.destination })}
                  className="h-6 px-2 rounded border border-[#1E3058] text-[10px] text-[#A8C0E0] hover:border-[#4DA6FF]/40"
                >
                  Destino: {shipment.destination}
                </button>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-[#4A6080]">Envío no encontrado en la solución actual; se muestra la trazabilidad de sus maletas.</div>
          )}
        </div>

        <BagListSection
          simulationId={simulationId}
          batchId={id}
          title="MALETAS DEL ENVÍO"
          refreshKey={lastCycleUpdate?.cycle}
          onOpenUt={flightId => openInspector({ kind: 'ut', id: flightId })}
          onOpenClient={clientId => openInspector({ kind: 'client', id: clientId })}
        />
      </>
    );
  }

  function renderClientInspector(id: string) {
    const clientShipments = shipments.filter(s => (s.airlineId || s.airline) === id);
    const totalLuggage = clientShipments.reduce((acc, s) => acc + s.luggageCount, 0);
    const delivered = clientShipments.filter(s => s.progress >= 1).reduce((acc, s) => acc + s.luggageCount, 0);
    const localQuery = inspectorSearch.trim().toLowerCase();
    const visibleShipments = clientShipments
      .filter(s => !localQuery || `${s.id} ${s.origin} ${s.destination} ${s.currentFlightId}`.toLowerCase().includes(localQuery));

    return (
      <>
        {renderInspectorHeader({ kind: 'client', id })}

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="grid grid-cols-2 gap-x-3">
            <ReportRow label="Envíos" value={clientShipments.length} color="#4DA6FF" />
            <ReportRow label="Maletas" value={totalLuggage.toLocaleString()} color="#A8C0E0" />
            <ReportRow label="Entregadas" value={delivered.toLocaleString()} color="#00FF9C" />
            <ReportRow label="Pendientes" value={(totalLuggage - delivered).toLocaleString()} color="#FFC857" />
          </div>
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="flex items-center gap-2 mb-2">
            <SearchBox value={inspectorSearch} onChange={setInspectorSearch} placeholder="Filtrar envíos del cliente" />
          </div>
          <SectionLabel>ENVÍOS DEL CLIENTE · {visibleShipments.length}</SectionLabel>
          <div className="max-h-[260px] overflow-y-auto flex flex-col gap-2">
            {visibleShipments.slice(0, VISIBLE_OPERATIONAL_ROWS).map(s => (
              <ShipmentCard
                key={s.id}
                shipment={s}
                mapActive={isFilterActive('shipment', s.id)}
                onOpen={() => openInspector({ kind: 'shipment', id: s.id })}
                onMapFilter={() => handleMapFilterClick({ type: 'shipment', id: s.id }, () => onSelectShipment?.(s.id))}
              />
            ))}
            {visibleShipments.length === 0 && (
              <div className="text-[11px] text-[#4A6080] px-1 py-2">Sin envíos que coincidan</div>
            )}
          </div>
        </div>

        <BagListSection
          simulationId={simulationId}
          clientId={id}
          title="MALETAS DEL CLIENTE"
          refreshKey={lastCycleUpdate?.cycle}
          onOpenShipment={batchId => openInspector({ kind: 'shipment', id: batchId })}
          onOpenUt={flightId => openInspector({ kind: 'ut', id: flightId })}
        />
      </>
    );
  }

  function renderInspector(target: InspectorTarget) {
    if (target.kind === 'ut') return renderUtInspector(target.id);
    if (target.kind === 'warehouse') return renderWarehouseInspector(target.id);
    if (target.kind === 'shipment') return renderShipmentInspector(target.id);
    return renderClientInspector(target.id);
  }

  return (
    <div className="w-80 bg-[#080F1E] border-l border-[#1E3058] flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[#1E3058] px-2 pt-2 gap-1 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
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
        {currentInspector && renderInspector(currentInspector)}

        {/* KPI Tab */}
        {!currentInspector && activeTab === 'kpi' && (
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
        {!currentInspector && activeTab === 'transport' && (
          <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
            <div className="flex items-center gap-2 mb-2">
              <SearchBox value={opsSearch} onChange={setOpsSearch} placeholder="Buscar UT por código o ruta" />
              <SortSelect
                value={transportSort}
                onChange={v => setTransportSort(v as typeof transportSort)}
                options={[
                  { value: 'load', label: 'Más carga' },
                  { value: 'departure', label: 'Salida' },
                  { value: 'route', label: 'Ruta' },
                ]}
              />
            </div>
            <FilterChips options={UT_FILTER_OPTIONS} value={utFilter} onChange={setUtFilter} />
            <div className="mt-2">
              <SectionLabel>UNIDADES DE TRANSPORTE · {transportUnits.length}</SectionLabel>
            </div>
            <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2">
              {transportUnits.slice(0, VISIBLE_OPERATIONAL_ROWS).map(unit => (
                <UtCard
                  key={unit.flightId}
                  unit={unit}
                  mapActive={isFilterActive('flight', unit.flightId)}
                  onOpen={() => openInspector({ kind: 'ut', id: unit.flightId })}
                  onMapFilter={() => handleMapFilterClick({ type: 'flight', id: unit.flightId }, () => onSelectFlight?.(unit.flightId))}
                />
              ))}
              {transportUnits.length === 0 && (
                <div className="text-[11px] text-[#4A6080] px-2 py-4">Sin unidades que coincidan con el filtro</div>
              )}
            </div>
          </div>
        )}

        {/* Shipments Tab */}
        {!currentInspector && activeTab === 'shipments' && (
          <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
            <div className="flex items-center gap-2 mb-2">
              <SearchBox value={opsSearch} onChange={setOpsSearch} placeholder="Buscar envío, cliente, UT o ruta" />
              <SortSelect
                value={shipmentSort}
                onChange={v => setShipmentSort(v as typeof shipmentSort)}
                options={[
                  { value: 'progress', label: 'Progreso' },
                  { value: 'bags', label: 'Maletas' },
                  { value: 'route', label: 'Ruta' },
                ]}
              />
            </div>
            <FilterChips options={SHIPMENT_FILTER_OPTIONS} value={shipmentFilter} onChange={setShipmentFilter} />
            <div className="grid grid-cols-3 gap-2 my-2">
              <ReportRow label="Sin ruta" value={lastCycleUpdate?.batchSummary.unrouted ?? 0} color="#FFC857" />
              <ReportRow label="En vuelo" value={backendMetrics?.inFlightBags ?? 0} color="#4DA6FF" />
              <ReportRow label="Entregadas" value={backendMetrics?.deliveredBags ?? 0} color="#00FF9C" />
            </div>
            <SectionLabel>ENVÍOS · {operationalShipments.length}</SectionLabel>
            <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2">
              {operationalShipments.slice(0, VISIBLE_OPERATIONAL_ROWS).map(shipment => (
                <ShipmentCard
                  key={shipment.id}
                  shipment={shipment}
                  mapActive={isFilterActive('shipment', shipment.id)}
                  onOpen={() => openInspector({ kind: 'shipment', id: shipment.id })}
                  onMapFilter={() => handleMapFilterClick({ type: 'shipment', id: shipment.id }, () => onSelectShipment?.(shipment.id))}
                />
              ))}
              {operationalShipments.length === 0 && (
                <div className="text-[11px] text-[#4A6080] px-2 py-4">
                  {hasBackendStats ? 'La lista detallada se carga desde la solución cuando el ciclo termina.' : 'Sin envíos que coincidan con el filtro'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clients Tab */}
        {!currentInspector && activeTab === 'clients' && (
          <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
            <div className="flex items-center gap-2 mb-2">
              <SearchBox value={opsSearch} onChange={setOpsSearch} placeholder="Buscar cliente, envío o ruta" />
            </div>
            <SectionLabel>MALETAS POR CLIENTE · {luggageByClient.length}</SectionLabel>
            <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2">
              {luggageByClient.map(client => {
                const maxLuggage = Math.max(luggageByClient[0]?.luggageCount ?? 1, 1);
                const deliveredPct = Math.round((client.deliveredCount / Math.max(client.luggageCount, 1)) * 100);
                return (
                  <div
                    key={client.clientId}
                    onClick={() => openInspector({ kind: 'client', id: client.clientId })}
                    className="rounded-lg border border-[#1E3058] bg-[#081426] p-2 hover:border-[#4DA6FF]/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{client.clientId}</span>
                      <span className="text-[10px] text-[#4DA6FF] font-mono">{client.luggageCount.toLocaleString()} maletas</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
                        <div
                          className="h-full rounded bg-[#4DA6FF]"
                          style={{ width: `${Math.max(4, Math.min(100, (client.luggageCount / maxLuggage) * 100))}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#4A6080]">{client.shipmentCount} env.</span>
                    </div>
                    <div className="text-[10px] text-[#4A6080] mt-1">
                      Entregadas: {client.deliveredCount.toLocaleString()} · {deliveredPct}%
                    </div>
                  </div>
                );
              })}
              {luggageByClient.length === 0 && (
                <div className="text-[11px] text-[#4A6080] px-2 py-4">Sin clientes que coincidan con el filtro</div>
              )}
            </div>
          </div>
        )}

        {/* Bags Tab */}
        {!currentInspector && activeTab === 'bags' && (
          <>
            <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
              <div className="flex items-center gap-2 mb-3">
                <SearchBox value={opsSearch} onChange={setOpsSearch} placeholder="Buscar maleta, cliente, lote, UT o almacén" />
              </div>

              <FilterChips options={BAG_STATE_OPTIONS} value={bagStateFilter} onChange={setBagStateFilter} />

              {!simulationId && (
                <div className="text-[11px] text-[#4A6080] px-2 py-4">Inicia o únete a una simulación para consultar trazabilidad de maletas</div>
              )}

              {simulationId && bagTraceability && (
                <>
                  <div className="grid grid-cols-2 gap-2 my-3">
                    <ReportRow label="Total" value={bagTraceability.summary.totalBags.toLocaleString()} color="#A8C0E0" />
                    <ReportRow label="Coinciden" value={bagTraceability.totalItems.toLocaleString()} color="#4DA6FF" />
                    <ReportRow label="En vuelo" value={bagTraceability.summary.inFlightBags.toLocaleString()} color="#4DA6FF" />
                    <ReportRow label="Entregadas" value={bagTraceability.summary.deliveredBags.toLocaleString()} color="#00FF9C" />
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                      TRAZABILIDAD · PÁGINA {bagTraceability.page + 1}
                    </div>
                    {bagTraceLoading && <span className="text-[10px] text-[#4A6080]">Actualizando...</span>}
                  </div>

                  <div className="max-h-[320px] overflow-y-auto flex flex-col gap-2">
                    {bagTraceability.bags.map(bag => {
                      const color = bagStateColor(bag.state);
                      const selected = selectedBagId === bag.bagId;
                      return (
                        <button
                          key={bag.bagId}
                          onClick={() => setSelectedBagId(bag.bagId)}
                          className={`text-left rounded-lg border bg-[#081426] p-2 transition-colors ${selected ? 'border-[#4DA6FF]' : 'border-[#1E3058] hover:border-[#4DA6FF]/40'}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: color }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-white truncate" style={{ fontWeight: 700 }}>{bag.bagId}</span>
                                <span className="text-[9px] border rounded px-1" style={{ color, borderColor: `${color}55` }}>{bagStateLabel(bag.state)}</span>
                              </div>
                              <div className="text-[10px] text-[#4A6080] mt-0.5 truncate">
                                {bag.clientId} · {bag.originId} → {bag.destinationId}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
                                  <div className="h-full rounded" style={{ width: `${Math.round(bag.progress * 100)}%`, backgroundColor: color }} />
                                </div>
                                <span className="text-[10px] font-mono" style={{ color }}>{Math.round(bag.progress * 100)}%</span>
                              </div>
                              <div className="text-[10px] text-[#4A6080] mt-1 truncate">
                                {bag.currentFlightId ? `Vuelo ${bag.currentFlightId}` : `Almacén ${bag.currentAirportId ?? DASH}`} · Próximo: {bag.nextEvent ? bagEventLabel(bag.nextEvent) : DASH}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {!bagTraceLoading && bagTraceability.bags.length === 0 && (
                      <div className="text-[11px] text-[#4A6080] px-2 py-4">No hay maletas que coincidan con el filtro</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <button
                      onClick={() => setBagPage(page => Math.max(0, page - 1))}
                      disabled={bagTraceability.page <= 0 || bagTraceLoading}
                      className="h-7 px-2 rounded-lg bg-[#081426] border border-[#1E3058] text-[10px] text-[#A8C0E0] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#4DA6FF]/50"
                    >
                      Anterior
                    </button>
                    <span className="text-[10px] text-[#4A6080]">
                      {Math.min((bagTraceability.page + 1) * bagTraceability.size, bagTraceability.totalItems).toLocaleString()} / {bagTraceability.totalItems.toLocaleString()}
                    </span>
                    <button
                      onClick={() => setBagPage(page => page + 1)}
                      disabled={(bagTraceability.page + 1) * bagTraceability.size >= bagTraceability.totalItems || bagTraceLoading}
                      className="h-7 px-2 rounded-lg bg-[#081426] border border-[#1E3058] text-[10px] text-[#A8C0E0] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#4DA6FF]/50"
                    >
                      Siguiente
                    </button>
                  </div>
                </>
              )}

              {bagTraceError && (
                <div className="text-[11px] text-[#FF4D4D] px-2 py-4">{bagTraceError}</div>
              )}
            </div>

            {selectedBag && (
              <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>DETALLE DE MALETA</div>
                    <div className="text-[12px] text-white truncate" style={{ fontWeight: 700 }}>{selectedBag.bagId}</div>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: bagStateColor(selectedBag.state) }}>
                    {bagStateLabel(selectedBag.state)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <ReportRow label="Lote" value={selectedBag.batchId} color="#A8C0E0" />
                  <ReportRow label="Cliente" value={selectedBag.clientId} color="#A8C0E0" />
                  <ReportRow label="Ingreso" value={formatTraceTime(selectedBag.ingressTime)} color="#A8C0E0" />
                  <ReportRow label="SLA" value={formatTraceTime(selectedBag.deadline)} color={selectedBag.meetsSla ? '#00FF9C' : '#FFC857'} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {selectedBag.events.map((event, index) => (
                    <div key={`${event.type}-${event.timestamp}-${index}`} className="flex items-center gap-2 text-[10px]">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: event.completed ? '#00FF9C' : '#1E3058' }} />
                      <span className={event.completed ? 'text-[#A8C0E0]' : 'text-[#4A6080]'} style={{ fontWeight: event.completed ? 600 : 400 }}>
                        {bagEventLabel(event.type)}
                      </span>
                      <span className="text-[#4A6080] truncate flex-1">
                        {event.flightId ? `${event.flightId} · ` : ''}{event.airportId ?? DASH}
                      </span>
                      <span className="text-[#4A6080] font-mono">{formatTraceTime(event.timestamp)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  <button
                    onClick={() => openInspector({ kind: 'shipment', id: selectedBag.batchId })}
                    className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                  >
                    Ver envío
                  </button>
                  <button
                    onClick={() => openInspector({ kind: 'client', id: selectedBag.clientId })}
                    className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                  >
                    Ver cliente
                  </button>
                  {selectedBag.currentFlightId && (
                    <button
                      onClick={() => openInspector({ kind: 'ut', id: selectedBag.currentFlightId! })}
                      className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                    >
                      Ver UT
                    </button>
                  )}
                  {selectedBag.currentAirportId && (
                    <button
                      onClick={() => openInspector({ kind: 'warehouse', id: selectedBag.currentAirportId! })}
                      className="h-6 px-2 rounded border border-[#4DA6FF]/40 text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/10"
                    >
                      Ver almacén
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Warehouse Tab */}
        {!currentInspector && activeTab === 'warehouse' && (
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
                  ALERTAS DE SOBRECAPACIDAD
                </div>
                {criticalAirports.map(a => (
                  <button
                    key={a.id}
                    onClick={() => openInspector({ kind: 'warehouse', id: a.id })}
                    className="w-full flex items-center justify-between py-1.5 border-b border-[#FF4D4D]/10 hover:bg-[#FF4D4D]/5 text-left"
                  >
                    <div>
                      <span className="text-[11px] text-[#FF4D4D]" style={{ fontWeight: 600 }}>{a.id}</span>
                      <span className="text-[11px] text-[#4A6080] ml-1">{a.city}</span>
                    </div>
                    <span className="text-[11px] text-[#FF4D4D]" style={{ fontWeight: 600 }}>
                      {getOccupancyPercent(a.occupancy, a.capacity)}%
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* All airports occupancy list */}
            <div className="bg-[#0D1E38] rounded-xl border border-[#1E3058] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1E3058] flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <SearchBox value={opsSearch} onChange={setOpsSearch} placeholder="Buscar por código, ciudad o país" />
                  <SortSelect
                    value={warehouseSort}
                    onChange={v => setWarehouseSort(v as typeof warehouseSort)}
                    options={[
                      { value: 'occupancy', label: 'Ocup. ↓' },
                      { value: 'occupancyAsc', label: 'Ocup. ↑' },
                      { value: 'code', label: 'Código' },
                      { value: 'city', label: 'Ciudad' },
                    ]}
                  />
                </div>
                <FilterChips options={WAREHOUSE_FILTER_OPTIONS} value={warehouseFilter} onChange={setWarehouseFilter} />
                <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                  ALMACENES · {filteredWarehouses.length}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filteredWarehouses.map(a => {
                  const pct = getOccupancyPercent(a.occupancy, a.capacity);
                  const color = getStatusColor(a.status);
                  const active = isFilterActive('airport', a.id);
                  return (
                    <div
                      key={a.id}
                      onClick={() => openInspector({ kind: 'warehouse', id: a.id })}
                      className="flex items-center gap-2 px-3 py-2 border-b border-[#1E3058]/40 hover:bg-[#1A2E4A]/30 cursor-pointer"
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[11px] text-[#A8C0E0] w-8" style={{ fontWeight: 600 }}>{a.id}</span>
                      <span className="text-[10px] text-[#4A6080] flex-1 truncate">{a.city}</span>
                      <div className="w-16 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color }}>{pct}%</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleMapFilterClick({ type: 'airport', id: a.id }, () => onSelectAirport?.(a.id)); }}
                        className={mapFilterButtonClass(active, 'w-6 h-6')}
                        title={active ? 'Quitar filtro del mapa' : 'Filtrar almacén en mapa'}
                      >
                        <MapPin className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {filteredWarehouses.length === 0 && (
                  <div className="text-[11px] text-[#4A6080] px-3 py-4">Sin almacenes que coincidan con el filtro</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Reports Tab */}
        {!currentInspector && activeTab === 'reports' && (
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
                  <button
                    key={f.flightId}
                    onClick={() => openInspector({ kind: 'ut', id: f.flightId })}
                    className="w-full flex items-center justify-between px-3 py-2 border-b border-[#1E3058]/30 hover:bg-[#1A2E4A]/30 text-left"
                  >
                    <div>
                      <span className="text-[11px] text-[#A8C0E0]" style={{ fontWeight: 500 }}>{f.flightId}</span>
                      <div className="text-[10px] text-[#4A6080]">{f.originId} → {f.destinationId} · {formatHourUtc(f.departureTime)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-[#4A6080]">{activeBagsByFlight.get(f.flightId)?.bagsCount ?? DASH}</div>
                      <div className="text-[10px] text-[#4A6080]">cap. {f.capacity}</div>
                    </div>
                  </button>
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
            {!hasBackendStats && recentReplanned.length > 0 && (
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
