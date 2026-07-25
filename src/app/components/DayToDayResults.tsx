import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Globe, X, RotateCcw, CheckCircle, AlertTriangle, Package,
  Clock, Warehouse, Plane, Users, Activity, Download,
} from 'lucide-react';
import { Shipment, SimEvent, Airport, getOccupancyPercent, occupancyColor, OCCUPANCY_CRITICAL_PCT } from '../data/mockData';
import type { BackendCycleUpdate, BackendSimulationResults } from '../types/backend';
import { LastCycleSnapshot } from './LastCycleSnapshot';
import { downloadTextFile, reportLine, reportSection } from '../utils/exportReport';

interface DayToDayResultsProps {
  results: BackendSimulationResults | null;
  lastCycleUpdate?: BackendCycleUpdate | null;
  airports: Airport[];
  shipments: Shipment[];
  events: SimEvent[];
  simulationTime: Date;
  onClose: () => void;
  onReset: () => void;
}

function KpiCard({ label, value, unit, color, icon, subtext }: {
  label: string; value: string | number; unit?: string; color: string;
  icon: React.ReactNode; subtext?: string;
}) {
  return (
    <div className="relative flex flex-col justify-between p-4 rounded-xl border border-[#1E3058] bg-[#0A1628] overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl" style={{ fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
        {unit && <span className="text-sm text-[#4A6080]">{unit}</span>}
      </div>
      {subtext && <span className="text-[11px] text-[#4A6080] mt-2">{subtext}</span>}
    </div>
  );
}

const DASH = '—';

export function DayToDayResults({ results, lastCycleUpdate, airports, shipments, events, simulationTime, onClose, onReset }: DayToDayResultsProps) {
  const metrics = lastCycleUpdate?.operationalMetrics;

  const avgOccupancy = airports.length > 0
    ? Math.round(airports.reduce((acc, a) => acc + getOccupancyPercent(a.occupancy, a.capacity), 0) / airports.length)
    : 0;
  const overloaded = airports.filter(a => getOccupancyPercent(a.occupancy, a.capacity) >= OCCUPANCY_CRITICAL_PCT).length;

  const occupancyData = React.useMemo(() => airports
    .map(a => ({ id: a.id, pct: getOccupancyPercent(a.occupancy, a.capacity) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 12), [airports]);

  // Maletas por cliente (datos reales de la solución mapeada)
  const clientData = React.useMemo(() => {
    const byClient = new Map<string, { clientId: string; bags: number; shipments: number }>();
    for (const s of shipments) {
      const clientId = s.airlineId || s.airline || 'Cliente';
      const cur = byClient.get(clientId) ?? { clientId, bags: 0, shipments: 0 };
      cur.bags += s.luggageCount;
      cur.shipments += 1;
      byClient.set(clientId, cur);
    }
    return Array.from(byClient.values()).sort((a, b) => b.bags - a.bags).slice(0, 8);
  }, [shipments]);

  // results.slaCompliancePercent ya es porcentaje; semaphores.slaCompliance es FRACCIÓN (0-1).
  const onTimePct = results ? Math.round(results.slaCompliancePercent) : (lastCycleUpdate ? Math.round(lastCycleUpdate.semaphores.slaCompliance * 100) : 0);
  const totalRoutes = results?.routedBatches ?? lastCycleUpdate?.totalRoutes ?? shipments.length;
  const totalBags = metrics?.totalAssignedBags ?? lastCycleUpdate?.totalBags ?? shipments.reduce((a, s) => a + s.luggageCount, 0);

  const handleExportTxt = () => {
    const num = (n: number | undefined) => (n === undefined || n === null ? '—' : n.toLocaleString());
    const lines: string[] = [];
    lines.push('SKYTRACK — REPORTE DE OPERACIÓN DÍA A DÍA');
    lines.push(`Generado: ${new Date().toLocaleString('es-PE', { hour12: false })}`);
    lines.push(`Hora simulada al cierre: ${simulationTime.toLocaleString('es-PE', { hour12: false })}`);
    lines.push(reportSection('RESUMEN'));
    lines.push(reportLine('Rutas planificadas', totalRoutes));
    lines.push(reportLine('A tiempo (%)', onTimePct));
    lines.push(reportLine('Maletas asignadas', typeof totalBags === 'number' ? totalBags.toLocaleString() : totalBags));
    lines.push(reportLine('Lotes totales', results?.totalBatches ?? shipments.length));
    lines.push(reportLine('Lotes con ruta', results?.routedBatches ?? '—'));
    lines.push(reportLine('Sin ruta', results?.unroutableBatches ?? (lastCycleUpdate?.batchSummary.unrouted ?? '—')));
    lines.push(reportLine('Ciclos ejecutados', results?.totalCycles ?? lastCycleUpdate?.cycle ?? '—'));
    lines.push(reportLine('Fitness final', results ? results.fitness.toFixed(2) : (lastCycleUpdate ? lastCycleUpdate.fitness.toFixed(2) : '—')));
    if (lastCycleUpdate) {
      lines.push(reportSection(`ÚLTIMO CICLO EJECUTADO (#${lastCycleUpdate.cycle})`));
      lines.push(reportLine('Vuelos en vuelo', num(metrics?.activeLoadedFlights ?? lastCycleUpdate.activeFlights?.length)));
      lines.push(reportLine('Maletas en vuelo', num(metrics?.inFlightBags)));
      lines.push(reportLine('Planificadas', num(metrics?.totalAssignedBags ?? lastCycleUpdate.totalBags)));
      lines.push(reportLine('Por planificar', num(lastCycleUpdate.batchSummary?.unrouted)));
      lines.push(reportLine('Entregadas', num(metrics?.deliveredBags)));
      lines.push(reportLine('En almacén', num(metrics?.storedBags)));
      lines.push(reportLine('En origen (sin despegar)', num(metrics?.notDepartedBags)));
      lines.push(reportLine('Pendientes de entrega', num(metrics?.pendingDeliveryBags)));
    }
    if (clientData.length > 0) {
      lines.push(reportSection('TOP CLIENTES (maletas)'));
      clientData.forEach(c => lines.push(reportLine(c.clientId, c.bags.toLocaleString())));
    }
    downloadTextFile(`reporte_dia_a_dia_${Date.now()}.txt`, lines.join('\n') + '\n');
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#060D1F', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div className="flex-shrink-0 h-16 bg-[#0A1628] border-b border-[#1E3058] flex items-center px-6 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 flex items-center justify-center">
            <Globe className="w-5 h-5 text-[#4DA6FF]" />
          </div>
          <div>
            <div className="text-white text-sm" style={{ fontWeight: 700, letterSpacing: '0.06em' }}>SKYTRACK</div>
            <div className="text-[#4DA6FF] text-[9px]" style={{ letterSpacing: '0.2em' }}>OPERACIÓN DÍA A DÍA — REPORTE</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00FF9C]/10 border border-[#00FF9C]/30">
          <CheckCircle className="w-3.5 h-3.5 text-[#00FF9C]" />
          <span className="text-xs text-[#00FF9C]" style={{ fontWeight: 600 }}>Última planificación estable</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#4A6080]">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{simulationTime.toLocaleString('es-ES', { hour12: false })}</span>
        </div>
        <div className="flex-1" />
        <button onClick={handleExportTxt} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A2E4A] border border-[#1E3058] text-xs text-[#A8C0E0] hover:border-[#00FF9C]/40 transition-colors" style={{ fontWeight: 600 }} title="Descargar un resumen del reporte en texto (.txt)">
          <Download className="w-3.5 h-3.5" />
          Exportar TXT
        </button>
        <button onClick={onReset} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A2E4A] border border-[#1E3058] text-xs text-[#A8C0E0] hover:border-[#4DA6FF]/40 transition-colors" style={{ fontWeight: 600 }}>
          <RotateCcw className="w-3.5 h-3.5" />
          Nueva Operación
        </button>
        <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[#1A2E4A] border border-[#1E3058] flex items-center justify-center hover:border-[#4DA6FF]/40 hover:text-[#4DA6FF] text-[#A8C0E0] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Último ciclo ejecutado — lo más importante: estado de la red al detener la operación */}
        <LastCycleSnapshot
          lastCycleUpdate={lastCycleUpdate}
          accent="#4DA6FF"
          subtitle={`Estado al detener la operación · ciclo #${lastCycleUpdate?.cycle ?? DASH}`}
        />

        {/* KPI strip (acumulado de toda la operación) */}
        <div className="grid grid-cols-6 gap-3 mb-5">
          <KpiCard label="RUTAS PLANIFICADAS" value={totalRoutes} color="#4DA6FF" icon={<Activity className="w-3.5 h-3.5" />} subtext="Lotes con ruta asignada" />
          <KpiCard label="A TIEMPO" value={onTimePct} unit="%" color={onTimePct >= 85 ? '#00FF9C' : onTimePct >= 70 ? '#FFC857' : '#FF4D4D'} icon={<CheckCircle className="w-3.5 h-3.5" />} subtext="Rutas a tiempo" />
          <KpiCard label="MALETAS ASIGNADAS" value={typeof totalBags === 'number' ? totalBags.toLocaleString() : totalBags} color="#A8C0E0" icon={<Package className="w-3.5 h-3.5" />} />
          <KpiCard label="ENTREGADAS" value={metrics?.deliveredBags?.toLocaleString() ?? DASH} color="#00FF9C" icon={<CheckCircle className="w-3.5 h-3.5" />} />
          <KpiCard label="EN VUELO" value={metrics?.inFlightBags?.toLocaleString() ?? DASH} color="#4DA6FF" icon={<Plane className="w-3.5 h-3.5" />} />
          <KpiCard label="SOBRECAPACIDAD" value={metrics?.overloadedAirports ?? overloaded} color={overloaded > 0 ? '#FF4D4D' : '#00FF9C'} icon={<AlertTriangle className="w-3.5 h-3.5" />} subtext={`Ocup. prom. ${avgOccupancy}%`} />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Occupancy by airport */}
          <div className="col-span-2 bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Warehouse className="w-3.5 h-3.5 text-[#4DA6FF]" />
              <span className="text-[11px] text-[#4A6080]" style={{ letterSpacing: '0.12em', fontWeight: 700 }}>OCUPACIÓN DE ALMACÉN POR AEROPUERTO</span>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={occupancyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={14}>
                  <XAxis dataKey="id" tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#4A6080', fontSize: 9 }} axisLine={false} tickLine={false} unit="%" />
                  <ReTooltip cursor={{ fill: 'rgba(77,166,255,0.05)' }} />
                  <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                    {occupancyData.map(e => (
                      <Cell key={e.id} fill={occupancyColor(e.pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top clients */}
          <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-3.5 h-3.5 text-[#4DA6FF]" />
              <span className="text-[11px] text-[#4A6080]" style={{ letterSpacing: '0.12em', fontWeight: 700 }}>MALETAS POR CLIENTE</span>
            </div>
            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
              {clientData.map(c => {
                const max = Math.max(clientData[0]?.bags ?? 1, 1);
                return (
                  <div key={c.clientId} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#A8C0E0] w-20 truncate" style={{ fontWeight: 600 }}>{c.clientId}</span>
                    <div className="flex-1 h-2 bg-[#1E3058] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#4DA6FF]" style={{ width: `${Math.max(4, (c.bags / max) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-[#4DA6FF] w-12 text-right">{c.bags.toLocaleString()}</span>
                  </div>
                );
              })}
              {clientData.length === 0 && <div className="text-[11px] text-[#4A6080]">Sin envíos registrados</div>}
            </div>
          </div>
        </div>

        {/* Resumen + eventos */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <span className="text-[11px] text-[#4A6080]" style={{ letterSpacing: '0.12em', fontWeight: 700 }}>RESUMEN</span>
            <div className="flex flex-col gap-1.5 mt-3">
              {[
                { label: 'Lotes totales', value: results?.totalBatches ?? shipments.length },
                { label: 'Lotes con ruta', value: results?.routedBatches ?? DASH },
                { label: 'Sin ruta', value: results?.unroutableBatches ?? (lastCycleUpdate?.batchSummary.unrouted ?? DASH) },
                { label: 'Ciclos', value: results?.totalCycles ?? lastCycleUpdate?.cycle ?? DASH },
                { label: 'Fitness final', value: results ? results.fitness.toFixed(2) : (lastCycleUpdate ? lastCycleUpdate.fitness.toFixed(2) : DASH) },
                { label: 'Algoritmo', value: results?.algorithmUsed ?? 'GATS' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-[#1E3058]/40">
                  <span className="text-[11px] text-[#4A6080]">{r.label}</span>
                  <span className="text-[11px] text-[#C8D8F0]" style={{ fontWeight: 600 }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 bg-[#0A1628] rounded-xl border border-[#1E3058] p-4">
            <span className="text-[11px] text-[#4A6080]" style={{ letterSpacing: '0.12em', fontWeight: 700 }}>REGISTRO DE EVENTOS</span>
            <div className="flex flex-col gap-0 mt-3 max-h-[240px] overflow-y-auto">
              {events.slice(0, 30).map(event => (
                <div key={event.id} className="flex items-start gap-2 py-1.5 border-b border-[#1E3058]/30">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${event.severity === 'critical' ? 'bg-[#FF4D4D]' : event.severity === 'warning' ? 'bg-[#FFC857]' : 'bg-[#4DA6FF]'}`} />
                  <div>
                    <p className="text-[11px] text-[#A8C0E0] leading-relaxed">{event.message}</p>
                    <p className="text-[9px] text-[#3A5070]">{event.time.toLocaleTimeString('es-ES', { hour12: false })}</p>
                  </div>
                </div>
              ))}
              {events.length === 0 && <div className="text-[11px] text-[#4A6080]">Sin eventos</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
