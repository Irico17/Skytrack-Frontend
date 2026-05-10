import React, { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Globe, X, Download, RotateCcw, CheckCircle, AlertTriangle, Zap,
  Package, TrendingUp, TrendingDown, Clock, Layers, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Activity, Warehouse,
  AlertOctagon, FileText, Calendar,
} from 'lucide-react';
import { DaySnapshot } from '../hooks/useSimulation';
import { Shipment, SimEvent, Airport, INITIAL_AIRPORTS } from '../data/mockData';

interface FiveDayResultsProps {
  startDate: Date;
  daySnapshots: DaySnapshot[];
  shipments: Shipment[];
  events: SimEvent[];
  airports: Airport[];
  onClose: () => void;
  onReset: () => void;
}

// ── Static enriched data for charts ──────────────────────────────────────────

const STATUS_EVOLUTION = [
  { label: 'Día 0\n(Inicio)', day: 'Inicio', onTime: 80, delayed: 15, critical: 5 },
  { label: 'Día 1', day: 'Día 1', onTime: 80, delayed: 15, critical: 5 },
  { label: 'Día 2', day: 'Día 2', onTime: 68, delayed: 22, critical: 10 },
  { label: 'Día 3', day: 'Día 3', onTime: 54, delayed: 29, critical: 17 },
  { label: 'Día 4', day: 'Día 4', onTime: 71, delayed: 22, critical: 7 },
  { label: 'Día 5', day: 'Día 5', onTime: 83, delayed: 13, critical: 4 },
];

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmtDate(base: Date, offset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]}`;
}

function fmtDateRange(base: Date, offsetEnd: number): string {
  const d = new Date(base);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function buildDailyBags(startDate: Date) {
  return [
    { day: fmtDate(startDate, 1), bags: 2840, replanned: 0 },
    { day: fmtDate(startDate, 2), bags: 3120, replanned: 0 },
    { day: fmtDate(startDate, 3), bags: 3450, replanned: 180 },
    { day: fmtDate(startDate, 4), bags: 3890, replanned: 520 },
    { day: fmtDate(startDate, 5), bags: 4280, replanned: 840 },
  ];
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
  if (snapshots.length === 0) return STATUS_EVOLUTION;
  return [
    { label: 'Día 0\n(Inicio)', day: 'Inicio', onTime: 0, delayed: 0, critical: 0 },
    ...snapshots.map(s => ({
      label: `Día ${s.day}`,
      day: `Día ${s.day}`,
      onTime: s.onTimePct,
      delayed: Math.max(0, Math.min(100, Math.round((s.delayed / Math.max(s.completed + s.delayed, 1)) * 100))),
      critical: Math.max(0, Math.min(100, Math.round((s.critical / Math.max(s.completed + s.delayed + s.critical, 1)) * 100))),
    })),
  ];
}

function buildIncidentTimelineFromEvents(events: SimEvent[], startDate: Date) {
  if (events.length === 0) return buildIncidentTimeline(startDate);
  return events.slice(0, 12).map(event => ({
    time: event.time.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    type: event.severity === 'critical' ? 'critical' : event.severity === 'warning' ? 'warning' : 'info',
    text: event.message,
  }));
}

function buildAirportImpactFromAirports(airports: Airport[]) {
  if (airports.length === 0) return AIRPORT_IMPACT;
  return airports
    .map(a => {
      const peakOccupancy = Math.round((a.occupancy / Math.max(a.capacity, 1)) * 100);
      return {
        id: a.id,
        city: a.city,
        peakOccupancy,
        daysOverloaded: peakOccupancy >= 90 ? 1 : 0,
        color: peakOccupancy >= 90 ? '#FF4D4D' : peakOccupancy >= 70 ? '#FFC857' : '#00FF9C',
      };
    })
    .sort((a, b) => b.peakOccupancy - a.peakOccupancy)
    .slice(0, 6);
}

function buildIncidentTimeline(startDate: Date) {
  return [
    { time: `${fmtDate(startDate, 1)} · 14:22`, type: 'warning', text: 'Almacén DXB alcanzó 94% de capacidad — protocolo de desvío activado' },
    { time: `${fmtDate(startDate, 2)} · 08:45`, type: 'warning', text: 'Tormenta climática en Atlántico Norte — BA297 y LH456 en espera (+4h)' },
    { time: `${fmtDate(startDate, 2)} · 17:10`, type: 'warning', text: 'EK501 BOM→DXB: Escasez de personal — 95 bolsas retenidas en origen' },
    { time: `${fmtDate(startDate, 3)} · 02:30`, type: 'critical', text: 'Suspensión parcial del hub DXB — vuelos entrantes limitados al 60% de capacidad' },
    { time: `${fmtDate(startDate, 3)} · 09:15`, type: 'critical', text: 'CRÍTICO: 5 envíos redirigidos por hub Doha (DOH)' },
    { time: `${fmtDate(startDate, 3)} · 22:00`, type: 'critical', text: 'Retraso en cascada: cadena SIN → HKG → NRT — 3 envíos en estado crítico' },
    { time: `${fmtDate(startDate, 4)} · 06:00`, type: 'info', text: 'Motor de replanificación activado — evaluando 12 rutas alternativas' },
    { time: `${fmtDate(startDate, 4)} · 08:30`, type: 'info', text: 'Replanificación completa — redirigidos vía hubs AMS, DOH y SIN' },
    { time: `${fmtDate(startDate, 5)} · 11:00`, type: 'info', text: 'Hub DXB completamente operativo — todas las rutas suspendidas restauradas' },
  ];
}

const AIRLINE_PERFORMANCE = [
  { code: 'SQ', name: 'Singapore Airlines', onTime: 92, bags: 1925, incidents: 0 },
  { code: 'CX', name: 'Cathay Pacific', onTime: 88, bags: 2595, incidents: 1 },
  { code: 'QR', name: 'Qatar Airways', onTime: 86, bags: 1120, incidents: 1 },
  { code: 'BA', name: 'British Airways', onTime: 82, bags: 3465, incidents: 2 },
  { code: 'LH', name: 'Lufthansa', onTime: 78, bags: 2860, incidents: 3 },
  { code: 'AF', name: 'Air France', onTime: 74, bags: 2450, incidents: 4 },
  { code: 'AA', name: 'American Airlines', onTime: 70, bags: 3080, incidents: 5 },
  { code: 'EK', name: 'Emirates', onTime: 63, bags: 4340, incidents: 9 },
];

const AIRPORT_IMPACT = [
  { id: 'DXB', city: 'Dubái', peakOccupancy: 98, daysOverloaded: 3, color: '#FF4D4D' },
  { id: 'LHR', city: 'Londres', peakOccupancy: 89, daysOverloaded: 2, color: '#FFC857' },
  { id: 'AMS', city: 'Ámsterdam', peakOccupancy: 86, daysOverloaded: 1, color: '#FFC857' },
  { id: 'PEK', city: 'Pekín', peakOccupancy: 83, daysOverloaded: 1, color: '#FFC857' },
  { id: 'JFK', city: 'Nueva York', peakOccupancy: 79, daysOverloaded: 0, color: '#00FF9C' },
  { id: 'CDG', city: 'París', peakOccupancy: 72, daysOverloaded: 0, color: '#00FF9C' },
];

const REPLANNING_ACTIONS = [
  { route: 'LHR → DXB', alt: 'LHR → DOH → DXB', airline: 'EK', status: 'success' },
  { route: 'BOM → DXB', alt: 'BOM → SIN → DXB', airline: 'EK', status: 'success' },
  { route: 'AMS → DXB', alt: 'AMS → DOH', airline: 'EK', status: 'success' },
  { route: 'FRA → DXB', alt: 'FRA → AMS → DOH', airline: 'LH', status: 'success' },
  { route: 'JFK → LHR', alt: 'JFK → AMS → LHR', airline: 'BA', status: 'success' },
];

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
          <span className="text-[#7090B0]">{p.dataKey === 'bags' ? 'Total Bolsas' : 'Replanificados'}:</span>
          <span className="text-[#4DA6FF]" style={{ fontWeight: 600 }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export function FiveDayResults({ startDate, daySnapshots, shipments, events, airports, onClose, onReset }: FiveDayResultsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'days' | 'airlines' | 'incidents'>('overview');

  const PRESET_SNAPSHOTS_LOCAL: DaySnapshot[] = daySnapshots.length === 5 ? daySnapshots : [
    { day: 1, date: fmtDate(startDate, 1), onTimePct: 80, delayed: 4, critical: 1, completed: 3, totalBags: 2840, newEvents: 5, avgOccupancy: 71, replanned: 0, keyEvent: 'Almacén DXB al 94% — alerta de congestión emitida', severity: 'warning' },
    { day: 2, date: fmtDate(startDate, 2), onTimePct: 68, delayed: 7, critical: 3, completed: 6, totalBags: 3120, newEvents: 11, avgOccupancy: 79, replanned: 0, keyEvent: 'Disrupción climática: BA297 y LH456 retrasados 4h en Atlántico Norte', severity: 'warning' },
    { day: 3, date: fmtDate(startDate, 3), onTimePct: 54, delayed: 8, critical: 5, completed: 8, totalBags: 3450, newEvents: 18, avgOccupancy: 87, replanned: 3, keyEvent: 'CRÍTICO: Suspensión parcial del hub DXB — redireccionamiento de emergencia activado', severity: 'critical' },
    { day: 4, date: fmtDate(startDate, 4), onTimePct: 71, delayed: 5, critical: 2, completed: 14, totalBags: 3890, newEvents: 9, avgOccupancy: 76, replanned: 9, keyEvent: 'Replanificación completa — 12 envíos redirigidos vía AMS y DOH', severity: 'normal' },
    { day: 5, date: fmtDate(startDate, 5), onTimePct: 83, delayed: 3, critical: 1, completed: 20, totalBags: 4280, newEvents: 4, avgOccupancy: 67, replanned: 12, keyEvent: 'Operaciones normalizadas — tasa de puntualidad recuperada al 83%', severity: 'normal' },
  ];

  const dailyBags = buildDailyBagsFromSnapshots(PRESET_SNAPSHOTS_LOCAL, startDate);
  const statusEvolution = buildStatusEvolutionFromSnapshots(PRESET_SNAPSHOTS_LOCAL);
  const incidentTimeline = buildIncidentTimelineFromEvents(events, startDate);
  const airportImpact = buildAirportImpactFromAirports(airports);

  // Computed totals
  const totalBags = dailyBags.reduce((acc, d) => acc + d.bags, 0);
  const totalReplanned = dailyBags.reduce((acc, d) => acc + d.replanned, 0);
  const totalIncidents = incidentTimeline.filter(e => e.type === 'critical').length + incidentTimeline.filter(e => e.type === 'warning').length;
  const finalOnTimeRate = PRESET_SNAPSHOTS_LOCAL[PRESET_SNAPSHOTS_LOCAL.length - 1]?.onTimePct ?? 0;
  const worstDay = PRESET_SNAPSHOTS_LOCAL.find(s => s.day === 3);
  const peakCritical = worstDay?.critical ?? 17;

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
          <span>{fmtDateRange(startDate, 0)} – {fmtDateRange(startDate, 5)}</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4DA6FF]/10 border border-[#4DA6FF]/30 text-xs text-[#4DA6FF] hover:bg-[#4DA6FF]/20 transition-colors"
          style={{ fontWeight: 600 }}
        >
          <Download className="w-3.5 h-3.5" />
          Exportar Reporte
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

            {/* KPI Strip */}
            <div className="grid grid-cols-7 gap-3">
              <MetricCard
                label="TOTAL BOLSAS TRANSPORTADAS"
                value={totalBags.toLocaleString()}
                subtext="En 5 días"
                color="#4DA6FF"
                icon={<Package className="w-3.5 h-3.5" />}
                trend="up"
                trendValue="+18% vs pronóstico"
              />
              <MetricCard
                label="TASA DE PUNTUALIDAD FINAL"
                value={finalOnTimeRate}
                unit="%"
                subtext="Recuperación Día 5"
                color="#00FF9C"
                icon={<CheckCircle className="w-3.5 h-3.5" />}
                trend="up"
                trendValue="+3pp vs Día 1"
              />
              <MetricCard
                label="INCIDENTES CRÍTICOS"
                value={totalIncidents}
                subtext="6 resueltos"
                color="#FF4D4D"
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                trend="neutral"
                trendValue="Pico: Día 3"
              />
              <MetricCard
                label="RUTAS REPLANIFICADAS"
                value={12}
                subtext="Vía AMS, DOH, SIN"
                color="#A855F7"
                icon={<Zap className="w-3.5 h-3.5" />}
                trend="up"
                trendValue="100% recuperado"
              />
              <MetricCard
                label="ENVÍOS COMPLETADOS"
                value={20}
                subtext="100% procesados"
                color="#00FF9C"
                icon={<Activity className="w-3.5 h-3.5" />}
                trend="up"
                trendValue="A tiempo"
              />
              <MetricCard
                label="CARGA MÁXIMA DE AEROPUERTO"
                value={98}
                unit="%"
                subtext="DXB — Día 3"
                color="#FF4D4D"
                icon={<Warehouse className="w-3.5 h-3.5" />}
                trend="down"
                trendValue="Ahora 67% (normal)"
              />
              <MetricCard
                label="PUNTUACIÓN DE EFICIENCIA"
                value={74}
                unit="/100"
                subtext="Sobre la línea base"
                color="#FFC857"
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                trend="up"
                trendValue="+9 tras replan"
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
                      <ReferenceLine x="Día 3" stroke="#FF4D4D" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: 'CRISIS', position: 'top', fill: '#FF4D4D', fontSize: 9 }} />
                      <ReferenceLine x="Día 4" stroke="#A855F7" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: 'REPLAN', position: 'top', fill: '#A855F7', fontSize: 9 }} />
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
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-px border-t border-dashed border-[#FF4D4D]" />
                    <span className="text-[10px] text-[#4A6080]">Pico de crisis</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-px border-t border-dashed border-[#A855F7]" />
                    <span className="text-[10px] text-[#4A6080]">Replan activada</span>
                  </div>
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
                      <Bar key="bar-bags" isAnimationActive={false} dataKey="bags" name="bolsas" radius={[3, 3, 0, 0]} fill="#4DA6FF" fillOpacity={0.8} />
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
              {PRESET_SNAPSHOTS_LOCAL.map((snap) => {
                const severityColor = snap.severity === 'critical' ? '#FF4D4D' : snap.severity === 'warning' ? '#FFC857' : '#00FF9C';
                const severityBg = snap.severity === 'critical' ? '#FF4D4D' : snap.severity === 'warning' ? '#FFC857' : '#00FF9C';
                const isWorstDay = snap.day === 3;
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
                          { label: 'Críticos', value: snap.critical, color: '#FF4D4D' },
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
                          <div className="text-[9px] text-[#4A6080]">Total Bolsas</div>
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
                    <ReferenceLine y={70} stroke="#FFC857" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'SLA 70%', position: 'right', fill: '#FFC857', fontSize: 9 }} />
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
                  {AIRLINE_PERFORMANCE.map((a, i) => {
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
                          <div className="text-[9px] text-[#4A6080]">bolsas</div>
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
              </div>

              {/* Summary cards */}
              <div className="flex flex-col gap-3">
                <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
                  <SectionTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>RESUMEN DE FLOTA</SectionTitle>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Mejor Rendimiento', value: 'SQ (92%)', color: '#00FF9C' },
                      { label: 'Más Bolsas', value: 'EK (4,340)', color: '#4DA6FF' },
                      { label: 'Más Incidentes', value: 'EK (9 eventos)', color: '#FF4D4D' },
                      { label: 'Promedio de Red', value: '79.5%', color: '#FFC857' },
                      { label: 'Cumplimiento SLA', value: '6/8 aerolíneas', color: '#00FF9C' },
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
                    <strong>Emirates (EK)</strong> registró 9 incidentes durante el período, mayormente ligados a la congestión del hub DXB. Se recomienda aumentar la capacidad de rutas alternativas para tránsitos en la región del Golfo.
                  </div>
                </div>

                <div className="bg-[#00FF9C]/8 rounded-xl border border-[#00FF9C]/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-3.5 h-3.5 text-[#00FF9C]" />
                    <span className="text-[10px] text-[#00FF9C]" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>MEJORES PRÁCTICAS</span>
                  </div>
                  <div className="text-xs text-[#70FFD0] leading-relaxed">
                    <strong>Singapore Airlines (SQ)</strong> mantuvo 92% de puntualidad durante los 5 días sin incidentes críticos — el hub SIN se utilizó como respaldo principal durante la suspensión de DXB.
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
                    { label: 'Total Eventos', value: '9', color: '#A8C0E0' },
                    { label: 'Críticos', value: '3', color: '#FF4D4D' },
                    { label: 'Advertencias', value: '3', color: '#FFC857' },
                    { label: 'Info / Resueltos', value: '3', color: '#4DA6FF' },
                    { label: 'Día Pico', value: 'Día 3 (18 sub-eventos)', color: '#FF4D4D' },
                    { label: 'MTTR', value: '14.2 horas prom.', color: '#FFC857' },
                    { label: 'Bolsas Afectadas', value: '2,340', color: '#FFC857' },
                    { label: 'Bolsas Recuperadas', value: '2,340 (100%)', color: '#00FF9C' },
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
                  {REPLANNING_ACTIONS.map((r) => (
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
          <span className="text-[10px] text-[#4A6080]">Período: {fmtDateRange(startDate, 0)} – {fmtDateRange(startDate, 5)} · Modo: Planificación 5 días · 20 envíos · 8 aerolíneas · 20 aeropuertos</span>
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
