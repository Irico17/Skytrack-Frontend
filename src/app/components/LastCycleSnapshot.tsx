import React from 'react';
import { Plane, Package, CheckCircle, Warehouse, Clock, ListChecks, Send, Hourglass } from 'lucide-react';
import type { BackendCycleUpdate } from '../types/backend';

/**
 * Panel "Último ciclo ejecutado": el estado de la red en el ÚLTIMO ciclo que alcanzó a
 * planificarse antes de detener/terminar la simulación. Es lo más importante para el
 * reporte día a día (la operación corre hasta que se detiene) y también útil en 5 días y
 * colapso. Muestra los datos acumulados hasta ese corte: vuelos en vuelo, maletas en vuelo,
 * planificadas, por planificar, entregadas, en almacén, en origen y pendientes de entrega.
 */
export function LastCycleSnapshot({
  lastCycleUpdate,
  accent = '#4DA6FF',
  title = 'ÚLTIMO CICLO EJECUTADO',
  subtitle,
}: {
  lastCycleUpdate?: BackendCycleUpdate | null;
  accent?: string;
  title?: string;
  subtitle?: string;
}) {
  const om = lastCycleUpdate?.operationalMetrics;

  const fmt = (n: number | undefined) => (n === undefined || n === null ? '—' : n.toLocaleString());

  let cutLabel = subtitle;
  if (!cutLabel && lastCycleUpdate) {
    const t = new Date(lastCycleUpdate.simulatedTime);
    const timeStr = Number.isNaN(t.getTime())
      ? ''
      : ` · ${t.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}`;
    cutLabel = `Estado al corte · ciclo #${lastCycleUpdate.cycle}${timeStr}`;
  }

  const flightsInFlight = om?.activeLoadedFlights ?? lastCycleUpdate?.activeFlights?.length;
  const unrouted = lastCycleUpdate?.batchSummary?.unrouted;

  const tiles: { label: string; value: string; color: string; icon: React.ReactNode }[] = [
    { label: 'Vuelos en vuelo', value: fmt(flightsInFlight), color: accent, icon: <Plane className="w-3.5 h-3.5" /> },
    { label: 'Maletas en vuelo', value: fmt(om?.inFlightBags), color: accent, icon: <Plane className="w-3.5 h-3.5" /> },
    { label: 'Planificadas', value: fmt(om?.totalAssignedBags ?? lastCycleUpdate?.totalBags), color: '#A8C0E0', icon: <ListChecks className="w-3.5 h-3.5" /> },
    { label: 'Por planificar', value: fmt(unrouted), color: unrouted && unrouted > 0 ? '#FFC857' : '#00FF9C', icon: <Hourglass className="w-3.5 h-3.5" /> },
    { label: 'Entregadas', value: fmt(om?.deliveredBags), color: '#00FF9C', icon: <CheckCircle className="w-3.5 h-3.5" /> },
    { label: 'En almacén', value: fmt(om?.storedBags), color: '#A8C0E0', icon: <Warehouse className="w-3.5 h-3.5" /> },
    { label: 'En origen (sin despegar)', value: fmt(om?.notDepartedBags), color: '#A8C0E0', icon: <Send className="w-3.5 h-3.5" /> },
    { label: 'Pendientes de entrega', value: fmt(om?.pendingDeliveryBags), color: '#A8C0E0', icon: <Package className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="rounded-xl border p-4 mb-5" style={{ background: '#0A1628', borderColor: `${accent}4D` }}>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-3.5 h-3.5" style={{ color: accent }} />
        <span className="text-[11px]" style={{ color: accent, letterSpacing: '0.12em', fontWeight: 700 }}>{title}</span>
        {cutLabel && <span className="text-[10px] text-[#4A6080]">· {cutLabel}</span>}
        <div className="flex-1 h-px bg-[#1E3058]" />
      </div>

      {lastCycleUpdate ? (
        <div className="grid grid-cols-4 gap-3">
          {tiles.map(t => (
            <div key={t.label} className="bg-[#0D1E38] rounded-lg p-3 border border-[#1E3058]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-[#4A6080]" style={{ letterSpacing: '0.06em', fontWeight: 600 }}>{t.label.toUpperCase()}</span>
                <span style={{ color: t.color }}>{t.icon}</span>
              </div>
              <span className="text-xl" style={{ fontWeight: 700, color: t.color, lineHeight: 1 }}>{t.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#4A6080] leading-relaxed">
          No se alcanzó a ejecutar ningún ciclo de planificación antes de detener la simulación, por lo que
          no hay un estado de último ciclo que mostrar.
        </p>
      )}
    </div>
  );
}
