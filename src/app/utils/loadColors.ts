import { OCCUPANCY_CRITICAL_PCT, OCCUPANCY_WARNING_PCT } from '../data/mockData';

/** Colores UT por % de carga (≥80 rojo, ≥50 ámbar, con carga verde, vacío gris-azulado). */
export function getUtLoadColor(bagsCount: number, capacity: number): string {
  if (bagsCount <= 0) return '#5E7699';
  if (capacity <= 0) return '#4ADE80';
  const pct = bagsCount / capacity;
  if (pct >= OCCUPANCY_CRITICAL_PCT / 100) return '#FF4D4D';
  if (pct >= OCCUPANCY_WARNING_PCT / 100) return '#FFC857';
  return '#4ADE80';
}

export function getLoadPercent(bagsCount: number, capacity: number): number {
  if (capacity <= 0) return bagsCount > 0 ? 100 : 0;
  return Math.round((bagsCount / capacity) * 100);
}

/**
 * Paleta de colores por SUB-LOTE de un envío dividido por capacidad (ids "-S<n>").
 * La comparten el mapa (rutas de la familia + leyenda, WorldMap.selectedShipmentGeometry)
 * y el detalle del envío (badge de ruta por maleta, RightPanel.BagListSection): el mismo
 * sub-lote, ordenado numéricamente dentro de su familia, recibe el mismo color en ambos —
 * así el grupo "S2" ámbar de la lista de maletas es la misma ruta ámbar del mapa.
 */
export const SUBLOT_COLORS = ['#00FF9C', '#4DA6FF', '#FFC857', '#FF7AD9', '#B78CFF', '#FF9060'];

/** Tinte continental aproximado por longitud (visual mapa).
 *  Tonos oscuros y fríos: se evita el marrón/naranja que generaba la "franja"
 *  visual en latitudes altas (MAP-REG-01) manteniendo diferenciación sutil. */
export function getContinentFill(lng: number, hovered: boolean): string {
  if (hovered) {
    if (lng < -30) return '#1A3558';  // América
    if (lng < 60) return '#173E47';   // Europa / África
    return '#1C3550';                 // Asia / Oceanía
  }
  if (lng < -30) return '#0F2848';
  if (lng < 60) return '#10303A';
  return '#13202E';
}
