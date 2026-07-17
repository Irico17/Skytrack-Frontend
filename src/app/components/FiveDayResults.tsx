import React, { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Globe, X, Download, RotateCcw, CheckCircle, AlertTriangle, Zap,
  Package, TrendingUp, Clock, Layers, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Activity, Warehouse,
  AlertOctagon, FileText, Calendar,
} from 'lucide-react';
import { DaySnapshot } from '../hooks/useSimulation';
import { Shipment, SimEvent, Airport } from '../data/mockData';
import type { BackendCycleUpdate, BackendSimulationResults } from '../types/backend';
import { LastCycleSnapshot } from './LastCycleSnapshot';
import { downloadTextFile, reportLine, reportSection } from '../utils/exportReport';

interface FiveDayResultsProps {
  startDate: Date;
  daySnapshots: DaySnapshot[];
  shipments: Shipment[];
  events: SimEvent[];
  airports: Airport[];
  lastCycleUpdate?: BackendCycleUpdate | null;
  results?: BackendSimulationResults | null;
  onClose: () => void;
  onReset: () => void;
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmtDate(base: Date, offset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]}`;
}

function fmtDateRange(base: Date, offsetEnd: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetEnd);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildDailyBags(startDate: Date) {
  return [] as { day: string; bags: number; replanned: number }[];
}

function buildDailyBagsFromSnapshots(snapshots: DaySnapshot[], startDate: Date) {
  if (snapshots.length === 0) return buildDailyBags(startDate);
  return snapshots.map(s => ({
    day: s.date || fmtDate(startDate, s.day),
    bags: s.totalBags,
    replanned: s.replanned,
  }));
}

function buildStatusEvolutionFromSnapshots(snapshots: DaySnapshot[]) {
  if (snapshots.length === 0) return [];
  // Mismo denominador para retrasados y críticos: total de envíos del día
  const points = snapshots.map(s => {
    const total = Math.max(s.completed, s.delayed + s.critical, 1);
    return {
      label: `Día ${s.day}`,
      day: `Día ${s.day}`,
      onTime: s.onTimePct,
      delayed: Math.max(0, Math.min(100, Math.round((s.delayed / total) * 100))),
      critical: Math.max(0, Math.min(100, Math.round((s.critical / total) * 100))),
    };
  });
  // El punto "Inicio" replica el primer día para no dibujar una subida falsa desde 0
  return [{ ...points[0], label: 'Día 0\n(Inicio)', day: 'Inicio' }, ...points];
}

function buildIncidentTimelineFromEvents(events: SimEvent[], startDate: Date) {
  if (events.length === 0) return [];
  return events.slice(0, 12).map(event => ({
    time: event.time.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    type: event.severity === 'critical' ? 'critical' : event.severity === 'warning' ? 'warning' : 'info',
    text: event.message,
  }));
}

function buildAirportImpactFromAirports(airports: Airport[]) {
  if (airports.length === 0) return [];
  return airports
    .map(a => {
      const peakVal = a.peakOccupancy !== undefined ? a.peakOccupancy : a.occupancy;
      const peakOccupancy = Math.round((peakVal / Math.max(a.capacity, 1)) * 100);
      const daysOverloaded = a.daysOverloaded ?? 0;
      return {
        id: a.id,
        city: a.city,
        peakOccupancy,
        daysOverloaded,
        color: peakOccupancy >= 90 ? '#FF4D4D' : peakOccupancy >= 70 ? '#FFC857' : '#00FF9C',
      };
    })
    .sort((a, b) => b.peakOccupancy - a.peakOccupancy)
    .slice(0, 6);
}

// ── Real-data derivations ─────────────────────────────────────────────────────

interface AirlineStat { code: string; name: string; onTime: number; bags: number; incidents: number }

/** Agrupa los envíos reales por aerolínea para calcular puntualidad, maletas e incidentes. */
function deriveAirlinePerformance(shipments: Shipment[]): AirlineStat[] {
  const map = new Map<string, { code: string; name: string; bags: number; total: number; onTime: number; incidents: number }>();
  for (const s of shipments) {
    const code = s.airlineId || s.airline || '—';
    const e = map.get(code) ?? { code, name: s.airline || code, bags: 0, total: 0, onTime: 0, incidents: 0 };
    e.bags += s.luggageCount;
    e.total += 1;
    if (s.status === 'on-time') e.onTime += 1;
    else e.incidents += 1;
    map.set(code, e);
  }
  return Array.from(map.values())
    .map(e => ({
      code: e.code,
      name: e.name,
      onTime: e.total > 0 ? Math.round((e.onTime / e.total) * 100) : 0,
      bags: e.bags,
      incidents: e.incidents,
    }))
    .sort((a, b) => b.onTime - a.onTime || b.bags - a.bags);
}

interface ReplanAction { route: string; alt: string; airline: string; status: string }

/** Extrae las rutas realmente replanificadas (con escalas / múltiples vuelos). */
function deriveReplanningActions(shipments: Shipment[]): ReplanAction[] {
  return shipments
    .filter(s => s.isReplanned)
    .slice(0, 8)
    .map(s => ({
      route: `${s.origin} → ${s.destination}`,
      alt: `Entrega est.: ${s.estimatedDelivery}`,
      airline: s.airlineId || s.airline || '—',
      status: s.status === 'on-time' ? 'success' : 'pending',
    }));
}

interface IncidentSummary {
  total: number; critical: number; warning: number; info: number;
  affectedBags: number; recoveredBags: number;
}

/** Resume los incidentes reales (eventos) y las maletas afectadas/recuperadas. */
function deriveIncidentSummary(events: SimEvent[], shipments: Shipment[]): IncidentSummary {
  const critical = events.filter(e => e.severity === 'critical').length;
  const warning = events.filter(e => e.severity === 'warning').length;
  const info = events.filter(e => e.severity === 'info').length;
  const affectedBags = shipments
    .filter(s => s.status !== 'on-time')
    .reduce((acc, s) => acc + s.luggageCount, 0);
  const recoveredBags = shipments
    .filter(s => s.isReplanned && s.status === 'on-time')
    .reduce((acc, s) => acc + s.luggageCount, 0);
  return { total: events.length, critical, warning, info, affectedBags, recoveredBags };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label, value, unit, subtext, color, icon, trend, trendValue,
}: {
  label: string; value: string | number; unit?: string; subtext?: string;
  color: string; icon: React.ReactNode; trend?: 'up' | 'down' | 'neutral'; trendValue?: string;
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor = trend === 'up' ? '#00FF9C' : trend === 'down' ? '#FF4D4D' : '#4A6080';
  return (
    <div className="relative flex flex-col justify-between p-4 rounded-xl border border-[#1E3058] bg-[#0A1628] overflow-hidden">
      <div
        className="absolute inset-0 opacity-5 pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(ellipse at top left, ${color}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl" style={{ fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
        {unit && <span className="text-sm text-[#4A6080]">{unit}</span>}
      </div>
      <div className="flex items-center justify-between mt-2">
        {subtext && <span className="text-[11px] text-[#4A6080]">{subtext}</span>}
        {trendValue && (
          <div className="flex items-center gap-0.5 text-[11px]" style={{ color: trendColor }}>
            <TrendIcon className="w-3 h-3" />
            <span>{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[#4DA6FF]">{icon}</span>
      <span className="text-[11px] text-[#4A6080]" style={{ letterSpacing: '0.12em', fontWeight: 700 }}>{children}</span>
      <div className="flex-1 h-px bg-[#1E3058]" />
    </div>
  );
}

const CustomAreaTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0D1E38] border border-[#1E3058] rounded-lg p-3 shadow-xl text-xs">
      <div className="text-[#A8C0E0] mb-2" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={`tooltip-area-${p.name}`} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[#7090B0]">{p.name}:</span>
          <span style={{ color: p.color, fontWeight: 600 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

const CustomBagsTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0D1E38] border border-[#1E3058] rounded-lg p-3 shadow-xl text-xs">
      <div className="text-[#A8C0E0] mb-2" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={`tooltip-bags-${p.dataKey}`} className="flex items-center gap-2 mb-0.5">
          <span className="text-[#7090B0]">{p.dataKey === 'bags' ? 'Total Maletas' : 'Replanificados'}:</span>
          <span className="text-[#4DA6FF]" style={{ fontWeight: 600 }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export function FiveDayResults({ startDate, daySnapshots, shipments, events, airports, lastCycleUpdate, results, onClose, onReset }: FiveDayResultsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'days' | 'airlines' | 'incidents'>('overview');
  // Paginación del ranking de aerolíneas (evita listas pesadas con muchos clientes).
  const AIRLINES_PAGE_SIZE = 10;
  const [airlinePage, setAirlinePage] = useState(0);
  const reportStart = results?.startDateTime ? new Date(results.startDateTime) : startDate;
  const reportEnd = results?.endDateTime
    ? new Date(results.endDateTime)
    : new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000);

  const reportSnapshots: DaySnapshot[] = daySnapshots.length > 0 ? daySnapshots : (lastCycleUpdate ? [{
    day: Math.max(1, Math.ceil(lastCycleUpdate.daysElapsed)),
    date: fmtDate(startDate, Math.max(1, Math.ceil(lastCycleUpdate.daysElapsed))),
    onTimePct: lastCycleUpdate.totalRoutes > 0
      ? Math.round((lastCycleUpdate.batchSummary.onTime / lastCycleUpdate.totalRoutes) * 100)
      : 0,
    delayed: lastCycleUpdate.batchSummary.delayed,
    critical: lastCycleUpdate.batchSummary.unrouted,
    completed: lastCycleUpdate.totalRoutes,
    totalBags: lastCycleUpdate.totalBags,
    newEvents: 0,
    avgOccupancy: Math.round(lastCycleUpdate.semaphores.storageOccupancy * 100),
    replanned: 0,
    keyEvent: `Último ciclo ${lastCycleUpdate.cycle} — Fitness: ${lastCycleUpdate.fitness.toFixed(2)}`,
    severity: lastCycleUpdate.semaphores.storage === 'RED' ? 'critical'
      : lastCycleUpdate.semaphores.storage === 'AMBER' ? 'warning' : 'normal',
  }] : []);

  const dailyBags = buildDailyBagsFromSnapshots(reportSnapshots, startDate);
  const statusEvolution = buildStatusEvolutionFromSnapshots(reportSnapshots);
  const incidentTimeline = buildIncidentTimelineFromEvents(events, startDate);
  const airportImpact = buildAirportImpactFromAirports(airports);

  // ── Derivaciones de datos reales ──
  const airlinePerf = React.useMemo(() => deriveAirlinePerformance(shipments), [shipments]);
  const replanActions = React.useMemo(() => deriveReplanningActions(shipments), [shipments]);
  const incidentSummary = React.useMemo(() => deriveIncidentSummary(events, shipments), [events, shipments]);
  const airlinePerformance = airlinePerf;
  const replanningActions = replanActions;

  const om = lastCycleUpdate?.operationalMetrics;
  const shipmentsBags = shipments.reduce((acc, s) => acc + s.luggageCount, 0);

  // Computed totals
  const totalBags = dailyBags.reduce((acc, d) => acc + d.bags, 0);
  const finalOnTimeRate = results?.slaCompliancePercent != null
    ? Math.round(results.slaCompliancePercent)
    : (reportSnapshots[reportSnapshots.length - 1]?.onTimePct ?? 0);
  const firstOnTimeRate = reportSnapshots[0]?.onTimePct ?? finalOnTimeRate;
  const punctualityDelta = finalOnTimeRate - firstOnTimeRate;

  // KPIs reales (preferimos métricas del backend; si faltan, derivamos de envíos/snapshots)
  // Nota: results.totalBatches son ENVÍOS (lotes), no maletas — no se usa aquí
  const realTotalBags = om?.totalAssignedBags ?? lastCycleUpdate?.totalBags ?? (shipmentsBags > 0 ? shipmentsBags : totalBags);
  const deliveredBags = om?.deliveredBags ?? 0;
  const totalShipments = results?.routedBatches ?? (shipments.length > 0
    ? shipments.length
    : lastCycleUpdate?.totalRoutes ?? reportSnapshots.reduce((acc, s) => acc + s.completed, 0));
  const replannedCount = shipments.filter(s => s.isReplanned).length;
  const totalIncidents = incidentSummary.critical + incidentSummary.warning;
  const peakAirport = airportImpact[0];
  const peakOccupancy = om?.peakAirportOccupancyRatio != null
    ? Math.round(om.peakAirportOccupancyRatio * 100)
    : (peakAirport?.peakOccupancy ?? 0);
  const peakAirportId = om?.peakAirportId ?? peakAirport?.id ?? '—';
  const overloadedAirports = om?.overloadedAirports ?? airports.filter(a => a.capacity > 0 && a.occupancy >= a.capacity).length;
  const efficiencyScore = Math.max(0, Math.min(100,
    Math.round(finalOnTimeRate * 0.8 + Math.max(0, 100 - peakOccupancy) * 0.2)));

  // Resumen de flota (derivado de airlinePerformance)
  const bestAirline = airlinePerformance[0];
  const mostBagsAirline = [...airlinePerformance].sort((a, b) => b.bags - a.bags)[0];
  const mostIncidentsAirline = [...airlinePerformance].sort((a, b) => b.incidents - a.incidents)[0];
  const networkAvgOnTime = airlinePerformance.length > 0
    ? Math.round(airlinePerformance.reduce((acc, a) => acc + a.onTime, 0) / airlinePerformance.length)
    : 0;
  const onTimeCompliantAirlines = airlinePerformance.filter(a => a.onTime >= 70).length;

  const handleExportTxt = () => {
    const num = (n: number | undefined) => (n === undefined || n === null ? '—' : n.toLocaleString());
    const lines: string[] = [];
    lines.push('SKYTRACK — REPORTE DE SIMULACIÓN DE 5 DÍAS');
    lines.push(`Generado: ${new Date().toLocaleString('es-PE', { hour12: false })}`);
    if (results) {
      lines.push(`Periodo: ${fmtDateRange(reportStart, 0)} → ${fmtDateRange(reportEnd, 0)}`);
      lines.push(reportSection('RESUMEN GLOBAL'));
      lines.push(reportLine('Maletas transportadas', num(realTotalBags)));
      lines.push(reportLine('Entregadas', num(deliveredBags)));
      lines.push(reportLine('Lotes totales', results.totalBatches));
      lines.push(reportLine('Lotes con ruta', results.routedBatches));
      lines.push(reportLine('Sin ruta', results.unroutableBatches));
      lines.push(reportLine('A tiempo (%)', Math.round(results.slaCompliancePercent)));
      lines.push(reportLine('Ciclos', results.totalCycles));
      lines.push(reportLine('Fitness final', results.fitness.toFixed(2)));
    }
    if (lastCycleUpdate) {
      const om = lastCycleUpdate.operationalMetrics;
      lines.push(reportSection(`ÚLTIMO CICLO (#${lastCycleUpdate.cycle})`));
      lines.push(reportLine('Vuelos en vuelo', num(om?.activeLoadedFlights ?? lastCycleUpdate.activeFlights?.length)));
      lines.push(reportLine('Maletas en vuelo', num(om?.inFlightBags)));
      lines.push(reportLine('Entregadas', num(om?.deliveredBags)));
      lines.push(reportLine('Por planificar', num(lastCycleUpdate.batchSummary?.unrouted)));
    }
    if (daySnapshots.length > 0) {
      lines.push(reportSection('POR DÍA'));
      daySnapshots.forEach(d => lines.push(reportLine(`${d.date}`, `entregas ${d.completed} · a tiempo ${d.onTimePct}% · retrasados ${d.delayed}`)));
    }
    if (airlinePerformance.length > 0) {
      lines.push(reportSection(`RANKING DE AEROLÍNEAS (${airlinePerformance.length})`));
      airlinePerformance.forEach((a, i) => lines.push(reportLine(`${i + 1}. ${a.code} ${a.name}`, `${a.onTime}% · ${a.bags.toLocaleString()} maletas · ${a.incidents} incid.`)));
    }
    downloadTextFile(`reporte_5dias_${Date.now()}.txt`, lines.join('\n') + '\n');
  };

  // Peor día real: el de menor puntualidad (solo si hay más de un día para comparar)
  const worstDayNum = reportSnapshots.length > 1
    ? reportSnapshots.reduce((worst, s) => (s.onTimePct < worst.onTimePct ? s : worst), reportSnapshots[0]).day
    : null;


  const tabs = [
    { id: 'overview' as const, label: 'Resumen', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'days' as const, label: 'Día a Día', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'airlines' as const, label: 'Aerolíneas', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'incidents' as const, label: 'Incidentes', icon: <AlertOctagon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#060D1F', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-16 bg-[#0A1628] border-b border-[#1E3058] flex items-center px-6 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 flex items-center justify-center">
            <Globe className="w-5 h-5 text-[#4DA6FF]" />
          </div>
          <div>
            <div className="text-white text-sm" style={{ fontWeight: 700, letterSpacing: '0.06em' }}>SKYTRACK</div>
            <div className="text-[#4DA6FF] text-[9px]" style={{ letterSpacing: '0.2em' }}>LOGISTICS CONTROL</div>
          </div>
        </div>

        <div className="w-px h-8 bg-[#1E3058]" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-[#4A6080]">
          <span>Panel Principal</span>
          <ChevronRight className="w-3 h-3" />
          <span>Simulación 5 Días</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#4DA6FF]" style={{ fontWeight: 600 }}>Reporte de Resultados</span>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00FF9C]/10 border border-[#00FF9C]/30">
          <CheckCircle className="w-3.5 h-3.5 text-[#00FF9C]" />
          <span className="text-xs text-[#00FF9C]" style={{ fontWeight: 600 }}>Simulación Completa</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D1E38] border border-[#1E3058] text-xs text-[#A8C0E0]">
          <Clock className="w-3 h-3 text-[#4A6080]" />
          <span>{fmtDateRange(reportStart, 0)} – {fmtDateRange(reportEnd, 0)}</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={handleExportTxt}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4DA6FF]/10 border border-[#4DA6FF]/30 text-xs text-[#4DA6FF] hover:bg-[#4DA6FF]/20 transition-colors"
          style={{ fontWeight: 600 }}
          title="Descargar un resumen del reporte en texto (.txt)"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar TXT
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A2E4A] border border-[#1E3058] text-xs text-[#A8C0E0] hover:border-[#4DA6FF]/40 transition-colors"
          style={{ fontWeight: 600 }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Nueva Simulación
        </button>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-lg bg-[#1A2E4A] border border-[#1E3058] flex items-center justify-center hover:border-[#FF4D4D]/40 hover:text-[#FF4D4D] text-[#A8C0E0] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-1 px-6 pt-4 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs transition-colors border-b-2
              ${activeTab === tab.id
                ? 'text-[#4DA6FF] border-[#4DA6FF] bg-[#0D1E38]'
                : 'text-[#4A6080] border-transparent hover:text-[#A8C0E0] hover:bg-[#0D1E38]/50'
              }`}
            style={{ fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: '#060D1F' }}>

        {/* ════ OVERVIEW TAB ════ */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-5">

            {/* Último ciclo ejecutado — estado final de la simulación */}
            <LastCycleSnapshot
              lastCycleUpdate={lastCycleUpdate}
              accent="#4DA6FF"
              subtitle="Estado final de la simulación de 5 días"
            />

            {/* KPI Strip */}
            <div className="grid grid-cols-7 gap-3">
              <MetricCard
                label="TOTAL MALETAS TRANSPORTADAS"
                value={realTotalBags.toLocaleString()}
                subtext={`${deliveredBags.toLocaleString()} entregadas`}
                color="#4DA6FF"
                icon={<Package className="w-3.5 h-3.5" />}
                trend={deliveredBags > 0 ? 'up' : 'neutral'}
                trendValue={realTotalBags > 0 ? `${Math.round((deliveredBags / realTotalBags) * 100)}% entregado` : '—'}
              />
              <MetricCard
                label="TASA DE PUNTUALIDAD FINAL"
                value={finalOnTimeRate}
                unit="%"
                subtext={results?.slaCompliancePercent != null ? 'Del período' : 'Último día'}
                color="#00FF9C"
                icon={<CheckCircle className="w-3.5 h-3.5" />}
                trend={punctualityDelta > 0 ? 'up' : punctualityDelta < 0 ? 'down' : 'neutral'}
                trendValue={`${punctualityDelta >= 0 ? '+' : ''}${punctualityDelta}pp vs Día 1`}
              />
              <MetricCard
                label="INCIDENTES REGISTRADOS"
                value={totalIncidents}
                subtext={`${incidentSummary.critical} críticos · ${incidentSummary.warning} alertas`}
                color="#FF4D4D"
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                trend="neutral"
                trendValue={`${incidentSummary.total} eventos`}
              />
              <MetricCard
                label="RUTAS REPLANIFICADAS"
                value={replannedCount}
                subtext="Con escalas alternas"
                color="#A855F7"
                icon={<Zap className="w-3.5 h-3.5" />}
                trend={replannedCount > 0 ? 'up' : 'neutral'}
                trendValue={`${incidentSummary.recoveredBags.toLocaleString()} maletas recup.`}
              />
              <MetricCard
                label="ENVÍOS PLANIFICADOS"
                value={totalShipments}
                subtext={`${realTotalBags.toLocaleString()} maletas`}
                color="#00FF9C"
                icon={<Activity className="w-3.5 h-3.5" />}
                trend={(results?.unroutableBatches ?? 0) > 0 ? 'down' : 'up'}
                trendValue={`${(results?.unroutableBatches ?? 0).toLocaleString()} sin ruta`}
              />
              <MetricCard
                label="CARGA MÁXIMA DE AEROPUERTO"
                value={peakOccupancy}
                unit="%"
                subtext={`${peakAirportId} — pico`}
                color={peakOccupancy >= 90 ? '#FF4D4D' : peakOccupancy >= 75 ? '#FFC857' : '#00FF9C'}
                icon={<Warehouse className="w-3.5 h-3.5" />}
                trend="neutral"
                trendValue={`${overloadedAirports} sobre capacidad`}
              />
              <MetricCard
                label="PUNTUACIÓN DE EFICIENCIA"
                value={efficiencyScore}
                unit="/100"
                subtext="Puntualidad + ocupación"
                color="#FFC857"
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                trend={efficiencyScore >= 70 ? 'up' : 'down'}
                trendValue={finalOnTimeRate >= 70 ? 'Meta cumplida' : 'Bajo meta'}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-4">

              {/* Status Evolution — isAnimationActive={false} fixes recharts 2.x duplicate-key bug
                  where all Area siblings share the same animationId → key "area-{animationId}" */}
              <div className="col-span-2 bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>EVOLUCIÓN DE ESTADO — PERÍODO 5 DÍAS</SectionTitle>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={statusEvolution} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fdr-gradGreen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00FF9C" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#00FF9C" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fdr-gradAmber" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FFC857" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#FFC857" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fdr-gradRed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FF4D4D" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#FF4D4D" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E3058" strokeOpacity={0.5} />
                      <XAxis dataKey="day" tick={{ fill: '#4A6080', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#4A6080', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                      <ReTooltip content={<CustomAreaTooltip />} cursor={{ stroke: '#1E3058', strokeWidth: 1 }} />
                      {worstDayNum != null && (
                        <ReferenceLine x={`Día ${worstDayNum}`} stroke="#FF4D4D" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: 'PEOR DÍA', position: 'top', fill: '#FF4D4D', fontSize: 9 }} />
                      )}
                      <Area key="area-onTime" isAnimationActive={false} type="monotone" dataKey="onTime" name="A Tiempo" stroke="#00FF9C" strokeWidth={2} fill="url(#fdr-gradGreen)" dot={{ fill: '#00FF9C', r: 3, strokeWidth: 0 }} />
                      <Area key="area-delayed" isAnimationActive={false} type="monotone" dataKey="delayed" name="Retrasados" stroke="#FFC857" strokeWidth={2} fill="url(#fdr-gradAmber)" dot={{ fill: '#FFC857', r: 3, strokeWidth: 0 }} />
                      <Area key="area-critical" isAnimationActive={false} type="monotone" dataKey="critical" name="Críticos" stroke="#FF4D4D" strokeWidth={2} fill="url(#fdr-gradRed)" dot={{ fill: '#FF4D4D', r: 3, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-5 mt-3 justify-center">
                  {[{ color: '#00FF9C', label: 'A Tiempo %' }, { color: '#FFC857', label: 'Retrasados %' }, { color: '#FF4D4D', label: 'Críticos %' }].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: l.color }} />
                      <span className="text-[10px] text-[#4A6080]">{l.label}</span>
                    </div>
                  ))}
                  {worstDayNum != null && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-px border-t border-dashed border-[#FF4D4D]" />
                      <span className="text-[10px] text-[#4A6080]">Peor día (menor puntualidad)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Bags — isAnimationActive={false} fixes same recharts duplicate-key bug for Bar */}
              <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                <SectionTitle icon={<Package className="w-3.5 h-3.5" />}>ENVÍOS DIARIOS PROCESADOS</SectionTitle>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyBags} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E3058" strokeOpacity={0.5} vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <ReTooltip content={<CustomBagsTooltip />} cursor={{ fill: 'rgba(77,166,255,0.05)' }} />
                      <Bar key="bar-bags" isAnimationActive={false} dataKey="bags" name="maletas" radius={[3, 3, 0, 0]} fill="#4DA6FF" fillOpacity={0.8} />
                      <Bar key="bar-replanned" isAnimationActive={false} dataKey="replanned" name="replanned" radius={[3, 3, 0, 0]} fill="#A855F7" fillOpacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-3 justify-center">
                  {[{ color: '#4DA6FF', label: 'Normal' }, { color: '#A855F7', label: 'Replanificados' }].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
                      <span className="text-[10px] text-[#4A6080]">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Airport Impact */}
            <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
              <SectionTitle icon={<Warehouse className="w-3.5 h-3.5" />}>IMPACTO DE CONGESTIÓN EN AEROPUERTOS — OCUPACIÓN MÁXIMA EN 5 DÍAS</SectionTitle>
              <div className="grid grid-cols-6 gap-3">
                {airportImpact.map(a => {
                  const fill = a.peakOccupancy >= 90 ? '#FF4D4D' : a.peakOccupancy >= 80 ? '#FFC857' : '#00FF9C';
                  return (
                    <div key={a.id} className="bg-[#0D1E38] rounded-lg p-3 border border-[#1E3058]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white" style={{ fontWeight: 700 }}>{a.id}</span>
                        {a.daysOverloaded > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${fill}20`, color: fill }}>
                            {a.daysOverloaded}d sobre
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#4A6080] mb-2">{a.city}</div>
                      <div className="relative h-1.5 bg-[#1E3058] rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full" style={{ width: `${a.peakOccupancy}%`, backgroundColor: fill }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#4A6080]">Carga pico</span>
                        <span className="text-xs" style={{ color: fill, fontWeight: 700 }}>{a.peakOccupancy}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ DAY-BY-DAY TAB ════ */}
        {activeTab === 'days' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-5 gap-3">
              {reportSnapshots.map((snap) => {
                const severityColor = snap.severity === 'critical' ? '#FF4D4D' : snap.severity === 'warning' ? '#FFC857' : '#00FF9C';
                const severityBg = severityColor;
                const isWorstDay = worstDayNum != null && snap.day === worstDayNum;
                return (
                  <div
                    key={snap.day}
                    className="relative flex flex-col rounded-xl border overflow-hidden"
                    style={{ borderColor: isWorstDay ? '#FF4D4D40' : '#1E3058', background: isWorstDay ? '#FF4D4D08' : '#0A1628' }}
                  >
                    {/* Day header */}
                    <div
                      className="px-4 py-3 border-b flex items-center justify-between"
                      style={{ borderColor: isWorstDay ? '#FF4D4D30' : '#1E3058' }}
                    >
                      <div>
                        <div className="text-xs text-[#A8C0E0]" style={{ fontWeight: 700 }}>Día {snap.day}</div>
                        <div className="text-[10px] text-[#4A6080]">{snap.date}</div>
                      </div>
                      <div
                        className="px-2 py-0.5 rounded text-[9px]"
                        style={{ backgroundColor: `${severityBg}20`, color: severityColor, fontWeight: 600, letterSpacing: '0.05em' }}
                      >
                        {snap.severity === 'critical' ? 'CRÍTICO' : snap.severity === 'warning' ? 'ADVERTENCIA' : 'NORMAL'}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="px-4 py-3 flex flex-col gap-2">
                      {/* On-time gauge */}
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[10px] text-[#4A6080]">A tiempo</span>
                          <span className="text-xs" style={{ color: severityColor, fontWeight: 700 }}>{snap.onTimePct}%</span>
                        </div>
                        <div className="h-1.5 bg-[#1E3058] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${snap.onTimePct}%`, backgroundColor: severityColor }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mt-1">
                        {[
                          { label: 'Retrasados', value: snap.delayed, color: '#FFC857' },
                          { label: 'Críticos (retraso severo)', value: snap.critical, color: '#FF4D4D' },
                          { label: 'Completados', value: snap.completed, color: '#00FF9C' },
                          { label: 'Replanificados', value: snap.replanned, color: '#A855F7' },
                        ].map(m => (
                          <div key={m.label} className="bg-[#0D1E38] rounded-lg px-2 py-1.5 border border-[#1E3058]">
                            <div className="text-[9px] text-[#4A6080]">{m.label}</div>
                            <div className="text-sm" style={{ color: m.color, fontWeight: 700 }}>{m.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="bg-[#0D1E38] rounded-lg px-2 py-1.5 border border-[#1E3058]">
                          <div className="text-[9px] text-[#4A6080]">Total Maletas</div>
                          <div className="text-sm text-[#4DA6FF]" style={{ fontWeight: 700 }}>{snap.totalBags.toLocaleString()}</div>
                        </div>
                        <div className="bg-[#0D1E38] rounded-lg px-2 py-1.5 border border-[#1E3058]">
                          <div className="text-[9px] text-[#4A6080]">Eventos</div>
                          <div className="text-sm text-[#FFC857]" style={{ fontWeight: 700 }}>{snap.newEvents}</div>
                        </div>
                      </div>

                        <div className="bg-[#0D1E38] rounded-lg px-2 py-1.5 border border-[#1E3058]">
                          <div className="text-[9px] text-[#4A6080] mb-0.5">Ocupación Prom. Aeropuertos</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-[#1E3058] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${snap.avgOccupancy}%`,
                                backgroundColor: snap.avgOccupancy >= 85 ? '#FF4D4D' : snap.avgOccupancy >= 75 ? '#FFC857' : '#00FF9C'
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono" style={{ color: snap.avgOccupancy >= 85 ? '#FF4D4D' : snap.avgOccupancy >= 75 ? '#FFC857' : '#00FF9C', fontWeight: 600 }}>
                            {snap.avgOccupancy}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Key event */}
                    <div
                      className="px-4 py-3 mt-auto border-t text-[10px] leading-relaxed"
                      style={{ borderColor: isWorstDay ? '#FF4D4D30' : '#1E3058', color: isWorstDay ? '#FF7070' : '#7090B0' }}
                    >
                      <div className="flex items-start gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: severityColor }} />
                        {snap.keyEvent}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comparative chart */}
            <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
              <SectionTitle icon={<Activity className="w-3.5 h-3.5" />}>EVOLUCIÓN DE PUNTUALIDAD + SUPERPOSICIÓN DE DISRUPCIONES</SectionTitle>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={statusEvolution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fdr-gradG2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00FF9C" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00FF9C" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E3058" strokeOpacity={0.5} />
                    <XAxis dataKey="day" tick={{ fill: '#4A6080', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#4A6080', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                    <ReTooltip content={<CustomAreaTooltip />} />
                    <ReferenceLine y={70} stroke="#FFC857" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'Meta 70%', position: 'right', fill: '#FFC857', fontSize: 9 }} />
                    <Area key="area-onTime-days" isAnimationActive={false} type="monotone" dataKey="onTime" name="A Tiempo" stroke="#00FF9C" strokeWidth={2.5} fill="url(#fdr-gradG2)" dot={{ fill: '#00FF9C', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ════ AIRLINES TAB ════ */}
        {activeTab === 'airlines' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              {/* Ranking */}
              <div className="col-span-2 bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                <SectionTitle icon={<Layers className="w-3.5 h-3.5" />}>RANKING DE AEROLÍNEAS — PUNTUALIDAD EN 5 DÍAS</SectionTitle>
                <div className="flex flex-col gap-2">
                  {airlinePerformance.slice(airlinePage * AIRLINES_PAGE_SIZE, airlinePage * AIRLINES_PAGE_SIZE + AIRLINES_PAGE_SIZE).map((a, idx) => {
                    const i = airlinePage * AIRLINES_PAGE_SIZE + idx;
                    const color = a.onTime >= 85 ? '#00FF9C' : a.onTime >= 75 ? '#4DA6FF' : a.onTime >= 65 ? '#FFC857' : '#FF4D4D';
                    return (
                      <div key={a.code} className="flex items-center gap-3 py-2.5 border-b border-[#1E3058]/40">
                        <div className="w-6 h-6 rounded-full bg-[#0D1E38] border border-[#1E3058] flex items-center justify-center text-[10px] text-[#4A6080]" style={{ fontWeight: 700 }}>
                          {i + 1}
                        </div>
                        <div className="w-8 text-xs text-[#A8C0E0]" style={{ fontWeight: 700 }}>{a.code}</div>
                        <div className="flex-1">
                          <div className="text-[11px] text-[#7090B0] mb-1">{a.name}</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-[#1E3058] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${a.onTime}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-xs font-mono w-10 text-right" style={{ color, fontWeight: 700 }}>{a.onTime}%</span>
                          </div>
                        </div>
                        <div className="text-right w-24">
                          <div className="text-xs text-[#A8C0E0]" style={{ fontWeight: 600 }}>{a.bags.toLocaleString()}</div>
                          <div className="text-[9px] text-[#4A6080]">maletas</div>
                        </div>
                        <div className="w-16 text-right">
                          <div className={`text-xs ${a.incidents === 0 ? 'text-[#00FF9C]' : a.incidents <= 2 ? 'text-[#FFC857]' : 'text-[#FF4D4D]'}`} style={{ fontWeight: 600 }}>
                            {a.incidents === 0 ? '✓ Sin incidentes' : `${a.incidents} incidentes`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {airlinePerformance.length > AIRLINES_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1E3058]/50">
                    <span className="text-[10px] text-[#4A6080]">
                      {airlinePage * AIRLINES_PAGE_SIZE + 1}–{Math.min((airlinePage + 1) * AIRLINES_PAGE_SIZE, airlinePerformance.length)} de {airlinePerformance.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAirlinePage(p => Math.max(0, p - 1))}
                        disabled={airlinePage === 0}
                        className="px-2.5 py-1 rounded-md text-[11px] bg-[#0D1E38] border border-[#1E3058] text-[#A8C0E0] disabled:opacity-40 hover:border-[#4DA6FF]/40 transition-colors"
                      >
                        ← Anterior
                      </button>
                      <span className="text-[10px] text-[#7090B0] font-mono">
                        {airlinePage + 1}/{Math.ceil(airlinePerformance.length / AIRLINES_PAGE_SIZE)}
                      </span>
                      <button
                        onClick={() => setAirlinePage(p => Math.min(Math.ceil(airlinePerformance.length / AIRLINES_PAGE_SIZE) - 1, p + 1))}
                        disabled={(airlinePage + 1) * AIRLINES_PAGE_SIZE >= airlinePerformance.length}
                        className="px-2.5 py-1 rounded-md text-[11px] bg-[#0D1E38] border border-[#1E3058] text-[#A8C0E0] disabled:opacity-40 hover:border-[#4DA6FF]/40 transition-colors"
                      >
                        Siguiente →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary cards */}
              <div className="flex flex-col gap-3">
                <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                  <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>RESUMEN DE FLOTA</SectionTitle>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Mejor Rendimiento', value: bestAirline ? `${bestAirline.code} (${bestAirline.onTime}%)` : '—', color: '#00FF9C' },
                      { label: 'Más Maletas', value: mostBagsAirline ? `${mostBagsAirline.code} (${mostBagsAirline.bags.toLocaleString()})` : '—', color: '#4DA6FF' },
                      { label: 'Más Incidentes', value: mostIncidentsAirline ? `${mostIncidentsAirline.code} (${mostIncidentsAirline.incidents})` : '—', color: '#FF4D4D' },
                      { label: 'Promedio de Red', value: `${networkAvgOnTime}%`, color: '#FFC857' },
                      { label: 'A tiempo (≥70%)', value: `${onTimeCompliantAirlines}/${airlinePerformance.length} aerolíneas`, color: '#00FF9C' },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-[#1E3058]/40">
                        <span className="text-[11px] text-[#4A6080]">{r.label}</span>
                        <span className="text-xs" style={{ color: r.color, fontWeight: 600 }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#FF4D4D]/8 rounded-xl border border-[#FF4D4D]/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#FF4D4D]" />
                    <span className="text-[10px] text-[#FF4D4D]" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>ACCIÓN REQUERIDA</span>
                  </div>
                  <div className="text-xs text-[#FF7070] leading-relaxed">
                    {mostIncidentsAirline && mostIncidentsAirline.incidents > 0 ? (
                      <><strong>{mostIncidentsAirline.name} ({mostIncidentsAirline.code})</strong> registró {mostIncidentsAirline.incidents} envíos con retraso durante el período. Se recomienda reforzar rutas alternativas y capacidad en sus hubs principales.</>
                    ) : (
                      <>Sin aerolíneas con incidentes relevantes en el período evaluado.</>
                    )}
                  </div>
                </div>

                <div className="bg-[#00FF9C]/8 rounded-xl border border-[#00FF9C]/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-3.5 h-3.5 text-[#00FF9C]" />
                    <span className="text-[10px] text-[#00FF9C]" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>MEJORES PRÁCTICAS</span>
                  </div>
                  <div className="text-xs text-[#70FFD0] leading-relaxed">
                    {bestAirline ? (
                      <><strong>{bestAirline.name} ({bestAirline.code})</strong> lideró la puntualidad con {bestAirline.onTime}% de envíos a tiempo sobre {bestAirline.bags.toLocaleString()} maletas transportadas durante los 5 días.</>
                    ) : (
                      <>Aún no hay datos de aerolíneas para el período.</>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ INCIDENTS TAB ════ */}
        {activeTab === 'incidents' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
              <SectionTitle icon={<AlertOctagon className="w-3.5 h-3.5" />}>LÍNEA DE TIEMPO DE INCIDENTES — REGISTRO COMPLETO</SectionTitle>
              <div className="relative flex flex-col gap-0 pl-5">
                {/* Timeline line */}
                <div className="absolute left-2 top-2 bottom-2 w-px bg-[#1E3058]" />
                {incidentTimeline.map((evt) => {
                  const color = evt.type === 'critical' ? '#FF4D4D' : evt.type === 'warning' ? '#FFC857' : '#4DA6FF';
                  return (
                    <div key={`incident-${evt.time}`} className="relative flex gap-3 py-3 border-b border-[#1E3058]/40 last:border-0">
                      {/* Dot */}
                      <div
                        className="absolute -left-3 top-4 w-3 h-3 rounded-full border-2 border-[#060D1F]"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-[10px] font-mono text-[#4A6080]">{evt.time}</span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${color}20`, color, fontWeight: 600, letterSpacing: '0.05em' }}
                          >
                            {evt.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: evt.type === 'critical' ? '#FF9090' : evt.type === 'warning' ? '#FFD890' : '#A8C0E0' }}>
                          {evt.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="flex flex-col gap-3">
              <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                <SectionTitle icon={<FileText className="w-3.5 h-3.5" />}>RESUMEN DE INCIDENTES</SectionTitle>
                <div className="flex flex-col gap-2.5">
                  {[
                    { label: 'Total Eventos', value: String(incidentSummary.total), color: '#A8C0E0' },
                    { label: 'Críticos', value: String(incidentSummary.critical), color: '#FF4D4D' },
                    { label: 'Advertencias', value: String(incidentSummary.warning), color: '#FFC857' },
                    { label: 'Info / Resueltos', value: String(incidentSummary.info), color: '#4DA6FF' },
                    { label: 'Envíos con Retraso', value: String(shipments.filter(s => s.status !== 'on-time').length), color: '#FFC857' },
                    { label: 'Rutas Replanificadas', value: String(replannedCount), color: '#A855F7' },
                    { label: 'Maletas Afectadas', value: incidentSummary.affectedBags.toLocaleString(), color: '#FFC857' },
                    { label: 'Maletas Recuperadas', value: incidentSummary.recoveredBags.toLocaleString(), color: '#00FF9C' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-[#1E3058]/40">
                      <span className="text-[11px] text-[#4A6080]">{r.label}</span>
                      <span className="text-xs" style={{ color: r.color, fontWeight: 600 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                <SectionTitle icon={<Zap className="w-3.5 h-3.5" />}>ACCIONES DE REPLANIFICACIÓN</SectionTitle>
                <div className="flex flex-col gap-2">
                  {replanningActions.map((r) => (
                    <div key={`replan-${r.route}`} className="flex items-start gap-2 py-2 border-b border-[#1E3058]/40">
                      <CheckCircle className="w-3 h-3 text-[#00FF9C] mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] text-[#A855F7]" style={{ fontWeight: 600 }}>{r.airline}</span>
                          <span className="text-[10px] text-[#FF4D4D] line-through">{r.route}</span>
                        </div>
                        <span className="text-[10px] text-[#00FF9C]">{r.alt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-12 bg-[#0A1628] border-t border-[#1E3058] flex items-center px-6 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00FF9C]" />
          <span className="text-[10px] text-[#4A6080]">
            Período: {fmtDateRange(reportStart, 0)} – {fmtDateRange(reportEnd, 0)} · 
            Modo: Planificación 5 días · 
            Algoritmo: {results?.algorithmUsed ?? 'GATS'} · 
            Ciclos: {results?.totalCycles ?? lastCycleUpdate?.cycle ?? 0} · 
            Envíos: {results?.totalBatches ?? totalShipments} · 
            Aerolíneas: {airlinePerformance.length} · 
            Aeropuertos: {airports.length}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#00FF9C]/12 border border-[#00FF9C]/30 text-xs text-[#00FF9C] hover:bg-[#00FF9C]/20 transition-colors"
          style={{ fontWeight: 600 }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Ejecutar Nueva Simulación
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#4DA6FF]/12 border border-[#4DA6FF]/30 text-xs text-[#4DA6FF] hover:bg-[#4DA6FF]/20 transition-colors"
          style={{ fontWeight: 600 }}
        >
          <Globe className="w-3.5 h-3.5" />
          Volver al Panel Principal
        </button>
      </div>
    </div>
  );
}
