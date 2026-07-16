import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PackagePlus, MapPin, Clock, CheckCircle2, AlertCircle, Loader2, Plane, RefreshCw } from 'lucide-react';
import { fetchAirports, getActiveSimulation, createShipment } from '../services/api';
import type { BackendAirport, BackendActiveSimulation } from '../types/backend';

/**
 * PANTALLA DE ESTACIÓN DE REGISTRO (operación día a día) — independiente del mapa.
 *
 * Requisito del curso: "una pantalla de ingreso de datos independiente del mapa de
 * operaciones día a día, pues es para un empleado que sólo recepciona maletas". Además:
 * "cada ciudad trabaja en su huso horario correspondiente" y "resulta redundante/innecesario
 * y hasta riesgoso que el personal registre la ciudad de origen" (la PC ya está en su sede).
 *
 * Por eso esta pantalla:
 *  - Detecta la estación (aeropuerto de origen) a partir del HUSO HORARIO de la PC — la pauta
 *    obliga a que cada alumno configure su PC en el huso de su ciudad (Lima/Buenos Aires/
 *    Copenhague/Delhi), así que la detección "simplemente funciona".
 *  - Permite corregirla una sola vez (override) por si el huso de la PC no coincide exacto,
 *    o forzarla por URL (?estacion=SPIM). Una vez fijada, el origen NO se pide en cada registro.
 *  - Muestra el reloj en la hora local de la estación.
 *  - Solo pide destino, cantidad y cliente. Se une a la operación día a día activa.
 */

/** Estaciones de la prueba: aeropuerto ↔ huso IANA ↔ ciudad. */
const STATIONS: Record<string, { city: string; timeZone: string; ianaAliases: string[] }> = {
  SPIM: { city: 'Lima (Perú)', timeZone: 'America/Lima', ianaAliases: ['America/Lima'] },
  SABE: { city: 'Buenos Aires (Argentina)', timeZone: 'America/Argentina/Buenos_Aires', ianaAliases: ['America/Argentina/Buenos_Aires', 'America/Buenos_Aires', 'America/Cordoba'] },
  EKCH: { city: 'Copenhague (Dinamarca)', timeZone: 'Europe/Copenhagen', ianaAliases: ['Europe/Copenhagen'] },
  VIDP: { city: 'Delhi (India)', timeZone: 'Asia/Kolkata', ianaAliases: ['Asia/Kolkata', 'Asia/Calcutta'] },
};

const DEFAULT_CLIENT = '0007729'; // cliente único de la prueba (dato no relevante, según pauta)

/** Detecta la estación a partir del huso horario del navegador. Devuelve null si no coincide. */
function detectStationFromTimeZone(): string | null {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return null;
  }
  for (const [code, cfg] of Object.entries(STATIONS)) {
    if (cfg.ianaAliases.includes(tz)) return code;
  }
  return null;
}

/** Lee ?estacion=XXXX de la URL (override manual explícito). */
function stationFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('estacion');
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return STATIONS[code] ? code : null;
}

interface RegisteredEntry {
  batchId: string;
  destinationId: string;
  quantity: number;
  clientId: string;
  localTime: string;
}

export function StationScreen() {
  // Prioridad: URL (?estacion) > detección por huso > null (obliga a elegir).
  const [station, setStation] = useState<string | null>(() => stationFromUrl() ?? detectStationFromTimeZone());
  const [detectedFromTz] = useState<string | null>(() => detectStationFromTimeZone());
  const [forcedByUrl] = useState<boolean>(() => stationFromUrl() !== null);

  const [airports, setAirports] = useState<BackendAirport[]>([]);
  const [activeSim, setActiveSim] = useState<BackendActiveSimulation | null>(null);
  const [checkingSim, setCheckingSim] = useState(true);

  const [destination, setDestination] = useState('');
  const [quantity, setQuantity] = useState('');
  const [clientId, setClientId] = useState(DEFAULT_CLIENT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState<RegisteredEntry[]>([]);

  const [nowTick, setNowTick] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cargar aeropuertos (para el desplegable de destino).
  useEffect(() => {
    fetchAirports()
      .then(setAirports)
      .catch(err => console.warn('No se pudieron cargar aeropuertos:', err));
  }, []);

  // Detectar la operación día a día activa (para unirse). Reintenta cada 5 s si no hay.
  const refreshActiveSim = useCallback(async () => {
    setCheckingSim(true);
    try {
      const active = await getActiveSimulation();
      setActiveSim(active && active.scenario === 'DAY_TO_DAY' && active.status === 'RUNNING' ? active : null);
    } catch {
      setActiveSim(null);
    } finally {
      setCheckingSim(false);
    }
  }, []);

  useEffect(() => {
    void refreshActiveSim();
    const t = setInterval(() => { void refreshActiveSim(); }, 5000);
    return () => clearInterval(t);
  }, [refreshActiveSim]);

  const stationCfg = station ? STATIONS[station] : null;

  // Reloj en la hora local de la estación.
  const localClock = useMemo(() => {
    if (!stationCfg) return { date: '', time: '' };
    const fmtDate = new Intl.DateTimeFormat('es-PE', {
      timeZone: stationCfg.timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const fmtTime = new Intl.DateTimeFormat('es-PE', {
      timeZone: stationCfg.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    return { date: fmtDate.format(nowTick), time: fmtTime.format(nowTick) };
  }, [stationCfg, nowTick]);

  const destinationOptions = useMemo(
    () => airports.filter(a => a.id !== station).sort((a, b) => a.id.localeCompare(b.id)),
    [airports, station]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!station) return setError('Selecciona tu estación primero');
    if (!activeSim) return setError('No hay una operación día a día activa. Espera a que inicie.');
    if (!destination) return setError('Selecciona el destino');
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) return setError('Ingresa una cantidad válida de maletas');
    if (qty > 400) return setError('Máximo 400 maletas por envío');

    setSubmitting(true);
    try {
      const res = await createShipment(activeSim.simulationId, {
        clientId: clientId.trim() || DEFAULT_CLIENT,
        originId: station,
        destinationId: destination,
        quantity: qty,
      });
      const localTime = stationCfg
        ? new Intl.DateTimeFormat('es-PE', { timeZone: stationCfg.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
        : '';
      setRegistered(prev => [
        { batchId: res.batchId, destinationId: res.destinationId, quantity: res.quantity, clientId: res.clientId, localTime },
        ...prev,
      ].slice(0, 50));
      setDestination('');
      setQuantity('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Selección de estación (cuando no se detectó, o al corregir el override) ──
  if (!station) {
    return (
      <div className="min-h-screen bg-[#070C18] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#0D1526] border border-[#1E3058] rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/30 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-[#4DA6FF]" />
            </div>
            <div>
              <div className="text-white text-base" style={{ fontWeight: 700 }}>Estación de registro</div>
              <div className="text-[#4A6080] text-xs">Selecciona tu sede de trabajo</div>
            </div>
          </div>
          <p className="text-[12px] text-[#7088A8] mb-4 leading-relaxed">
            No se pudo detectar tu estación desde el huso horario de esta PC. Selecciona la ciudad
            que te corresponde (debe coincidir con la hora configurada en tu computadora).
          </p>
          <div className="flex flex-col gap-2">
            {Object.entries(STATIONS).map(([code, cfg]) => (
              <button
                key={code}
                onClick={() => setStation(code)}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0A1628] border border-[#1E3058] text-left hover:border-[#4DA6FF]/50 transition-colors"
              >
                <div>
                  <div className="text-[#C8D8F0] text-sm" style={{ fontWeight: 600 }}>{code}</div>
                  <div className="text-[#6080A0] text-[11px]">{cfg.city}</div>
                </div>
                <div className="text-[#4A6080] text-[10px]">{cfg.timeZone}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070C18] flex items-start justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg flex flex-col gap-4">
        {/* Encabezado: estación fija + reloj local */}
        <div className="bg-[#0D1526] border border-[#1E3058] rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/30 flex items-center justify-center">
                <Plane className="w-5 h-5 text-[#00FF9C]" />
              </div>
              <div>
                <div className="text-white text-lg" style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
                  Estación {station}
                </div>
                <div className="text-[#6080A0] text-xs">{stationCfg?.city}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end text-[#4DA6FF]">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-lg tabular-nums" style={{ fontWeight: 700 }}>{localClock.time}</span>
              </div>
              <div className="text-[#4A6080] text-[11px]">{localClock.date} · hora local</div>
            </div>
          </div>

          {/* Aviso de detección + override */}
          <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-[#6080A0]">
              {forcedByUrl
                ? 'Estación fijada por URL (?estacion).'
                : detectedFromTz === station
                ? 'Estación detectada por el huso horario de esta PC.'
                : 'Estación seleccionada manualmente.'}
            </span>
            <button
              onClick={() => setStation(null)}
              className="flex items-center gap-1 text-[#4DA6FF] hover:text-[#7AC0FF] transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Cambiar
            </button>
          </div>
        </div>

        {/* Estado de la operación activa */}
        <div className={`rounded-xl px-4 py-2.5 border text-[12px] flex items-center gap-2 ${
          activeSim
            ? 'bg-[#00FF9C]/8 border-[#00FF9C]/25 text-[#00FF9C]'
            : 'bg-[#FFC857]/8 border-[#FFC857]/25 text-[#FFC857]'
        }`}>
          {checkingSim
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando operación día a día activa…</>
            : activeSim
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Conectado a la operación día a día en curso.</>
            : <><AlertCircle className="w-3.5 h-3.5" /> No hay operación activa. Espera a que el equipo la inicie.</>}
        </div>

        {/* Formulario de registro: SOLO destino, cantidad, cliente (origen fijo = la estación) */}
        <form onSubmit={handleSubmit} className="bg-[#0D1526] border border-[#1E3058] rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[#C8D8F0]" style={{ fontWeight: 700 }}>
            <PackagePlus className="w-4 h-4 text-[#4DA6FF]" /> Registrar recepción de maletas
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>DESTINO</label>
            <select
              value={destination}
              onChange={e => { setDestination(e.target.value); setError(''); }}
              disabled={submitting || !activeSim}
              className="w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 disabled:opacity-50"
            >
              <option value="">Seleccionar destino…</option>
              {destinationOptions.map(a => (
                <option key={a.id} value={a.id}>{a.id} — {a.city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              CANTIDAD DE MALETAS <span className="text-[#2A4060]">(máx. 400)</span>
            </label>
            <input
              type="number" min={1} max={400}
              value={quantity}
              onChange={e => { setQuantity(e.target.value); setError(''); }}
              disabled={submitting || !activeSim}
              placeholder="Ej. 180"
              className="w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              CLIENTE <span className="text-[#2A4060]">(aerolínea)</span>
            </label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              disabled={submitting || !activeSim}
              className="w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 disabled:opacity-50"
              maxLength={16}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30">
              <AlertCircle className="w-3.5 h-3.5 text-[#FF4D4D] flex-shrink-0" />
              <span className="text-[11px] text-[#FF4D4D]">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !activeSim}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C] text-sm hover:bg-[#00FF9C]/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontWeight: 700 }}
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando…</> : <><PackagePlus className="w-4 h-4" /> Registrar envío</>}
          </button>
        </form>

        {/* Últimos registros de ESTA estación */}
        {registered.length > 0 && (
          <div className="bg-[#0D1526] border border-[#1E3058] rounded-2xl p-5 shadow-2xl">
            <div className="text-[#6080A0] text-[11px] mb-3" style={{ letterSpacing: '0.1em' }}>
              REGISTRADOS EN ESTA SESIÓN ({registered.length})
            </div>
            <div className="flex flex-col gap-1.5 max-h-72 overflow-auto">
              {registered.map(r => (
                <div key={r.batchId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0A1628] border border-[#1E3058]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#C8D8F0] text-[13px]" style={{ fontWeight: 600 }}>{station} → {r.destinationId}</span>
                    <span className="text-[#4A6080] text-[11px]">· {r.clientId}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#00FF9C] text-[12px] tabular-nums" style={{ fontWeight: 600 }}>{r.quantity} maletas</span>
                    <span className="text-[#4A6080] text-[10px] tabular-nums">{r.localTime}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
