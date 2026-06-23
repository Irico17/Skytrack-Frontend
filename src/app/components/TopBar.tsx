import React from 'react';
import {
  Activity, AlertTriangle, Bell, Layers, Play, Pause,
  RotateCcw, Globe, Wifi, Clock, Zap, ChevronDown
} from 'lucide-react';
import { SimulationMode, SimEvent } from '../data/mockData';

interface TopBarProps {
  isRunning: boolean;
  isPaused: boolean;
  isStarting?: boolean;
  mode: SimulationMode;
  simulationTime: Date;
  events: SimEvent[];
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onModeChange: (mode: SimulationMode) => void;
  totalShipments: number;
  criticalCount: number;
  viewerCount?: number;
  startDisabled?: boolean;
  /** KPIs reales del último ciclo, siempre visibles arriba (null antes del primer ciclo). */
  kpis?: { inFlight: number | string; delivered: number | string; slaPct: number | string; overloaded: number | string } | null;
}

const MODE_LABELS: Record<SimulationMode, string> = {
  realtime: 'Operación Día a Día',
  '5day': 'Simulación 5 Días',
  collapse: 'Escenario de Colapso',
};

const MODE_ICONS: Record<SimulationMode, React.ReactNode> = {
  realtime: <Activity className="w-3 h-3" />,
  '5day': <Layers className="w-3 h-3" />,
  collapse: <Zap className="w-3 h-3" />,
};

export function TopBar({
  isRunning, isPaused, isStarting = false, mode, simulationTime, events, onStart, onPause, onResume, onReset,
  onModeChange, totalShipments, criticalCount, viewerCount = 0,
  startDisabled = false, kpis = null,
}: TopBarProps) {
  const [showModeDropdown, setShowModeDropdown] = React.useState(false);
  const [showAlerts, setShowAlerts] = React.useState(false);
  const criticalEvents = events.filter(e => e.severity === 'critical').length;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-ES', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });
  };

  return (
    <div className="h-14 bg-[#0A1628] border-b border-[#1E3058] flex items-center px-4 gap-4 z-50 relative">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-8 h-8 rounded-lg bg-[#4DA6FF]/20 border border-[#4DA6FF]/40 flex items-center justify-center">
          <Globe className="w-4 h-4 text-[#4DA6FF]" />
        </div>
        <div>
          <div className="text-white text-sm" style={{ fontWeight: 700, letterSpacing: '0.05em' }}>SKYTRACK</div>
          <div className="text-[#4DA6FF] text-[9px]" style={{ letterSpacing: '0.15em' }}>LOGISTICS CONTROL</div>
        </div>
      </div>

      <div className="w-px h-8 bg-[#1E3058]" />

      {/* Simulation Mode Selector */}
      <div className="relative">
        <button
          onClick={() => setShowModeDropdown(!showModeDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D1E38] border border-[#1E3058] hover:border-[#4DA6FF]/50 transition-colors text-xs text-[#A8C0E0]"
        >
          {MODE_ICONS[mode]}
          <span>{MODE_LABELS[mode]}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {showModeDropdown && (
          <div className="absolute top-full mt-1 left-0 bg-[#0D1E38] border border-[#1E3058] rounded-lg overflow-hidden z-50 min-w-[180px]">
            {(Object.keys(MODE_LABELS) as SimulationMode[]).map(m => (
              <button
                key={m}
                onClick={() => { onModeChange(m); setShowModeDropdown(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-[#1A2E4A] transition-colors text-left
                  ${mode === m ? 'text-[#4DA6FF] bg-[#1A2E4A]' : 'text-[#A8C0E0]'}`}
              >
                {MODE_ICONS[m]}
                <span>{MODE_LABELS[m]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Simulation Controls */}
      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            onClick={onPause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFC857]/15 border border-[#FFC857]/40 text-[#FFC857] text-xs hover:bg-[#FFC857]/25 transition-colors"
          >
            <Pause className="w-3 h-3 fill-current" />
            <span>Pausar</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={onResume}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C] text-xs hover:bg-[#00FF9C]/25 transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Reanudar</span>
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={startDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C] text-xs hover:bg-[#00FF9C]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Iniciar</span>
          </button>
        )}

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A2E4A] border border-[#1E3058] text-[#A8C0E0] text-xs hover:border-[#4DA6FF]/40 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reiniciar</span>
        </button>
      </div>

      <div className="w-px h-8 bg-[#1E3058]" />

      {/* Status indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isStarting ? 'bg-[#4DA6FF] animate-pulse' : isRunning ? 'bg-[#00FF9C] animate-pulse' : isPaused ? 'bg-[#FFC857]' : 'bg-[#4A5568]'}`} />
          <span className={`text-xs ${isStarting ? 'text-[#4DA6FF]' : isRunning ? 'text-[#00FF9C]' : isPaused ? 'text-[#FFC857]' : 'text-[#4A5568]'}`}>
            {isStarting ? 'INICIANDO…' : isRunning ? 'EN VIVO' : isPaused ? 'PAUSADO' : 'DETENIDO'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Wifi className="w-3 h-3 text-[#00FF9C]" />
          <span className="text-[#A8C0E0]">{totalShipments} Envíos</span>
        </div>

        {/* KPIs principales siempre visibles (del último ciclo del backend). */}
        {kpis && (
          <div className="flex items-center gap-3 px-2.5 py-1 rounded-lg bg-[#0D1E38] border border-[#1E3058]">
            <span className="text-[11px] text-[#4DA6FF]" title="Maletas en vuelo">✈ {kpis.inFlight}</span>
            <span className="text-[11px] text-[#00FF9C]" title="Maletas entregadas">✓ {kpis.delivered}</span>
            <span className={`text-[11px] ${Number(kpis.slaPct) >= 85 ? 'text-[#00FF9C]' : Number(kpis.slaPct) >= 70 ? 'text-[#FFC857]' : 'text-[#FF4D4D]'}`} title="Cumplimiento SLA">SLA {kpis.slaPct}%</span>
            <span className={`text-[11px] ${Number(kpis.overloaded) > 0 ? 'text-[#FF4D4D]' : 'text-[#4A6080]'}`} title="Aeropuertos sobre capacidad">⚠ {kpis.overloaded}</span>
          </div>
        )}

        {criticalCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#FF4D4D]/15 border border-[#FF4D4D]/30">
            <AlertTriangle className="w-3 h-3 text-[#FF4D4D]" />
            <span className="text-xs text-[#FF4D4D]">{criticalCount} Crítico</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {viewerCount > 0 && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0D1E38] border border-[#1E3058]"
          title="Visualizadores conectados a esta simulación"
        >
          <Wifi className="w-3 h-3 text-[#4DA6FF]" />
          <span className="text-[10px] text-[#A8C0E0]">{viewerCount} visualizador{viewerCount === 1 ? '' : 'es'}</span>
        </div>
      )}

      {/* Alert bell */}
      <div className="relative">
        <button
          onClick={() => setShowAlerts(!showAlerts)}
          className="relative w-8 h-8 rounded-lg bg-[#0D1E38] border border-[#1E3058] flex items-center justify-center hover:border-[#FFC857]/50 transition-colors"
        >
          <Bell className="w-4 h-4 text-[#A8C0E0]" />
          {criticalEvents > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF4D4D] text-white text-[9px] flex items-center justify-center">
              {Math.min(criticalEvents, 9)}
            </span>
          )}
        </button>

        {showAlerts && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-[#0D1E38] border border-[#1E3058] rounded-xl overflow-hidden z-50 shadow-2xl">
            <div className="px-4 py-2.5 border-b border-[#1E3058] flex items-center justify-between">
              <span className="text-xs text-white" style={{ fontWeight: 600 }}>Alertas del Sistema</span>
              <span className="text-[10px] text-[#A8C0E0]">{events.length} eventos</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {events.slice(0, 8).map(event => (
                <div key={event.id} className="px-4 py-2.5 border-b border-[#1E3058]/50 hover:bg-[#1A2E4A]/50">
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0
                      ${event.severity === 'critical' ? 'bg-[#FF4D4D]' :
                        event.severity === 'warning' ? 'bg-[#FFC857]' : 'bg-[#4DA6FF]'}`} />
                    <div>
                      <p className="text-[11px] text-[#C8D8F0] leading-relaxed">{event.message}</p>
                      <p className="text-[10px] text-[#4A6080] mt-0.5">
                        {event.time.toLocaleTimeString('es-ES', { hour12: false })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1E38] border border-[#1E3058]">
        <div className="w-6 h-6 rounded-full bg-[#4DA6FF]/20 flex items-center justify-center">
          <span className="text-[10px] text-[#4DA6FF]" style={{ fontWeight: 700 }}>OC</span>
        </div>
        <span className="text-xs text-[#A8C0E0]">Centro de Operaciones</span>
      </div>
    </div>
  );
}
