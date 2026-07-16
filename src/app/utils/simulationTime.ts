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
