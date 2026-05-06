import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { feature } from 'topojson-client';
import {
  Airport, Flight, Shipment,
  getStatusColor, getRouteColor, interpolateCoords, getOccupancyPercent
} from '../data/mockData';

const GEO_JSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export interface SelectedEntity {
  type: 'airport' | 'flight' | 'shipment';
  id: string;
}

interface Tooltip {
  x: number;
  y: number;
  content: React.ReactNode;
}

interface Toggles {
  showRoutes: boolean;
  showWarehouseCapacity: boolean;
  showCongestion: boolean;
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
}

// ── Equirectangular projection ──────────────────────────────────────────────
const BASE_W = 1000;
const BASE_H = 520;

function project(lng: number, lat: number): [number, number] {
  const x = ((lng + 180) / 360) * BASE_W;
  const y = ((90 - lat) / 180) * BASE_H;
  return [x, y];
}

// ── Graticule (grid lines) ───────────────────────────────────────────────────
function GraticuleLines() {
  const lines: React.ReactNode[] = [];
  for (let lng = -180; lng <= 180; lng += 30) {
    const [x0, y0] = project(lng, 90);
    const [x1, y1] = project(lng, -90);
    lines.push(
      <line key={`lng${lng}`} x1={x0} y1={y0} x2={x1} y2={y1}
        stroke="#0E1E35" strokeWidth={0.5} />
    );
  }
  for (let lat = -60; lat <= 90; lat += 30) {
    const [x0] = project(-180, lat);
    const [x1] = project(180, lat);
    const [, y] = project(0, lat);
    lines.push(
      <line key={`lat${lat}`} x1={x0} y1={y} x2={x1} y2={y}
        stroke="#0E1E35" strokeWidth={0.5} />
    );
  }
  return <>{lines}</>;
}

// ── Main component ────────────────────────────────────────────────────────────
export function WorldMap({
  airports, flights, shipments, selectedEntity,
  onSelectAirport, onSelectFlight, onSelectShipment, toggles
}: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [geoFeatures, setGeoFeatures] = useState<any[]>([]);

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
    if (e.target !== svgRef.current && !(e.target as Element).closest('[data-map-bg]')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startVB: viewBox };
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startX) / rect.width * dragRef.current.startVB.w;
    const dy = (e.clientY - dragRef.current.startY) / rect.height * dragRef.current.startVB.h;
    const { startVB } = dragRef.current;
    setViewBox({ ...startVB, x: startVB.x - dx, y: startVB.y - dy });
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const zoomIn = () => setViewBox(vb => {
    const f = 0.7; const nx = vb.x + vb.w * (1 - f) / 2; const ny = vb.y + vb.h * (1 - f) / 2;
    return { x: nx, y: ny, w: Math.max(vb.w * f, 80), h: Math.max(vb.h * f, 40) };
  });
  const zoomOut = () => setViewBox(vb => {
    const f = 1.4; const nx = vb.x - vb.w * (f - 1) / 2; const ny = vb.y - vb.h * (f - 1) / 2;
    return { x: nx, y: ny, w: Math.min(vb.w * f, BASE_W * 2), h: Math.min(vb.h * f, BASE_H * 2) };
  });
  const resetView = () => setViewBox({ x: 0, y: 0, w: BASE_W, h: BASE_H });

  // Airport SVG positions
  const airportPositions = useMemo(() =>
    airports.map(a => ({ ...a, svgPos: project(a.coords[0], a.coords[1]) })),
    [airports]
  );

  // Flight SVG paths
  const flightPaths = useMemo(() =>
    flights.map(f => {
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
      return { ...f, pathD, midX: cpx, midY: cpy };
    }).filter((f): f is NonNullable<typeof f> => f !== null),
    [flights, airports]
  );

  // Shipment paths and current positions
  const shipmentData = useMemo(() => {
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
      // Current position along the curve
      const t = s.progress;
      const cx = (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * cpx + t * t * tx;
      const cy = (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * cpy + t * t * ty;
      // Direction angle for the airplane
      const angle = Math.atan2(2 * (1 - t) * (cpy - fy) + 2 * t * (ty - cpy), 2 * (1 - t) * (cpx - fx) + 2 * t * (tx - cpx)) * (180 / Math.PI);
      return { ...s, svgPos: [cx, cy] as [number, number], pathD, angle };
    }).filter((s): s is (Shipment & { svgPos: [number, number]; pathD: string; angle: number }) => s !== null);
  }, [shipments, airports]);

  // ── Tooltips ───────────────────────────────────────────────────────────
  const makeAirportTooltip = (airport: Airport) => {
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
  };

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
            { label: 'Equipaje', value: `${s.luggageCount} bolsas`, vc: '#C8D8F0' },
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

  const viewBoxStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;
  const zoomLevel = BASE_W / viewBox.w;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: '#05091A', cursor: dragRef.current ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background */}
        <rect data-map-bg="1" x="-5000" y="-5000" width="15000" height="15000" fill="#05091A" />

        {/* Graticule */}
        <GraticuleLines />

        {/* Continent fills from TopoJSON */}
        {geoFeatures.map((geo: any, i: number) => {
          if (!geo.geometry || !geo.geometry.coordinates) return null;
          const coords = geo.geometry.type === 'Polygon'
            ? [geo.geometry.coordinates]
            : geo.geometry.coordinates;

          return (
            <g key={`${geo.id}-${i}`}>
              {coords.map((ringSet: any, ri: number) =>
                ringSet.map((ring: number[][], ri2: number) => {
                  const d = ring
                    .map(([lng, lat]: [number, number], j: number) => {
                      const [x, y] = project(lng, lat);
                      return `${j === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
                    })
                    .join(' ') + ' Z';
                  return (
                    <path
                      key={`${ri}-${ri2}`}
                      d={d}
                      fill="#0E1C35"
                      stroke="#162540"
                      strokeWidth={0.6}
                      strokeLinejoin="round"
                    />
                  );
                })
              )}
            </g>
          );
        })}

        {/* ── Route Lines ── */}
        {toggles.showRoutes && flightPaths.map(f => {
          const isSelected = selectedEntity?.type === 'flight' && selectedEntity.id === f.id;
          const color = getRouteColor(f.status, f.isReplanned);
          const strokeDash = f.isReplanned ? '5,3' : undefined;

          return (
            <g key={f.id}>
              {(isSelected || f.status === 'critical') && (
                <path d={f.pathD} stroke={color} strokeWidth={isSelected ? 8 : 5}
                  strokeOpacity={0.12} fill="none" style={{ pointerEvents: 'none' }} />
              )}
              <path
                d={f.pathD} stroke="transparent" strokeWidth={10} fill="none"
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onSelectFlight(f.id); }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: makeFlightTooltip(f) });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              <path d={f.pathD} stroke={color}
                strokeWidth={isSelected ? 2 : 1}
                strokeOpacity={isSelected ? 1 : 0.65}
                strokeDasharray={strokeDash}
                fill="none" style={{ pointerEvents: 'none' }} />
            </g>
          );
        })}

        {/* ── Airport Markers ── */}
        {airportPositions.map(a => {
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
              onClick={(e) => { e.stopPropagation(); onSelectAirport(a.id); }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: makeAirportTooltip(a) });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {isCritical && toggles.showCongestion && (
                <circle r={9} fill={color} opacity={0.08}>
                  <animate attributeName="r" values="6;16;6" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.15;0;0.15" dur="2.5s" repeatCount="indefinite" />
                </circle>
              )}
              {isWarning && toggles.showCongestion && (
                <circle r={7} fill={color} opacity={0.08}>
                  <animate attributeName="r" values="5;11;5" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.1;0;0.1" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
              {isSelected && (
                <circle r={r + 4} fill="none" stroke={color} strokeWidth={1.2} opacity={0.7} />
              )}
              <circle r={r + 2} fill={color} opacity={0.18} />
              <circle r={r} fill={color} stroke="#05091A" strokeWidth={1} />
              <circle r={1.2} fill="#05091A" />
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
              {toggles.showWarehouseCapacity && (
                <g transform="translate(-8,5)">
                  <rect width={16} height={2.5} rx={1} fill="#0D1A2E" />
                  <rect width={16 * Math.min(pct / 100, 1)} height={2.5} rx={1}
                    fill={color} opacity={0.85} />
                </g>
              )}
            </g>
          );
        })}

        {/* ── Shipment Airplanes ── */}
        {shipmentData.map(s => {
          const isSelected = selectedEntity?.type === 'shipment' && selectedEntity.id === s.id;
          const color = getStatusColor(s.status);
          const [px, py] = s.svgPos;

          return (
            <g
              key={s.id}
              transform={`translate(${px},${py}) rotate(${s.angle + 90})`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onSelectShipment(s.id); }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: makeShipmentTooltip(s) });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {isSelected && <circle r={10} fill={color} opacity={0.15} />}
              <g transform="scale(0.35)">
                <path
                  d="M21,16V14L13,9V3.5A1.5,1.5,0,0,0,10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5Z"
                  fill={color}
                  stroke="#05091A"
                  strokeWidth={1.5}
                  opacity={0.9}
                />
              </g>
            </g>
          );
        })}
      </svg>

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
          onMouseDown={e => e.stopPropagation()}
          onClick={resetView}
          title="Reset view"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(10,20,45,0.92)',
            border: '1px solid #1E3058',
            color: '#A8C0E0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6" cy="6" r="2.5" />
            <line x1="6" y1="1" x2="6" y2="3" />
            <line x1="6" y1="9" x2="6" y2="11" />
            <line x1="1" y1="6" x2="3" y2="6" />
            <line x1="9" y1="6" x2="11" y2="6" />
          </svg>
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3" style={{ fontSize: 9, color: '#1A3055', letterSpacing: '0.15em', pointerEvents: 'none', userSelect: 'none' }}>
        SKYTRACK RED LOGÍSTICA GLOBAL · {zoomLevel.toFixed(1)}× ZOOM
      </div>
    </div>
  );
}
