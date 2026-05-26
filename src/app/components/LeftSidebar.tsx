import React from 'react';
import {
  Filter, Route, Warehouse, AlertOctagon, Play, Pause,
  RotateCcw, Zap, PlusCircle, Search, X, ChevronDown, ChevronUp,
  Plane, Package, Building2, FastForward, BarChart2, Calendar,
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
  filters: Filters;
  toggles: Toggles;
  isRunning: boolean;
  hasReplanned: boolean;
  daysElapsed: number;
  simulationComplete: boolean;
  collapseComplete: boolean;
  airports?: Airport[];
  onModeChange: (mode: SimulationMode) => void;
  onStartDateChange: (date: Date) => void;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onToggleChange: (key: keyof Toggles) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onReplan: () => void;
  onAddShipment: () => void;
  onCancelFlight: () => void;
  onSkipToComplete: () => void;
  onSkipToCollapseComplete: () => void;
  onViewResults: () => void;
  onViewCollapseResults: () => void;
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

const SIMULATION_MODES = [
  { id: 'realtime' as SimulationMode, label: 'Operación Día a Día', desc: 'Datos reales del backend', color: '#00FF9C' },
  { id: '5day' as SimulationMode, label: 'Simulación 5 Días', desc: 'Planificación a mediano plazo', color: '#4DA6FF' },
  { id: 'collapse' as SimulationMode, label: 'Escenario de Colapso', desc: 'Pruebas de estrés', color: '#FF4D4D' },
];

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

export function LeftSidebar({
  mode, startDate, filters, toggles, isRunning, hasReplanned,
  daysElapsed, simulationComplete, collapseComplete, airports = [],
  onModeChange, onStartDateChange, onFilterChange, onToggleChange,
  onStart, onPause, onReset, onReplan, onAddShipment, onCancelFlight,
  onSkipToComplete, onSkipToCollapseComplete, onViewResults, onViewCollapseResults,
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

  const showDateSelector = mode === '5day' || mode === 'collapse';

  const formatInputDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const formatDateDisplay = (date: Date): string => {
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
  };

  return (
    <div className="w-64 bg-[#080F1E] border-r border-[#1E3058] flex flex-col h-full overflow-y-auto">
      {/* Add shipment button */}
      <div className="p-4 border-b border-[#1E3058]">
        <button
          onClick={onAddShipment}
          disabled={mode === '5day' || (mode === 'realtime' && !isRunning)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-xs hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <PlusCircle className="w-4 h-4" />
          Registrar Maletas
        </button>
        <button
          onClick={onCancelFlight}
          disabled={mode !== 'realtime' || !isRunning}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 text-[#FF4D4D] text-xs hover:bg-[#FF4D4D]/25 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          <Plane className="w-4 h-4" />
          Cancelar Vuelo
        </button>
      </div>

      {/* Simulation Mode */}
      <Section title="MODO DE SIMULACIÓN" icon={<Play className="w-3 h-3" />}>
        <div className="flex flex-col gap-2">
          {SIMULATION_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors text-left
                ${mode === m.id
                  ? 'bg-[#0D1E38] border-[#4DA6FF]/50'
                  : 'border-[#1E3058] hover:border-[#1E3058] hover:bg-[#0D1E38]/50'
                }`}
            >
              <div className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: m.color }} />
              <div>
                <div className="text-xs text-[#C8D8F0]" style={{ fontWeight: mode === m.id ? 600 : 400 }}>{m.label}</div>
                <div className="text-[10px] text-[#4A6080] mt-0.5">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* Date Selector — visible for 5day and collapse modes */}
      {showDateSelector && (
        <Section title="FECHA DE INICIO" icon={<Calendar className="w-3 h-3" />}>
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4A6080] pointer-events-none" />
              <input
                type="date"
                value={formatInputDate(startDate)}
                onChange={e => onStartDateChange(new Date(e.target.value + 'T08:00:00'))}
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
      )}

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

      {/* Simulation Controls */}
      <Section title="CONTROLES" icon={<Zap className="w-3 h-3" />}>
        <div className="flex flex-col gap-2">
          {!isRunning ? (
            <button
              onClick={onStart}
              disabled={simulationComplete || collapseComplete}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs transition-colors
                ${simulationComplete || collapseComplete
                  ? 'bg-[#00FF9C]/5 border border-[#00FF9C]/15 text-[#00FF9C]/40 cursor-not-allowed'
                  : 'bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C] hover:bg-[#00FF9C]/25'
                }`}
              style={{ fontWeight: 600 }}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Iniciar Simulación
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#FFC857]/15 border border-[#FFC857]/40 text-[#FFC857] text-xs hover:bg-[#FFC857]/25 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              Pausar Simulación
            </button>
          )}

          {/* Skip to End — only in 5day mode and not yet complete */}
          {mode === '5day' && !simulationComplete && (
            <button
              onClick={onSkipToComplete}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-xs hover:bg-[#4DA6FF]/25 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <FastForward className="w-3.5 h-3.5" />
              Completar y Ver Resultados
            </button>
          )}

          {/* Skip to collapse complete — only in collapse mode */}
          {mode === 'collapse' && !collapseComplete && (
            <button
              onClick={onSkipToCollapseComplete}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 text-[#FF4D4D] text-xs hover:bg-[#FF4D4D]/25 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <FastForward className="w-3.5 h-3.5" />
              Simular Colapso Completo
            </button>
          )}

          {/* View collapse results */}
          {mode === 'collapse' && collapseComplete && (
            <button
              onClick={onViewCollapseResults}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/50 text-[#FF4D4D] text-xs hover:bg-[#FF4D4D]/25 transition-colors animate-pulse"
              style={{ fontWeight: 600 }}
            >
              <BarChart2 className="w-4 h-4" />
              Ver Análisis de Colapso
            </button>
          )}

          <button
            onClick={onReplan}
            disabled={hasReplanned}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs transition-colors
              ${hasReplanned
                ? 'bg-[#A855F7]/10 border border-[#A855F7]/20 text-[#A855F7]/50 cursor-not-allowed'
                : 'bg-[#A855F7]/15 border border-[#A855F7]/40 text-[#A855F7] hover:bg-[#A855F7]/25'
              }`}
            style={{ fontWeight: 600 }}
          >
            <Zap className="w-3.5 h-3.5" />
            {hasReplanned ? 'Rutas Replanificadas' : 'Replanificar Rutas'}
          </button>

          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1A2E4A] border border-[#1E3058] text-[#A8C0E0] text-xs hover:border-[#4DA6FF]/40 transition-colors"
            style={{ fontWeight: 600 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar Simulación
          </button>
        </div>
      </Section>

      {/* Filters */}
      <Section title="FILTROS" icon={<Filter className="w-3 h-3" />}>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-3.5 h-3.5 text-[#FF4D4D]" />
              <span className="text-xs text-[#A8C0E0]">Mostrar Congestión</span>
            </div>
            <ToggleSwitch checked={toggles.showCongestion} onChange={() => onToggleChange('showCongestion')} />
          </div>
        </div>
      </Section>

      {/* Legend */}
      <Section title="LEYENDA DEL MAPA" icon={<Search className="w-3 h-3" />} defaultOpen={false}>
        <div className="flex flex-col gap-2">
          {[
            { color: '#00FF9C', label: 'Operación Normal' },
            { color: '#FFC857', label: 'Retraso / Advertencia' },
            { color: '#FF4D4D', label: 'Crítico / Congestión' },
            { color: '#4DA6FF', label: 'Rutas Activas' },
            { color: '#A855F7', label: 'Rutas Replanificadas' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] text-[#7090B0]">{item.label}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-[#1E3058]">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1">
                <div className="w-5 h-0.5 bg-[#4DA6FF]" />
              </div>
              <span className="text-[11px] text-[#7090B0]">Ruta Directa</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <div className="w-1 h-0.5 bg-[#A855F7]" />
                <div className="w-1 h-0.5 bg-transparent" />
                <div className="w-1 h-0.5 bg-[#A855F7]" />
                <div className="w-1 h-0.5 bg-transparent" />
                <div className="w-1 h-0.5 bg-[#A855F7]" />
              </div>
              <span className="text-[11px] text-[#7090B0]">Ruta Replanificada</span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}