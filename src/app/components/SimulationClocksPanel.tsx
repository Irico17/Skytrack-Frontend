import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import {
  formatElapsedDhms,
  formatRealDateTime,
  formatSimClockDate,
  formatSimClockTime,
  formatSimDateTimeDisplay,
  getSimulationEndDate,
} from '../utils/simulationTime';

export interface SimulationClocksPanelProps {
  simClock: Date;
  simClockRef?: { current: Date };
  realStartedAt: Date | null;
  startDate: Date;
  daysElapsed: number;
  simulationK: number;
  isRunning: boolean;
  mode: string;
  onCollapsedChange?: (collapsed: boolean) => void;
}

/**
 * Overlay flotante de relojes. Sus ticks viven dentro del componente para no volver a
 * renderizar App, mapa y paneles únicamente por actualizar texto de reloj.
 */
export function SimulationClocksPanel({
  simClock,
  simClockRef,
  realStartedAt,
  startDate,
  daysElapsed,
  simulationK,
  isRunning,
  mode,
  onCollapsedChange,
}: SimulationClocksPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [renderedSimClock, setRenderedSimClock] = useState(simClock);
  const [realClock, setRealClock] = useState(() => new Date());
  const fallbackSimClockRef = React.useRef(simClock);
  fallbackSimClockRef.current = simClock;

  React.useEffect(() => {
    const timer = window.setInterval(() => setRealClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!isRunning) {
      setRenderedSimClock(simClock);
    }
  }, [isRunning, simClock]);

  React.useEffect(() => {
    if (!isRunning) return;
    let frameId = 0;
    let lastCommit = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastCommit >= 140) {
        setRenderedSimClock(new Date((simClockRef?.current ?? fallbackSimClockRef.current).getTime()));
        lastCommit = timestamp;
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isRunning, simClockRef]);

  const simDate = formatSimClockDate(renderedSimClock);
  const simTime = formatSimClockTime(renderedSimClock);
  const simEndDate = getSimulationEndDate(mode, startDate);
  const simElapsedMs = Math.max(0, daysElapsed * 24 * 60 * 60 * 1000);
  const realElapsedMs = realStartedAt
    ? Math.max(0, realClock.getTime() - realStartedAt.getTime())
    : 0;

  const toggleCollapsed = () => {
    setCollapsed(v => {
      const next = !v;
      onCollapsedChange?.(next);
      return next;
    });
  };

  return (
    <div
      className="absolute top-3 left-3 z-30 pointer-events-auto"
      style={{ maxWidth: 280 }}
    >
      <div
        className="rounded-xl border border-[#1E3058]/90 overflow-hidden"
        style={{
          background: 'rgba(10, 22, 40, 0.94)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        }}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-[#1A2E4A]/40 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-3.5 h-3.5 text-[#4DA6FF] flex-shrink-0" />
            {collapsed ? (
              <span className="font-mono text-[11px] text-[#E2E8F8] truncate" style={{ fontWeight: 700, letterSpacing: '0.03em' }}>
                {simDate}{' '}
                <span className="text-[#4DA6FF]">{simTime}</span>
              </span>
            ) : (
              <span className="text-[10px] text-[#A8C0E0] truncate" style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
                RELOJES
              </span>
            )}
            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#4DA6FF] flex-shrink-0" style={{ boxShadow: '0 0 6px #4DA6FF' }} />
            )}
          </div>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-[#4A6080]" /> : <ChevronUp className="w-3.5 h-3.5 text-[#4A6080]" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 flex flex-col gap-2.5 border-t border-[#1E3058]/70">
            {/* Tiempo simulado */}
            <div className="pt-2.5">
              <div className="text-[9px] text-[#4A6080] mb-0.5" style={{ letterSpacing: '0.12em' }}>
                TIEMPO SIMULADO · K={simulationK}×
              </div>
              <div className="font-mono text-[15px] text-[#E2E8F8]" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
                {simDate}{' '}
                <span className="text-[#4DA6FF]">{simTime}</span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                <div className="font-mono text-[10px] text-white" style={{ letterSpacing: '0.02em' }}>
                  Inicio simulación: {formatSimDateTimeDisplay(startDate)}
                </div>
                {simEndDate && (
                  <div className="font-mono text-[10px] text-white" style={{ letterSpacing: '0.02em' }}>
                    Término simulación: {formatSimDateTimeDisplay(simEndDate)}
                  </div>
                )}
              </div>
              {mode === '5day' && daysElapsed > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[9px] text-[#4A6080]">Día {Math.min(Math.floor(daysElapsed) + 1, 5)}/5</span>
                  <div className="flex-1 h-1 rounded bg-[#1E3058] overflow-hidden">
                    <div
                      className="h-full rounded bg-[#4DA6FF] transition-[width] duration-300"
                      style={{ width: `${Math.min(100, (daysElapsed / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {mode === 'collapse' && daysElapsed > 0 && (
                <div className="mt-1 text-[9px] text-[#4A6080]">
                  Día {Math.floor(daysElapsed) + 1} · sin límite
                </div>
              )}
            </div>

            {/* Hora real actual — jerarquía dominante */}
            <div className="rounded-lg border border-[#1E3058] bg-[#0A1628]/80 px-2.5 py-2">
              <div className="text-[9px] text-[#4A6080] mb-0.5" style={{ letterSpacing: '0.12em' }}>
                HORA REAL
              </div>
              <div className="font-mono text-[16px] text-[#E2E8F8]" style={{ fontWeight: 700, letterSpacing: '0.03em' }}>
                {formatRealDateTime(realClock)}
              </div>
            </div>

            {/* Inicio real */}
            <div>
              <div className="text-[9px] text-[#4A6080] mb-0.5" style={{ letterSpacing: '0.12em' }}>
                INICIO REAL
              </div>
              <div className="font-mono text-[12px] text-white" style={{ fontWeight: 700, letterSpacing: '0.03em' }}>
                {realStartedAt ? formatRealDateTime(realStartedAt) : '—'}
              </div>
            </div>

            {/* Elapsed pair */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#1E3058]/80 px-2 py-1.5">
                <div className="text-[8px] text-[#4A6080] mb-0.5" style={{ letterSpacing: '0.1em' }}>
                  TRANS. SIM
                </div>
                <div className="font-mono text-[17px] text-[#E2E8F8]" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
                  {formatElapsedDhms(simElapsedMs)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1E3058]/80 px-2 py-1.5">
                <div className="text-[8px] text-[#4A6080] mb-0.5" style={{ letterSpacing: '0.1em' }}>
                  TRANS. REAL
                </div>
                <div className="font-mono text-[17px] text-[#E2E8F8]" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
                  {realStartedAt ? formatElapsedDhms(realElapsedMs) : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
