import React from 'react';
import {
  AlertTriangle, X, RotateCcw, ChevronRight, Globe, AlertOctagon,
  TrendingDown, Shield, Zap, Clock, Package, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, CheckCircle, Activity,
} from 'lucide-react';
import { CollapseMetrics, DaySnapshot } from '../hooks/useSimulation';
import { Shipment, SimEvent, Airport, INITIAL_AIRPORTS } from '../data/mockData';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';

interface CollapseResultsProps {
  collapseMetrics: CollapseMetrics;
  shipments: Shipment[];
  events: SimEvent[];
  airports: Airport[];
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
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

const COLLAPSE_PHASES = [
  { phase: 'Normal', time: '0 min', desc: 'Operación estándar', status: 'normal' },
  { phase: 'Degradación', time: '3 min', desc: 'Primeros aeropuertos saturados', status: 'warning' },
  { phase: 'Colapso', time: '8 min', desc: 'Red sobrepasada — hubs críticos', status: 'critical' },
  { phase: 'Pico', time: '12 min', desc: 'Máxima congestión alcanzada', status: 'critical' },
  { phase: 'Replanificación', time: '14 min', desc: 'Rutas alternativas activadas', status: 'warning' },
  { phase: 'Recuperación', time: '18 min', desc: 'Operaciones estabilizándose', status: 'normal' },
  { phase: 'Estable', time: '21 min', desc: 'Nueva línea base operativa', status: 'normal' },
];

const COLLAPSE_TIMELINE = [
  { time: 'T+2 min', type: 'warning', text: 'DXB y AMS superan 85% de capacidad — primer umbral de alerta' },
  { time: 'T+4 min', type: 'warning', text: 'LHR y PEK entran en estado de advertencia — carga acumulándose' },
  { time: 'T+6 min', type: 'critical', text: 'DXB colapsa al 98% — vuelos entrantes detenidos, 395 bolsas retenidas' },
  { time: 'T+8 min', type: 'critical', text: 'Efecto cascada: LHR, AMS, PEK, FRA, CDG, BOM en estado crítico simultáneo' },
  { time: 'T+10 min', type: 'critical', text: '60% de la red comprometida — 12 envíos sin ruta viable' },
  { time: 'T+12 min', type: 'critical', text: 'PICO DE COLAPSO: Ocupación máxima registrada en DXB (98%) y AMS (95%)' },
  { time: 'T+14 min', type: 'info', text: 'Motor de replanificación activado — 12 rutas alternativas calculadas' },
  { time: 'T+16 min', type: 'info', text: 'Redirigidos vía hubs SIN, DOH, GRU — congestión comenzando a bajar' },
  { time: 'T+19 min', type: 'info', text: 'DXB bajo 80% — operaciones parciales restauradas' },
  { time: 'T+21 min', type: 'info', text: 'Red estabilizada — todos los hubs operativos con carga normalizada' },
];

const AIRLINE_RESILIENCE = [
  { code: 'SQ', name: 'Singapore Airlines', resilience: 94, lost: 0, color: '#00FF9C' },
  { code: 'QR', name: 'Qatar Airways', resilience: 88, lost: 0, color: '#00FF9C' },
  { code: 'CX', name: 'Cathay Pacific', resilience: 76, lost: 1, color: '#FFC857' },
  { code: 'BA', name: 'British Airways', resilience: 68, lost: 1, color: '#FFC857' },
  { code: 'AF', name: 'Air France', resilience: 62, lost: 1, color: '#FFC857' },
  { code: 'LH', name: 'Lufthansa', resilience: 55, lost: 2, color: '#FF4D4D' },
  { code: 'AA', name: 'American Airlines', resilience: 48, lost: 2, color: '#FF4D4D' },
  { code: 'EK', name: 'Emirates', resilience: 31, lost: 3, color: '#FF4D4D' },
];

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
      <span className="text-[#FF4D4D]">{icon}</span>
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
        <div key={`tooltip-collapse-${p.name}`} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[#7090B0]">{p.name}:</span>
          <span style={{ color: p.color, fontWeight: 600 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export function CollapseResults({ collapseMetrics, shipments, events, airports, onClose, onReset }: CollapseResultsProps) {
  const startDate = new Date();

  const NETWORK_HEALTH = [
    { phase: 'Normal', health: 95 },
    { phase: 'T+3min', health: 82 },
    { phase: 'T+6min', health: 55 },
    { phase: 'COLAPSO', health: 28 },
    { phase: 'T+12min', health: 18 },
    { phase: 'Replan', health: 42 },
    { phase: 'T+18min', health: 68 },
    { phase: 'Estable', health: 85 },
  ];

  const AIRPORT_OVERLOAD = [
    { id: 'DXB', city: 'Dubái', normal: 93, peak: 98, color: '#FF4D4D' },
    { id: 'AMS', city: 'Ámsterdam', normal: 85, peak: 95, color: '#FF4D4D' },
    { id: 'LHR', city: 'Londres', normal: 87, peak: 94, color: '#FF4D4D' },
    { id: 'PEK', city: 'Pekín', normal: 82, peak: 92, color: '#FF4D4D' },
    { id: 'FRA', city: 'Fráncfort', normal: 56, peak: 91, color: '#FF4D4D' },
    { id: 'BOM', city: 'Mumbai', normal: 74, peak: 90, color: '#FFC857' },
    { id: 'CDG', city: 'París', normal: 71, peak: 86, color: '#FFC857' },
    { id: 'SIN', city: 'Singapur', normal: 66, peak: 72, color: '#00FF9C' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#060D1F', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-16 bg-[#0A1628] border-b border-[#1E3058] flex items-center px-6 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 flex items-center justify-center">
            <Globe className="w-5 h-5 text-[#FF4D4D]" />
          </div>
          <div>
            <div className="text-white text-sm" style={{ fontWeight: 700, letterSpacing: '0.06em' }}>SKYTRACK</div>
            <div className="text-[#FF4D4D] text-[9px]" style={{ letterSpacing: '0.2em' }}>LOGISTICS CONTROL</div>
          </div>
        </div>

        <div className="w-px h-8 bg-[#1E3058]" />

        <div className="flex items-center gap-1.5 text-xs text-[#4A6080]">
          <span>Panel Principal</span>
          <ChevronRight className="w-3 h-3" />
          <span>Escenario de Colapso</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#FF4D4D]" style={{ fontWeight: 600 }}>Análisis de Resiliencia</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30">
          <AlertTriangle className="w-3.5 h-3.5 text-[#FF4D4D]" />
          <span className="text-xs text-[#FF4D4D]" style={{ fontWeight: 600 }}>Colapso Detectado</span>
        </div>

        <div className="flex-1" />

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

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: '#060D1F' }}>

        {/* KPI Strip */}
        <div className="grid grid-cols-6 gap-3 mb-5">
          <MetricCard
            label="TIEMPO AL COLAPSO"
            value={collapseMetrics.timeToCollapse}
            subtext="Desde inicio hasta red comprometida"
            color="#FF4D4D"
            icon={<Clock className="w-3.5 h-3.5" />}
            trend="down"
            trendValue="Crítico"
          />
          <MetricCard
            label="PUNTUACIÓN RESILIENCIA"
            value={collapseMetrics.resilienceScore}
            unit="/100"
            subtext="Basado en recuperación"
            color="#FFC857"
            icon={<Shield className="w-3.5 h-3.5" />}
            trend="neutral"
            trendValue="Umbral: 60"
          />
          <MetricCard
            label="AEROPUERTOS AFECTADOS"
            value={collapseMetrics.affectedAirports}
            subtext={`De ${collapseMetrics.totalAirports} hubs`}
            color="#FF4D4D"
            icon={<AlertOctagon className="w-3.5 h-3.5" />}
            trend="down"
            trendValue={`${Math.round(collapseMetrics.affectedAirports / collapseMetrics.totalAirports * 100)}% de la red`}
          />
          <MetricCard
            label="ENVÍOS RETRASADOS"
            value={collapseMetrics.shipmentsDelayed}
            subtext={`${collapseMetrics.shipmentsLost} perdidos de ${collapseMetrics.totalShipments}`}
            color="#FFC857"
            icon={<Package className="w-3.5 h-3.5" />}
            trend="down"
            trendValue={`${collapseMetrics.shipmentsLost} críticos`}
          />
          <MetricCard
            label="CONGESTIÓN PICO"
            value={collapseMetrics.peakCongestion}
            unit="%"
            subtext={`Hub ${collapseMetrics.peakAirport}`}
            color="#FF4D4D"
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            trend="down"
            trendValue="Máximo histórico"
          />
          <MetricCard
            label="EVENTOS EN CASCADA"
            value={collapseMetrics.cascadeEvents}
            subtext={`Rutas replanificadas: ${collapseMetrics.replannedRoutes}`}
            color="#A855F7"
            icon={<Zap className="w-3.5 h-3.5" />}
            trend="up"
            trendValue="Impacto multiplicado"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-4 mb-5">

          {/* Network Health Over Time */}
          <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <SectionTitle icon={<Activity className="w-3.5 h-3.5" />}>SALUD DE LA RED DURANTE EL COLAPSO</SectionTitle>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={NETWORK_HEALTH} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collapse-health" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF4D4D" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FF4D4D" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E3058" strokeOpacity={0.5} />
                  <XAxis dataKey="phase" tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#4A6080', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                  <ReTooltip content={<CustomAreaTooltip />} cursor={{ stroke: '#1E3058', strokeWidth: 1 }} />
                  <ReferenceLine y={60} stroke="#FFC857" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'SLA 60%', position: 'right', fill: '#FFC857', fontSize: 9 }} />
                  <ReferenceLine x="COLAPSO" stroke="#FF4D4D" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: 'COLAPSO', position: 'top', fill: '#FF4D4D', fontSize: 9 }} />
                  <ReferenceLine x="Replan" stroke="#00FF9C" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: 'REPLAN', position: 'top', fill: '#00FF9C', fontSize: 9 }} />
                  <Area isAnimationActive={false} type="monotone" dataKey="health" name="Salud de Red" stroke="#FF4D4D" strokeWidth={2.5} fill="url(#collapse-health)" dot={{ fill: '#FF4D4D', r: 3, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Airport Overload Comparison */}
          <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <SectionTitle icon={<BarChart3 className="w-3.5 h-3.5" />}>COMPARACIÓN DE CARGA — NORMAL VS PICO DE COLAPSO</SectionTitle>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={AIRPORT_OVERLOAD} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E3058" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="id" tick={{ fill: '#4A6080', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} unit="%" />
                  <ReTooltip cursor={{ fill: 'rgba(255,77,77,0.05)' }} />
                  <Bar isAnimationActive={false} dataKey="normal" name="Normal" radius={[2, 2, 0, 0]} fill="#4DA6FF" fillOpacity={0.6} />
                  <Bar isAnimationActive={false} dataKey="peak" name="Pico" radius={[2, 2, 0, 0]} fill="#FF4D4D" fillOpacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 justify-center">
              {[{ color: '#4DA6FF', label: 'Normal' }, { color: '#FF4D4D', label: 'Pico de Colapso' }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-[#4A6080]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Collapse Phases Timeline */}
        <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4 mb-5">
          <SectionTitle icon={<Clock className="w-3.5 h-3.5" />}>FASES DEL COLAPSO — CRONOLOGÍA COMPLETA</SectionTitle>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {COLLAPSE_PHASES.map((p, i) => {
              const color = p.status === 'critical' ? '#FF4D4D' : p.status === 'warning' ? '#FFC857' : '#00FF9C';
              return (
                <React.Fragment key={p.phase}>
                  {i > 0 && <div className="w-8 h-px bg-[#1E3058] flex-shrink-0" />}
                  <div className="flex flex-col items-center gap-1 min-w-[90px]">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: `${color}20`, color, fontWeight: 700, border: `1px solid ${color}40` }}>
                      {i + 1}
                    </div>
                    <span className="text-[10px] text-[#C8D8F0]" style={{ fontWeight: 600 }}>{p.phase}</span>
                    <span className="text-[9px] text-[#4A6080]">{p.time}</span>
                    <span className="text-[8px] text-[#4A6080] text-center leading-tight">{p.desc}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Incident Timeline */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="col-span-2 bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <SectionTitle icon={<AlertOctagon className="w-3.5 h-3.5" />}>LÍNEA DE TIEMPO DE EVENTOS</SectionTitle>
            <div className="relative flex flex-col gap-0 pl-5">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-[#1E3058]" />
              {COLLAPSE_TIMELINE.map((evt) => {
                const color = evt.type === 'critical' ? '#FF4D4D' : evt.type === 'warning' ? '#FFC857' : '#4DA6FF';
                return (
                  <div key={`collapse-${evt.time}`} className="relative flex gap-3 py-3 border-b border-[#1E3058]/40 last:border-0">
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
                          {evt.type === 'warning' ? 'ADVERTENCIA' : evt.type === 'critical' ? 'CRÍTICO' : 'INFO'}
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

          {/* Airline Resilience */}
          <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <SectionTitle icon={<Shield className="w-3.5 h-3.5" />}>RESILIENCIA POR AEROLÍNEA</SectionTitle>
            <div className="flex flex-col gap-2">
              {AIRLINE_RESILIENCE.map((a) => (
                <div key={a.code} className="flex items-center gap-2 py-1.5 border-b border-[#1E3058]/40">
                  <div className="w-7 text-[11px] text-[#A8C0E0]" style={{ fontWeight: 700 }}>{a.code}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[#1E3058] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${a.resilience}%`, backgroundColor: a.color }} />
                      </div>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color: a.color, fontWeight: 700 }}>{a.resilience}%</span>
                    </div>
                  </div>
                  <div className="text-[9px]" style={{ color: a.lost === 0 ? '#00FF9C' : '#FF4D4D' }}>
                    {a.lost === 0 ? '✓' : `${a.lost}×`}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 bg-[#FF4D4D]/8 rounded-lg border border-[#FF4D4D]/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3 h-3 text-[#FF4D4D]" />
                <span className="text-[9px] text-[#FF4D4D]" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>PUNTO DÉBIL</span>
              </div>
              <div className="text-[11px] text-[#FF7070] leading-relaxed">
                <strong>Emirates (EK)</strong> más vulnerable — dependencia excesiva del hub DXB. Se requieren hubs redundantes para rutas del Golfo.
              </div>
            </div>

            <div className="mt-3 bg-[#00FF9C]/8 rounded-lg border border-[#00FF9C]/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-3 h-3 text-[#00FF9C]" />
                <span className="text-[9px] text-[#00FF9C]" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>MÁS RESILIENTE</span>
              </div>
              <div className="text-[11px] text-[#70FFD0] leading-relaxed">
                <strong>Singapore Airlines (SQ)</strong> mejor preparada — red distribuida con hub SIN como respaldo efectivo durante colapso.
              </div>
            </div>
          </div>
        </div>

        {/* Airport Impact Grid */}
        <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4 mb-5">
          <SectionTitle icon={<AlertOctagon className="w-3.5 h-3.5" />}>IMPACTO POR AEROPUERTO — ANÁLISIS DE CONGESTIÓN</SectionTitle>
          <div className="grid grid-cols-4 gap-3">
            {AIRPORT_OVERLOAD.map(a => {
              const delta = a.peak - a.normal;
              const severity = a.peak >= 95 ? '#FF4D4D' : a.peak >= 90 ? '#FF4D4D' : a.peak >= 85 ? '#FFC857' : '#00FF9C';
              return (
                <div key={a.id} className="bg-[#0D1E38] rounded-lg p-3 border border-[#1E3058]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white" style={{ fontWeight: 700 }}>{a.id}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${severity}20`, color: severity, fontWeight: 600 }}
                    >
                      +{delta}pp
                    </span>
                  </div>
                  <div className="text-[10px] text-[#4A6080] mb-2">{a.city}</div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex-1">
                      <div className="text-[9px] text-[#4A6080] mb-0.5">Normal</div>
                      <div className="h-1 bg-[#1E3058] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${a.normal}%`, backgroundColor: '#4DA6FF' }} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[9px] text-[#4A6080] mb-0.5">Pico</div>
                      <div className="h-1 bg-[#1E3058] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${a.peak}%`, backgroundColor: severity }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[#4A6080]">{a.normal}%</span>
                    <span className="text-xs font-mono" style={{ color: severity, fontWeight: 700 }}>{a.peak}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-12 bg-[#0A1628] border-t border-[#1E3058] flex items-center px-6 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D]" />
          <span className="text-[10px] text-[#4A6080]">Colapso simulado · {collapseMetrics.affectedAirports}/{collapseMetrics.totalAirports} aeropuertos críticos · Resiliencia: {collapseMetrics.resilienceScore}/100</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#FF4D4D]/12 border border-[#FF4D4D]/30 text-xs text-[#FF4D4D] hover:bg-[#FF4D4D]/20 transition-colors"
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
