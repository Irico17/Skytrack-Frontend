import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, Plane, X } from 'lucide-react';
import type { BackendActiveFlight, BackendFlightPlanFlight } from '../types/backend';
import { computeCancellationTargetDay } from '../utils/cancellationDay';

interface CancelFlightModalProps {
  onClose: () => void;
  onCancel: (flightId: string, day: string) => Promise<void>;
  flightPlanFlights: BackendFlightPlanFlight[];
  activeFlights: BackendActiveFlight[];
  simulationTime: Date;
}

function stripProjectedDaySuffix(flightId: string): string {
  return flightId.replace(/-D\d+$/, '');
}

function formatFlightLabel(flight: BackendFlightPlanFlight | BackendActiveFlight): string {
  const dep = new Date(flight.departureTime);
  const time = Number.isNaN(dep.getTime())
    ? flight.departureTime
    : dep.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${stripProjectedDaySuffix(flight.flightId)} · ${flight.originId} -> ${flight.destinationId} · ${time}`;
}

export function CancelFlightModal({
  onClose,
  onCancel,
  flightPlanFlights,
  activeFlights,
  simulationTime,
}: CancelFlightModalProps) {
  const [flightId, setFlightId] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');

  const flights = useMemo(() => {
    const map = new Map<string, BackendFlightPlanFlight | BackendActiveFlight>();
    for (const flight of flightPlanFlights) map.set(flight.flightId, flight);
    for (const flight of activeFlights) map.set(flight.flightId, flight);
    return [...map.values()].sort((a, b) =>
      new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime()
    );
  }, [flightPlanFlights, activeFlights]);

  // Lista filtrada y ACOTADA (máx. 60) — evita renderizar ~15k opciones (lag al abrir).
  const MAX_RESULTS = 60;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? flights.filter(f => `${f.flightId} ${f.originId} ${f.destinationId}`.toLowerCase().includes(q))
      : flights;
    return base.slice(0, MAX_RESULTS);
  }, [flights, query]);

  useEffect(() => {
    if (!flightId) return;
    const flight = flights.find(f => f.flightId === flightId);
    if (!flight) return;
    setDay(computeCancellationTargetDay(simulationTime, flight.departureTime));
  }, [flightId, simulationTime, flights]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!flightId) return setError('Selecciona un vuelo');
    if (!day) return setError('Selecciona el día de cancelación');

    setSubmitting(true);
    try {
      await onCancel(flightId, day);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = 'w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 transition-colors';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Fondo apenas atenuado y SIN desenfoque para que se siga viendo el mapa/aviones detrás */}
      <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} />

      <div className="relative bg-[#0D1526] border border-[#1E3058] rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/30 flex items-center justify-center">
              <Ban className="w-4 h-4 text-[#FF4D4D]" />
            </div>
            <div>
              <div className="text-white text-sm" style={{ fontWeight: 700 }}>Cancelar Vuelo</div>
              <div className="text-[#4A6080] text-[11px]">Replanificación día a día</div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-7 h-7 rounded-lg bg-[#1A2E4A] flex items-center justify-center hover:bg-[#1E3058] transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5 text-[#A8C0E0]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>VUELO</label>
            <div className="relative">
              <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4A6080] pointer-events-none" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setFlightId(''); }}
                placeholder="Buscar por código, origen o destino…"
                className={`${inputStyle} pl-9`}
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#1E3058] divide-y divide-[#1E3058]/50">
              {filtered.map(flight => {
                const selected = flight.flightId === flightId;
                return (
                  <button
                    type="button"
                    key={flight.flightId}
                    onClick={() => setFlightId(flight.flightId)}
                    className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${selected
                      ? 'bg-[#FF4D4D]/15 text-[#FF9090]'
                      : 'text-[#C8D8F0] hover:bg-[#1A2E4A]/40'}`}
                  >
                    {formatFlightLabel(flight)}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-3 text-[11px] text-[#4A6080]">Sin vuelos que coincidan</div>
              )}
            </div>
            {flights.length > filtered.length && (
              <div className="mt-1 text-[10px] text-[#4A6080]">Mostrando {filtered.length} de {flights.length.toLocaleString()} · refina la búsqueda</div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>DÍA</label>
            <input
              type="date"
              value={day}
              onChange={event => setDay(event.target.value)}
              className={inputStyle}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30">
              <AlertCircle className="w-3.5 h-3.5 text-[#FF4D4D] flex-shrink-0" />
              <span className="text-[11px] text-[#FF4D4D]">{error}</span>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-[#1E3058] text-[#A8C0E0] text-sm hover:border-[#2A3E60] transition-colors disabled:opacity-50"
              style={{ fontWeight: 500 }}
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={submitting || flights.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 text-[#FF4D4D] text-sm hover:bg-[#FF4D4D]/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontWeight: 600 }}
            >
              <Ban className="w-4 h-4" />
              {submitting ? 'Cancelando...' : 'Cancelar Vuelo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
