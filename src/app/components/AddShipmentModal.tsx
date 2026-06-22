import React, { useState } from 'react';
import { X, Package, PlusCircle, AlertCircle } from 'lucide-react';
import { Airport, Shipment } from '../data/mockData';

interface AddShipmentModalProps {
  onClose: () => void;
  onAdd: (shipment: Omit<Shipment, 'id' | 'progress' | 'isReplanned' | 'currentFlightId' | 'estimatedDelivery'>) => Promise<void>;
  airports: Airport[];
}

export function AddShipmentModal({ onClose, onAdd, airports }: AddShipmentModalProps) {
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    luggageCount: '',
    clientId: '',
    status: 'on-time' as Shipment['status'],
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.origin) return setError('Selecciona un aeropuerto de origen');
    if (!form.destination) return setError('Selecciona un aeropuerto de destino');
    if (form.origin === form.destination) return setError('El origen y destino deben ser diferentes');
    if (!form.luggageCount || parseInt(form.luggageCount) <= 0) return setError('Ingresa una cantidad válida de maletas');
    if (parseInt(form.luggageCount) > 400) return setError('Máximo 400 maletas por envío');

    setSubmitting(true);
    try {
      const trimmedClient = form.clientId.trim();
      await onAdd({
        // airlineId transporta el clientId; vacío → el hook autogenera uno único por ejecución.
        airlineId: trimmedClient,
        airline: trimmedClient || 'Operación manual',
        origin: form.origin,
        destination: form.destination,
        luggageCount: parseInt(form.luggageCount),
        status: 'on-time',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
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
              <div className="text-white text-sm" style={{ fontWeight: 700 }}>Registrar Maletas</div>
              <div className="text-[#4A6080] text-[11px]">Operación día a día</div>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="w-7 h-7 rounded-lg bg-[#1A2E4A] flex items-center justify-center hover:bg-[#1E3058] transition-colors disabled:opacity-50">
            <X className="w-3.5 h-3.5 text-[#A8C0E0]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
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
                  {airports.map(a => (
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
                  {airports.map(a => (
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
              CANTIDAD DE MALETAS
              <span className="text-[#2A4060] ml-1">(máx. 400)</span>
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

          {/* Client ID (opcional) */}
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              CLIENTE
              <span className="text-[#2A4060] ml-1">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.clientId}
              onChange={e => setField('clientId', e.target.value)}
              className={InputStyle}
              placeholder="Ej. 0019169 — vacío genera uno automático"
              maxLength={16}
            />
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#4DA6FF]/8 border border-[#4DA6FF]/20">
            <AlertCircle className="w-4 h-4 text-[#4DA6FF] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#6080A0] leading-relaxed">
              El lote quedará pendiente hasta el siguiente ciclo de planificación del backend. Si no indicas un cliente, se generará un identificador único para esta ejecución.
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
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-[#1E3058] text-[#A8C0E0] text-sm hover:border-[#2A3E60] transition-colors"
              style={{ fontWeight: 500 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || airports.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-sm hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontWeight: 600 }}
            >
              <PlusCircle className="w-4 h-4" />
              {submitting ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
