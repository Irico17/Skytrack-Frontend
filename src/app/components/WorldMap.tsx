import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { feature } from 'topojson-client';
import { LocateFixed, Maximize2, Minimize2 } from 'lucide-react';
import {
  Airport, Flight, Shipment,
  getStatusColor, getRouteColor, getOccupancyPercent
} from '../data/mockData';
import type { BackendActiveFlight, BackendFlightPlanFlight } from '../types/backend';

const GEO_JSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

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

interface FlightFilterState {
  showSlaOk: boolean;
  showSlaFail: boolean;
  showEmpty: boolean;
}

type ActiveFlightBags = Map<string, { bagsCount: number; meetsSla: boolean }>;

interface PlannedFlightGeometry {
  flightId: string;
  originId: string;
  destinationId: string;
  dep: number;
  arr: number;
  duration: number;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  cpx: number;
  cpy: number;
  pathD: string;
}

interface WorldMapProps {
  airports: Airport[];
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
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

// ── Equirectangular projection ──────────────────────────────────────────────
const BASE_W = 1000;
const BASE_H = 520;

function project(lng: number, lat: number): [number, number] {
  const x = ((lng + 180) / 360) * BASE_W;
  const y = ((90 - lat) / 180) * BASE_H;
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

function buildActiveFlightDots(
  now: number,
  flightPlanGeometry: PlannedFlightGeometry[],
  maxFlightDuration: number,
  activeFlightBagsById: ActiveFlightBags,
  flightFilter: FlightFilterState,
  selectedFlightId?: string | null,
): FlightDot[] {
  if (flightPlanGeometry.length === 0) return [];

  const dots: FlightDot[] = [];
  const selectedBaseFlightId = selectedFlightId?.replace(/-D\d+$/, '') ?? null;
  const startIndex = lowerBoundDeparture(flightPlanGeometry, now - maxFlightDuration);
  const endIndex = upperBoundDeparture(flightPlanGeometry, now);

  for (let i = startIndex; i < endIndex; i += 1) {
    const f = flightPlanGeometry[i];
    if (now > f.arr) continue;

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
    if (hasBags && meetsSla && !flightFilter.showSlaOk) continue;
    if (hasBags && !meetsSla && !flightFilter.showSlaFail) continue;
    if (!hasBags && !flightFilter.showEmpty && !isSelectedFlight) continue;

    const color = hasBags ? (meetsSla ? '#4DA6FF' : '#FFC857') : '#3A4A5E';

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
    ctx.moveTo(toCanvasX(dot.ox), toCanvasY(dot.oy));
    ctx.quadraticCurveTo(
      toCanvasX(dot.cpx), toCanvasY(dot.cpy),
      toCanvasX(dot.dx), toCanvasY(dot.dy),
    );
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
  const zoomBoost = hasBags
    ? Math.min(2.05, 1.12 + Math.max(0, zoomLevel - 1) * 0.32)
    : Math.min(1.82, 1.1 + Math.max(0, zoomLevel - 1) * 0.26);

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
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -3.1);
    ctx.lineTo(1.15, 1.9);
    ctx.lineTo(0, 1.25);
    ctx.lineTo(-1.15, 1.9);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.globalAlpha = 0.42;
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
  airports, flights, shipments, selectedEntity,
  onSelectAirport, onSelectFlight, onSelectShipment, toggles,
  simClock, simClockRef, activeFlights = [], flightPlanFlights = [],
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
  const [flightFilter, setFlightFilter] = useState<FlightFilterState>({
    showSlaOk: true,
    showSlaFail: true,
    showEmpty: false,
  });

  const makeCanvasFlightTooltip = useCallback((dot: FlightDot) => (
    <div style={{ minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot.color }} />
        <span style={{ fontWeight: 700, color: '#E2E8F8', fontSize: 12 }}>{dot.flightId}</span>
      </div>
      <div style={{ fontSize: 11, color: '#A8C0E0' }}>{dot.originId} → {dot.destinationId}</div>
      <div style={{ fontSize: 11, color: '#6080A0', marginTop: 4 }}>Maletas: {dot.bagsCount}</div>
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
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        content: makeCanvasFlightTooltip(hit.dot),
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
    const targetRatio = BASE_W / BASE_H;
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
      x: Math.max(-40, Math.min(centeredX, BASE_W - w + 40)),
      y: Math.max(-30, Math.min(centeredY, BASE_H - h + 30)),
      w: Math.min(w, BASE_W),
      h: Math.min(h, BASE_H),
    });
  }, [airports]);

  // Airport SVG positions (lookup map)
  const airportById = useMemo(() => {
    const m: Record<string, Airport & { svgPos: [number, number] }> = {};
    airports.forEach(a => { m[a.id] = { ...a, svgPos: project(a.coords[0], a.coords[1]) }; });
    return m;
  }, [airports]);

  const airportGeometryKey = useMemo(() =>
    airports.map(a => `${a.id}:${a.coords[0]}:${a.coords[1]}`).join('|'),
    [airports]
  );

  const airportGeometryById = useMemo(() => {
    const m: Record<string, { svgPos: [number, number] }> = {};
    airports.forEach(a => { m[a.id] = { svgPos: project(a.coords[0], a.coords[1]) }; });
    return m;
  }, [airportGeometryKey]);

  // Airport SVG positions array for rendering
  const airportPositions = useMemo(() =>
    airports.map(a => ({ ...a, svgPos: project(a.coords[0], a.coords[1]) })),
    [airports]
  );

  const countryLayers = useMemo(() => geoFeatures.map((geo: any, i: number) => {
    if (!geo.geometry || !geo.geometry.coordinates) return null;
    const coords = geo.geometry.type === 'Polygon'
      ? [geo.geometry.coordinates]
      : geo.geometry.coordinates;
    const isHovered = hoveredCountry === geo.id;

    return (
      <g
        key={`${geo.id}-${i}`}
        style={{ pointerEvents: 'none' }}
      >
        {coords.map((ringSet: any, ri: number) =>
          ringSet.map((ring: number[][], ri2: number) => {
            const pathSegments: string[] = [];
            for (let j = 0; j < ring.length; j += 1) {
              const point = ring[j];
              const lng = point[0];
              const lat = point[1];
              if (lng !== undefined && lat !== undefined) {
                const [x, y] = project(lng, lat);
                pathSegments.push(`${j === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
              }
            }
            const d = `${pathSegments.join(' ')} Z`;
            return (
              <path
                key={`${ri}-${ri2}`}
                d={d}
                fill={isHovered ? 'url(#continentHoverGrad)' : 'url(#continentGrad)'}
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
    type FlightSource = { flightId: string; originId: string; destinationId: string; departureTime: string; arrivalTime: string };
    const source: FlightSource[] = geometryFlights;
    if (source.length === 0) return [];

    const geometry: PlannedFlightGeometry[] = [];

    for (const f of source) {
      const origin = airportGeometryById[f.originId];
      const dest   = airportGeometryById[f.destinationId];
      if (!origin || !dest) continue;

      const dep = new Date(f.departureTime).getTime();
      const arr = new Date(f.arrivalTime).getTime();
      const duration = arr - dep;
      if (duration <= 0) continue;

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
        dep, arr, duration, ox, oy, dx, dy, cpx, cpy,
        pathD: `M ${ox} ${oy} Q ${cpx} ${cpy} ${dx} ${dy}`,
      });
    }

    geometry.sort((a, b) => a.dep - b.dep);
    return geometry;
  }, [geometryFlights, airportGeometryById]);

  const selectedFlightGeometry = useMemo(() => {
    if (selectedEntity?.type !== 'flight') return null;
    const selectedId = selectedEntity.id;
    const selectedBaseId = selectedId.replace(/-D\d+$/, '');
    return flightPlanGeometry.find(f =>
      f.flightId === selectedId || f.flightId.replace(/-D\d+$/, '') === selectedBaseId
    ) ?? null;
  }, [selectedEntity, flightPlanGeometry]);

  useEffect(() => {
    if (!selectedEntity) return;
    const key = `${selectedEntity.type}:${selectedEntity.id}`;
    if (lastFocusedSelectionRef.current === key) return;
    lastFocusedSelectionRef.current = key;

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
      fitBounds(x, y, x, y, 55);
      return;
    }

    if (selectedFlightGeometry) {
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
      const shipment = shipments.find(s => s.id === selectedEntity.id);
      if (!shipment) return;
      const origin = airportById[shipment.origin];
      const dest = airportById[shipment.destination];
      if (!origin || !dest) return;
      fitBounds(
        Math.min(origin.svgPos[0], dest.svgPos[0]),
        Math.min(origin.svgPos[1], dest.svgPos[1]),
        Math.max(origin.svgPos[0], dest.svgPos[0]),
        Math.max(origin.svgPos[1], dest.svgPos[1]),
        50,
      );
    }
  }, [selectedEntity, airportById, selectedFlightGeometry, shipments]);

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
  const flightFilterRef = useRef(flightFilter);
  const selectedFlightIdRef = useRef<string | null>(null);
  const showRoutesRef = useRef(toggles.showRoutes);
  const paintVersionRef = useRef(0);

  fallbackClockRef.current = simClock;
  viewBoxRef.current = viewBox;
  flightPlanGeometryRef.current = flightPlanGeometry;
  maxFlightDurationRef.current = maxFlightDuration;
  activeFlightBagsByIdRef.current = activeFlightBagsById;
  flightFilterRef.current = flightFilter;
  selectedFlightIdRef.current = selectedEntity?.type === 'flight' ? selectedEntity.id : null;
  showRoutesRef.current = toggles.showRoutes;

  useEffect(() => {
    paintVersionRef.current += 1;
  }, [flightPlanGeometry, maxFlightDuration, activeFlightBagsById, flightFilter, toggles.showRoutes, selectedEntity]);

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
      if (!viewChanged && !canvasSizeChanged && !dataChanged && wallMs - lastPaintWallMs < 33) return;
      if (!viewChanged && !canvasSizeChanged && !dataChanged && Number.isFinite(lastPaintClockMs) && Math.abs(nowMs - lastPaintClockMs) < 15) return;
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
        flightFilterRef.current,
        selectedFlightId,
      );

      if (dots.length === 0) {
        flightHitTargetsRef.current = [];
        const filter = flightFilterRef.current;
        const allFlightCategoriesHidden = !filter.showSlaOk && !filter.showSlaFail && !filter.showEmpty;
        const shouldPreserveLastPaint = hasPaintedFlights
          && !allFlightCategoriesHidden
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
      const routeColors = ['#4DA6FF', '#FFC857'];

      ctx.clearRect(0, 0, rect.width, rect.height);
      if (visibleDots.length === 0) {
        hasPaintedFlights = false;
        flightHitTargetsRef.current = [];
        return;
      }

      if (showRoutesRef.current) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.035;
        ctx.lineWidth = 1.55 * routeWidthScale;
        for (const color of routeColors) {
          ctx.strokeStyle = color;
          drawRouteBatch(ctx, visibleDots, color, toCanvasX, toCanvasY);
        }

        ctx.setLineDash([4, 10]);
        ctx.globalAlpha = 0.64;
        ctx.lineWidth = 0.68 * routeWidthScale;
        for (const color of routeColors) {
          ctx.strokeStyle = color;
          drawRouteBatch(ctx, visibleDots, color, toCanvasX, toCanvasY);
        }
        ctx.restore();
      }

      const selectedBaseFlightId = selectedFlightId?.replace(/-D\d+$/, '') ?? null;
      const denseMode = visibleDots.length > 2500 && canvasZoomLevel < 1.7;
      const hitTargets: FlightHitTarget[] = [];
      for (const dot of visibleDots) {
        const x = toCanvasX(dot.cx);
        const y = toCanvasY(dot.cy);
        drawPlaneMarker(ctx, x, y, dot.angle, dot.color, dot.hasBags, denseMode, canvasZoomLevel);
        const isSelectedFlight = selectedBaseFlightId != null
          && (dot.flightId === selectedFlightId || dot.flightId.replace(/-D\d+$/, '') === selectedBaseFlightId);
        if (dot.hasBags || isSelectedFlight) hitTargets.push({ x, y, dot });
      }
      hasPaintedFlights = true;
      flightHitTargetsRef.current = hitTargets;
    };

    frameId = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frameId);
      flightHitTargetsRef.current = [];
    };
  }, [hasBackendFlightData, simClockRef]);

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

        {/* ── Airport Markers (fallback estático o con datos reales del backend) ── */}
        {(shouldShowStaticFallback || hasBackendFlightData) && airportPositions.map(a => {
          const isSelected = selectedEntity?.type === 'airport' && selectedEntity.id === a.id;
          const color = getStatusColor(a.status);
          const [px, py] = a.svgPos;
          const pct = getOccupancyPercent(a.occupancy, a.capacity);
          const isCritical = a.status === 'critical';
          const isWarning = a.status === 'warning';
          const r = isSelected ? 5 : 3.8;

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
              {/* Outer halo */}
              <circle r={r + 2} fill={color} opacity={0.18} />
              {/* Main dot */}
              <circle r={r} fill={color} stroke="#040814" strokeWidth={1} />
              {/* Center pinhole */}
              <circle r={1.2} fill="#040814" />
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
              {(showWarehouseBars || showWarehouseBars === false) && toggles.showWarehouseCapacity && showLabels && (
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

      {/* ── Flight filter panel ── */}
      <div
        data-interactive="true"
        onMouseDown={e => e.stopPropagation()}
        className="absolute z-10"
        style={{
          bottom: 30,
          left: 12,
          background: 'rgba(4,10,26,0.90)',
          border: '1px solid #1E3058',
          borderRadius: 10,
          padding: '8px 10px',
          backdropFilter: 'blur(6px)',
          minWidth: 164,
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 9, color: '#4A7098', marginBottom: 7, letterSpacing: '0.13em', fontWeight: 700, textTransform: 'uppercase' }}>
          Filtros de vuelos
        </div>
        {([
          { key: 'showSlaOk'   as const, color: '#4DA6FF', label: 'En ruta · cumple SLA' },
          { key: 'showSlaFail' as const, color: '#FFC857', label: 'En ruta · sin SLA' },
          { key: 'showEmpty'   as const, color: '#4A5E72', label: 'Sin carga asignada' },
        ] as { key: keyof typeof flightFilter; color: string; label: string }[]).map(({ key, color, label }) => (
          <div
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, cursor: 'pointer' }}
            onClick={() => setFlightFilter(prev => ({ ...prev, [key]: !prev[key] }))}
          >
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              border: `1.5px solid ${color}`,
              background: flightFilter[key] ? color : 'transparent',
              flexShrink: 0,
              transition: 'background 0.15s',
            }} />
            <span style={{ fontSize: 10, color: flightFilter[key] ? '#C8D8F0' : '#3A5070', transition: 'color 0.15s' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

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
