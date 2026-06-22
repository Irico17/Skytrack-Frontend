import type { BackendActiveFlight, BackendFlightPlanFlight } from '../types/backend';

/** Minutes east of UTC from an ISO-8601 string (e.g. -05:00, Z, or trailing [ZoneId]). */
export function parseIsoOffsetMinutes(iso: string): number | null {
  const normalized = iso.replace(/\[[^\]]+\]$/, '');
  if (/(?:Z|z)$/.test(normalized)) return 0;
  const match = normalized.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!match) return null;
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
}

function parseLocalTimeFromIso(iso: string): { hours: number; minutes: number } | null {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

function formatLocalDateFromOffset(instant: Date, offsetMinutes: number): string {
  const localMs = instant.getTime() + offsetMinutes * 60_000;
  const d = new Date(localMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Mirrors CancellationService: cancelTime <= departure - 1h (origin local) → same day; else next day.
 * Origin offset is taken from the flight departureTime ISO string when present.
 */
export function computeCancellationTargetDay(
  simulatedTime: Date,
  departureTimeIso: string,
): string {
  const offsetMinutes = parseIsoOffsetMinutes(departureTimeIso) ?? 0;
  const localMs = simulatedTime.getTime() + offsetMinutes * 60_000;
  const local = new Date(localMs);
  const cancelDateStr = formatLocalDateFromOffset(simulatedTime, offsetMinutes);
  const cancelTotalMin = local.getUTCHours() * 60 + local.getUTCMinutes();

  const depTime = parseLocalTimeFromIso(departureTimeIso);
  if (!depTime) return cancelDateStr;

  const depTotalMin = depTime.hours * 60 + depTime.minutes;
  const thresholdMin = depTotalMin - 60;

  if (cancelTotalMin <= thresholdMin) return cancelDateStr;
  return addDaysToIsoDate(cancelDateStr, 1);
}

export function findFlightById(
  flightId: string,
  flightPlanFlights: BackendFlightPlanFlight[],
  activeFlights: BackendActiveFlight[],
): BackendFlightPlanFlight | BackendActiveFlight | undefined {
  return activeFlights.find(f => f.flightId === flightId)
    ?? flightPlanFlights.find(f => f.flightId === flightId);
}
