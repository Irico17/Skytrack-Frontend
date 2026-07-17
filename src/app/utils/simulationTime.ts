/**
 * Contrato temporal del reloj de simulación.
 *
 * El selector trabaja en la zona local del navegador. En la API siempre se
 * envía un instante UTC ISO-8601. Al recibirlo, Date conserva el instante y
 * los componentes locales permiten renderizarlo en la zona del navegador.
 */

/** Convierte un Date (instante) al formato canónico enviado al backend. */
export function toApiInstant(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Fecha/hora de simulación inválida');
  }
  return date.toISOString();
}

/**
 * Convierte una fecha de API a Date.
 *
 * Los valores nuevos incluyen Z/offset. La rama sin zona existe únicamente
 * para recuperar sesiones guardadas por versiones anteriores del frontend,
 * cuyo backend las interpretaba como UTC.
 */
export function parseApiInstant(value: string): Date {
  const trimmed = value.trim();
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})(?:\[[^\]]+\])?$/.test(trimmed);
  const normalized = hasZone || !trimmed.includes('T') ? trimmed : `${trimmed}Z`;
  const parsed = new Date(normalized.replace(/\[[^\]]+\]$/, ''));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Fecha/hora de API inválida: ${value}`);
  }
  return parsed;
}

/** Formatea un instante usando la zona local del navegador. */
export function formatLocalDateTime(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = typeof value === 'string' ? parseApiInstant(value) : value;
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  });
}

/** Fecha + hora local completa (incluye segundos) para relojes de operación. */
export function formatRealDateTime(value: Date | string): string {
  const date = typeof value === 'string' ? parseApiInstant(value) : value;
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Fecha simulada con año para el reloj principal (sin hora). */
export function formatSimClockDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Hora simulada `HH:MM:SS` para el reloj principal. */
export function formatSimClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

/** Fecha + hora local para etiquetas de inicio/término de simulación. */
export function formatSimDateTimeDisplay(date: Date): string {
  return `${formatSimClockDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Fin de ventana operativa según modo (null = sin término, p. ej. collapse). */
export function getSimulationEndDate(mode: string, startDate: Date): Date | null {
  if (mode === 'collapse') return null;
  const days = mode === 'realtime' ? 1 : 5;
  return new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Formatea milisegundos (o días fraccionarios vía daysElapsed * 86400000)
 * como `Dd Hh Mm Ss`.
 */
export function formatElapsedDhms(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
