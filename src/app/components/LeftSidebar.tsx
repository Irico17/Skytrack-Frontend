import React from 'react';
import {
  Filter, Route, Warehouse,
  PlusCircle, Search, X, ChevronDown, ChevronUp,
  Plane, BarChart2, Calendar, Database,
  Clock, Zap,
} from 'lucide-react';
import { SimulationMode, AIRLINES, Airport } from '../data/mockData';

interface Filters {
  airline: string;
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
  daysElapsed: number;
  simulationComplete: boolean;
  collapseComplete: boolean;
  airports?: Airport[];
  onStartDateChange: (date: Date) => void;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onToggleChange: (key: keyof Toggles) => void;
  onAddShipment: () => void;
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
        onClick={() => setOpen(!open)}
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

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
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
  return (
    <div className="mb-3">
      <label className="block text-[10px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>{label}</label>
      <div className="relative">
        <select
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

function formatDurationHms(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function LeftSidebar({
  mode, startDate, simulationTime, simulationK = 240, filters, toggles, isRunning,
  daysElapsed, simulationComplete, collapseComplete, airports = [],
  onStartDateChange, onFilterChange, onToggleChange,
  onAddShipment, onCancelFlight, onUploadStaticData, onCloseOperations,
  onViewResults, onViewCollapseResults, onViewDayToDayResults, dayToDayComplete,
}: LeftSidebarProps) {

  const airlineOptions = mode === '5day' || mode === 'realtime'
    ? [{ value: '', label: '— Clientes backend' }]
    : [
        { value: '', label: 'Todas las Aerolíneas' },
        ...AIRLINES.map(a => ({ value: a.id, label: a.name }))
      ];

  const cityOptions = [
    { value: '', label: 'Todas las Ciudades' },
    ...airports.map(a => ({ value: a.id, label: `${a.city} (${a.id})` }))
  ];

  const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const dayLabels = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i + 1);
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES[d.getMonth()]}`;
  });
  const currentDay = Math.min(Math.ceil(daysElapsed), 5);
  const elapsedMs = mode === 'collapse'
    ? Math.max(0, simulationTime.getTime() - startDate.getTime())
    : Math.max(0, daysElapsed * 24 * 60 * 60 * 1000);
  const elapsedHms = formatDurationHms(elapsedMs);
  const displayedK = mode === 'collapse' ? 75 : mode === 'realtime' ? 1 : simulationK;

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
          title={mode !== 'realtime' ? 'El registro manual de maletas solo aplica a la operación día a día' : !isRunning ? 'Inicia la operación para registrar maletas' : undefined}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-xs hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <PlusCircle className="w-4 h-4" />
          Registrar Maletas
        </button>
        <button
          onClick={onCancelFlight}
          disabled={!isRunning}
          title={!isRunning ? 'Inicia una simulación activa para cancelar vuelos' : undefined}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 text-[#FF4D4D] text-xs hover:bg-[#FF4D4D]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <Plane className="w-4 h-4" />
          Cancelar Vuelo
        </button>
        <button
          onClick={onUploadStaticData}
          disabled={isRunning}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C] text-xs hover:bg-[#00FF9C]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
      <Section title="FECHA Y HORA DE INICIO" icon={<Calendar className="w-3 h-3" />}>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4A6080] pointer-events-none" />
            <input
              type="datetime-local"
              value={formatInputDateTime(startDate)}
              onChange={e => {
                if (e.target.value) onStartDateChange(new Date(e.target.value));
              }}
              disabled={isRunning}
              className="w-full bg-[#0D1E38] border border-[#1E3058] rounded-lg pl-7 pr-2 py-2 text-[10px] text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            />
          </div>
          <div className="text-[9px] text-[#4A6080]">
            {formatDateDisplay(startDate)} → {formatDateDisplay(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000))}
          </div>
        </div>
      </Section>

      <Section title="TIEMPO TRANSCURRIDO" icon={<Clock className="w-3 h-3" />}>
        <div className="rounded-lg border border-[#1E3058] bg-[#0D1E38] px-3 py-2.5">
          <div className="text-[10px] text-[#4A6080] mb-1" style={{ letterSpacing: '0.1em' }}>SIMULADO</div>
          <div className="text-xl font-mono text-[#E2E8F8]" style={{ fontWeight: 700 }}>{elapsedHms}</div>
          <div className="mt-1 text-[10px] text-[#4A6080]">Velocidad K={displayedK}×</div>
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
                  {simulationComplete ? 'Completo' : `Día ${currentDay}/5`}
                </span>
              </div>
              <div className="h-2 bg-[#1E3058] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${simulationComplete ? 100 : (daysElapsed / 5) * 100}%`,
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
                const isCurrent = !simulationComplete && currentDay === dayNum && daysElapsed > 0;
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

      {/* Collapse scenario actions — only visible in collapse mode */}
      {mode === 'collapse' && (
        <Section title="ESCENARIO DE COLAPSO" icon={<Zap className="w-3 h-3" />}>
          <div className="flex flex-col gap-2">
            {!collapseComplete ? (
              <div className="rounded-lg border border-[#FF4D4D]/30 bg-[#FF4D4D]/8 px-3 py-2.5 text-[11px] text-[#FF9090] leading-relaxed">
                {isRunning
                  ? 'Acelerando la operación (K=75×) hasta que el backend detecte saturación logística. El colapso se declara con datos reales.'
                  : 'Inicia la simulación para acelerar la red hasta el colapso. Usa Reiniciar para detenerla o cambiar la fecha de inicio.'}
              </div>
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
          label="AEROLÍNEA (CLIENTE)"
          value={filters.airline}
          onChange={v => onFilterChange('airline', v)}
          options={airlineOptions}
          disabled={mode === '5day' || mode === 'realtime'}
        />
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
        {(filters.airline || filters.origin || filters.destination) && (
          <button
            onClick={() => { onFilterChange('airline', ''); onFilterChange('origin', ''); onFilterChange('destination', ''); }}
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
            <ToggleSwitch checked={toggles.showRoutes} onChange={() => onToggleChange('showRoutes')} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Warehouse className="w-3.5 h-3.5 text-[#FFC857]" />
              <span className="text-xs text-[#A8C0E0]">Capacidad de Almacén</span>
            </div>
            <ToggleSwitch checked={toggles.showWarehouseCapacity} onChange={() => onToggleChange('showWarehouseCapacity')} />
          </div>
        </div>
      </Section>

      {/* Legend — refleja lo que dibuja el mapa: almacenes por estado y UTs por SLA/carga */}
      <Section title="LEYENDA DEL MAPA" icon={<Search className="w-3 h-3" />} defaultOpen={false}>
        <div className="flex flex-col gap-2">
          <div className="text-[9px] text-[#4A6080]" style={{ letterSpacing: '0.1em' }}>ALMACENES (PUNTOS)</div>
          {[
            { color: '#00FF9C', label: 'Ocupación normal' },
            { color: '#FFC857', label: 'Advertencia (≥70%)' },
            { color: '#FF4D4D', label: 'Crítico (≥90%)' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] text-[#7090B0]">{item.label}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-[#1E3058] flex flex-col gap-1.5">
            <div className="text-[9px] text-[#4A6080]" style={{ letterSpacing: '0.1em' }}>UNIDADES DE TRANSPORTE (LÍNEAS)</div>
            {[
              { color: '#4DA6FF', label: 'Con carga (<70%)' },
              { color: '#FFC857', label: 'Advertencia carga (≥70%)' },
              { color: '#FF4D4D', label: 'Crítico carga (≥90%)' },
              { color: '#3A4A5E', label: 'Vacía (0 maletas)' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-5 h-0.5 flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-[#7090B0]">{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#FFC857]/40 text-[#FFC857]">SLA</span>
              <span className="text-[11px] text-[#7090B0]">Badge en tooltip si riesgo SLA</span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
