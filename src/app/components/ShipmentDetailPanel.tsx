import React from 'react';
import {
  X, Package, Plane, ArrowRight, Clock, MapPin,
  CheckCircle, AlertTriangle, XCircle, Zap, Route,
  ChevronRight, Calendar, Luggage, Shield,
} from 'lucide-react';
import { Shipment, Flight, Airport, getStatusColor, getOccupancyPercent } from '../data/mockData';

interface ShipmentDetailPanelProps {
  shipment: Shipment;
  flights: Flight[];
  airports: Airport[];
  onClose: () => void;
  simulationTime: Date;
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmtDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString('es-ES', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    'on-time': { bg: 'bg-[#00FF9C]/10 border-[#00FF9C]/30', text: 'text-[#00FF9C]', icon: <CheckCircle className="w-3 h-3" />, label: 'A Tiempo' },
    'delayed': { bg: 'bg-[#FFC857]/10 border-[#FFC857]/30', text: 'text-[#FFC857]', icon: <AlertTriangle className="w-3 h-3" />, label: 'Retrasado' },
    'critical': { bg: 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30', text: 'text-[#FF4D4D]', icon: <XCircle className="w-3 h-3" />, label: 'Crítico' },
  };
  const c = configs[status] || configs['on-time'];
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${c.bg} ${c.text}`} style={{ fontWeight: 600 }}>
      {c.icon}
      {c.label}
    </span>
  );
}

function TimelineStep({
  label, time, status, icon, last,
}: {
  label: string; time: string; status: 'complete' | 'active' | 'pending'; icon: React.ReactNode; last?: boolean;
}) {
  const colors = {
    complete: { dot: '#00FF9C', text: '#00FF9C', label: '#A8C0E0' },
    active: { dot: '#4DA6FF', text: '#4DA6FF', label: '#A8C0E0' },
    pending: { dot: '#1E3058', text: '#4A6080', label: '#4A6080' },
  };
  const c = colors[status];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${c.dot}20`, border: `1px solid ${c.dot}60` }}>
          <div style={{ color: c.dot }} className="w-3 h-3">{icon}</div>
        </div>
        {!last && <div className="w-px flex-1 bg-[#1E3058] mt-1" />}
      </div>
      <div className="pb-4 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: c.label, fontWeight: 500 }}>{label}</span>
          <span className="text-[10px] font-mono" style={{ color: c.text }}>{time}</span>
        </div>
      </div>
    </div>
  );
}

export function ShipmentDetailPanel({ shipment, flights, airports, onClose, simulationTime }: ShipmentDetailPanelProps) {
  const origin = airports.find(a => a.id === shipment.origin);
  const dest = airports.find(a => a.id === shipment.destination);
  const currentFlight = flights.find(f => f.id === shipment.currentFlightId);
  const color = getStatusColor(shipment.status);
  const progressPct = Math.round(shipment.progress * 100);

  // Build a computed route with transfers
  const routeStops: { airport: Airport; action: string }[] = [];
  if (origin) routeStops.push({ airport: origin, action: 'Recogida inicial' });

  // Check if there are intermediate airports (multi-hop)
  const routeFlights = flights.filter(f =>
    f.from === shipment.origin || f.to === shipment.destination ||
    (currentFlight && f.to === currentFlight.from && f.from !== shipment.origin)
  );

  if (shipment.isReplanned && routeFlights.length > 0) {
    routeFlights.slice(0, 2).forEach(f => {
      const mid = airports.find(a => a.id === f.to);
      if (mid && mid.id !== dest?.id) {
        routeStops.push({ airport: mid, action: 'Transferencia (ruta alternativa)' });
      }
    });
  }

  if (dest && !routeStops.find(s => s.airport.id === dest.id)) {
    routeStops.push({ airport: dest, action: 'Entrega final' });
  }

  // Build timeline based on progress
  const totalStages = 5;
  const currentStage = Math.floor(progressPct / (100 / totalStages));

  const estDeliveryDate = new Date(shipment.estimatedDelivery);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#080F1E] border-l border-[#1E3058] flex flex-col z-[90] shadow-2xl">
      {/* Header */}
      <div className="flex-shrink-0 h-14 bg-[#0A1628] border-b border-[#1E3058] flex items-center px-4 gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}40` }}>
          <Package className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm" style={{ fontWeight: 700 }}>{shipment.id}</span>
            {shipment.isReplanned && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30">Redirigido</span>
            )}
          </div>
          <div className="text-[#4A6080] text-[11px]">{shipment.airline}</div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-[#1A2E4A] border border-[#1E3058] flex items-center justify-center hover:border-[#FF4D4D]/40 hover:text-[#FF4D4D] text-[#A8C0E0] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Route Overview */}
        <div className="p-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-2 mb-3">
            <Route className="w-3.5 h-3.5 text-[#4DA6FF]" />
            <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>RUTA COMPLETA</span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="text-center">
              <div className="text-lg text-white" style={{ fontWeight: 700 }}>{shipment.origin}</div>
              <div className="text-[10px] text-[#4A6080]">{origin?.city}</div>
            </div>
            <div className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-px bg-[#1E3058]" />
              <Plane className="w-3 h-3 text-[#4DA6FF]" style={{ transform: 'rotate(90deg)' }} />
              <div className="flex-1 h-px bg-[#1E3058]" />
              {shipment.isReplanned && <ChevronRight className="w-3 h-3 text-[#A855F7]" />}
              {shipment.isReplanned && <div className="flex-1 h-px border-t border-dashed border-[#A855F7]" />}
            </div>
            <div className="text-center">
              <div className="text-lg text-white" style={{ fontWeight: 700 }}>{shipment.destination}</div>
              <div className="text-[10px] text-[#4A6080]">{dest?.city}</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <StatusBadge status={shipment.status} />
            <span className="text-xs text-[#4A6080]">{progressPct}% completado</span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-[#1E3058] rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}40`,
              }}
            />
          </div>
        </div>

        {/* Current Flight */}
        {currentFlight && (
          <div className="p-4 border-b border-[#1E3058]">
            <div className="flex items-center gap-2 mb-3">
              <Plane className="w-3.5 h-3.5 text-[#4DA6FF]" />
              <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>VUELO ACTUAL</span>
            </div>

            <div className="bg-[#0D1E38] rounded-lg p-3 border border-[#1E3058]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white" style={{ fontWeight: 700 }}>{currentFlight.flightNumber}</span>
                <StatusBadge status={currentFlight.status} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#A8C0E0] mb-2">
                <span>{currentFlight.from}</span>
                <ArrowRight className="w-3 h-3 text-[#4A6080]" />
                <span>{currentFlight.to}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-[#4A6080]">Salida </span>
                  <span className="text-[#C8D8F0]">{currentFlight.departureTime}</span>
                </div>
                <div>
                  <span className="text-[#4A6080]">Llegada </span>
                  <span className="text-[#C8D8F0]">{currentFlight.arrivalTime}</span>
                </div>
                <div>
                  <span className="text-[#4A6080]">Capacidad </span>
                  <span className="text-[#C8D8F0]">{currentFlight.load}/{currentFlight.capacity}</span>
                </div>
                <div>
                  <span className="text-[#4A6080]">Carga </span>
                  <span className="text-[#C8D8F0]">{Math.round(currentFlight.load / currentFlight.capacity * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shipment Details */}
        <div className="p-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-3.5 h-3.5 text-[#4DA6FF]" />
            <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>DETALLES DEL ENVÍO</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0D1E38] rounded-lg p-3 border border-[#1E3058]">
              <div className="flex items-center gap-1.5 mb-1">
                <Luggage className="w-3 h-3 text-[#4DA6FF]" />
                <span className="text-[9px] text-[#4A6080]">EQUIPAJE</span>
              </div>
              <div className="text-lg text-[#4DA6FF]" style={{ fontWeight: 700 }}>{shipment.luggageCount}</div>
              <div className="text-[10px] text-[#4A6080]">maletas</div>
            </div>

            <div className="bg-[#0D1E38] rounded-lg p-3 border border-[#1E3058]">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3 h-3 text-[#00FF9C]" />
                <span className="text-[9px] text-[#4A6080]">ENTREGA ESTIMADA</span>
              </div>
              <div className="text-sm text-[#00FF9C]" style={{ fontWeight: 600 }}>{fmtTime(estDeliveryDate)}</div>
              <div className="text-[10px] text-[#4A6080]">{fmtDate(estDeliveryDate)}</div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="p-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-[#4DA6FF]" />
            <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>LÍNEA DE TIEMPO</span>
          </div>

          <div className="pl-1">
            <TimelineStep
              label="Envío registrado en origen"
              time={fmtTime(simulationTime)}
              status={currentStage >= 0 ? 'complete' : 'pending'}
              icon={<MapPin className="w-2.5 h-2.5" />}
            />
            <TimelineStep
              label={`Cargado en vuelo ${currentFlight?.flightNumber || '—'}`}
              time={currentStage >= 1 ? fmtTime(new Date(simulationTime.getTime() + 60 * 60000)) : '—'}
              status={currentStage >= 1 ? 'complete' : currentStage === 0 ? 'active' : 'pending'}
              icon={<Plane className="w-2.5 h-2.5" />}
            />
            {shipment.isReplanned && (
              <TimelineStep
                label="Ruta replanificada — redirigido"
                time={currentStage >= 2 ? fmtTime(new Date(simulationTime.getTime() + 120 * 60000)) : '—'}
                status={currentStage >= 2 ? 'complete' : currentStage === 1 ? 'active' : 'pending'}
                icon={<Zap className="w-2.5 h-2.5" />}
              />
            )}
            <TimelineStep
              label={shipment.isReplanned ? 'Transferencia en hub alternativo' : 'En tránsito'}
              time={currentStage >= 3 ? fmtTime(new Date(simulationTime.getTime() + 180 * 60000)) : '—'}
              status={currentStage >= 3 ? 'complete' : currentStage === 2 ? 'active' : 'pending'}
              icon={<Route className="w-2.5 h-2.5" />}
            />
            <TimelineStep
              label="Entrega en destino"
              time={currentStage >= 4 ? fmtTime(estDeliveryDate) : '—'}
              status={currentStage >= 4 ? 'complete' : currentStage === 3 ? 'active' : 'pending'}
              icon={<CheckCircle className="w-2.5 h-2.5" />}
              last
            />
          </div>
        </div>

        {/* Route Stops */}
        {routeStops.length > 1 && (
          <div className="p-4 border-b border-[#1E3058]">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-3.5 h-3.5 text-[#4DA6FF]" />
              <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>ESCALAS DE RUTA</span>
            </div>

            <div className="flex flex-col gap-3">
              {routeStops.map((stop, i) => {
                const isFirst = i === 0;
                const isLast = i === routeStops.length - 1;
                const isReplannedStop = stop.action.includes('alternativa');
                return (
                  <div key={stop.airport.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px]"
                        style={{
                          backgroundColor: isReplannedStop ? '#A855F7' : isFirst ? '#00FF9C' : isLast ? '#4DA6FF' : '#FFC857',
                          color: '#060D1F',
                          fontWeight: 700,
                        }}
                      >
                        {i + 1}
                      </div>
                      {i < routeStops.length - 1 && <div className="w-px flex-1 bg-[#1E3058] mt-1" />}
                    </div>
                    <div className="pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white" style={{ fontWeight: 600 }}>{stop.airport.id}</span>
                        {isReplannedStop && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-[#A855F7]/20 text-[#A855F7]">Alt</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#4A6080]">{stop.airport.city}</div>
                      <div className="text-[10px] text-[#7090B0] mt-0.5">{stop.action}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Risk Assessment */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-3.5 h-3.5 text-[#4DA6FF]" />
            <span className="text-[10px] text-[#4A6080]" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>EVALUACIÓN DE RIESGO</span>
          </div>

          <div className={`rounded-lg p-3 border ${
            shipment.status === 'critical'
              ? 'bg-[#FF4D4D]/8 border-[#FF4D4D]/30'
              : shipment.status === 'delayed'
                ? 'bg-[#FFC857]/8 border-[#FFC857]/30'
                : 'bg-[#00FF9C]/8 border-[#00FF9C]/30'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {shipment.status === 'critical' ? (
                <XCircle className="w-4 h-4 text-[#FF4D4D]" />
              ) : shipment.status === 'delayed' ? (
                <AlertTriangle className="w-4 h-4 text-[#FFC857]" />
              ) : (
                <CheckCircle className="w-4 h-4 text-[#00FF9C]" />
              )}
              <span className="text-xs" style={{ color, fontWeight: 600 }}>
                {shipment.status === 'critical' ? 'RIESGO CRÍTICO' : shipment.status === 'delayed' ? 'RIESGO MODERADO' : 'BAJO RIESGO'}
              </span>
            </div>
            <div className="text-[11px] leading-relaxed" style={{ color: shipment.status === 'critical' ? '#FF9090' : shipment.status === 'delayed' ? '#FFD890' : '#70FFD0' }}>
              {shipment.status === 'critical'
                ? 'Este envío requiere intervención inmediata. Posible pérdida de equipaje o retraso significativo.'
                : shipment.status === 'delayed'
                  ? 'Retraso detectado en la ruta. Se monitoreará de cerca para evitar escalada.'
                  : 'Envío en ruta normal. Entrega estimada dentro del tiempo esperado.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
