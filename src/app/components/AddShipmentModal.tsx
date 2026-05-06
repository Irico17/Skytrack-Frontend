import React, { useState } from 'react';
import { X, Package, PlusCircle, AlertCircle } from 'lucide-react';
import { AIRLINES, INITIAL_AIRPORTS, Shipment } from '../data/mockData';

interface AddShipmentModalProps {
  onClose: () => void;
  onAdd: (shipment: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => void;
}

export function AddShipmentModal({ onClose, onAdd }: AddShipmentModalProps) {
  const [form, setForm] = useState({
    airlineId: '',
    airline: '',
    origin: '',
    destination: '',
    luggageCount: '',
    status: 'on-time' as Shipment['status'],
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.airlineId) return setError('Selecciona una aerolínea');
    if (!form.origin) return setError('Selecciona un aeropuerto de origen');
    if (!form.destination) return setError('Selecciona un aeropuerto de destino');
    if (form.origin === form.destination) return setError('El origen y destino deben ser diferentes');
    if (!form.luggageCount || parseInt(form.luggageCount) <= 0) return setError('Ingresa una cantidad válida de bolsas');
    if (parseInt(form.luggageCount) > 400) return setError('Máximo 400 bolsas por envío');

    const airline = AIRLINES.find(a => a.id === form.airlineId);
    onAdd({
      airlineId: form.airlineId,
      airline: airline?.name || form.airlineId,
      origin: form.origin,
      destination: form.destination,
      luggageCount: parseInt(form.luggageCount),
      status: 'on-time',
    });
    onClose();
  };

  const setField = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const InputStyle = "w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 transition-colors placeholder:text-[#2A4060]";
  const SelectStyle = `${InputStyle} appearance-none cursor-pointer`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#0D1526] border border-[#1E3058] rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/30 flex items-center justify-center">
              <Package className="w-4 h-4 text-[#4DA6FF]" />
            </div>
            <div>
              <div className="text-white text-sm" style={{ fontWeight: 700 }}>Registrar Nuevo Envío</div>
              <div className="text-[#4A6080] text-[11px]">Agrega un nuevo envío de equipaje al sistema</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-[#1A2E4A] flex items-center justify-center hover:bg-[#1E3058] transition-colors">
            <X className="w-3.5 h-3.5 text-[#A8C0E0]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Airline */}
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>AEROLÍNEA (CLIENTE)</label>
            <div className="relative">
              <select
                value={form.airlineId}
                onChange={e => {
                  const airline = AIRLINES.find(a => a.id === e.target.value);
                  setField('airlineId', e.target.value);
                  setField('airline', airline?.name || '');
                }}
                className={SelectStyle}
                style={{ backgroundImage: 'none' }}
              >
                <option value="" className="bg-[#0A1628]">Seleccionar aerolínea...</option>
                {AIRLINES.map(a => (
                  <option key={a.id} value={a.id} className="bg-[#0A1628]">
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A6080] pointer-events-none">▾</div>
            </div>
          </div>

          {/* Route */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>AEROPUERTO DE ORIGEN</label>
              <div className="relative">
                <select
                  value={form.origin}
                  onChange={e => setField('origin', e.target.value)}
                  className={SelectStyle}
                  style={{ backgroundImage: 'none' }}
                >
                  <option value="" className="bg-[#0A1628]">Seleccionar origen...</option>
                  {INITIAL_AIRPORTS.map(a => (
                    <option key={a.id} value={a.id} className="bg-[#0A1628]">
                      {a.id} — {a.city}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A6080] pointer-events-none text-xs">▾</div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>AEROPUERTO DE DESTINO</label>
              <div className="relative">
                <select
                  value={form.destination}
                  onChange={e => setField('destination', e.target.value)}
                  className={SelectStyle}
                  style={{ backgroundImage: 'none' }}
                >
                  <option value="" className="bg-[#0A1628]">Seleccionar destino...</option>
                  {INITIAL_AIRPORTS.map(a => (
                    <option key={a.id} value={a.id} className="bg-[#0A1628]">
                      {a.id} — {a.city}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A6080] pointer-events-none text-xs">▾</div>
              </div>
            </div>
          </div>

          {/* Luggage count */}
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              NÚMERO DE UNIDADES DE EQUIPAJE
              <span className="text-[#2A4060] ml-1">(máx. 400 por vuelo)</span>
            </label>
            <input
              type="number"
              min={1}
              max={400}
              value={form.luggageCount}
              onChange={e => setField('luggageCount', e.target.value)}
              className={InputStyle}
              placeholder="Ej. 150"
            />
            {form.luggageCount && (
              <div className="mt-1.5 h-1.5 rounded-full bg-[#1E3058] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((parseInt(form.luggageCount) / 400) * 100, 100)}%`,
                    backgroundColor: parseInt(form.luggageCount) > 350 ? '#FF4D4D' :
                      parseInt(form.luggageCount) > 250 ? '#FFC857' : '#00FF9C'
                  }}
                />
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#4DA6FF]/8 border border-[#4DA6FF]/20">
            <AlertCircle className="w-4 h-4 text-[#4DA6FF] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#6080A0] leading-relaxed">
              El optimizador de rutas asignará automáticamente la mejor ruta de vuelo disponible.
              El envío aparecerá en el mapa de inmediato y podrá rastrearse en tiempo real.
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30">
              <AlertCircle className="w-3.5 h-3.5 text-[#FF4D4D] flex-shrink-0" />
              <span className="text-[11px] text-[#FF4D4D]">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#1E3058] text-[#A8C0E0] text-sm hover:border-[#2A3E60] transition-colors"
              style={{ fontWeight: 500 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-sm hover:bg-[#4DA6FF]/25 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <PlusCircle className="w-4 h-4" />
              Registrar Envío
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
