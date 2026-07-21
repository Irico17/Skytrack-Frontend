import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Package, AlertTriangle, Warehouse,
  FileText, Zap, CheckCircle, Activity,
  Plane, Search, MapPin, Luggage, Users, ArrowLeft, X, ChevronDown
} from 'lucide-react';
import { Airport, Flight, Shipment, SimEvent, getStatusColor, getOccupancyPercent } from '../data/mockData';
import { getBagTraceability } from '../services/api';
import { isDeliveredInSimWindow } from '../utils/shipmentFilters';
import { parseApiInstant } from '../utils/simulationTime';
import { SUBLOT_COLORS } from '../utils/loadColors';
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
  /** Entidad seleccionada en el mapa: abre su inspector en este panel (bidireccional). */
  selectedEntity?: { type: 'airport' | 'flight' | 'shipment'; id: string } | null;
  onToggleMapFilter?: (filter: MapEntityFilter) => void;
  /** Resalta en el mapa la ruta completa (UTs + almacenes de escala) de una maleta/envío. */
  onTraceRoute?: (label: string, flightIds: string[], airportIds: string[]) => void;
  onSelectAirport?: (id: string) => void;
  onSelectFlight?: (id: string) => void;
  onSelectShipment?: (id: string) => void;
  utFilter?: string;
  warehouseFilter?: string;
  warehouseContinent?: string;
  onUtFilterChange?: (value: string) => void;
  onWarehouseFilterChange?: (value: string) => void;
  onWarehouseContinentChange?: (value: string) => void;
  viewerCount?: number;
  cancelledFlightIds?: Set<string>;
}

interface TransportUnit {
  flightId: string;
  originId: string;
  destinationId: string;
  departureTime: string;
  arrivalTime: string;
  departureMs: number;
  arrivalMs: number;
  capacity: number;
  bags: number;
  pct: number;
  meetsSla: boolean;
  empty: boolean;
  cancelled: boolean;
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
/** Tope de filas para la lista de UT (puede haber ~15k vuelos proyectados). */
const VISIBLE_UT_ROWS = 300;
const EMPTY_CANCELLED_SET: Set<string> = new Set();
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
  { id: 'empty', label: 'Vacío', color: '#3A4A5E' },
  { id: 'normal', label: 'Normal', color: '#00FF9C' },
  { id: 'warning', label: 'Adv.', color: '#FFC857' },
  { id: 'critical', label: 'Crít.', color: '#FF4D4D' },
  { id: 'inflight', label: 'En vuelo', color: '#4DA6FF' },
  { id: 'cancelled', label: 'Cancelados', color: '#A855F7' },
];

const WAREHOUSE_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'empty', label: 'Vacío', color: '#3A4A5E' },
  { id: 'normal', label: 'Normal', color: '#00FF9C' },
  { id: 'warning', label: 'Advertencia', color: '#FFC857' },
  { id: 'critical', label: 'Crítico', color: '#FF4D4D' },
];

const SHIPMENT_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'on-time', label: 'A tiempo', color: '#00FF9C' },
  { id: 'delayed', label: 'Retrasado', color: '#FFC857' },
  { id: 'critical', label: 'Crítico', color: '#FF4D4D' },
  { id: 'inflight', label: 'En vuelo', color: '#4DA6FF' },
  { id: 'delivered', label: 'Últimas 4 h', color: '#00FF9C' },
];
// En modo backend la solución solo distingue a-tiempo/retrasado (sin "crítico"): se omite ese chip.
const SHIPMENT_FILTER_OPTIONS_BACKEND = [
  { id: 'all', label: 'Todos' },
  { id: 'on-time', label: 'A tiempo', color: '#00FF9C' },
  { id: 'delayed', label: 'Retrasado', color: '#FFC857' },
  { id: 'inflight', label: 'En vuelo', color: '#4DA6FF' },
  { id: 'delivered', label: 'Últimas 4 h', color: '#00FF9C' },
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
  try {
    const date = parseApiInstant(value);
    return date.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return value;
  }
}

function formatHourUtc(value: string): string {
  try {
    return parseApiInstant(value).toISOString().slice(11, 16);
  } catch {
    return value;
  }
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
        className="w-full h-8 rounded-lg bg-[#081426] border border-[#1E3058] pl-7 pr-7 text-[11px] text-[#C8D8F0] outline-none focus:border-[#4DA6FF]/60"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center text-[#4A6080] hover:text-[#FF4D4D]"
          title="Limpiar búsqueda"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function FilterChips({ options, value, onChange }: {
  options: { id: string; label: string; color?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {options.map(option => {
        const active = value === option.id;
        const c = option.color;
        // Si la opción tiene color (semáforo), el chip se tiñe con ese color: punto + borde +
        // texto al activarse, para distinguir de un vistazo normal/adv./crítico/etc.
        const activeStyle = c
          ? { backgroundColor: `${c}22`, borderColor: c, color: c }
          : undefined;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            style={active ? activeStyle : undefined}
            className={`h-7 px-2 rounded-lg border text-[10px] whitespace-nowrap transition-colors flex-shrink-0 flex items-center gap-1.5 ${active
              ? (c ? '' : 'bg-[#4DA6FF]/15 border-[#4DA6FF] text-[#4DA6FF]')
              : 'bg-[#081426] border-[#1E3058] text-[#4A6080] hover:text-[#A8C0E0] hover:border-[#4DA6FF]/40'
            }`}
          >
            {c && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: c, opacity: active ? 1 : 0.65 }}
              />
            )}
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

function isTransportUnitInFlight(unit: TransportUnit, nowMs: number): boolean {
  return Number.isFinite(unit.departureMs)
    && Number.isFinite(unit.arrivalMs)
    && nowMs >= unit.departureMs
    && nowMs < unit.arrivalMs;
}

function parseInstantMs(value: string): number {
  try {
    return parseApiInstant(value).getTime();
  } catch {
    return Number.NaN;
  }
}

function UtCard({ unit, nowMs, mapActive, onOpen, onMapFilter }: {
  unit: TransportUnit;
  nowMs: number;
  mapActive: boolean;
  onOpen?: () => void;
  onMapFilter?: () => void;
}) {
  const inFlight = isTransportUnitInFlight(unit, nowMs);
  const color = unit.cancelled ? '#FF4D4D' : !unit.meetsSla ? '#FFC857' : unit.pct >= 90 ? '#FF4D4D' : unit.pct >= 70 ? '#FFC857' : unit.empty ? '#4A6080' : '#00FF9C';
  return (
    <div
      onClick={onOpen}
      className={`rounded-lg border border-[#1E3058] bg-[#081426] p-2 hover:border-[#4DA6FF]/40 transition-colors ${onOpen ? 'cursor-pointer' : ''} ${unit.cancelled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] text-white truncate ${unit.cancelled ? 'line-through' : ''}`} style={{ fontWeight: 700 }}>{unit.flightId}</span>
            {unit.cancelled && <span className="text-[9px] text-[#FF4D4D] border border-[#FF4D4D]/40 rounded px-1" style={{ fontWeight: 700 }}>CANCELADO</span>}
            {!unit.cancelled && inFlight && <span className="text-[9px] text-[#4DA6FF] border border-[#4DA6FF]/30 rounded px-1">EN VUELO</span>}
            {!unit.cancelled && unit.empty && <span className="text-[9px] text-[#4A6080] border border-[#1E3058] rounded px-1">VACÍO</span>}
            {!unit.cancelled && !unit.meetsSla && <span className="text-[9px] text-[#FFC857] border border-[#FFC857]/30 rounded px-1">En riesgo</span>}
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
            title={mapActive ? 'Quitar filtro del mapa' : 'Centrar y filtrar UT en mapa'}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Progreso del viaje interpolado EN VIVO contra el reloj simulado (misma fórmula lineal que
 * el backend: (ahora − primera salida)/(llegada final − primera salida)). Permite que la barra
 * avance suave entre refrescos de la solución, sin recargar nada. Cae al valor del backend si
 * falta el timing. No reordena ni filtra (solo el valor mostrado), así no hay reflujo de la lista.
 */
/**
 * Instante real de entrega (aterrizaje + ventana de recojo), no el aterrizaje crudo —
 * ver AssignedRoute.getDeliveredTime() en el backend. Cae a finalArrivalTime si el
 * backend aún no manda deliveredTime (compatibilidad con datos viejos/mock).
 */
function deliveredAtMs(s: Shipment): number {
  try {
    if (s.deliveredTime) return parseApiInstant(s.deliveredTime).getTime();
    if (s.finalArrivalTime) return parseApiInstant(s.finalArrivalTime).getTime();
  } catch {
    // fall through
  }
  return NaN;
}

function liveJourneyProgress(s: Shipment, nowMs: number): number {
  const deliveredMs = deliveredAtMs(s);
  if (Number.isFinite(deliveredMs) ? nowMs >= deliveredMs : (s.progress >= 1 || s.deliveredAt)) return 1;
  const firstLeg = s.legs?.[0];
  const lastLeg = s.legs?.[s.legs.length - 1];
  let start = firstLeg?.dep ?? NaN;
  let end = lastLeg?.arr ?? NaN;
  try {
    if (!Number.isFinite(start) && s.journeyStartTime) start = parseApiInstant(s.journeyStartTime).getTime();
    if (!Number.isFinite(end) && s.finalArrivalTime) end = parseApiInstant(s.finalArrivalTime).getTime();
  } catch {
    return s.progress;
  }
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
  }
  return s.progress;
}

type LiveState = 'pending' | 'scheduled' | 'at_origin' | 'in_flight' | 'at_transfer' | 'delivered';

/**
 * Deriva EN VIVO (desde el reloj simulado) el estado y la posición tramo a tramo de un envío,
 * usando su itinerario compacto `legs`. Así el panel iguala al mapa: muestra "en vuelo F123",
 * "transferencia en BBB", "en origen" o "entregado" sin esperar al refresco de la solución.
 * Solo se evalúa para las filas que se renderizan, así que es barato.
 */
function liveShipmentState(s: Shipment, nowMs: number, currentFlightAirborne = false): {
  state: LiveState; flightId: string | null; airportId: string | null; progress: number;
} {
  const progress = liveJourneyProgress(s, nowMs);
  const deliveredMs = deliveredAtMs(s);
  const isDelivered = Number.isFinite(deliveredMs) ? nowMs >= deliveredMs : (s.progress >= 1 || !!s.deliveredAt);
  const legs = s.legs;
  if (!legs || legs.length === 0) {
    const hasUt = s.currentFlightId && s.currentFlightId !== 'PENDING';
    if (isDelivered) return { state: 'delivered', flightId: null, airportId: s.destination, progress: 1 };
    if (hasUt && currentFlightAirborne) return { state: 'in_flight', flightId: s.currentFlightId, airportId: null, progress };
    return { state: hasUt ? 'scheduled' : 'pending', flightId: hasUt ? s.currentFlightId : null, airportId: hasUt ? null : s.origin, progress };
  }
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (isDelivered) return { state: 'delivered', flightId: null, airportId: last.to, progress: 1 };
  if (nowMs < first.dep) return { state: 'at_origin', flightId: null, airportId: first.from, progress: 0 };
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (nowMs >= leg.dep && nowMs <= leg.arr) {
      return { state: 'in_flight', flightId: leg.id, airportId: null, progress };
    }
    const next = legs[i + 1];
    if (next && nowMs > leg.arr && nowMs < next.dep) {
      // Entre la llegada de este tramo y la salida del siguiente → en transferencia.
      return { state: 'at_transfer', flightId: null, airportId: leg.to, progress };
    }
  }
  return { state: 'in_flight', flightId: s.currentFlightId !== 'PENDING' ? s.currentFlightId : null, airportId: null, progress };
}

const LIVE_STATE_META: Record<LiveState, { label: string; color: string }> = {
  pending: { label: 'Sin ruta', color: '#FF4D4D' },
  scheduled: { label: 'Programado', color: '#7090B0' },
  at_origin: { label: 'En origen', color: '#7090B0' },
  in_flight: { label: 'En vuelo', color: '#4DA6FF' },
  at_transfer: { label: 'Transferencia', color: '#FFC857' },
  delivered: { label: 'Entregado', color: '#00FF9C' },
};

function ShipmentCard({ shipment, familySize = 1, mapActive, onOpen, onMapFilter, nowMs, currentFlightAirborne = false }: {
  shipment: Shipment;
  familySize?: number;
  mapActive: boolean;
  onOpen?: () => void;
  onMapFilter?: () => void;
  nowMs?: number;
  currentFlightAirborne?: boolean;
}) {
  const color = getStatusColor(shipment.status);
  const live = liveShipmentState(shipment, nowMs ?? Date.now(), currentFlightAirborne);
  const pct = Math.round(live.progress * 100);
  const liveMeta = LIVE_STATE_META[live.state];
  const liveWhere = live.flightId ? `Vuelo ${live.flightId}` : live.airportId ? `Almacén ${live.airportId}` : '';
  const splitMatch = shipment.id.match(/-S(\d+)$/);
  const isSplit = familySize > 1 || !!splitMatch;
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
            {isSplit && (
              <span
                className="text-[9px] px-1 rounded flex-shrink-0"
                style={{ backgroundColor: '#B78CFF1F', color: '#B78CFF', fontWeight: 600 }}
                title="Este envío se dividió por capacidad — sus partes pueden tomar rutas distintas. Selecciónalo en el mapa para ver la familia completa."
              >
                Dividido · {familySize}
              </span>
            )}
            <span className="text-[9px] text-[#4A6080] border border-[#1E3058] rounded px-1 flex-shrink-0">{shipment.luggageCount} maletas</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1"
              style={{ backgroundColor: `${liveMeta.color}1F`, color: liveMeta.color, fontWeight: 600 }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: liveMeta.color }} />
              {liveMeta.label}
            </span>
            <span className="text-[10px] text-[#4A6080] truncate">
              {shipment.origin} → {shipment.destination}{liveWhere ? ` · ${liveWhere}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded bg-[#1E3058] overflow-hidden">
              <div className="h-full rounded transition-[width] duration-300 ease-linear" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-mono" style={{ color }}>{pct}%</span>
          </div>
        </div>
        {onMapFilter && (
          <button
            onClick={e => { e.stopPropagation(); onMapFilter(); }}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${mapActive
              ? 'bg-[#4DA6FF]/20 border-[#4DA6FF] text-[#4DA6FF]'
              : 'bg-[#0D1E38] border-[#1E3058] text-[#A8C0E0] hover:text-[#4DA6FF] hover:border-[#4DA6FF]/50'
            }`}
            title={mapActive ? 'Quitar filtro del mapa' : 'Centrar y filtrar envío en mapa'}
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

  // Sub-lotes ("-S<n>") presentes en la página: un envío dividido por capacidad viaja en
  // varias rutas — cada batchId distinto ES una ruta distinta. Mismo orden numérico y misma
  // paleta que usa el mapa para dibujar la familia (ver SUBLOT_COLORS en utils/loadColors),
  // así el grupo de maletas "S2" de esta lista se corresponde 1:1 con la línea de ese color
  // en el mapa. Solo se señaliza cuando hay MÁS de un sub-lote (si no, no hay nada que
  // distinguir). La etiqueta corta es el sufijo del sub-lote (estable ante paginación, a
  // diferencia de un "Ruta 1/2" posicional que cambiaría de página a página).
  const sublotIds = useMemo(() => {
    if (!data) return [] as string[];
    const ids = [...new Set(data.bags.map(b => b.batchId))];
    ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return ids;
  }, [data]);
  const sublotBase = useMemo(
    () => (sublotIds.length > 0 ? sublotIds[0].replace(/(-S\d+)+$/, '') : ''),
    [sublotIds],
  );
  const sublotColor = (id: string) => SUBLOT_COLORS[sublotIds.indexOf(id) % SUBLOT_COLORS.length];
  const sublotShortLabel = (id: string) => {
    const suffix = id.slice(sublotBase.length).replace(/^-/, '');
    return suffix === '' ? 'Principal' : suffix;
  };

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
          {sublotIds.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap mt-2 px-1">
              <span className="text-[9px] text-[#B78CFF]" style={{ fontWeight: 600 }}>
                Envío dividido · {sublotIds.length} rutas:
              </span>
              {sublotIds.map(id => (
                <span
                  key={id}
                  className="text-[9px] px-1 rounded border flex-shrink-0"
                  style={{ color: sublotColor(id), borderColor: `${sublotColor(id)}55`, backgroundColor: `${sublotColor(id)}14`, fontWeight: 600 }}
                  title={`Sub-lote ${id} — mismo color que su ruta en el mapa`}
                >
                  {sublotShortLabel(id)}
                </span>
              ))}
            </div>
          )}
          <div className="max-h-[280px] overflow-y-auto flex flex-col gap-2 mt-2">
            {data.bags.map(bag => {
              const color = bagStateColor(bag.state);
              const expanded = expandedBagId === bag.bagId;
              const routeColor = sublotColor(bag.batchId);
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
                          {sublotIds.length > 1 && (
                            <span
                              className="text-[9px] px-1 rounded flex-shrink-0"
                              style={{ color: routeColor, backgroundColor: `${routeColor}1F`, fontWeight: 600 }}
                              title={`Esta maleta viaja en el sub-lote ${bag.batchId} — su ruta se dibuja de este color en el mapa`}
                            >
                              ⬤ {sublotShortLabel(bag.batchId)}
                            </span>
                          )}
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
                        <ReportRow label="Deadline" value={formatTraceTime(bag.deadline)} color={bag.meetsSla ? '#00FF9C' : '#FFC857'} />
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
  activeMapFilter = null, selectedEntity = null, onToggleMapFilter, onTraceRoute,
  onSelectAirport, onSelectFlight, onSelectShipment,
  utFilter: utFilterProp, warehouseFilter: warehouseFilterProp,
  warehouseContinent: warehouseContinentProp, onWarehouseContinentChange,
  onUtFilterChange, onWarehouseFilterChange,
  viewerCount = 0, cancelledFlightIds,
}: RightPanelProps) {
  const cancelledSet = cancelledFlightIds ?? EMPTY_CANCELLED_SET;
  const [activeTab, setActiveTab] = useState<'kpi' | 'transport' | 'warehouse' | 'shipments' | 'clients' | 'bags' | 'reports'>('kpi');
  const [opsSearch, setOpsSearch] = useState('');
  const [transportOriginFilter, setTransportOriginFilter] = useState('');
  const [transportDestFilter, setTransportDestFilter] = useState('');
  const [shipmentOriginFilter, setShipmentOriginFilter] = useState('');
  const [shipmentDestFilter, setShipmentDestFilter] = useState('');
  const [transportSort, setTransportSort] = useState<'load' | 'loadAsc' | 'departure' | 'arrival' | 'destination' | 'route'>('load');
  const [utFilterLocal, setUtFilterLocal] = useState('all');
  const [warehouseFilterLocal, setWarehouseFilterLocal] = useState('all');
  const utFilter = utFilterProp ?? utFilterLocal;
  const warehouseFilter = warehouseFilterProp ?? warehouseFilterLocal;
  const setUtFilter = onUtFilterChange ?? setUtFilterLocal;
  const setWarehouseFilter = onWarehouseFilterChange ?? setWarehouseFilterLocal;
  const [warehouseContinentLocal, setWarehouseContinentLocal] = useState('all');
  const warehouseContinent = warehouseContinentProp ?? warehouseContinentLocal;
  const setWarehouseContinent = onWarehouseContinentChange ?? setWarehouseContinentLocal;
  const [warehouseSort, setWarehouseSort] = useState<'occupancy' | 'occupancyAsc' | 'code' | 'city' | 'nextDeparture' | 'nextArrival'>('city');
  // Reloj simulado en ms — RightPanel ya re-renderiza ~4×/seg cuando avanza el reloj, así que
  // las barras de progreso interpoladas se actualizan casi en vivo sin timers extra.
  const nowMs = simulationTime.getTime();
  const [shipmentSort, setShipmentSort] = useState<'progress' | 'progressAsc' | 'bags' | 'bagsAsc' | 'route'>('progress');
  const [clientSort, setClientSort] = useState<'bags' | 'shipments' | 'delivered' | 'name'>('bags');
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
  const isBackendStatsMode = mode === '5day' || mode === 'realtime' || mode === 'collapse';
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

  // Bidireccional: al seleccionar una entidad en el MAPA, abrir su inspector y la pestaña.
  const lastExternalSelectionRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!selectedEntity) { lastExternalSelectionRef.current = null; return; }
    const key = `${selectedEntity.type}:${selectedEntity.id}`;
    if (lastExternalSelectionRef.current === key) return;
    lastExternalSelectionRef.current = key;
    if (selectedEntity.type === 'airport') {
      setActiveTab('warehouse');
      openInspector({ kind: 'warehouse', id: selectedEntity.id });
    } else if (selectedEntity.type === 'flight') {
      setActiveTab('transport');
      openInspector({ kind: 'ut', id: selectedEntity.id });
    } else if (selectedEntity.type === 'shipment') {
      setActiveTab('shipments');
      openInspector({ kind: 'shipment', id: selectedEntity.id });
    }
  }, [selectedEntity, openInspector]);

  const currentInspector = inspectorStack[inspectorStack.length - 1] ?? null;

  // F9: indicador de filtros activos + limpiar por vista (la búsqueda es compartida).
  const viewFiltersActive =
    (activeTab === 'transport' && (opsSearch !== '' || transportOriginFilter !== '' || transportDestFilter !== '' || utFilter !== 'all' || transportSort !== 'load')) ||
    (activeTab === 'warehouse' && (opsSearch !== '' || warehouseFilter !== 'all' || warehouseContinent !== 'all' || warehouseSort !== 'city')) ||
    (activeTab === 'shipments' && (opsSearch !== '' || shipmentOriginFilter !== '' || shipmentDestFilter !== '' || shipmentFilter !== 'all' || shipmentSort !== 'progress')) ||
    (activeTab === 'clients' && opsSearch !== '') ||
    (activeTab === 'bags' && (opsSearch !== '' || bagStateFilter !== 'ALL'));
  const clearViewFilters = () => {
    setOpsSearch('');
    if (activeTab === 'transport') {
      setTransportOriginFilter('');
      setTransportDestFilter('');
      setUtFilter('all');
      setTransportSort('load');
    } else if (activeTab === 'warehouse') {
      setWarehouseFilter('all');
      setWarehouseContinent('all');
      setWarehouseSort('city');
    } else if (activeTab === 'shipments') {
      setShipmentOriginFilter('');
      setShipmentDestFilter('');
      setShipmentFilter('all');
      setShipmentSort('progress');
    } else if (activeTab === 'bags') {
      setBagStateFilter('ALL');
    }
  };

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

  // Ocupación promedio: preferimos el semáforo de almacén del backend (misma fórmula que
  // el reporte) y caemos al promedio local de aeropuertos si no hay datos del ciclo.
  const avgOccupancy = hasBackendStats && lastCycleUpdate?.semaphores?.storageOccupancy != null
    ? Math.round(lastCycleUpdate.semaphores.storageOccupancy * 100)
    : airports.length > 0
      ? Math.round(airports.reduce((acc, a) => acc + getOccupancyPercent(a.occupancy, a.capacity), 0) / airports.length)
      : 0;
  const criticalAirports = useMemo(() => airports.filter(a => a.status === 'critical'), [airports]);

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

  const parsedFlightPlan = useMemo(() => flightPlanFlights.map(f => ({
    ...f,
    departureMs: parseInstantMs(f.departureTime),
    arrivalMs: parseInstantMs(f.arrivalTime),
  })), [flightPlanFlights]);

  // Base de UTs (sin filtros): se usa tanto en la pestaña UT como en los drill-downs.
  // Las fechas se parsean solo cuando cambia el plan, no en cada avance del reloj.
  const baseTransportUnits = useMemo<TransportUnit[]>(() => {
    if (parsedFlightPlan.length > 0) {
      return parsedFlightPlan.map(f => {
        const active = activeBagsByFlight.get(f.flightId);
        const bags = active?.bagsCount ?? 0;
        const pct = f.capacity > 0 ? Math.round((bags / f.capacity) * 100) : 0;
        return {
          flightId: f.flightId,
          originId: f.originId,
          destinationId: f.destinationId,
          departureTime: f.departureTime,
          arrivalTime: f.arrivalTime,
          departureMs: f.departureMs,
          arrivalMs: f.arrivalMs,
          capacity: f.capacity,
          bags,
          pct,
          meetsSla: active?.meetsSla ?? true,
          empty: bags === 0,
          cancelled: cancelledSet.has(f.flightId),
        };
      });
    }
    return activeFlights.map(f => ({
      flightId: f.flightId,
      originId: f.originId,
      destinationId: f.destinationId,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      departureMs: parseInstantMs(f.departureTime),
      arrivalMs: parseInstantMs(f.arrivalTime),
      capacity: 0,
      bags: f.bagsCount,
      pct: 0,
      meetsSla: f.meetsSla,
      empty: f.bagsCount === 0,
      cancelled: cancelledSet.has(f.flightId),
    }));
  }, [parsedFlightPlan, activeFlights, activeBagsByFlight, cancelledSet]);

  const transportUnitById = useMemo(() => {
    const units = new Map<string, TransportUnit>();
    const unitsByBaseId = new Map<string, TransportUnit[]>();
    for (const unit of baseTransportUnits) {
      units.set(unit.flightId, unit);
      const baseId = stripProjectedDaySuffix(unit.flightId);
      const projected = unitsByBaseId.get(baseId);
      if (projected) projected.push(unit);
      else unitsByBaseId.set(baseId, [unit]);
    }
    return { units, unitsByBaseId };
  }, [baseTransportUnits]);

  const isShipmentCurrentFlightAirborne = (shipment: Shipment): boolean => {
    if (!shipment.currentFlightId || shipment.currentFlightId === 'PENDING') return false;
    const exact = transportUnitById.units.get(shipment.currentFlightId);
    if (exact) return !exact.cancelled && isTransportUnitInFlight(exact, nowMs);
    const projected = transportUnitById.unitsByBaseId.get(stripProjectedDaySuffix(shipment.currentFlightId)) ?? [];
    return projected.some(unit => !unit.cancelled && isTransportUnitInFlight(unit, nowMs));
  };

  const warehouseNextUtTimes = useMemo(() => {
    if (activeTab !== 'warehouse') {
      return { nextDeparture: new Map<string, number>(), nextArrival: new Map<string, number>() };
    }
    const nextDeparture = new Map<string, number>();
    const nextArrival = new Map<string, number>();
    for (const f of parsedFlightPlan) {
      const depMs = f.departureMs;
      const arrMs = f.arrivalMs;
      if (Number.isFinite(depMs) && depMs >= nowMs) {
        const prev = nextDeparture.get(f.originId);
        if (prev == null || depMs < prev) nextDeparture.set(f.originId, depMs);
      }
      if (Number.isFinite(arrMs) && arrMs >= nowMs) {
        const prev = nextArrival.get(f.destinationId);
        if (prev == null || arrMs < prev) nextArrival.set(f.destinationId, arrMs);
      }
    }
    return { nextDeparture, nextArrival };
  }, [activeTab, parsedFlightPlan, nowMs]);

  const transportClockMs = utFilter === 'inflight' ? nowMs : 0;
  const transportUnits = useMemo(() => {
    if (activeTab !== 'transport') return [];

    const query = opsSearch.trim().toLowerCase();
    const originQ = transportOriginFilter.trim().toLowerCase();
    const destQ = transportDestFilter.trim().toLowerCase();
    return baseTransportUnits
      .filter(f => !query || `${f.flightId} ${f.originId} ${f.destinationId}`.toLowerCase().includes(query))
      .filter(f => !originQ || f.originId.toLowerCase().includes(originQ))
      .filter(f => !destQ || f.destinationId.toLowerCase().includes(destQ))
      .filter(f => {
        if (utFilter === 'cancelled') return f.cancelled;
        // Las demás vistas ocultan las canceladas (ya no operan).
        if (f.cancelled) return false;
        if (utFilter === 'inflight') return isTransportUnitInFlight(f, transportClockMs);
        if (utFilter === 'empty') return f.empty;
        if (utFilter === 'normal') return !f.empty && f.pct < 70;     // semáforo verde
        if (utFilter === 'warning') return !f.empty && f.pct >= 70 && f.pct < 90; // ámbar
        if (utFilter === 'critical') return !f.empty && f.pct >= 90;  // rojo
        if (utFilter === 'loaded') return f.bags > 0;
        if (utFilter === 'sla') return !f.meetsSla;
        return true;
      })
      .sort((a, b) => {
        if (transportSort === 'departure') {
          return a.departureMs - b.departureMs;
        }
        if (transportSort === 'arrival') {
          return a.arrivalMs - b.arrivalMs;
        }
        if (transportSort === 'destination') return a.destinationId.localeCompare(b.destinationId) || a.flightId.localeCompare(b.flightId);
        if (transportSort === 'route') return `${a.originId}-${a.destinationId}`.localeCompare(`${b.originId}-${b.destinationId}`);
        if (transportSort === 'loadAsc') return a.bags - b.bags;
        return b.bags - a.bags;
      });
  }, [activeTab, baseTransportUnits, transportClockMs, opsSearch, transportOriginFilter, transportDestFilter, transportSort, utFilter]);

  // Continentes disponibles según los aeropuertos reales del backend.
  const continentOptions = useMemo(() => {
    const present = new Set<string>();
    for (const a of airports) {
      if (a.continent) present.add(a.continent);
    }
    const labels: Record<string, string> = {
      AMERICA: 'América', SOUTH_AMERICA: 'Sudamérica', NORTH_AMERICA: 'Norteamérica',
      EUROPE: 'Europa', ASIA: 'Asia', AFRICA: 'África', OCEANIA: 'Oceanía',
    };
    return [
      { id: 'all', label: 'Todos' },
      ...Array.from(present).sort().map(c => ({ id: c, label: labels[c] ?? c })),
    ];
  }, [airports]);

  const filteredWarehouses = useMemo(() => {
    if (activeTab !== 'warehouse') return [];

    const query = opsSearch.trim().toLowerCase();
    return airports
      .filter(a => !query || `${a.id} ${a.city} ${a.country} ${a.name}`.toLowerCase().includes(query))
      .filter(a => warehouseFilter === 'all'
        || (warehouseFilter === 'empty' ? a.occupancy === 0 : a.status === warehouseFilter))
      .filter(a => warehouseContinent === 'all' || (a.continent ?? '') === warehouseContinent)
      .sort((a, b) => {
        if (warehouseSort === 'occupancyAsc') return getOccupancyPercent(a.occupancy, a.capacity) - getOccupancyPercent(b.occupancy, b.capacity);
        if (warehouseSort === 'code') return a.id.localeCompare(b.id);
        if (warehouseSort === 'city') return a.city.localeCompare(b.city);
        if (warehouseSort === 'nextDeparture') {
          const aMs = warehouseNextUtTimes.nextDeparture.get(a.id) ?? Number.POSITIVE_INFINITY;
          const bMs = warehouseNextUtTimes.nextDeparture.get(b.id) ?? Number.POSITIVE_INFINITY;
          return aMs - bMs || a.id.localeCompare(b.id);
        }
        if (warehouseSort === 'nextArrival') {
          const aMs = warehouseNextUtTimes.nextArrival.get(a.id) ?? Number.POSITIVE_INFINITY;
          const bMs = warehouseNextUtTimes.nextArrival.get(b.id) ?? Number.POSITIVE_INFINITY;
          return aMs - bMs || a.id.localeCompare(b.id);
        }
        return getOccupancyPercent(b.occupancy, b.capacity) - getOccupancyPercent(a.occupancy, a.capacity);
      });
  }, [activeTab, airports, opsSearch, warehouseFilter, warehouseContinent, warehouseSort, warehouseNextUtTimes]);

  // Un envío que se dividió por capacidad aparece como varias filas independientes
  // ("B16-S1", "B16-S2"...), cada una con su propia ruta. Este mapa (id BASE -> cuántas
  // filas comparten ese base) deja marcar en la tarjeta cuáles son parte de una división,
  // sin tener que tocar cómo se listan (mismo criterio de sufijo "-S<n>" que usa el mapa
  // en selectedShipmentGeometry para dibujar la familia completa).
  const splitFamilySizeById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shipments) {
      const base = s.id.replace(/(-S\d+)+$/, '');
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    return counts;
  }, [shipments]);

  const operationalShipments = useMemo(() => {
    if (activeTab !== 'shipments') return [];

    // Solo UTs físicamente en vuelo según salida/llegada; activeFlights también contiene
    // tramos futuros de la ventana del backend y no sirve por sí solo para este estado.
    const inFlightIds = new Set(
      baseTransportUnits
        .filter(unit => !unit.cancelled && isTransportUnitInFlight(unit, nowMs))
        .map(unit => stripProjectedDaySuffix(unit.flightId)),
    );

    const query = opsSearch.trim().toLowerCase();
    const originQ = shipmentOriginFilter.trim().toLowerCase();
    const destQ = shipmentDestFilter.trim().toLowerCase();
    const filtered = shipments
      .filter(s => !query || `${s.id} ${s.origin} ${s.destination} ${s.airlineId} ${s.airline} ${s.currentFlightId}`.toLowerCase().includes(query))
      .filter(s => !originQ || s.origin.toLowerCase().includes(originQ))
      .filter(s => !destQ || s.destination.toLowerCase().includes(destQ))
      .filter(s => {
        if (shipmentFilter === 'all') return true;
        if (shipmentFilter === 'inflight') {
          // Estado en vivo (tramo a tramo) — si tiene itinerario, lo deriva del reloj;
          // si no, cae al método anterior (vuelo actual ∈ UTs en vuelo).
          // Guardia de volumen (escenario colapso): con >20k envíos, derivar por elemento en
          // cada commit del reloj (~4×/s) costaría ms perceptibles; se usa el método estático.
          if (s.legs && s.legs.length > 0 && shipments.length <= 20_000) {
            return liveShipmentState(s, nowMs).state === 'in_flight';
          }
          return s.progress < 1 && !!s.currentFlightId && s.currentFlightId !== 'PENDING'
            && inFlightIds.has(stripProjectedDaySuffix(s.currentFlightId));
        }
        if (shipmentFilter === 'delivered') return isDeliveredInSimWindow(s, simulationTime);
        return s.status === shipmentFilter;
      });

    if (shipmentSort === 'progress' || shipmentSort === 'progressAsc') {
      // Ordenar por el progreso EN VIVO (interpolado), no por el estático: así "mayor/menor
      // progreso" se reordena solo conforme avanzan las barras. Se precalcula una vez por
      // envío (evita re-parsear fechas en cada comparación del sort).
      const lp = new Map<string, number>();
      for (const s of filtered) lp.set(s.id, liveJourneyProgress(s, nowMs));
      return filtered.sort((a, b) => {
        const pa = lp.get(a.id) ?? 0;
        const pb = lp.get(b.id) ?? 0;
        return shipmentSort === 'progressAsc'
          ? (pa - pb || a.id.localeCompare(b.id))
          : (pb - pa || a.id.localeCompare(b.id));
      });
    }
    return filtered.sort((a, b) => {
      if (shipmentSort === 'bags') return b.luggageCount - a.luggageCount;
      if (shipmentSort === 'bagsAsc') return a.luggageCount - b.luggageCount;
      if (shipmentSort === 'route') return `${a.origin}-${a.destination}`.localeCompare(`${b.origin}-${b.destination}`);
      return a.id.localeCompare(b.id);
    });
  }, [activeTab, shipments, opsSearch, shipmentOriginFilter, shipmentDestFilter, shipmentSort, shipmentFilter, baseTransportUnits, simulationTime, nowMs]);

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
      .sort((a, b) => {
        if (clientSort === 'shipments') return b.shipmentCount - a.shipmentCount;
        if (clientSort === 'delivered') return b.deliveredCount - a.deliveredCount;
        if (clientSort === 'name') return a.clientId.localeCompare(b.clientId);
        return b.luggageCount - a.luggageCount;
      })
      .slice(0, VISIBLE_OPERATIONAL_ROWS);
  }, [activeTab, shipments, opsSearch, clientSort]);

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
    const unitInFlight = unit ? isTransportUnitInFlight(unit, nowMs) : false;
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
                  title="Centrar y filtrar UT en mapa"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 mt-2">
                <ReportRow label="Salida" value={formatHourUtc(unit.departureTime)} color="#A8C0E0" />
                <ReportRow label="Llegada" value={formatHourUtc(unit.arrivalTime)} color="#A8C0E0" />
                <ReportRow label="Carga" value={unit.capacity > 0 ? `${unit.bags}/${unit.capacity}` : `${unit.bags}`} color={utColor} />
                <ReportRow label="Estado" value={unitInFlight ? 'En vuelo' : unit.empty ? 'Vacío' : 'Programado'} color={unitInFlight ? '#4DA6FF' : '#A8C0E0'} />
                <ReportRow label="Puntualidad" value={unit.meetsSla ? 'A tiempo' : 'En riesgo'} color={unit.meetsSla ? '#00FF9C' : '#FFC857'} />
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
                nowMs={nowMs}
                currentFlightAirborne={isShipmentCurrentFlightAirborne(s)}
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
                  title="Centrar y filtrar almacén en mapa"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 rounded-full bg-[#1E3058] overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-[600ms] ease-linear" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
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
                nowMs={nowMs}
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
                nowMs={nowMs}
                currentFlightAirborne={isShipmentCurrentFlightAirborne(s)}
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
                  {(() => {
                    const live = liveShipmentState(shipment, nowMs, isShipmentCurrentFlightAirborne(shipment));
                    const m = LIVE_STATE_META[live.state];
                    const where = live.flightId ? `Vuelo ${live.flightId}` : live.airportId ? `Almacén ${live.airportId}` : '';
                    return (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ backgroundColor: `${m.color}1F`, color: m.color, fontWeight: 600 }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                          {m.label}
                        </span>
                        {where && <span className="text-[10px] text-[#7090B0] truncate">{where}</span>}
                      </div>
                    );
                  })()}
                </div>
                <button
                  onClick={() => handleMapFilterClick({ type: 'shipment', id }, () => onSelectShipment?.(id))}
                  className={mapFilterButtonClass(isFilterActive('shipment', id))}
                  title="Centrar y filtrar envío en mapa"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 rounded-full bg-[#1E3058] overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${Math.round(liveJourneyProgress(shipment, nowMs) * 100)}%`, backgroundColor: color }} />
                </div>
                <span className="text-[11px] font-mono" style={{ color }}>{Math.round(liveJourneyProgress(shipment, nowMs) * 100)}%</span>
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
          batchId={id.replace(/(-S\d+)+$/, '')}
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
                nowMs={nowMs}
                currentFlightAirborne={isShipmentCurrentFlightAirborne(s)}
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
        {!currentInspector && viewFiltersActive && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#4DA6FF]/10 border border-[#4DA6FF]/30">
            <span className="text-[10px] text-[#4DA6FF]" style={{ fontWeight: 600 }}>Filtros activos en esta vista</span>
            <button
              onClick={clearViewFilters}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#4DA6FF] hover:bg-[#4DA6FF]/20"
              style={{ fontWeight: 600 }}
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>
        )}
        {currentInspector && renderInspector(currentInspector)}

        {/* KPI Tab */}
        {!currentInspector && activeTab === 'kpi' && (
          <>
            {viewerCount > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#0A1628] border border-[#1E3058] text-[10px] text-[#A8C0E0]">
                <Activity className="w-3 h-3 text-[#4DA6FF]" />
                {viewerCount} visualizador{viewerCount === 1 ? '' : 'es'} conectado{viewerCount === 1 ? '' : 's'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <KPICard
                label={hasBackendStats ? 'MALETAS EN VUELO' : 'EN TRÁNSITO'}
                value={totalInTransit}
                color="#4DA6FF"
                icon={<Package className="w-3.5 h-3.5" />}
              />
              <KPICard
                label="ENTREGADAS"
                value={deliveredBags}
                color="#00FF9C"
                icon={<CheckCircle className="w-3.5 h-3.5" />}
              />
              <KPICard
                label="POR ENTREGAR"
                value={pendingBags}
                color={Number(pendingBags) > 0 ? '#FFC857' : '#00FF9C'}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
              />
              <KPICard
                label="EN ALMACÉN"
                value={storedBags}
                color={criticalCount > 0 ? '#FF4D4D' : '#00FF9C'}
                icon={<Warehouse className="w-3.5 h-3.5" />}
              />
              <KPICard
                label="TOTAL MALETAS"
                value={typeof totalBags === 'number' ? totalBags.toLocaleString() : totalBags}
                color="#A8C0E0"
                icon={<Zap className="w-3.5 h-3.5" />}
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
                  { value: 'loadAsc', label: 'Menos carga' },
                  { value: 'departure', label: 'Salida' },
                  { value: 'arrival', label: 'Llegada' },
                  { value: 'destination', label: 'Destino' },
                  { value: 'route', label: 'Ruta' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <SearchBox value={transportOriginFilter} onChange={setTransportOriginFilter} placeholder="Origen" />
              <SearchBox value={transportDestFilter} onChange={setTransportDestFilter} placeholder="Destino" />
            </div>
            <FilterChips options={UT_FILTER_OPTIONS} value={utFilter} onChange={setUtFilter} />
            <div className="mt-2">
              <SectionLabel>UNIDADES DE TRANSPORTE · {transportUnits.length}</SectionLabel>
            </div>
            <div className="max-h-[520px] overflow-y-auto flex flex-col gap-2">
              {transportUnits.slice(0, VISIBLE_UT_ROWS).map(unit => (
                <UtCard
                  key={unit.flightId}
                  unit={unit}
                  nowMs={nowMs}
                  mapActive={isFilterActive('flight', unit.flightId)}
                  onOpen={() => openInspector({ kind: 'ut', id: unit.flightId })}
                  onMapFilter={() => handleMapFilterClick({ type: 'flight', id: unit.flightId }, () => onSelectFlight?.(unit.flightId))}
                />
              ))}
              {transportUnits.length > VISIBLE_UT_ROWS && (
                <div className="text-[11px] text-[#4A6080] px-2 py-3 text-center border-t border-[#1E3058]/40">
                  Mostrando {VISIBLE_UT_ROWS} de {transportUnits.length.toLocaleString()} · refina con búsqueda o filtros
                </div>
              )}
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
                  { value: 'progress', label: 'Progreso ↓' },
                  { value: 'progressAsc', label: 'Progreso ↑' },
                  { value: 'bags', label: 'Maletas ↓' },
                  { value: 'bagsAsc', label: 'Maletas ↑' },
                  { value: 'route', label: 'Ruta' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <SearchBox value={shipmentOriginFilter} onChange={setShipmentOriginFilter} placeholder="Origen" />
              <SearchBox value={shipmentDestFilter} onChange={setShipmentDestFilter} placeholder="Destino" />
            </div>
            <FilterChips options={isBackendStatsMode ? SHIPMENT_FILTER_OPTIONS_BACKEND : SHIPMENT_FILTER_OPTIONS} value={shipmentFilter} onChange={setShipmentFilter} />
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
                  familySize={splitFamilySizeById.get(shipment.id.replace(/(-S\d+)+$/, '')) ?? 1}
                  mapActive={isFilterActive('shipment', shipment.id)}
                  onOpen={() => openInspector({ kind: 'shipment', id: shipment.id })}
                  onMapFilter={() => handleMapFilterClick({ type: 'shipment', id: shipment.id }, () => onSelectShipment?.(shipment.id))}
                  nowMs={nowMs}
                  currentFlightAirborne={isShipmentCurrentFlightAirborne(shipment)}
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
              <SortSelect
                value={clientSort}
                onChange={v => setClientSort(v as typeof clientSort)}
                options={[
                  { value: 'bags', label: 'Maletas' },
                  { value: 'shipments', label: 'Envíos' },
                  { value: 'delivered', label: 'Entregadas' },
                  { value: 'name', label: 'Cliente' },
                ]}
              />
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
                      // "-S<n>" en el batchId = esta maleta viajó en un sub-lote (el envío se
                      // dividió por capacidad); dos maletas del MISMO cliente/lote original con
                      // batchId distinto tomaron rutas distintas.
                      const isSplitLot = /-S\d+$/.test(bag.batchId);
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
                                {isSplitLot && (
                                  <span
                                    className="text-[9px] px-1 rounded flex-shrink-0"
                                    style={{ backgroundColor: '#B78CFF1F', color: '#B78CFF', fontWeight: 600 }}
                                    title="Esta maleta viajó en un sub-lote de un envío dividido por capacidad"
                                  >
                                    {bag.batchId}
                                  </span>
                                )}
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
                  <ReportRow label="Deadline" value={formatTraceTime(selectedBag.deadline)} color={selectedBag.meetsSla ? '#00FF9C' : '#FFC857'} />
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
                    onClick={() => {
                      // Traza completa en el mapa: todos los tramos (UTs) y almacenes de escala
                      // por los que pasó la maleta, derivados de sus eventos de trazabilidad.
                      const flightIds = Array.from(new Set(
                        selectedBag.events.filter(e => e.flightId).map(e => e.flightId as string)
                      ));
                      const airportIds = Array.from(new Set(
                        [selectedBag.originId, selectedBag.destinationId,
                         ...selectedBag.events.map(e => e.airportId).filter(Boolean) as string[]]
                      ));
                      if (onTraceRoute && flightIds.length > 0) {
                        onTraceRoute(`Maleta ${selectedBag.bagId}`, flightIds, airportIds);
                      } else if (selectedBag.currentFlightId) {
                        handleMapFilterClick({ type: 'flight', id: selectedBag.currentFlightId }, () => onSelectFlight?.(selectedBag.currentFlightId!));
                      } else {
                        handleMapFilterClick({ type: 'shipment', id: selectedBag.batchId }, () => onSelectShipment?.(selectedBag.batchId));
                      }
                    }}
                    className="h-6 px-2 rounded border border-[#00FF9C]/40 text-[10px] text-[#00FF9C] hover:bg-[#00FF9C]/10 flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3" /> Ver ruta en mapa
                  </button>
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
                          fill={entry.pct >= 80 ? '#FF4D4D' : entry.pct >= 50 ? '#FFC857' : '#00FF9C'}
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
                      { value: 'nextDeparture', label: 'Próx. salida' },
                      { value: 'nextArrival', label: 'Próx. llegada' },
                      { value: 'code', label: 'Código' },
                      { value: 'city', label: 'Ciudad' },
                    ]}
                  />
                </div>
                <FilterChips options={WAREHOUSE_FILTER_OPTIONS} value={warehouseFilter} onChange={setWarehouseFilter} />
                {continentOptions.length > 1 && (
                  <FilterChips options={continentOptions} value={warehouseContinent} onChange={setWarehouseContinent} />
                )}
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
                        <div className="h-full rounded-full transition-[width] duration-[600ms] ease-linear" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color }}>{pct}%</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleMapFilterClick({ type: 'airport', id: a.id }, () => onSelectAirport?.(a.id)); }}
                        className={mapFilterButtonClass(active, 'w-6 h-6')}
                        title={active ? 'Quitar filtro del mapa' : 'Centrar y filtrar almacén en mapa'}
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
                  { label: 'Ocupación Prom.', value: `${avgOccupancy}%`, color: getStatusColor(avgOccupancy >= 80 ? 'critical' : avgOccupancy >= 50 ? 'warning' : 'normal') },
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
