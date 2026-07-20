/** Colores UT por % de carga (spec PO: ≥90 rojo, ≥70 ámbar, con carga verde, vacío gris-azulado). */
export function getUtLoadColor(bagsCount: number, capacity: number): string {
  if (bagsCount <= 0) return '#5E7699';
  if (capacity <= 0) return '#4ADE80';
  const pct = bagsCount / capacity;
  if (pct >= 0.9) return '#FF4D4D';
  if (pct >= 0.7) return '#FFC857';
  return '#4ADE80';
}

export function getLoadPercent(bagsCount: number, capacity: number): number {
  if (capacity <= 0) return bagsCount > 0 ? 100 : 0;
  return Math.round((bagsCount / capacity) * 100);
}

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
