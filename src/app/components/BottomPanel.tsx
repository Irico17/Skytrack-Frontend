import React, { useState } from 'react';
import {
  Package, Plane, Building2, AlertTriangle,
  CheckCircle, XCircle, X, ArrowRight, BarChart2,
  Luggage
} from 'lucide-react';
import { Airport, Flight, Shipment, getStatusColor, getOccupancyPercent } from '../data/mockData';

interface SelectedEntity {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

interface BottomPanelProps {
  selectedEntity: SelectedEntity | null;
  airports: Airport[];
  flights: Flight[];
  shipments: Shipment[];
  onClearSelection: () => void;
  isRunning: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    'on-time': { bg: 'bg-[#00FF9C]/10 border-[#00FF9C]/30', text: 'text-[#00FF9C]', icon: <CheckCircle className="w-3 h-3" />, label: 'A Tiempo' },
    'delayed': { bg: 'bg-[#FFC857]/10 border-[#FFC857]/30', text: 'text-[#FFC857]', icon: <AlertTriangle className="w-3 h-3" />, label: 'Retrasado' },
    'critical': { bg: 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30', text: 'text-[#FF4D4D]', icon: <XCircle className="w-3 h-3" />, label: 'Crítico' },
    'normal': { bg: 'bg-[#00FF9C]/10 border-[#00FF9C]/30', text: 'text-[#00FF9C]', icon: <CheckCircle className="w-3 h-3" />, label: 'Normal' },
    'warning': { bg: 'bg-[#FFC857]/10 border-[#FFC857]/30', text: 'text-[#FFC857]', icon: <AlertTriangle className="w-3 h-3" />, label: 'Advertencia' },
  };
  const c = configs[status] || configs['normal'];
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${c.bg} ${c.text}`} style={{ fontWeight: 600 }}>
      {c.icon}
      {c.label}
    </span>
  );
}

function CapacityBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-mono" style={{ color }}>{value}/{max}</span>
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1E3058]/50">
      <span className="text-[11px] text-[#4A6080]">{label}</span>
      <span className="text-[11px]" style={{ color: valueColor || '#C8D8F0', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function AirportDetail({ airport, shipments, flights }: { airport: Airport; shipments: Shipment[]; flights: Flight[] }) {
  const pct = getOccupancyPercent(airport.occupancy, airport.capacity);
  const color = getStatusColor(airport.status);
  const activeFlights = flights.filter(f => f.from === airport.id || f.to === airport.id);
  const activeShipments = shipments.filter(s => s.origin === airport.id || s.destination === airport.id);

  return (
    <div className="flex gap-6 h-full">
      <div className="flex items-start gap-3 min-w-[200px]">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}>
          <Building2 className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="text-white text-sm" style={{ fontWeight: 700 }}>{airport.id}</div>
          <div className="text-[#A8C0E0] text-xs">{airport.name}</div>
          <div className="text-[#4A6080] text-[11px]">{airport.city}, {airport.country}</div>
          <div className="mt-2">
            <StatusBadge status={airport.status} />
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-4">
        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>CAPACIDAD DE ALMACÉN</div>
          <div className="text-2xl" style={{ fontWeight: 700, color }}>{pct}%</div>
          <div className="text-[11px] text-[#4A6080] mt-0.5">{airport.occupancy} / {airport.capacity} bolsas</div>
          <CapacityBar value={airport.occupancy} max={airport.capacity} color={color} />
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>VUELOS ACTIVOS</div>
          <div className="text-2xl text-[#4DA6FF]" style={{ fontWeight: 700 }}>{activeFlights.length}</div>
          <div className="text-[11px] text-[#4A6080] mt-0.5">rutas por este hub</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {activeFlights.slice(0, 4).map(f => (
              <span key={f.id} className="text-[10px] px-1.5 py-0.5 rounded bg-[#4DA6FF]/10 text-[#4DA6FF]">{f.flightNumber}</span>
            ))}
          </div>
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>ENVÍOS</div>
          <div className="text-2xl text-[#A8C0E0]" style={{ fontWeight: 700 }}>{activeShipments.length}</div>
          <div className="text-[11px] text-[#4A6080] mt-0.5">rastreo por este hub</div>
          <div className="mt-2 text-[11px] text-[#4A6080]">
            {activeShipments.filter(s => s.status === 'critical').length} críticos
            · {activeShipments.filter(s => s.status === 'delayed').length} retrasados
          </div>
        </div>
      </div>
    </div>
  );
}

function FlightDetail({ flight, airports, shipments }: { flight: Flight; airports: Airport[]; shipments: Shipment[] }) {
  const origin = airports.find(a => a.id === flight.from);
  const dest = airports.find(a => a.id === flight.to);
  const color = getStatusColor(flight.status);
  const loadPct = Math.round((flight.load / flight.capacity) * 100);
  const flightShipments = shipments.filter(s => s.currentFlightId === flight.id);

  return (
    <div className="flex gap-6 h-full">
      <div className="flex items-start gap-3 min-w-[220px]">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}>
          <Plane className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm" style={{ fontWeight: 700 }}>{flight.flightNumber}</span>
            {flight.isReplanned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30">Replanificado</span>
            )}
          </div>
          <div className="text-[#A8C0E0] text-xs">{flight.airline}</div>
          <div className="flex items-center gap-1 text-[#4A6080] text-[11px] mt-1">
            <span>{flight.from}</span>
            <ArrowRight className="w-3 h-3" />
            <span>{flight.to}</span>
          </div>
          {origin && dest && (
            <div className="text-[10px] text-[#4A6080] mt-0.5">{origin.city} → {dest.city}</div>
          )}
          <div className="mt-2">
            <StatusBadge status={flight.status} />
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-4">
        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>USO DE CAPACIDAD</div>
          <div className="text-2xl" style={{ fontWeight: 700, color }}>{loadPct}%</div>
          <div className="text-[11px] text-[#4A6080] mt-0.5">{flight.load} / {flight.capacity} bolsas</div>
          <CapacityBar value={flight.load} max={flight.capacity} color={color} />
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>HORARIO</div>
          <div className="text-xs text-[#C8D8F0]">Sale <span style={{ fontWeight: 600 }}>{flight.departureTime}</span></div>
          <div className="text-xs text-[#C8D8F0] mt-1">Llega <span style={{ fontWeight: 600 }}>{flight.arrivalTime}</span></div>
          <div className="text-[11px] text-[#4A6080] mt-1">{origin?.city} → {dest?.city}</div>
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>ENVÍOS A BORDO</div>
          <div className="text-2xl text-[#A8C0E0]" style={{ fontWeight: 700 }}>{flightShipments.length}</div>
          <div className="text-[11px] text-[#4A6080] mt-0.5">envíos activos</div>
          <div className="mt-1 text-[11px] text-[#4A6080]">
            {flightShipments.reduce((acc, s) => acc + s.luggageCount, 0)} bolsas en total
          </div>
        </div>
      </div>
    </div>
  );
}

function ShipmentDetail({ shipment, airports, flights }: { shipment: Shipment; airports: Airport[]; flights: Flight[] }) {
  const origin = airports.find(a => a.id === shipment.origin);
  const dest = airports.find(a => a.id === shipment.destination);
  const currentFlight = flights.find(f => f.id === shipment.currentFlightId);
  const color = getStatusColor(shipment.status);
  const progressPct = Math.round(shipment.progress * 100);

  return (
    <div className="flex gap-6 h-full">
      <div className="flex items-start gap-3 min-w-[220px]">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}>
          <Package className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm" style={{ fontWeight: 700 }}>{shipment.id}</span>
            {shipment.isReplanned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30">Redirigido</span>
            )}
          </div>
          <div className="text-[#A8C0E0] text-xs">{shipment.airline}</div>
          <div className="flex items-center gap-1 text-[#4A6080] text-[11px] mt-1">
            <span>{shipment.origin}</span>
            <ArrowRight className="w-3 h-3" />
            <span>{shipment.destination}</span>
          </div>
          {origin && dest && (
            <div className="text-[10px] text-[#4A6080] mt-0.5">{origin.city} → {dest.city}</div>
          )}
          <div className="mt-2">
            <StatusBadge status={shipment.status} />
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-4 gap-4">
        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>PROGRESO</div>
          <div className="text-2xl" style={{ fontWeight: 700, color }}>{progressPct}%</div>
          <CapacityBar value={shipment.progress * 100} max={100} color={color} />
          <div className="text-[11px] text-[#4A6080] mt-1">{shipment.origin} → {shipment.destination}</div>
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>EQUIPAJE</div>
          <div className="text-2xl text-[#4DA6FF]" style={{ fontWeight: 700 }}>{shipment.luggageCount}</div>
          <div className="text-[11px] text-[#4A6080] mt-0.5">bolsas en tránsito</div>
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>VUELO ACTUAL</div>
          {currentFlight ? (
            <>
              <div className="text-sm text-[#C8D8F0]" style={{ fontWeight: 600 }}>{currentFlight.flightNumber}</div>
              <div className="text-[11px] text-[#4A6080] mt-0.5">{currentFlight.from} → {currentFlight.to}</div>
              <div className="text-[11px] text-[#4A6080] mt-0.5">ETA: {currentFlight.arrivalTime}</div>
            </>
          ) : (
            <div className="text-[11px] text-[#4A6080]">No asignado</div>
          )}
        </div>

        <div className="bg-[#0D1E38] rounded-xl p-3 border border-[#1E3058]">
          <div className="text-[10px] text-[#4A6080] mb-2" style={{ letterSpacing: '0.1em' }}>ENTREGA ESTIMADA</div>
          <div className="text-xs text-[#C8D8F0]" style={{ fontWeight: 500 }}>
            {shipment.estimatedDelivery.split(' ')[0]}
          </div>
          <div className="text-sm text-[#A8C0E0]" style={{ fontWeight: 600 }}>
            {shipment.estimatedDelivery.split(' ')[1] || '–'}
          </div>
          <div className="mt-1 text-[11px]" style={{ color }}>
            {shipment.status === 'on-time' ? '✓ A tiempo' :
              shipment.status === 'delayed' ? '⚠ Retrasado' : '✕ Riesgo crítico'}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShipmentListRow({ s, onClick }: { s: Shipment; onClick: () => void }) {
  const color = getStatusColor(s.status);
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1A2E4A]/40 transition-colors border-b border-[#1E3058]/30 text-left"
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[11px] text-[#7090B0] w-14">{s.id}</span>
      <span className="text-[11px] text-[#A8C0E0] w-28 truncate">{s.airline}</span>
      <span className="text-[11px] text-[#7090B0] flex items-center gap-1">
        {s.origin} <ArrowRight className="w-2.5 h-2.5" /> {s.destination}
      </span>
      <span className="text-[11px] text-[#4DA6FF] w-12">{s.luggageCount} bolsas</span>
      <div className="flex-1" />
      <span className="text-[11px] font-mono text-[#4A6080]">{Math.round(s.progress * 100)}%</span>
      <div className="w-16 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${s.progress * 100}%`, backgroundColor: color }} />
      </div>
    </button>
  );
}

export function BottomPanel({
  selectedEntity, airports, flights, shipments, onClearSelection
}: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<'detail' | 'shipments' | 'active'>('detail');

  const selectedAirport = selectedEntity?.type === 'airport' ? airports.find(a => a.id === selectedEntity.id) : null;
  const selectedFlight = selectedEntity?.type === 'flight' ? flights.find(f => f.id === selectedEntity.id) : null;
  const selectedShipment = selectedEntity?.type === 'shipment' ? shipments.find(s => s.id === selectedEntity.id) : null;

  const hasSelection = selectedAirport || selectedFlight || selectedShipment;

  const tabs = [
    { id: 'detail' as const, label: hasSelection ? 'Detalles' : 'Resumen', icon: <BarChart2 className="w-3 h-3" /> },
    { id: 'shipments' as const, label: 'Todos los Envíos', icon: <Package className="w-3 h-3" /> },
    { id: 'active' as const, label: 'Alertas Activas', icon: <AlertTriangle className="w-3 h-3" /> },
  ];

  const criticalShipments = shipments.filter(s => s.status === 'critical');
  const delayedShipments = shipments.filter(s => s.status === 'delayed');

  return (
    <div className="h-56 bg-[#080F1E] border-t border-[#1E3058] flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[#1E3058] px-4 gap-1 flex-shrink-0 h-9">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors
              ${activeTab === tab.id
                ? 'text-[#4DA6FF] bg-[#4DA6FF]/10'
                : 'text-[#4A6080] hover:text-[#A8C0E0]'
              }`}
            style={{ fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        <div className="flex-1" />

        {hasSelection && (
          <button
            onClick={onClearSelection}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#4A6080] hover:text-[#A8C0E0] transition-colors"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}

        <div className="flex items-center gap-3 text-[11px] text-[#4A6080]">
          <span className="text-[#00FF9C]">● {shipments.filter(s => s.status === 'on-time').length} A Tiempo</span>
          <span className="text-[#FFC857]">● {delayedShipments.length} Retrasados</span>
          <span className="text-[#FF4D4D]">● {criticalShipments.length} Críticos</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'detail' && (
          <div className="h-full p-4">
            {selectedAirport && <AirportDetail airport={selectedAirport} shipments={shipments} flights={flights} />}
            {selectedFlight && <FlightDetail flight={selectedFlight} airports={airports} shipments={shipments} />}
            {selectedShipment && <ShipmentDetail shipment={selectedShipment} airports={airports} flights={flights} />}
            {!hasSelection && (
              <div className="flex items-center h-full gap-6">
                {[
                  { label: 'Total Aeropuertos', value: airports.length, color: '#4DA6FF', icon: <Building2 className="w-5 h-5" /> },
                  { label: 'Rutas Activas', value: flights.length, color: '#A855F7', icon: <Plane className="w-5 h-5" /> },
                  { label: 'En Tránsito', value: shipments.filter(s => s.progress < 1).length, color: '#00FF9C', icon: <Package className="w-5 h-5" /> },
                  { label: 'Críticos', value: criticalShipments.length, color: '#FF4D4D', icon: <AlertTriangle className="w-5 h-5" /> },
                  { label: 'Total Bolsas', value: shipments.reduce((a, s) => a + s.luggageCount, 0), color: '#FFC857', icon: <Luggage className="w-5 h-5" /> },
                ].map(m => (
                  <div key={m.label} className="bg-[#0D1E38] rounded-xl p-4 border border-[#1E3058] flex items-center gap-3 min-w-[160px]">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${m.color}15` }}>
                      <div style={{ color: m.color }}>{m.icon}</div>
                    </div>
                    <div>
                      <div className="text-xl" style={{ fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div className="text-[11px] text-[#4A6080]">{m.label}</div>
                    </div>
                  </div>
                ))}
                <div className="text-[11px] text-[#2A4060] ml-4">← Haz clic en cualquier elemento del mapa para ver detalles</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'shipments' && (
          <div className="h-full overflow-y-auto">
            <div className="sticky top-0 bg-[#080F1E] px-4 py-2 flex items-center gap-4 text-[10px] text-[#4A6080] border-b border-[#1E3058]/50" style={{ letterSpacing: '0.1em' }}>
              <span className="w-14">ID</span>
              <span className="w-28">AEROLÍNEA</span>
              <span>RUTA</span>
              <span className="w-12">BOLSAS</span>
              <div className="flex-1" />
              <span>PROGRESO</span>
            </div>
            {shipments.map(s => (
              <ShipmentListRow key={s.id} s={s} onClick={() => { }} />
            ))}
          </div>
        )}

        {activeTab === 'active' && (
          <div className="h-full overflow-y-auto">
            {criticalShipments.length === 0 && delayedShipments.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#2A4060] text-sm">
                <CheckCircle className="w-4 h-4 mr-2 text-[#00FF9C]" />
                Todos los envíos operando con normalidad
              </div>
            ) : (
              <>
                {criticalShipments.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1E3058]/30 bg-[#FF4D4D]/3">
                    <AlertTriangle className="w-4 h-4 text-[#FF4D4D] flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-[#FF4D4D]" style={{ fontWeight: 600 }}>CRÍTICO — {s.id}</div>
                      <div className="text-[11px] text-[#A8C0E0]">{s.airline} · {s.origin}→{s.destination} · {s.luggageCount} bolsas</div>
                    </div>
                  </div>
                ))}
                {delayedShipments.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1E3058]/30">
                    <AlertTriangle className="w-4 h-4 text-[#FFC857] flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-[#FFC857]" style={{ fontWeight: 600 }}>RETRASADO — {s.id}</div>
                      <div className="text-[11px] text-[#A8C0E0]">{s.airline} · {s.origin}→{s.destination} · {s.luggageCount} bolsas</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}