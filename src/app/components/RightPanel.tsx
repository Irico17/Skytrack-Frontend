import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Package, AlertTriangle, Warehouse,
  Clock, FileText, Zap, CheckCircle, ChevronRight, Activity
} from 'lucide-react';
import { Airport, Flight, Shipment, SimEvent, getStatusColor, getOccupancyPercent } from '../data/mockData';

interface RightPanelProps {
  airports: Airport[];
  flights: Flight[];
  shipments: Shipment[];
  events: SimEvent[];
  isRunning: boolean;
  simulationTime: Date;
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

export function RightPanel({ airports, flights, shipments, events, isRunning, simulationTime }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'kpi' | 'warehouse' | 'reports'>('kpi');

  // KPI calculations
  const totalInTransit = shipments.filter(s => s.progress < 1).length;
  const delayedCount = shipments.filter(s => s.status === 'delayed').length;
  const criticalCount = shipments.filter(s => s.status === 'critical').length;
  const onTimeCount = shipments.filter(s => s.status === 'on-time').length;
  const totalBags = shipments.reduce((acc, s) => acc + s.luggageCount, 0);
  const replanCount = shipments.filter(s => s.isReplanned).length;

  const punctualityPct = Math.round((onTimeCount / Math.max(shipments.length, 1)) * 100);
  const avgOccupancy = Math.round(
    airports.reduce((acc, a) => acc + getOccupancyPercent(a.occupancy, a.capacity), 0) / airports.length
  );
  const criticalAirports = airports.filter(a => a.status === 'critical');
  const criticalFlights = flights.filter(f => f.status === 'critical');

  // Warehouse data for chart
  const warehouseData = airports
    .map(a => ({ id: a.id, pct: getOccupancyPercent(a.occupancy, a.capacity), occupancy: a.occupancy, capacity: a.capacity }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);

  // Shipment status distribution
  const statusData = [
    { name: 'A Tiempo', value: onTimeCount, color: '#00FF9C' },
    { name: 'Retrasado', value: delayedCount, color: '#FFC857' },
    { name: 'Crítico', value: criticalCount, color: '#FF4D4D' },
  ].filter(d => d.value > 0);

  const tabs = [
    { id: 'kpi' as const, label: 'KPIs', icon: <Activity className="w-3 h-3" /> },
    { id: 'warehouse' as const, label: 'Almacén', icon: <Warehouse className="w-3 h-3" /> },
    { id: 'reports' as const, label: 'Reportes', icon: <FileText className="w-3 h-3" /> },
  ];

  const recentReplanned = shipments.filter(s => s.isReplanned);

  return (
    <div className="w-80 bg-[#080F1E] border-l border-[#1E3058] flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[#1E3058] px-3 pt-2 gap-1 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] rounded-t-lg transition-colors
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
                label="EN TRÁNSITO"
                value={totalInTransit}
                color="#4DA6FF"
                icon={<Package className="w-3.5 h-3.5" />}
                trend={`${totalBags} bolsas en total`}
                trendDir="neutral"
              />
              <KPICard
                label="RETRASADOS"
                value={delayedCount}
                color={delayedCount > 0 ? '#FFC857' : '#00FF9C'}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                trend={delayedCount > 0 ? 'Requiere atención' : 'Todos a tiempo'}
                trendDir={delayedCount > 0 ? 'down' : 'up'}
              />
              <KPICard
                label="CRÍTICOS"
                value={criticalCount}
                color={criticalCount > 0 ? '#FF4D4D' : '#00FF9C'}
                icon={<Zap className="w-3.5 h-3.5" />}
                trend={criticalCount > 0 ? 'Acción requerida' : 'Sin problemas'}
                trendDir={criticalCount > 0 ? 'down' : 'up'}
              />
              <KPICard
                label="PUNTUALIDAD"
                value={punctualityPct}
                unit="%"
                color={punctualityPct >= 85 ? '#00FF9C' : punctualityPct >= 70 ? '#FFC857' : '#FF4D4D'}
                icon={<Clock className="w-3.5 h-3.5" />}
                trend={`${onTimeCount}/${shipments.length} a tiempo`}
                trendDir={punctualityPct >= 85 ? 'up' : 'down'}
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
                max={Math.max(shipments.length, 1)}
                thresholdWarn={5}
                thresholdCrit={15}
              />
              <TrafficLight
                label="Sobrecapacidad de Vuelos"
                value={criticalFlights.length}
                max={Math.max(flights.length, 1)}
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
                {events.slice(0, 6).map(event => (
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
                {airports
                  .sort((a, b) => getOccupancyPercent(b.occupancy, b.capacity) - getOccupancyPercent(a.occupancy, a.capacity))
                  .map(a => {
                    const pct = getOccupancyPercent(a.occupancy, a.capacity);
                    const color = getStatusColor(a.status);
                    return (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-b border-[#1E3058]/40 hover:bg-[#1A2E4A]/30">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[11px] text-[#A8C0E0] w-8" style={{ fontWeight: 600 }}>{a.id}</span>
                        <span className="text-[10px] text-[#4A6080] flex-1 truncate">{a.city}</span>
                        <div className="w-16 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-[11px] font-mono w-8 text-right" style={{ color }}>{pct}%</span>
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
                  { label: 'Total Envíos', value: shipments.length, color: '#4DA6FF' },
                  { label: 'Completados', value: shipments.filter(s => s.progress >= 1).length, color: '#00FF9C' },
                  { label: 'En Tránsito', value: totalInTransit, color: '#A8C0E0' },
                  { label: 'Retrasados', value: delayedCount, color: '#FFC857' },
                  { label: 'Críticos', value: criticalCount, color: '#FF4D4D' },
                  { label: 'Replanificados', value: replanCount, color: '#A855F7' },
                  { label: 'Total Bolsas', value: totalBags.toLocaleString(), color: '#4DA6FF' },
                  { label: 'Ocupación Prom.', value: `${avgOccupancy}%`, color: getStatusColor(avgOccupancy >= 90 ? 'critical' : avgOccupancy >= 70 ? 'warning' : 'normal') },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-[#1E3058]/40">
                    <span className="text-[11px] text-[#4A6080]">{row.label}</span>
                    <span className="text-[11px]" style={{ color: row.color, fontWeight: 600 }}>{row.value}</span>
                  </div>
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
                {flights.map(f => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2 border-b border-[#1E3058]/30 hover:bg-[#1A2E4A]/30">
                    <div>
                      <span className="text-[11px] text-[#A8C0E0]" style={{ fontWeight: 500 }}>{f.flightNumber}</span>
                      <div className="text-[10px] text-[#4A6080]">{f.from} → {f.to} · {f.departureTime}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px]" style={{ color: getStatusColor(f.status) }}>
                        {Math.round((f.load / f.capacity) * 100)}%
                      </div>
                      <div className="text-[10px] text-[#4A6080]">{f.load}/{f.capacity}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Replanned shipments */}
            {recentReplanned.length > 0 && (
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
