import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { feature } from 'topojson-client';
import { LocateFixed, Maximize2, Minimize2 } from 'lucide-react';
import {
  Airport, Flight, Shipment,
  getStatusColor, getRouteColor, getOccupancyPercent
} from '../data/mockData';
import type { BackendActiveFlight, BackendFlightPlanFlight } from '../types/backend';
import { getContinentFill, getLoadPercent, getUtLoadColor, SUBLOT_COLORS } from '../utils/loadColors';
import { parseApiInstant } from '../utils/simulationTime';

const GEO_JSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const EMPTY_CANCELLED_SET_WM: Set<string> = new Set();
/**
 * TASK-032 — Optimizaciones de render:
 * - Canvas + rAF con throttle (~33ms pared / ~15ms reloj sim).
 * - Culling por viewBox antes de pintar; batch de rutas por color.
 * - denseMode cuando hay muchos dots en viewport (LOD visual, sin ocultar vuelos).
 * - React.memo en export.
 */

export interface SelectedEntity {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

interface Tooltip {
  x: number;
  y: number;
  content: React.ReactNode;
  airportId?: string;
}

interface Toggles {
  showRoutes: boolean;
  showWarehouseCapacity: boolean;
  showCongestion: boolean;
}

interface FlightDot {
  flightId: string;
  cx: number;
  cy: number;
  color: string;
  t: number;
  angle: number;
  pathD: string;
  bagsCount: number;
  originId: string;
  destinationId: string;
  hasBags: boolean;
  meetsSla: boolean;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  cpx: number;
  cpy: number;
}

interface FlightHitTarget {
  x: number;
  y: number;
  dot: FlightDot;
}

type ActiveFlightBags = Map<string, { bagsCount: number; meetsSla: boolean }>;

interface PlannedFlightGeometry {
  flightId: string;
  originId: string;
  destinationId: string;
  dep: number;
  arr: number;
  duration: number;
  capacity: number;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  cpx: number;
  cpy: number;
  pathD: string;
}

interface WorldMapProps {
  /** Aeropuertos visibles después de aplicar los filtros de vista. */
  airports: Airport[];
  /** Catálogo completo, usado para resolver geometría sin dibujar marcadores extra. */
  allAirports?: Airport[];
  flights: Flight[];
  shipments: Shipment[];
  selectedEntity: SelectedEntity | null;
  onSelectAirport: (id: string) => void;
  onSelectFlight: (id: string) => void;
  onSelectShipment: (id: string) => void;
  toggles: Toggles;
  /** Reloj del tiempo simulado para animar vuelos activos */
  simClock?: Date;
  /** Reloj mutable para animación canvas sin forzar renders de React */
  simClockRef?: { current: Date };
  /** Vuelos con maletas asignadas por el planificador */
  activeFlights?: BackendActiveFlight[];
  /** TODOS los vuelos del plan de vuelos (independientes del planificador) */
  flightPlanFlights?: BackendFlightPlanFlight[];
  /** Filtros sincronizados con el panel derecho (TASK-021). */
  utFilter?: string;
  warehouseFilter?: string;
  /** Filtro por región/continente de almacenes (sincronizado con el panel). */
  warehouseContinent?: string;
  /** Permite que la barra de filtro del mapa actualice el filtro UT compartido (MAP-REG-05). */
  onUtFilterChange?: (value: string) => void;
  onWarehouseFilterChange?: (value: string) => void;
  /** IDs de vuelos cancelados (con sufijo -D{n}) — se ocultan del mapa. */
  cancelledFlightIds?: Set<string>;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

// ── Equirectangular projection ──────────────────────────────────────────────
const BASE_W = 1000;
const BASE_H = 520;

function project(lng: number, lat: number): [number, number] {
  // Clamp de latitud ±85° (MAP-REG-01): evita que polígonos árticos/antárticos
  // se estiren hasta el borde superior/inferior y generen una franja.
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const x = ((lng + 180) / 360) * BASE_W;
  const y = ((90 - clampedLat) / 180) * BASE_H;
  return [x, y];
}

function lowerBoundDeparture(flights: PlannedFlightGeometry[], time: number): number {
  let lo = 0;
  let hi = flights.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (flights[mid].dep < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundDeparture(flights: PlannedFlightGeometry[], time: number): number {
  let lo = 0;
  let hi = flights.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (flights[mid].dep <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function passesUtMapFilter(
  pct: number,
  empty: boolean,
  meetsSla: boolean,
  utFilter: string,
  isSelected: boolean,
): boolean {
  if (isSelected) return true;
  switch (utFilter) {
    case 'inflight': return true;
    case 'loaded': return !empty;
    case 'empty': return empty;
    case 'normal': return !empty && pct < 70;       // semáforo verde
    case 'warning': return !empty && pct >= 70 && pct < 90; // ámbar
    case 'critical': return !empty && pct >= 90;     // rojo
    case 'sla': return !empty && !meetsSla;
    default: return true;
  }
}

function passesWarehouseMapFilter(airport: Airport, warehouseFilter: string): boolean {
  if (warehouseFilter === 'all') return true;
  if (warehouseFilter === 'empty') return airport.occupancy === 0;
  return airport.status === warehouseFilter;
}

/** Hash determinista de un string (para muestreo estable por densidad, sin parpadeo). */
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

function buildActiveFlightDots(
  now: number,
  flightPlanGeometry: PlannedFlightGeometry[],
  maxFlightDuration: number,
  activeFlightBagsById: ActiveFlightBags,
  utFilter: string,
  selectedFlightId: string | null | undefined,
  density: number,
  cancelledFlightIds: Set<string>,
): FlightDot[] {
  if (flightPlanGeometry.length === 0) return [];

  const dots: FlightDot[] = [];
  const selectedBaseFlightId = selectedFlightId?.replace(/-D\d+$/, '') ?? null;
  const startIndex = lowerBoundDeparture(flightPlanGeometry, now - maxFlightDuration);
  const endIndex = upperBoundDeparture(flightPlanGeometry, now);
  const sampleThreshold = density < 1 ? Math.round(density * 1000) : 1000;

  for (let i = startIndex; i < endIndex; i += 1) {
    const f = flightPlanGeometry[i];
    if (now > f.arr) continue;
    if (cancelledFlightIds.size > 0 && cancelledFlightIds.has(f.flightId)) continue; // cancelado → no se dibuja

    const t = (now - f.dep) / f.duration;
    if (t < 0 || t > 1) continue;

    const { ox, oy, dx, dy, cpx, cpy } = f;
    const cx = (1-t)*(1-t)*ox + 2*(1-t)*t*cpx + t*t*dx;
    const cy = (1-t)*(1-t)*oy + 2*(1-t)*t*cpy + t*t*dy;

    const tanX = 2*(1-t)*(cpx - ox) + 2*t*(dx - cpx);
    const tanY = 2*(1-t)*(cpy - oy) + 2*t*(dy - cpy);
    const angle = Math.atan2(tanY, tanX) * (180 / Math.PI);

    const bags = activeFlightBagsById.get(f.flightId);
    const hasBags = bags !== undefined && bags.bagsCount > 0;
    const meetsSla = hasBags ? bags!.meetsSla : false;
    const isSelectedFlight = selectedBaseFlightId != null
      && (f.flightId === selectedFlightId || f.flightId.replace(/-D\d+$/, '') === selectedBaseFlightId);
    const loadPct = f.capacity > 0 ? (hasBags ? bags!.bagsCount : 0) / f.capacity * 100 : (hasBags ? 100 : 0);
    if (!passesUtMapFilter(loadPct, !hasBags, meetsSla, utFilter, isSelectedFlight)) continue;

    // Densidad: reduce solo aviones vacíos mediante muestreo determinista. Las UT con
    // carga y la selección permanecen visibles para que lista y mapa no se contradigan.
    if (density < 1 && !hasBags && !isSelectedFlight && stableHash(f.flightId) >= sampleThreshold) {
      continue;
    }

    const color = getUtLoadColor(hasBags ? bags!.bagsCount : 0, f.capacity);

    dots.push({
      flightId: f.flightId, cx, cy, color, t, angle, pathD: f.pathD,
      bagsCount: hasBags ? bags!.bagsCount : 0,
      originId: f.originId, destinationId: f.destinationId,
      hasBags, meetsSla, ox, oy, dx, dy, cpx, cpy,
    });
  }

  return dots;
}

function drawRouteBatch(
  ctx: CanvasRenderingContext2D,
  dots: FlightDot[],
  color: string,
  toCanvasX: (x: number) => number,
  toCanvasY: (y: number) => number,
) {
  let hasPath = false;
  ctx.beginPath();
  for (const dot of dots) {
    if (!dot.hasBags || dot.color !== color) continue;
    // Solo el tramo RESTANTE (delante del avión): la parte recorrida desaparece.
    // Sub-curva de Bézier cuadrática [t,1]: inicio=posición actual, control=lerp(cp,dest,t).
    const t = dot.t;
    const bx = (1 - t) * dot.cpx + t * dot.dx;
    const by = (1 - t) * dot.cpy + t * dot.dy;
    ctx.moveTo(toCanvasX(dot.cx), toCanvasY(dot.cy));
    ctx.quadraticCurveTo(toCanvasX(bx), toCanvasY(by), toCanvasX(dot.dx), toCanvasY(dot.dy));
    hasPath = true;
  }
  if (hasPath) ctx.stroke();
}

function drawPlaneMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  hasBags: boolean,
  denseMode: boolean,
  zoomLevel: number,
) {
  const zoomBoost = (hasBags
    ? Math.min(2.55, 1.68 + Math.max(0, zoomLevel - 1) * 0.48)
    : Math.min(2.28, 1.65 + Math.max(0, zoomLevel - 1) * 0.39)) * 1.25; // aviones ~25% más grandes

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle + 90) * Math.PI / 180);
  ctx.scale(zoomBoost, zoomBoost);

  if (hasBags) {
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#040814';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -4.4);
    ctx.lineTo(0.8, -1.3);
    ctx.lineTo(3.5, 0.2);
    ctx.lineTo(3.1, 1.25);
    ctx.lineTo(0.75, 0.75);
    ctx.lineTo(0.65, 3.0);
    ctx.lineTo(1.8, 3.75);
    ctx.lineTo(1.8, 4.45);
    ctx.lineTo(0, 3.9);
    ctx.lineTo(-1.8, 4.45);
    ctx.lineTo(-1.8, 3.75);
    ctx.lineTo(-0.65, 3.0);
    ctx.lineTo(-0.75, 0.75);
    ctx.lineTo(-3.1, 1.25);
    ctx.lineTo(-3.5, 0.2);
    ctx.lineTo(-0.8, -1.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (denseMode) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -3.1);
    ctx.lineTo(1.15, 1.9);
    ctx.lineTo(0, 1.25);
    ctx.lineTo(-1.15, 1.9);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -3.4);
    ctx.lineTo(0.6, -0.9);
    ctx.lineTo(2.5, 0.25);
    ctx.lineTo(2.15, 0.9);
    ctx.lineTo(0.55, 0.6);
    ctx.lineTo(0.45, 2.3);
    ctx.lineTo(1.25, 2.85);
    ctx.lineTo(1.25, 3.3);
    ctx.lineTo(0, 2.9);
    ctx.lineTo(-1.25, 3.3);
    ctx.lineTo(-1.25, 2.85);
    ctx.lineTo(-0.45, 2.3);
    ctx.lineTo(-0.55, 0.6);
    ctx.lineTo(-2.15, 0.9);
    ctx.lineTo(-2.5, 0.25);
    ctx.lineTo(-0.6, -0.9);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ── Graticule (grid lines) ───────────────────────────────────────────────────
const GraticuleLines = React.memo(function GraticuleLines() {
  const lines: React.ReactNode[] = [];
  for (let lng = -180; lng <= 180; lng += 30) {
    const [x0, y0] = project(lng, 90);
    const [x1, y1] = project(lng, -90);
    lines.push(
      <line key={`lng${lng}`} x1={x0} y1={y0} x2={x1} y2={y1}
        stroke="#0C1628" strokeWidth={0.5} />
    );
  }
  for (let lat = -60; lat <= 90; lat += 30) {
    const [x0] = project(-180, lat);
    const [x1] = project(180, lat);
    const [, y] = project(0, lat);
    lines.push(
      <line key={`lat${lat}`} x1={x0} y1={y} x2={x1} y2={y}
        stroke="#0C1628" strokeWidth={0.5} />
    );
  }
  // Highlight equator and prime meridian
  const [eqX0] = project(-180, 0); const [eqX1] = project(180, 0);
  const [, eqY] = project(0, 0);
  lines.push(<line key="equator" x1={eqX0} y1={eqY} x2={eqX1} y2={eqY} stroke="#111D35" strokeWidth={0.8} />);
  const [pmX, pmY0] = project(0, 90); const [, pmY1] = project(0, -90);
  lines.push(<line key="meridian" x1={pmX} y1={pmY0} x2={pmX} y2={pmY1} stroke="#111D35" strokeWidth={0.8} />);
  return <>{lines}</>;
});

// ── Main component ────────────────────────────────────────────────────────────
function WorldMapComponent({
  airports, allAirports = airports, flights, shipments, selectedEntity,
  onSelectAirport, onSelectFlight, onSelectShipment, toggles,
  simClock, simClockRef, activeFlights = [], flightPlanFlights = [],
  utFilter = 'all', warehouseFilter = 'all', warehouseContinent = 'all', onUtFilterChange, onWarehouseFilterChange,
  cancelledFlightIds,
  isExpanded = false, onToggleExpanded,
}: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const flightCanvasRef = useRef<HTMLCanvasElement>(null);
  const flightHitTargetsRef = useRef<FlightHitTarget[]>([]);
  const didDragRef = useRef(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [geoFeatures, setGeoFeatures] = useState<any[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  // Contador de vuelos dibujados (MAP-REG-04): se actualiza desde el loop de pintado
  // por un ref + intervalo, sin forzar re-render por frame.
  const [flightCounts, setFlightCounts] = useState({ visible: 0, loaded: 0 });
  const flightCountsRef = useRef({ visible: 0, loaded: 0 });
  // Densidad de render del mapa (1 = todos; 0.5 = mitad de las vacías; 0.25 = un cuarto).
  const [mapDensity, setMapDensity] = useState(1);
  // Barra de filtros del mapa colapsable: se esconde tras un asa y aparece al pasar el mouse,
  // para no tapar la vista cuando no se usa.
  const [mapFiltersOpen, setMapFiltersOpen] = useState(false);
  const mapDensityRef = useRef(1);
  mapDensityRef.current = mapDensity;
  const cancelledFlightIdsRef = useRef<Set<string>>(EMPTY_CANCELLED_SET_WM);
  cancelledFlightIdsRef.current = cancelledFlightIds ?? EMPTY_CANCELLED_SET_WM;

  const makeCanvasFlightTooltip = useCallback((dot: FlightDot, capacity: number) => (
    <div style={{ minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot.color }} />
        <span style={{ fontWeight: 700, color: '#E2E8F8', fontSize: 12 }}>{dot.flightId}</span>
        {dot.hasBags && !dot.meetsSla && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,200,87,0.15)', color: '#FFC857' }}>
            En riesgo
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#A8C0E0' }}>{dot.originId} → {dot.destinationId}</div>
      <div style={{ fontSize: 11, color: '#6080A0', marginTop: 4 }}>
        Carga: {dot.bagsCount}/{capacity > 0 ? capacity : '—'} ({getLoadPercent(dot.bagsCount, capacity)}%)
      </div>
      <div style={{ fontSize: 11, color: '#6080A0' }}>Progreso: {Math.round(dot.t * 100)}%</div>
    </div>
  ), []);

  const getCanvasFlightHit = useCallback((clientX: number, clientY: number) => {
    const rect = flightCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let closest: FlightHitTarget | null = null;
    const hitRadiusPx = 22;
    let closestDistance = hitRadiusPx * hitRadiusPx;

    for (const target of flightHitTargetsRef.current) {
      const dx = target.x - x;
      const dy = target.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closest = target;
        closestDistance = distance;
      }
    }

    return closest;
  }, []);

  // Load world TopoJSON
  useEffect(() => {
    fetch(GEO_JSON_URL)
      .then(r => r.json())
      .then(topo => {
        const geo = feature(topo, topo.objects.countries) as any;
        setGeoFeatures(geo.features);
      })
      .catch(() => setGeoFeatures([]));
  }, []);

  // Pan/zoom state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: BASE_W, h: BASE_H });
  const dragRef = useRef<{ startX: number; startY: number; startVB: typeof viewBox } | null>(null);
  const lastFocusedSelectionRef = useRef<string | null>(null);

  // Zoom on wheel
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;
    setViewBox(vb => {
      const newW = Math.min(Math.max(vb.w * zoomFactor, 80), BASE_W * 2);
      const newH = Math.min(Math.max(vb.h * zoomFactor, 40), BASE_H * 2);
      const newX = vb.x + (vb.w - newW) * mx;
      const newY = vb.y + (vb.h - newH) * my;
      return { x: newX, y: newY, w: newW, h: newH };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Pan on drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('[data-interactive="true"]')) return;
    didDragRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startVB: viewBox };
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const rawDx = e.clientX - dragRef.current.startX;
      const rawDy = e.clientY - dragRef.current.startY;
      if (Math.hypot(rawDx, rawDy) > 3) didDragRef.current = true;
      const dx = rawDx / rect.width * dragRef.current.startVB.w;
      const dy = rawDy / rect.height * dragRef.current.startVB.h;
      const { startVB } = dragRef.current;
      setViewBox({ ...startVB, x: startVB.x - dx, y: startVB.y - dy });
      return;
    }

    const target = e.target as Element;
    if (target.closest('[data-interactive="true"]')) return;

    const hit = getCanvasFlightHit(e.clientX, e.clientY);
    const rect = containerRef.current?.getBoundingClientRect();
    if (hit && rect) {
      const cap = flightCapacityByIdRef.current.get(hit.dot.flightId) ?? 0;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        content: makeCanvasFlightTooltip(hit.dot, cap),
      });
    } else {
      setTooltip(null);
    }
  }, [getCanvasFlightHit, makeCanvasFlightTooltip]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const handleMapClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

    const target = e.target as Element;
    if (target.closest('[data-interactive="true"]')) return;

    const hit = getCanvasFlightHit(e.clientX, e.clientY);
    if (hit) {
      e.stopPropagation();
      onSelectFlight(hit.dot.flightId);
    }
  }, [getCanvasFlightHit, onSelectFlight]);

  const zoomIn = () => setViewBox(vb => {
    const f = 0.7; const nx = vb.x + vb.w * (1 - f) / 2; const ny = vb.y + vb.h * (1 - f) / 2;
    return { x: nx, y: ny, w: Math.max(vb.w * f, 80), h: Math.max(vb.h * f, 40) };
  });
  const zoomOut = () => setViewBox(vb => {
    const f = 1.4; const nx = vb.x - vb.w * (f - 1) / 2; const ny = vb.y - vb.h * (f - 1) / 2;
    return { x: nx, y: ny, w: Math.min(vb.w * f, BASE_W * 2), h: Math.min(vb.h * f, BASE_H * 2) };
  });
  const resetView = useCallback(() => {
    const valid = airports
      .map(a => project(a.coords[0], a.coords[1]))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

    if (valid.length === 0) {
      setViewBox({ x: 0, y: 0, w: BASE_W, h: BASE_H });
      return;
    }

    const xs = valid.map(([x]) => x);
    const ys = valid.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 70;
    const boxW = Math.max(maxX - minX + padding * 2, 260);
    const boxH = Math.max(maxY - minY + padding * 2, 150);
    // Usar la relación de aspecto REAL del contenedor para evitar bandas vacías y el
    // recorte de vuelos arriba/abajo (antes se fijaba a 2:1 y dejaba letterbox).
    const rect = containerRef.current?.getBoundingClientRect();
    const targetRatio = rect && rect.height > 0 ? rect.width / rect.height : BASE_W / BASE_H;
    let w = boxW;
    let h = boxH;
    if (w / h > targetRatio) {
      h = w / targetRatio;
    } else {
      w = h * targetRatio;
    }

    const centeredX = (minX + maxX) / 2 - w / 2;
    const centeredY = (minY + maxY) / 2 - h / 2;

    setViewBox({
      x: centeredX,
      y: centeredY,
      w: Math.min(w, BASE_W * 2),
      h: Math.min(h, BASE_H * 2),
    });
  }, [airports]);

  // Ajuste inicial: al cargar aeropuertos + países por primera vez, encuadra a los
  // aeropuertos para que el mapa se vea completo desde el arranque (no recortado).
  const hasFitInitialRef = useRef(false);
  useEffect(() => {
    if (hasFitInitialRef.current) return;
    if (airports.length > 0 && geoFeatures.length > 0) {
      hasFitInitialRef.current = true;
      resetView();
    }
  }, [airports.length, geoFeatures.length, resetView]);

  // Mantener el aspecto del viewBox = aspecto del contenedor (sin letterbox). Cuando los
  // paneles se colapsan/expanden o la ventana cambia, el mapa se reajusta para que los
  // vuelos cubran TODO el alto (antes quedaban franjas arriba/abajo sin aviones).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const aspect = rect.width / rect.height;
      setViewBox(vb => {
        const targetH = vb.w / aspect;
        if (Math.abs(targetH - vb.h) < 0.5) return vb;
        return { ...vb, y: vb.y + (vb.h - targetH) / 2, h: targetH };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Airport SVG positions (lookup map)
  const airportById = useMemo(() => {
    const m: Record<string, Airport & { svgPos: [number, number] }> = {};
    allAirports.forEach(a => { m[a.id] = { ...a, svgPos: project(a.coords[0], a.coords[1]) }; });
    return m;
  }, [allAirports]);

  const airportGeometryKey = useMemo(() =>
    allAirports.map(a => `${a.id}:${a.coords[0]}:${a.coords[1]}`).join('|'),
    [allAirports]
  );

  const airportGeometryById = useMemo(() => {
    const m: Record<string, { svgPos: [number, number] }> = {};
    allAirports.forEach(a => { m[a.id] = { svgPos: project(a.coords[0], a.coords[1]) }; });
    return m;
  }, [airportGeometryKey]);

  // Airport SVG positions array for rendering (filtrado por semáforo almacén — TASK-021)
  const airportPositions = useMemo(() =>
    airports
      .filter(a => passesWarehouseMapFilter(a, warehouseFilter))
      .filter(a => warehouseContinent === 'all' || ((a as { continent?: string }).continent ?? '') === warehouseContinent)
      .map(a => ({ ...a, svgPos: project(a.coords[0], a.coords[1]) })),
    [airports, warehouseFilter, warehouseContinent]
  );

  const countryLayers = useMemo(() => geoFeatures.map((geo: any, i: number) => {
    if (!geo.geometry || !geo.geometry.coordinates) return null;
    const coords = geo.geometry.type === 'Polygon'
      ? [geo.geometry.coordinates]
      : geo.geometry.coordinates;
    const isHovered = hoveredCountry === geo.id;
    const firstRing = coords[0]?.[0];
    const sampleLng = firstRing?.[0]?.[0] ?? 0;
    const fill = getContinentFill(sampleLng, isHovered);

    return (
      <g
        key={`${geo.id}-${i}`}
        style={{ pointerEvents: 'none' }}
      >
        {coords.map((ringSet: any, ri: number) =>
          ringSet.map((ring: number[][], ri2: number) => {
            const pathSegments: string[] = [];
            let prevX: number | null = null;
            for (let j = 0; j < ring.length; j += 1) {
              const point = ring[j];
              const lng = point[0];
              const lat = point[1];
              if (lng !== undefined && lat !== undefined) {
                const [x, y] = project(lng, lat);
                // Corta el trazo al cruzar el antimeridiano (salto > medio mapa):
                // evita la franja horizontal que conectaba +180° con −180° (MAP-REG-01).
                const cmd = (j === 0 || (prevX !== null && Math.abs(x - prevX) > BASE_W / 2)) ? 'M' : 'L';
                pathSegments.push(`${cmd} ${x.toFixed(2)} ${y.toFixed(2)}`);
                prevX = x;
              }
            }
            const d = `${pathSegments.join(' ')} Z`;
            return (
              <path
                key={`${ri}-${ri2}`}
                d={d}
                fill={fill}
                stroke={isHovered ? '#1E3558' : '#13203A'}
                strokeWidth={isHovered ? 0.8 : 0.5}
                strokeLinejoin="round"
                style={{ transition: 'fill 0.15s, stroke 0.15s' }}
              />
            );
          })
        )}
      </g>
    );
  }), [geoFeatures, hoveredCountry]);

  // ===== GEOMETRÍA ESTÁTICA DEL PLAN (calculada una sola vez al cambiar vuelos o aeropuertos) =====
  const geometryFlights = flightPlanFlights.length > 0 ? flightPlanFlights : activeFlights;

  const flightPlanGeometry = useMemo(() => {
    type FlightSource = { flightId: string; originId: string; destinationId: string; departureTime: string; arrivalTime: string; capacity?: number };
    const source: FlightSource[] = geometryFlights;
    if (source.length === 0) return [];

    const geometry: PlannedFlightGeometry[] = [];

    for (const f of source) {
      const origin = airportGeometryById[f.originId];
      const dest   = airportGeometryById[f.destinationId];
      if (!origin || !dest) continue;

      const dep = parseApiInstant(f.departureTime).getTime();
      const arr = parseApiInstant(f.arrivalTime).getTime();
      const duration = arr - dep;
      if (!Number.isFinite(duration) || duration <= 0) continue;

      const [ox, oy] = origin.svgPos;
      const [dx, dy] = dest.svgPos;
      const mx = (ox + dx) / 2;
      const my = (oy + dy) / 2;
      const ddx = dx - ox; const ddy = dy - oy;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const curve = Math.min(Math.max(dist * 0.22, 18), 110);
      const cpx = mx - (ddy / dist) * curve;
      const cpy = my + (ddx / dist) * curve;

      geometry.push({
        flightId: f.flightId, originId: f.originId, destinationId: f.destinationId,
        dep, arr, duration, capacity: f.capacity ?? 0,
        ox, oy, dx, dy, cpx, cpy,
        pathD: `M ${ox} ${oy} Q ${cpx} ${cpy} ${dx} ${dy}`,
      });
    }

    geometry.sort((a, b) => a.dep - b.dep);
    return geometry;
  }, [geometryFlights, airportGeometryById]);

  const flightCapacityById = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of flightPlanGeometry) m.set(g.flightId, g.capacity);
    for (const f of flights) {
      if (!m.has(f.id)) m.set(f.id, f.capacity);
    }
    return m;
  }, [flightPlanGeometry, flights]);

  const selectedFlightGeometry = useMemo(() => {
    if (selectedEntity?.type !== 'flight') return null;
    const selectedId = selectedEntity.id;
    const selectedBaseId = selectedId.replace(/-D\d+$/, '');
    return flightPlanGeometry.find(f =>
      f.flightId === selectedId || f.flightId.replace(/-D\d+$/, '') === selectedBaseId
    ) ?? null;
  }, [selectedEntity, flightPlanGeometry]);

  /**
   * Geometría de TODOS los tramos (legs) del ENVÍO seleccionado, para dibujar su ruta
   * completa en el mapa (requisito de la prueba día a día: "se selecciona un envío y se
   * debe mostrar en el mapa todas las rutas del envío de manera gráfica"). Aplica igual
   * a los 3 escenarios — los legs vienen de la solución del backend en todos los modos.
   *
   * SUB-LOTES: un envío puede dividirse por capacidad en varios sub-lotes (ids con
   * sufijo -S1/-S2...), cada uno con SU PROPIA ruta (vuelos distintos). Seleccionar
   * cualquiera de ellos dibuja la familia COMPLETA (todas las rutas de todos los
   * sub-lotes del mismo envío base), con un color por sub-lote para distinguirlas.
   * Si el envío aún no tiene ruta asignada (PENDING), no hay tramos que dibujar.
   */
  const selectedShipmentGeometry = useMemo(() => {
    if (selectedEntity?.type !== 'shipment') return null;
    const stripSublot = (id: string) => id.replace(/(-S\d+)+$/, '');
    const baseId = stripSublot(selectedEntity.id);
    // Familia completa: el lote base y/o todos sus sub-lotes -S1/-S2...
    const family = shipments.filter(s => stripSublot(s.id) === baseId);
    if (family.length === 0) return null;
    // Orden estable (base primero, luego -S1, -S2...) para que los colores no salten.
    family.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    const sublots = family
      .map((shipment, sublotIndex) => {
        const legs = (shipment.legs ?? [])
          .map((leg, index) => {
            const origin = airportGeometryById[leg.from];
            const dest = airportGeometryById[leg.to];
            if (!origin || !dest) return null;
            const [ox, oy] = origin.svgPos;
            const [dx, dy] = dest.svgPos;
            const mx = (ox + dx) / 2;
            const my = (oy + dy) / 2;
            const ddx = dx - ox; const ddy = dy - oy;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            // Curvatura levemente distinta por sub-lote: si dos sub-lotes comparten un
            // tramo (mismo par de aeropuertos), sus arcos no se superponen exactamente
            // y ambos quedan visibles.
            const curve = Math.min(Math.max(dist * (0.22 + sublotIndex * 0.05), 18), 130);
            const cpx = mx - (ddy / dist) * curve;
            const cpy = my + (ddx / dist) * curve;
            return {
              key: `${shipment.id}-leg-${index}`,
              flightId: leg.id,
              from: leg.from,
              to: leg.to,
              ox, oy, dx, dy, cpx, cpy,
              pathD: `M ${ox} ${oy} Q ${cpx} ${cpy} ${dx} ${dy}`,
              isFirst: index === 0,
              isLast: index === (shipment.legs?.length ?? 0) - 1,
            };
          })
          .filter((leg): leg is NonNullable<typeof leg> => leg !== null);
        return {
          shipmentId: shipment.id,
          quantity: shipment.luggageCount,
          color: SUBLOT_COLORS[sublotIndex % SUBLOT_COLORS.length],
          legs,
        };
      })
      .filter(sublot => sublot.legs.length > 0);

    if (sublots.length === 0) return null;
    return { baseId, sublots };
  }, [selectedEntity, shipments, airportGeometryById]);

  useEffect(() => {
    if (!selectedEntity) {
      lastFocusedSelectionRef.current = null;
      return;
    }
    const key = `${selectedEntity.type}:${selectedEntity.id}`;
    if (lastFocusedSelectionRef.current === key) return;

    const fitBounds = (minX: number, minY: number, maxX: number, maxY: number, padding: number) => {
      const targetRatio = BASE_W / BASE_H;
      let w = Math.max(maxX - minX + padding * 2, 150);
      let h = Math.max(maxY - minY + padding * 2, 90);
      if (w / h > targetRatio) {
        h = w / targetRatio;
      } else {
        w = h * targetRatio;
      }
      w = Math.min(Math.max(w, 120), BASE_W);
      h = Math.min(Math.max(h, 70), BASE_H);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setViewBox({
        x: Math.max(-60, Math.min(cx - w / 2, BASE_W - w + 60)),
        y: Math.max(-40, Math.min(cy - h / 2, BASE_H - h + 40)),
        w,
        h,
      });
    };

    if (selectedEntity.type === 'airport') {
      const airport = airportById[selectedEntity.id];
      if (!airport) return;
      const [x, y] = airport.svgPos;
      lastFocusedSelectionRef.current = key;
      fitBounds(x, y, x, y, 55);
      return;
    }

    if (selectedFlightGeometry) {
      lastFocusedSelectionRef.current = key;
      fitBounds(
        Math.min(selectedFlightGeometry.ox, selectedFlightGeometry.dx, selectedFlightGeometry.cpx),
        Math.min(selectedFlightGeometry.oy, selectedFlightGeometry.dy, selectedFlightGeometry.cpy),
        Math.max(selectedFlightGeometry.ox, selectedFlightGeometry.dx, selectedFlightGeometry.cpx),
        Math.max(selectedFlightGeometry.oy, selectedFlightGeometry.dy, selectedFlightGeometry.cpy),
        45,
      );
      return;
    }

    if (selectedEntity.type === 'shipment') {
      // Con ruta asignada: encuadrar TODOS los tramos de TODOS los sub-lotes (incluye
      // escalas intermedias y curvas de control, para que nada quede fuera del encuadre).
      if (selectedShipmentGeometry) {
        const allLegs = selectedShipmentGeometry.sublots.flatMap(sl => sl.legs);
        const xs = allLegs.flatMap(l => [l.ox, l.dx, l.cpx]);
        const ys = allLegs.flatMap(l => [l.oy, l.dy, l.cpy]);
        lastFocusedSelectionRef.current = key;
        fitBounds(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 45);
        return;
      }
      // Sin ruta aún (PENDING): encuadrar el par origen-destino como referencia.
      const shipment = shipments.find(s => s.id === selectedEntity.id);
      if (!shipment) return;
      const origin = airportById[shipment.origin];
      const dest = airportById[shipment.destination];
      if (!origin || !dest) return;
      lastFocusedSelectionRef.current = key;
      fitBounds(
        Math.min(origin.svgPos[0], dest.svgPos[0]),
        Math.min(origin.svgPos[1], dest.svgPos[1]),
        Math.max(origin.svgPos[0], dest.svgPos[0]),
        Math.max(origin.svgPos[1], dest.svgPos[1]),
        50,
      );
    }
  }, [selectedEntity, airportById, selectedFlightGeometry, selectedShipmentGeometry, shipments]);

  const maxFlightDuration = useMemo(() => {
    let maxDuration = 0;
    for (const flight of flightPlanGeometry) {
      if (flight.duration > maxDuration) maxDuration = flight.duration;
    }
    return maxDuration;
  }, [flightPlanGeometry]);

  const activeFlightBagsById = useMemo(() => {
    const bagsMap = new Map<string, { bagsCount: number; meetsSla: boolean }>();
    for (const af of activeFlights) {
      bagsMap.set(af.flightId, { bagsCount: af.bagsCount, meetsSla: af.meetsSla });
    }
    return bagsMap;
  }, [activeFlights]);

  // True cuando el backend ya ha mandado datos de vuelos (plan o activos)
  const hasBackendFlightData = flightPlanFlights.length > 0 || activeFlights.length > 0;
  // Solo mostramos el fallback estático si NO hay ningún dato del backend
  const shouldShowStaticFallback = !hasBackendFlightData;

  const fallbackClockRef = useRef(simClock);
  const viewBoxRef = useRef(viewBox);
  const flightPlanGeometryRef = useRef(flightPlanGeometry);
  const maxFlightDurationRef = useRef(maxFlightDuration);
  const activeFlightBagsByIdRef = useRef(activeFlightBagsById);
  const utFilterRef = useRef(utFilter);
  const flightCapacityByIdRef = useRef(flightCapacityById);
  const selectedFlightIdRef = useRef<string | null>(null);
  const showRoutesRef = useRef(toggles.showRoutes);
  const paintVersionRef = useRef(0);

  fallbackClockRef.current = simClock;
  viewBoxRef.current = viewBox;
  flightPlanGeometryRef.current = flightPlanGeometry;
  maxFlightDurationRef.current = maxFlightDuration;
  activeFlightBagsByIdRef.current = activeFlightBagsById;
  utFilterRef.current = utFilter;
  flightCapacityByIdRef.current = flightCapacityById;
  selectedFlightIdRef.current = selectedEntity?.type === 'flight' ? selectedEntity.id : null;
  showRoutesRef.current = toggles.showRoutes;

  useEffect(() => {
    paintVersionRef.current += 1;
  }, [flightPlanGeometry, maxFlightDuration, activeFlightBagsById, utFilter, toggles.showRoutes, selectedEntity, mapDensity, cancelledFlightIds]);

  useEffect(() => {
    const canvas = flightCanvasRef.current;
    if (!canvas || !hasBackendFlightData) {
      flightHitTargetsRef.current = [];
      return;
    }

    let frameId = 0;
    let lastPaintWallMs = 0;
    let lastPaintClockMs = Number.NaN;
    let lastPaintViewBox = viewBoxRef.current;
    let lastPaintVersion = -1;
    let hasPaintedFlights = false;
    let lastDotCount = 0; // para throttle adaptativo: baja FPS cuando hay muchos aviones

    const paint = () => {
      frameId = requestAnimationFrame(paint);
      const wallMs = performance.now();

      const clockDate = simClockRef?.current ?? fallbackClockRef.current;
      const nowMs = clockDate?.getTime();
      if (!Number.isFinite(nowMs)) return;

      const vb = viewBoxRef.current;
      const viewChanged = vb.x !== lastPaintViewBox.x || vb.y !== lastPaintViewBox.y || vb.w !== lastPaintViewBox.w || vb.h !== lastPaintViewBox.h;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      const canvasSizeChanged = canvas.width !== width || canvas.height !== height;
      const paintVersion = paintVersionRef.current;
      const dataChanged = paintVersion !== lastPaintVersion;
      // Throttle adaptativo: con muchos aviones bajamos los FPS para evitar lag (LOD temporal).
      // El canvas ya usa LOD en alta densidad; 15 FPS (66 ms) hacía visible cada paso.
      const minIntervalMs = lastDotCount > 3000 ? 50 : lastDotCount > 1400 ? 33 : 16;
      const minClockDeltaMs = lastDotCount > 1400 ? 30 : 15;
      if (!viewChanged && !canvasSizeChanged && !dataChanged && wallMs - lastPaintWallMs < minIntervalMs) return;
      if (!viewChanged && !canvasSizeChanged && !dataChanged && Number.isFinite(lastPaintClockMs) && Math.abs(nowMs - lastPaintClockMs) < minClockDeltaMs) return;
      lastPaintWallMs = wallMs;
      lastPaintClockMs = nowMs;
      lastPaintViewBox = vb;
      lastPaintVersion = paintVersion;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const selectedFlightId = selectedFlightIdRef.current;
      const dots = buildActiveFlightDots(
        nowMs,
        flightPlanGeometryRef.current,
        maxFlightDurationRef.current,
        activeFlightBagsByIdRef.current,
        utFilterRef.current,
        selectedFlightId,
        mapDensityRef.current,
        cancelledFlightIdsRef.current,
      );

      if (dots.length === 0) {
        flightHitTargetsRef.current = [];
        flightCountsRef.current = { visible: 0, loaded: 0 };
        const shouldPreserveLastPaint = hasPaintedFlights
          && !viewChanged
          && !canvasSizeChanged
          && !dataChanged
          && flightPlanGeometryRef.current.length > 0;
        if (!shouldPreserveLastPaint) {
          hasPaintedFlights = false;
          ctx.clearRect(0, 0, rect.width, rect.height);
        }
        return;
      }

      const toCanvasX = (x: number) => (x - vb.x) / vb.w * rect.width;
      const toCanvasY = (y: number) => (y - vb.y) / vb.h * rect.height;
      const pad = Math.max(vb.w, vb.h) * 0.08;
      const vx0 = vb.x - pad, vx1 = vb.x + vb.w + pad;
      const vy0 = vb.y - pad, vy1 = vb.y + vb.h + pad;
      const visibleDots = dots.filter(dot => dot.cx >= vx0 && dot.cx <= vx1 && dot.cy >= vy0 && dot.cy <= vy1);
      const canvasZoomLevel = BASE_W / vb.w;
      const routeWidthScale = Math.min(1.7, 1 + Math.max(0, canvasZoomLevel - 1) * 0.16);
      const onlyLoadedColors = visibleDots.filter(d => d.hasBags).map(d => d.color);
      const routeColors = [...new Set(onlyLoadedColors)];

      ctx.clearRect(0, 0, rect.width, rect.height);
      if (visibleDots.length === 0) {
        hasPaintedFlights = false;
        flightHitTargetsRef.current = [];
        flightCountsRef.current = { visible: 0, loaded: 0 };
        return;
      }

      // LOD: con muchos aviones y poco zoom dibujamos rectángulos pequeños agrupados por color
      // (sin save/rotate por avión) — mucho más barato y elimina el lag. No se oculta ningún
      // vuelo (solo cambia el LOD visual). En modo denso también se omiten las estelas.
      const denseMode = visibleDots.length > 1400 && canvasZoomLevel < 2;

      // Estelas finas solo de las UTs con carga y cuando NO estamos en modo denso (perf).
      if (showRoutesRef.current && !denseMode && routeColors.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([3, 6]);
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 0.6 * routeWidthScale;
        for (const color of routeColors) {
          ctx.strokeStyle = color;
          drawRouteBatch(ctx, visibleDots, color, toCanvasX, toCanvasY);
        }
        ctx.restore();
      }

      const selectedBaseFlightId = selectedFlightId?.replace(/-D\d+$/, '') ?? null;
      const isSelectedDot = (dot: FlightDot) => selectedBaseFlightId != null
        && (dot.flightId === selectedFlightId || dot.flightId.replace(/-D\d+$/, '') === selectedBaseFlightId);
      const hitTargets: FlightHitTarget[] = [];
      let loadedCount = 0;
      if (denseMode) {
        const byColor = new Map<string, FlightDot[]>();
        for (const dot of visibleDots) {
          let arr = byColor.get(dot.color);
          if (!arr) { arr = []; byColor.set(dot.color, arr); }
          arr.push(dot);
          if (dot.hasBags) loadedCount += 1;
        }
        for (const [color, ds] of byColor) {
          ctx.fillStyle = color;
          for (const dot of ds) {
            const x = toCanvasX(dot.cx);
            const y = toCanvasY(dot.cy);
            const s = dot.hasBags ? 3.2 : 2.4;
            ctx.globalAlpha = dot.hasBags ? 0.95 : 0.58;
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
            if (dot.hasBags || isSelectedDot(dot)) hitTargets.push({ x, y, dot });
          }
        }
        ctx.globalAlpha = 1;
      } else {
        for (const dot of visibleDots) {
          const x = toCanvasX(dot.cx);
          const y = toCanvasY(dot.cy);
          drawPlaneMarker(ctx, x, y, dot.angle, dot.color, dot.hasBags, false, canvasZoomLevel);
          if (dot.hasBags) loadedCount += 1;
          if (dot.hasBags || isSelectedDot(dot)) hitTargets.push({ x, y, dot });
        }
      }
      lastDotCount = visibleDots.length;
      hasPaintedFlights = true;
      flightHitTargetsRef.current = hitTargets;
      flightCountsRef.current = { visible: visibleDots.length, loaded: loadedCount };
    };

    frameId = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frameId);
      flightHitTargetsRef.current = [];
    };
  }, [hasBackendFlightData, simClockRef]);

  // Sincroniza el contador de vuelos dibujados a estado React (baja frecuencia).
  useEffect(() => {
    if (!hasBackendFlightData) {
      setFlightCounts({ visible: 0, loaded: 0 });
      return;
    }
    const id = window.setInterval(() => {
      setFlightCounts(prev => {
        const c = flightCountsRef.current;
        return prev.visible === c.visible && prev.loaded === c.loaded ? prev : { ...c };
      });
    }, 800);
    return () => window.clearInterval(id);
  }, [hasBackendFlightData]);

  // Flight SVG paths
  const flightPaths = useMemo(() => {
    if (!shouldShowStaticFallback) return [];
    return flights.map(f => {
      const origin = airports.find(a => a.id === f.from);
      const dest = airports.find(a => a.id === f.to);
      if (!origin || !dest) return null;
      const [fx, fy] = project(origin.coords[0], origin.coords[1]);
      const [tx, ty] = project(dest.coords[0], dest.coords[1]);
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;
      const dx = tx - fx; const dy = ty - fy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const curve = dist * 0.12;
      const cpx = mx - (dy / dist) * curve;
      const cpy = my + (dx / dist) * curve;
      const pathD = `M ${fx} ${fy} Q ${cpx} ${cpy} ${tx} ${ty}`;
      return { ...f, pathD, midX: cpx, midY: cpy, origin, dest };
    }).filter((f): f is NonNullable<typeof f> => f !== null);
  }, [flights, airports, shouldShowStaticFallback]);

  // Shipment paths and current positions
  const shipmentData = useMemo(() => {
    if (!shouldShowStaticFallback) return [];
    return shipments.map(s => {
      const origin = airports.find(a => a.id === s.origin);
      const dest = airports.find(a => a.id === s.destination);
      if (!origin || !dest || s.progress >= 1) return null;
      const [fx, fy] = project(origin.coords[0], origin.coords[1]);
      const [tx, ty] = project(dest.coords[0], dest.coords[1]);
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;
      const dx = tx - fx; const dy = ty - fy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const curve = dist * 0.12;
      const cpx = mx - (dy / dist) * curve;
      const cpy = my + (dx / dist) * curve;
      const pathD = `M ${fx} ${fy} Q ${cpx} ${cpy} ${tx} ${ty}`;
      const t = s.progress;
      const cx = (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * cpx + t * t * tx;
      const cy = (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * cpy + t * t * ty;
      const angle = Math.atan2(2 * (1 - t) * (cpy - fy) + 2 * t * (ty - cpy), 2 * (1 - t) * (cpx - fx) + 2 * t * (tx - cpx)) * (180 / Math.PI);
      return { ...s, svgPos: [cx, cy] as [number, number], pathD, angle, originPos: [fx, fy] as [number, number], destPos: [tx, ty] as [number, number] };
    }).filter((s): s is (Shipment & { svgPos: [number, number]; pathD: string; angle: number; originPos: [number, number]; destPos: [number, number] }) => s !== null);
  }, [shipments, airports, shouldShowStaticFallback]);

  // ── Tooltips ───────────────────────────────────────────────────────────
  const makeAirportTooltip = useCallback((airport: Airport) => {
    const pct = getOccupancyPercent(airport.occupancy, airport.capacity);
    const color = getStatusColor(airport.status);
    return (
      <div style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: '#E2E8F8' }}>{airport.id}</span>
          <span style={{ color: '#6080A0', fontSize: 10 }}>{airport.city}</span>
        </div>
        <div style={{ fontSize: 11, color: '#A8C0E0', marginBottom: 2 }}>{airport.name}</div>
        <div style={{ fontSize: 11, color: '#6080A0' }}>{airport.country}</div>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1E3058' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#6080A0' }}>Almacén</span>
            <span style={{ color, fontWeight: 600 }}>{airport.occupancy}/{airport.capacity} ({pct}%)</span>
          </div>
        </div>
      </div>
    );
  }, []);

  const makeFlightTooltip = (flight: Flight) => {
    const loadPct = Math.round((flight.load / flight.capacity) * 100);
    const color = getStatusColor(flight.status);
    return (
      <div style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: '#E2E8F8' }}>{flight.flightNumber}</span>
          {flight.isReplanned && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#A855F7' }}>
              Replanificado
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#A8C0E0' }}>{flight.airline}</div>
        <div style={{ fontSize: 11, color: '#6080A0', marginTop: 4 }}>{flight.from} → {flight.to}</div>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1E3058' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: '#6080A0' }}>Capacidad</span>
            <span style={{ color, fontWeight: 600 }}>{flight.load}/{flight.capacity} ({loadPct}%)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#6080A0' }}>Sale</span>
            <span style={{ color: '#C8D8F0' }}>{flight.departureTime}</span>
          </div>
        </div>
      </div>
    );
  };

  const makeShipmentTooltip = (s: Shipment) => {
    const color = getStatusColor(s.status);
    return (
      <div style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: '#E2E8F8' }}>{s.id}</span>
          {s.isReplanned && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#A855F7' }}>
              Redirigido
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#A8C0E0' }}>{s.airline}</div>
        <div style={{ fontSize: 11, color: '#6080A0', marginTop: 4 }}>{s.origin} → {s.destination}</div>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1E3058' }}>
          {[
            { label: 'Equipaje', value: `${s.luggageCount} maletas`, vc: '#C8D8F0' },
            { label: 'Progreso', value: `${Math.round(s.progress * 100)}%`, vc: '#C8D8F0' },
            { label: 'Estado', value: s.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()), vc: color },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: '#6080A0' }}>{r.label}</span>
              <span style={{ color: r.vc, fontWeight: 500 }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!tooltip?.airportId) return;
    const airport = airportPositions.find(a => a.id === tooltip.airportId);
    if (!airport) {
      setTooltip(null);
      return;
    }
    setTooltip(prev => prev?.airportId === airport.id
      ? { ...prev, content: makeAirportTooltip(airport) }
      : prev
    );
  }, [airportPositions, makeAirportTooltip, tooltip?.airportId]);

  const viewBoxStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;
  const zoomLevel = BASE_W / viewBox.w;
  const showLabels = zoomLevel > 1.2;
  const showWarehouseBars = zoomLevel > 1.8;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: '#040814', cursor: dragRef.current ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleMapClick}
    >
      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Defs: gradients and filters */}
        <defs>
          {/* Ocean radial gradient */}
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#081428" />
            <stop offset="50%" stopColor="#050A18" />
            <stop offset="100%" stopColor="#020410" />
          </radialGradient>

          {/* Continent gradient */}
          <linearGradient id="continentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#122040" />
            <stop offset="100%" stopColor="#0C1830" />
          </linearGradient>

          {/* Continent hover gradient */}
          <linearGradient id="continentHoverGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#182E55" />
            <stop offset="100%" stopColor="#101E3D" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Stronger glow for critical */}
          <filter id="glowStrong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ocean background with gradient */}
        <rect data-map-bg="1" x="-5000" y="-5000" width="15000" height="15000" fill="url(#oceanGrad)" />

        {/* Subtle dot pattern on ocean */}
        <pattern id="oceanDots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.3" fill="#0A1430" opacity="0.5" />
        </pattern>
        <rect data-map-bg="1" x="-5000" y="-5000" width="15000" height="15000" fill="url(#oceanDots)" />

        {/* Graticule */}
        <GraticuleLines />

        {/* Continent fills from TopoJSON */}
        {countryLayers}

        {/* ── Route Lines (fallback estático: solo cuando no hay datos del backend) ── */}
        {toggles.showRoutes && shouldShowStaticFallback && flightPaths.map(f => {
          const isSelected = selectedEntity?.type === 'flight' && selectedEntity.id === f.id;
          const color = getRouteColor(f.status, f.isReplanned);

          return (
            <g key={f.id}>
              {/* Glow layer */}
              {(isSelected || f.status === 'critical') && (
                <path d={f.pathD} stroke={color} strokeWidth={isSelected ? 8 : 5}
                  strokeOpacity={0.12} fill="none" style={{ pointerEvents: 'none' }} filter="url(#glow)" />
              )}
              {/* Hit area */}
              <path
                d={f.pathD} stroke="transparent" strokeWidth={10} fill="none"
                style={{ cursor: 'pointer' }}
                data-interactive="true"
                onClick={(e) => { e.stopPropagation(); onSelectFlight(f.id); }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: makeFlightTooltip(f) });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* Visible line */}
              <path d={f.pathD} stroke={color}
                strokeWidth={isSelected ? 2 : 1}
                strokeOpacity={isSelected ? 1 : 0.65}
                fill="none" style={{ pointerEvents: 'none' }} />
            </g>
          );
        })}

        {toggles.showRoutes && selectedFlightGeometry && (
          <g style={{ pointerEvents: 'none' }}>
            <path
              d={selectedFlightGeometry.pathD}
              stroke="#4DA6FF"
              strokeWidth={3.5}
              strokeOpacity={0.16}
              fill="none"
              filter="url(#glow)"
            />
            <path
              d={selectedFlightGeometry.pathD}
              stroke="#4DA6FF"
              strokeWidth={1.15}
              strokeOpacity={0.95}
              fill="none"
              strokeDasharray="5 5"
            />
          </g>
        )}

        {/* Rutas planificadas del filtro (mapa filtrado a pocas UTs): muestra la ruta
            aunque la UT no esté EN VUELO ahora, para que nunca "no salga nada". */}
        {toggles.showRoutes && !selectedFlightGeometry && flightPlanGeometry.length > 0 && flightPlanGeometry.length <= 30 && (
          <g style={{ pointerEvents: 'none' }}>
            {flightPlanGeometry.map(f => (
              <g key={`route-${f.flightId}`}>
                <path d={f.pathD} stroke="#4DA6FF" strokeWidth={1.1} strokeOpacity={0.8} fill="none" strokeDasharray="5 5" />
                <circle cx={f.ox} cy={f.oy} r={2.5} fill="#4DA6FF" />
                <circle cx={f.dx} cy={f.dy} r={2.5} fill="#00FF9C" />
              </g>
            ))}
          </g>
        )}

        {/* ── Vuelos backend en canvas: evita miles de nodos SVG por frame ── */}
        {hasBackendFlightData && (
          <foreignObject
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.w}
            height={viewBox.h}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <canvas
              ref={flightCanvasRef}
              style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
            />
          </foreignObject>
        )}

        {/* ── Ruta completa del ENVÍO seleccionado (todos sus sub-lotes y tramos) ──
            Requisito día a día: "se selecciona un envío y se debe mostrar en el mapa todas
            las rutas del envío de manera gráfica". Un envío dividido por capacidad tiene
            varios sub-lotes con rutas propias — se dibujan TODAS, un color por sub-lote.
            Aplica a los 3 escenarios. Se dibuja DESPUÉS del canvas para quedar encima. */}
        {toggles.showRoutes && selectedShipmentGeometry && (
          <g style={{ pointerEvents: 'none' }}>
            {selectedShipmentGeometry.sublots.map(sublot => (
              <g key={sublot.shipmentId}>
                {sublot.legs.map(leg => (
                  <g key={leg.key}>
                    {/* Halo del tramo */}
                    <path
                      d={leg.pathD}
                      stroke={sublot.color}
                      strokeWidth={3.5}
                      strokeOpacity={0.18}
                      fill="none"
                      filter="url(#glow)"
                    />
                    {/* Trazo del tramo (animado para indicar dirección de avance) */}
                    <path
                      d={leg.pathD}
                      stroke={sublot.color}
                      strokeWidth={1.2}
                      strokeOpacity={0.95}
                      fill="none"
                      strokeDasharray="6 4"
                    >
                      <animate attributeName="stroke-dashoffset" values="20;0" dur="1.2s" repeatCount="indefinite" />
                    </path>
                    {/* Origen del viaje (solo primer tramo) */}
                    {leg.isFirst && (
                      <circle cx={leg.ox} cy={leg.oy} r={3} fill="#4DA6FF" stroke="#040814" strokeWidth={0.8} />
                    )}
                    {/* Escala intermedia (destino de tramo no final) */}
                    {!leg.isLast && (
                      <circle cx={leg.dx} cy={leg.dy} r={2.4} fill="#FFC857" stroke="#040814" strokeWidth={0.8} />
                    )}
                    {/* Destino final del sub-lote */}
                    {leg.isLast && (
                      <g transform={`translate(${leg.dx},${leg.dy})`}>
                        <circle r={3.4} fill={sublot.color} opacity={0.25}>
                          <animate attributeName="r" values="3.4;7;3.4" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.3;0;0.3" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                        <circle r={3} fill={sublot.color} stroke="#040814" strokeWidth={0.8} />
                      </g>
                    )}
                  </g>
                ))}
              </g>
            ))}
            {/* Leyenda compacta cuando hay varios sub-lotes: id y maletas por color */}
            {selectedShipmentGeometry.sublots.length > 1 && (
              <g transform={`translate(${viewBox.x + 10}, ${viewBox.y + 12})`}>
                {selectedShipmentGeometry.sublots.map((sublot, i) => (
                  <g key={`legend-${sublot.shipmentId}`} transform={`translate(0, ${i * 9})`}>
                    <line x1={0} y1={0} x2={10} y2={0} stroke={sublot.color} strokeWidth={1.5} strokeDasharray="4 2" />
                    <text x={13} y={2.5} fontSize={6.5} fill="#C8D8F0" style={{ userSelect: 'none' }}>
                      {sublot.shipmentId} · {sublot.quantity} maletas
                    </text>
                  </g>
                ))}
              </g>
            )}
          </g>
        )}

        {/* ── Airport Markers (fallback estático o con datos reales del backend) ── */}
        {(shouldShowStaticFallback || hasBackendFlightData) && airportPositions.map(a => {
          const isSelected = selectedEntity?.type === 'airport' && selectedEntity.id === a.id;
          const color = getStatusColor(a.status);
          const [px, py] = a.svgPos;
          const pct = getOccupancyPercent(a.occupancy, a.capacity);
          const isCritical = a.status === 'critical';
          const isWarning = a.status === 'warning';
          // Almacén ~50% más pequeño que el punto anterior (5 / 3.8 → 2.6 / 1.9).
          const r = isSelected ? 2.6 : 1.9;
          // Glifo de almacén (casa/edificio) en lugar de un punto.
          const gw = r * 1.35;                 // semi-ancho
          const eave = -r * 0.25;              // alero
          const peak = -r * 1.3;               // cumbre del techo
          const base = r * 1.05;               // base
          const warehousePath = `M ${-gw} ${eave} L 0 ${peak} L ${gw} ${eave} L ${gw} ${base} L ${-gw} ${base} Z`;

          return (
            <g
              key={a.id}
              transform={`translate(${px},${py})`}
              style={{ cursor: 'pointer' }}
              data-interactive="true"
              onClick={(e) => { e.stopPropagation(); onSelectAirport(a.id); }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: makeAirportTooltip(a), airportId: a.id });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Critical pulsing glow */}
              {isCritical && toggles.showCongestion && (
                <>
                  <circle r={6} fill="none" stroke={color} strokeWidth={0.8} opacity={0.5} filter="url(#glowStrong)">
                    <animate attributeName="r" values="6;18;6" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle r={4} fill={color} opacity={0.1}>
                    <animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.12;0;0.12" dur="2s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {/* Warning pulse */}
              {isWarning && toggles.showCongestion && (
                <circle r={7} fill={color} opacity={0.08}>
                  <animate attributeName="r" values="5;11;5" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.1;0;0.1" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Selected ring */}
              {isSelected && (
                <circle r={r + 4} fill="none" stroke={color} strokeWidth={1.2} opacity={0.7} filter="url(#glow)" />
              )}
              {/* Halo de visibilidad */}
              <circle r={r + 2} fill={color} opacity={0.16} />
              {/* Glifo de almacén (edificio con techo) coloreado por semáforo */}
              <path d={warehousePath} fill={color} stroke="#040814" strokeWidth={0.7} strokeLinejoin="round" />
              {/* Puerta del almacén */}
              <rect x={-gw * 0.32} y={base - r * 0.8} width={gw * 0.64} height={r * 0.8} fill="#040814" opacity={0.55} rx={0.25} />
              {/* Airport label */}
              {showLabels && (
                <text
                  textAnchor="middle"
                  y={-(r + 4)}
                  style={{
                    fill: isSelected ? color : '#7090B8',
                    fontSize: isSelected ? 6 : 5,
                    fontFamily: 'monospace',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  {a.id}
                </text>
              )}
              {/* Warehouse capacity bar */}
              {showWarehouseBars && toggles.showWarehouseCapacity && showLabels && (
                <g transform="translate(-8,5)">
                  <rect width={16} height={2.5} rx={1} fill="#081225" />
                  <rect width={16 * Math.min(pct / 100, 1)} height={2.5} rx={1}
                    fill={color} opacity={0.85} />
                </g>
              )}
            </g>
          );
        })}

        {/* ── Shipment Airplanes (fallback estático: solo cuando no hay datos del backend) ── */}
        {shouldShowStaticFallback && shipmentData.map(s => {
          const isSelected = selectedEntity?.type === 'shipment' && selectedEntity.id === s.id;
          const color = getStatusColor(s.status);
          const [px, py] = s.svgPos;

          return (
            <g
              key={s.id}
              transform={`translate(${px},${py}) rotate(${s.angle + 90})`}
              style={{ cursor: 'pointer' }}
              data-interactive="true"
              onClick={(e) => { e.stopPropagation(); onSelectShipment(s.id); }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: makeShipmentTooltip(s) });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Glow for critical/delayed */}
              {(s.status === 'critical' || isSelected) && (
                <circle r={8} fill={color} opacity={0.12} filter="url(#glow)" />
              )}
              {/* Airplane icon */}
              <g transform="scale(0.35)">
                <path
                  d="M21,16V14L13,9V3.5A1.5,1.5,0,0,0,10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5Z"
                  fill={color}
                  stroke="#040814"
                  strokeWidth={1.5}
                  opacity={0.9}
                />
              </g>
            </g>
          );
        })}

      </svg>

      {/* Barra de filtro rápida del mapa (MAP-REG-05) — sincronizada con el panel (utFilter).
          Permite alternar Todos / Con carga / Vacías sin abrir el panel derecho. */}
      {hasBackendFlightData && (
        <div
          data-interactive="true"
          onMouseDown={e => e.stopPropagation()}
          onMouseEnter={() => setMapFiltersOpen(true)}
          onMouseLeave={() => setMapFiltersOpen(false)}
          className="absolute bottom-5 left-4 flex flex-col gap-1.5"
          style={{ zIndex: 20 }}
        >
         {mapFiltersOpen && (<>
          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ background: 'rgba(10,20,45,0.92)', border: '1px solid #1E3058', backdropFilter: 'blur(6px)' }}
            title="Filtro de UTs por semáforo (% de carga)"
          >
            <span className="text-[9px] text-[#4A6080] px-1" style={{ letterSpacing: '0.08em' }}>UT</span>
            {([
              { id: 'all', label: 'Todos', c: '#A8C0E0' },
              { id: 'empty', label: 'Vacío', c: '#5E7699' },
              { id: 'normal', label: 'Normal', c: '#4ADE80' },
              { id: 'warning', label: 'Adv.', c: '#FFC857' },
              { id: 'critical', label: 'Crít.', c: '#FF4D4D' },
            ] as { id: string; label: string; c: string }[]).map(opt => {
              const active = utFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onUtFilterChange?.(opt.id)}
                  className="h-6 px-2 rounded-md text-[10px] transition-colors flex items-center gap-1"
                  style={{
                    fontWeight: active ? 700 : 500,
                    color: active ? '#0A1628' : '#A8C0E0',
                    background: active ? opt.c : 'transparent',
                  }}
                >
                  {opt.id !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#0A1628' : opt.c }} />}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {/* Semáforo de almacenes: filtra los puntos de aeropuerto por estado (incl. vacío). */}
          {onWarehouseFilterChange && (
            <div
              className="flex items-center gap-1 p-1 rounded-lg"
              style={{ background: 'rgba(10,20,45,0.92)', border: '1px solid #1E3058', backdropFilter: 'blur(6px)' }}
              title="Filtro de almacenes por semáforo"
            >
              <span className="text-[9px] text-[#4A6080] px-1" style={{ letterSpacing: '0.08em' }}>ALM.</span>
              {([
                { id: 'all', label: 'Todos', c: '#A8C0E0' },
                { id: 'empty', label: 'Vacío', c: '#4A6080' },
                { id: 'normal', label: 'Normal', c: '#00FF9C' },
                { id: 'warning', label: 'Adv.', c: '#FFC857' },
                { id: 'critical', label: 'Crít.', c: '#FF4D4D' },
              ] as { id: string; label: string; c: string }[]).map(opt => {
                const active = warehouseFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => onWarehouseFilterChange(opt.id)}
                    className="h-6 px-2 rounded-md text-[10px] transition-colors flex items-center gap-1"
                    style={{
                      fontWeight: active ? 700 : 500,
                      color: active ? '#0A1628' : '#A8C0E0',
                      background: active ? opt.c : 'transparent',
                    }}
                  >
                    {opt.id !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#0A1628' : opt.c }} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
          {/* Densidad de render: cuántos vuelos vacíos dibujar (las cargadas siempre se ven). */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ background: 'rgba(10,20,45,0.92)', border: '1px solid #1E3058', backdropFilter: 'blur(6px)' }}
            title="Densidad de aviones en el mapa (para fluidez). Las UTs con carga siempre se muestran."
          >
            <span className="text-[9px] text-[#4A6080] px-1" style={{ letterSpacing: '0.08em' }}>DENSIDAD</span>
            {([
              { v: 1, label: '100%' },
              { v: 0.5, label: '50%' },
              { v: 0.25, label: '25%' },
            ] as { v: number; label: string }[]).map(opt => {
              const active = mapDensity === opt.v;
              return (
                <button
                  key={opt.label}
                  onClick={() => setMapDensity(opt.v)}
                  className="h-6 px-2 rounded-md text-[10px] transition-colors"
                  style={{
                    fontWeight: active ? 700 : 500,
                    color: active ? '#0A1628' : '#A8C0E0',
                    background: active ? '#4DA6FF' : 'transparent',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
         </>)}
          {/* Asa siempre visible: muestra/oculta los filtros al pasar el mouse. Incluye el contador. */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] self-start"
            style={{ background: 'rgba(10,20,45,0.92)', border: `1px solid ${mapFiltersOpen ? '#4DA6FF55' : '#1E3058'}` }}
            title="Pasa el mouse para mostrar/ocultar los filtros del mapa (UT · almacenes · densidad)"
          >
            <span style={{ color: mapFiltersOpen ? '#4DA6FF' : '#7090B0', fontWeight: 600 }}>⚙ Filtros</span>
            <span className="font-mono" style={{ color: '#7090B0' }}>· ✈ {flightCounts.visible} en vuelo · {flightCounts.loaded} con carga</span>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 800) - 220),
            top: Math.max(tooltip.y - 10, 8),
          }}
        >
          <div style={{
            background: 'rgba(6, 14, 32, 0.97)',
            border: '1px solid #1E3058',
            borderRadius: 12,
            padding: '10px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            fontSize: 12,
            color: '#C8D8F0',
          }}>
            {tooltip.content}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-5 right-4 flex flex-col gap-1.5">
        {[
          { label: '+', action: zoomIn },
          { label: '−', action: zoomOut },
        ].map(btn => (
          <button
            key={btn.label}
            data-interactive="true"
            onMouseDown={e => e.stopPropagation()}
            onClick={btn.action}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(10,20,45,0.92)',
              border: '1px solid #1E3058',
              color: '#A8C0E0', fontSize: 18, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {btn.label}
          </button>
        ))}
        <button
          data-interactive="true"
          onMouseDown={e => e.stopPropagation()}
          onClick={resetView}
          title="Centrar aeropuertos"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(10,20,45,0.92)',
            border: '1px solid #1E3058',
            color: '#A8C0E0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <LocateFixed size={14} />
        </button>
        {onToggleExpanded && (
          <button
            data-interactive="true"
            onMouseDown={e => e.stopPropagation()}
            onClick={onToggleExpanded}
            title={isExpanded ? 'Salir de vista amplia' : 'Expandir mapa'}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: isExpanded ? 'rgba(77,166,255,0.22)' : 'rgba(10,20,45,0.92)',
              border: '1px solid #1E3058',
              color: isExpanded ? '#4DA6FF' : '#A8C0E0', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3" style={{ fontSize: 9, color: '#1A3055', letterSpacing: '0.15em', pointerEvents: 'none', userSelect: 'none' }}>
        SKYTRACK RED LOGÍSTICA GLOBAL · {zoomLevel.toFixed(1)}× ZOOM
      </div>
    </div>
  );
}

export const WorldMap = React.memo(WorldMapComponent);
