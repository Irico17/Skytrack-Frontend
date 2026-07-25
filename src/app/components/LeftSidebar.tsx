import React from 'react';
import {
  Filter, Route, Warehouse,
  PlusCircle, Search, X, ChevronDown, ChevronUp,
  Plane, BarChart2, Calendar, Database,
  Zap, Activity,
} from 'lucide-react';
import { SimulationMode, Airport } from '../data/mockData';

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface Filters {
  origin: string;
  destination: string;
}

interface Toggles {
  showRoutes: boolean;
  showWarehouseCapacity: boolean;
  showCongestion: boolean;
}

interface LeftSidebarProps {
  mode: SimulationMode;
  startDate: Date;
  simulationTime: Date;
  simulationK?: number;
  filters: Filters;
  toggles: Toggles;
  isRunning: boolean;
  isStarting?: boolean;
  isPaused?: boolean;
  currentCycle?: number | null;
  storageOccupancyPct?: number | null;
  daysElapsed: number;
  simulationComplete: boolean;
  collapseComplete: boolean;
  airports?: Airport[];
  onStartDateChange: (date: Date) => void;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onClearFilters: () => void;
  onToggleChange: (key: keyof Toggles) => void;
  onResetView: () => void;
  onAddShipment: () => void;
  onUploadShipmentsFile?: () => void;
  onCancelFlight: () => void;
  onUploadStaticData: () => void;
  onCloseOperations: () => void;
  onViewResults: () => void;
  onViewCollapseResults: () => void;
  onViewDayToDayResults: () => void;
  dayToDayComplete: boolean;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-[#1E3058]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1A2E4A]/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-[#A8C0E0] text-xs" style={{ fontWeight: 600, letterSpacing: '0.08em' }}>
          {icon}
          <span>{title}</span>
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-[#4A6080]" /> : <ChevronDown className="w-3 h-3 text-[#4A6080]" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${checked ? 'bg-[#4DA6FF]' : 'bg-[#1E3058]'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const fieldId = React.useId();
  return (
    <div className="mb-3">
      <label htmlFor={fieldId} className="block text-[10px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>{label}</label>
      <div className="relative">
        <select
          id={fieldId}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-[#0D1E38] border border-[#1E3058] rounded-lg px-3 py-2 text-xs text-[#C8D8F0] appearance-none focus:outline-none focus:border-[#4DA6FF]/60 cursor-pointer"
          style={{ backgroundImage: 'none' }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value} className="bg-[#0D1E38]">{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4A6080] pointer-events-none" />
      </div>
    </div>
  );
}

export function LeftSidebar({
  mode, startDate, simulationTime, simulationK = 120, filters, toggles, isRunning,
  isStarting = false, isPaused = false, currentCycle = null, storageOccupancyPct = null,
  daysElapsed, simulationComplete, collapseComplete, airports = [],
  onStartDateChange, onFilterChange, onClearFilters, onToggleChange, onResetView,
  onAddShipment, onUploadShipmentsFile, onCancelFlight, onUploadStaticData, onCloseOperations,
  onViewResults, onViewCollapseResults, onViewDayToDayResults, dayToDayComplete,
}: LeftSidebarProps) {

  const cityOptions = React.useMemo(() => [
      { value: '', label: 'Todas las Ciudades' },
      ...airports
        .map(a => ({ value: a.id, label: `${a.city} (${a.id})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [airports],
  );

  const dayLabels = React.useMemo(() => Array.from({ length: 5 }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]}`;
    }),
    [startDate],
  );
  const currentDay = Math.min(Math.max(1, Math.floor(daysElapsed) + 1), 5);
  const displayedK = mode === 'realtime' ? 1 : simulationK;
  const airportStatusCounts = React.useMemo(
    () => airports.reduce(
      (counts, airport) => {
        counts[airport.status] += 1;
        return counts;
      },
      { normal: 0, warning: 0, critical: 0 },
    ),
    [airports],
  );
  const simulationActive = isRunning || isPaused;
  const isComplete = simulationComplete || collapseComplete || dayToDayComplete;
  const liveStatus = isStarting ? 'PREPARANDO'
    : isRunning ? 'EN CURSO'
    : isPaused ? 'PAUSADA'
    : isComplete ? 'FINALIZADA'
    : 'DETENIDA';
  const liveStatusColor = isStarting || isRunning ? '#4DA6FF'
    : isPaused ? '#FFC857'
    : isComplete ? '#00FF9C'
    : '#4A6080';

  const formatInputDateTime = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const formatDateDisplay = (date: Date): string => {
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="w-64 bg-[#080F1E] border-r border-[#1E3058] flex flex-col h-full overflow-y-auto">
      {/* Acciones operativas (no duplicadas en la barra superior) */}
      <div className="p-4 border-b border-[#1E3058]">
        <button
          onClick={onAddShipment}
          disabled={mode !== 'realtime' || !isRunning}
          title={mode !== 'realtime' ? 'El registro manual de maletas solo aplica a la operación día a día' : isPaused ? 'La operación está pausada' : !isRunning ? 'Inicia la operación para registrar maletas' : undefined}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-xs hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <PlusCircle className="w-4 h-4" />
          Registrar Maletas
        </button>
        {onUploadShipmentsFile && (
          <button
            onClick={onUploadShipmentsFile}
            disabled={mode !== 'realtime' || !isRunning}
            title={mode !== 'realtime' ? 'Solo aplica a la operación día a día' : isPaused ? 'La operación está pausada' : !isRunning ? 'Inicia la operación para cargar el archivo' : undefined}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-xs hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
          >
            <PlusCircle className="w-4 h-4" />
            Cargar Archivo de Envíos
          </button>
        )}
        <button
          onClick={onCancelFlight}
          disabled={!isRunning}
          title={isPaused ? 'La simulación está pausada' : !isRunning ? 'Inicia una simulación activa para cancelar vuelos' : undefined}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F97316]/15 border border-[#F97316]/45 text-[#F97316] text-xs hover:bg-[#F97316]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <Plane className="w-4 h-4" />
          Cancelar Vuelo
        </button>
        <button
          onClick={onUploadStaticData}
          disabled={simulationActive}
          title={simulationActive ? 'Detén la simulación antes de reemplazar los datos base' : undefined}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-xs hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <Database className="w-4 h-4" />
          Cargar Datos
        </button>
        {mode === 'realtime' && isRunning && (
          <button
            onClick={onCloseOperations}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FFC857]/15 border border-[#FFC857]/40 text-[#FFC857] text-xs hover:bg-[#FFC857]/25 transition-colors"
            style={{ fontWeight: 600 }}
            title="Detiene la operación y genera el reporte de la última planificación estable"
          >
            <BarChart2 className="w-4 h-4" />
            Cerrar y Ver Reporte
          </button>
        )}
        {mode === 'realtime' && dayToDayComplete && !isRunning && (
          <button
            onClick={onViewDayToDayResults}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/50 text-[#00FF9C] text-xs hover:bg-[#00FF9C]/25 transition-colors animate-pulse"
            style={{ fontWeight: 600 }}
          >
            <BarChart2 className="w-4 h-4" />
            Ver Reporte del Día
          </button>
        )}
      </div>

      {/* Date/time selector */}
      <Section title="FECHA Y HORA DE INICIO (LOCAL)" icon={<Calendar className="w-3 h-3" />}>
        <div className="flex flex-col gap-2" style={{ colorScheme: 'dark' }}>
          <div className="relative">
            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4A6080] pointer-events-none z-10" />
            <input
              type="datetime-local"
              value={formatInputDateTime(startDate)}
              onChange={e => {
                if (e.target.value) onStartDateChange(new Date(e.target.value));
              }}
              disabled={simulationActive}
              className="datetime-local-dark w-full bg-[#0D1E38] border border-[#1E3058] rounded-lg pl-7 pr-2 py-2 text-[11px] text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 focus:ring-1 focus:ring-[#4DA6FF]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#0A1628] disabled:border-[#1A2848] disabled:text-[#6A80A0]"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif', colorScheme: 'dark' }}
            />
          </div>
          <div className="text-[9px] text-[#4A6080]">
            {formatDateDisplay(startDate)} → {mode === 'collapse'
              ? 'Sin límite'
              : formatDateDisplay(new Date(startDate.getTime() + (mode === 'realtime' ? 1 : 5) * 24 * 60 * 60 * 1000))}
          </div>
          <div className="text-[9px] text-[#3A5070]">
            Zona del navegador: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </div>
        </div>
      </Section>

      <Section title="ESTADO EN TIEMPO REAL" icon={<Activity className="w-3 h-3" />}>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4A6080]">Motor</span>
            <span className="text-[10px]" style={{ color: liveStatusColor, fontWeight: 700 }}>
              {liveStatus}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4A6080]">Tiempo simulado</span>
            <span className="text-[10px] font-mono text-[#C8D8F0]">
              {formatDateDisplay(simulationTime)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4A6080]">Aceleración</span>
            <span className="text-[10px] font-mono text-[#4DA6FF]">K={displayedK}×</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4A6080]">Último estado</span>
            <span className="text-[10px] font-mono text-[#C8D8F0]">
              {currentCycle == null ? 'Esperando ciclo' : `Ciclo ${currentCycle}`}
            </span>
          </div>
          {storageOccupancyPct != null && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#4A6080]">Ocupación global</span>
              <span className="text-[10px] font-mono text-[#C8D8F0]">{storageOccupancyPct}%</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {[
              { label: 'Normal', value: currentCycle == null ? '—' : airportStatusCounts.normal, color: '#00FF9C' },
              { label: 'Alerta', value: currentCycle == null ? '—' : airportStatusCounts.warning, color: '#FFC857' },
              { label: 'Crítico', value: currentCycle == null ? '—' : airportStatusCounts.critical, color: '#FF4D4D' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-[#1E3058] bg-[#0D1E38] px-1.5 py-2 text-center">
                <div className="text-sm font-mono" style={{ color: item.color, fontWeight: 700 }}>
                  {item.value}
                </div>
                <div className="text-[8px] text-[#4A6080]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 5-Day Progress — only visible in 5day mode */}
      {mode === '5day' && (
        <Section title="PROGRESO 5 DÍAS" icon={<BarChart2 className="w-3 h-3" />}>
          <div className="flex flex-col gap-3">
            {/* Day progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-[#4A6080]">Progreso de Simulación</span>
                <span className="text-[10px] text-[#4DA6FF]" style={{ fontWeight: 600 }}>
                  {simulationComplete ? 'Completo' : isStarting ? 'Preparando' : !isRunning && daysElapsed === 0 ? 'Sin iniciar' : `Día ${currentDay}/5`}
                </span>
              </div>
              <div className="h-2 bg-[#1E3058] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${simulationComplete ? 100 : Math.min(100, Math.max(0, (daysElapsed / 5) * 100))}%`,
                    backgroundColor: simulationComplete ? '#00FF9C' : '#4DA6FF',
                  }}
                />
              </div>
            </div>

            {/* Day markers */}
            <div className="flex justify-between">
              {dayLabels.map((label, i) => {
                const dayNum = i + 1;
                const isComplete = simulationComplete || daysElapsed >= dayNum;
                const isCurrent = !simulationComplete && !isStarting && isRunning && currentDay === dayNum;
                return (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                      style={{
                        backgroundColor: isComplete ? '#00FF9C' : isCurrent ? '#4DA6FF' : '#1E3058',
                        color: isComplete || isCurrent ? '#060D1F' : '#4A6080',
                        fontWeight: 700,
                        border: isCurrent ? '2px solid #4DA6FF' : 'none',
                        boxShadow: isCurrent ? '0 0 8px #4DA6FF60' : 'none',
                      }}
                    >
                      {isComplete ? '✓' : dayNum}
                    </div>
                    <span className="text-[8px] text-[#4A6080]">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* View results button — when complete */}
            {simulationComplete && (
              <button
                onClick={onViewResults}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/50 text-[#00FF9C] text-xs hover:bg-[#00FF9C]/25 transition-colors animate-pulse"
                style={{ fontWeight: 600 }}
              >
                <BarChart2 className="w-4 h-4" />
                Ver Resultados de la Simulación
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Colapso — misma visualización que 5 días (contador de días transcurridos), pero
          SIN el tope "/5": el colapso no tiene fin fijo, dura hasta que el backend detecte
          saturación real. La única diferencia real entre ambos modos es esa: uno se
          detiene a los 5 días, el otro sigue hasta colapsar. */}
      {mode === 'collapse' && (
        <Section title="ESCENARIO DE COLAPSO" icon={<Zap className="w-3 h-3" />}>
          <div className="flex flex-col gap-3">
            {!collapseComplete ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[#4A6080]">Progreso de Simulación</span>
                    <span className="text-[10px] text-[#FF4D4D]" style={{ fontWeight: 600 }}>
                      {isStarting ? 'Preparando' : daysElapsed > 0 ? `Día ${Math.floor(daysElapsed) + 1} (sin límite)` : 'Sin iniciar'}
                    </span>
                  </div>
                  {/* Barra "viva": sin tope fijo, se anima mientras corre para reflejar que
                      no hay un total conocido de antemano (a diferencia de la de 5 días). */}
                  <div className="h-2 bg-[#1E3058] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-[#FF4D4D] ${isRunning ? 'animate-pulse' : ''}`}
                      style={{ width: isRunning ? '100%' : '0%', opacity: isRunning ? 0.55 : 0, transition: 'opacity 0.3s' }}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[#FF4D4D]/30 bg-[#FF4D4D]/8 px-3 py-2.5 text-[11px] text-[#FF9090] leading-relaxed">
                  {isRunning
                    ? `Acelerando la operación (K=${displayedK}×) hasta que el backend detecte saturación logística. El colapso se declara con datos reales.`
                    : 'Inicia la simulación para acelerar la red hasta el colapso. Usa Cancelar simulación para detenerla o cambiar la fecha de inicio.'}
                </div>
              </>
            ) : (
              <button
                onClick={onViewCollapseResults}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/50 text-[#FF4D4D] text-xs hover:bg-[#FF4D4D]/25 transition-colors animate-pulse"
                style={{ fontWeight: 600 }}
              >
                <BarChart2 className="w-4 h-4" />
                Ver Análisis de Colapso
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Filters */}
      <Section title="FILTROS DEL MAPA" icon={<Filter className="w-3 h-3" />}>
        <SelectField
          label="AEROPUERTO DE ORIGEN"
          value={filters.origin}
          onChange={v => onFilterChange('origin', v)}
          options={cityOptions}
        />
        <SelectField
          label="AEROPUERTO DE DESTINO"
          value={filters.destination}
          onChange={v => onFilterChange('destination', v)}
          options={cityOptions}
        />
        {(filters.origin || filters.destination) && (
          <button
            type="button"
            onClick={onClearFilters}
            className="flex items-center gap-1 text-[10px] text-[#FF4D4D] hover:text-[#FF4D4D]/80 mt-1"
          >
            <X className="w-3 h-3" />
            Limpiar filtros
          </button>
        )}
      </Section>

      {/* Toggles */}
      <Section title="OPCIONES DE VISUALIZACIÓN" icon={<Route className="w-3 h-3" />}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-3.5 h-3.5 text-[#4DA6FF]" />
              <span className="text-xs text-[#A8C0E0]">Mostrar Rutas</span>
            </div>
            <ToggleSwitch label="Mostrar rutas" checked={toggles.showRoutes} onChange={() => onToggleChange('showRoutes')} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Warehouse className="w-3.5 h-3.5 text-[#FFC857]" />
              <span className="text-xs text-[#A8C0E0]">Capacidad de Almacén</span>
            </div>
            <ToggleSwitch label="Mostrar capacidad de almacén" checked={toggles.showWarehouseCapacity} onChange={() => onToggleChange('showWarehouseCapacity')} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-[#FF4D4D]" />
              <span className="text-xs text-[#A8C0E0]">Alertas de Congestión</span>
            </div>
            <ToggleSwitch label="Mostrar alertas de congestión" checked={toggles.showCongestion} onChange={() => onToggleChange('showCongestion')} />
          </div>
          <div className="text-[9px] text-[#4A6080] leading-relaxed">
            Las barras de capacidad aparecen al acercar el mapa; las UT con carga permanecen visibles con cualquier densidad.
          </div>
          <button
            type="button"
            onClick={onResetView}
            className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#1E3058] text-[10px] text-[#7090B0] hover:border-[#4DA6FF]/50 hover:text-[#4DA6FF] transition-colors"
          >
            <X className="w-3 h-3" />
            Restablecer vista y filtros
          </button>
        </div>
      </Section>

      {/* Legend — refleja lo que dibuja el mapa: almacenes por estado y UTs por carga */}
      <Section title="LEYENDA DEL MAPA" icon={<Search className="w-3 h-3" />} defaultOpen={false}>
        <div className="flex flex-col gap-2">
          <div className="text-[9px] text-[#4A6080]" style={{ letterSpacing: '0.1em' }}>ALMACENES (PUNTOS)</div>
          {[
            { color: '#00FF9C', label: 'Ocupación normal' },
            { color: '#FFC857', label: 'Advertencia (≥50%)' },
            { color: '#FF4D4D', label: 'Crítico (≥80%)' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] text-[#7090B0]">{item.label}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-[#1E3058] flex flex-col gap-1.5">
            <div className="text-[9px] text-[#4A6080]" style={{ letterSpacing: '0.1em' }}>UNIDADES DE TRANSPORTE (LÍNEAS)</div>
            {[
              { color: '#4DA6FF', label: 'Con carga (<50%)' },
              { color: '#FFC857', label: 'Advertencia carga (≥50%)' },
              { color: '#FF4D4D', label: 'Crítico carga (≥80%)' },
              { color: '#3A4A5E', label: 'Vacía (0 maletas)' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-5 h-0.5 flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-[#7090B0]">{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#FFC857]/40 text-[#FFC857]">En riesgo</span>
              <span className="text-[11px] text-[#7090B0]">Badge en tooltip si entrega en riesgo</span>
            </div>
            <div className="text-[9px] text-[#4A6080] leading-relaxed">
              “Alertas de Congestión” controla los pulsos animados en almacenes con advertencia o estado crítico.
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
