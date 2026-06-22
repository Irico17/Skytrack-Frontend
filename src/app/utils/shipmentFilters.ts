import type { Shipment } from '../data/mockData';

export const DELIVERED_WINDOW_MS = 4 * 60 * 60 * 1000;

/** Resolves delivery instant from backend/mapped fields or estimated delivery fallback. */
export function getShipmentDeliveryTimeMs(shipment: Shipment): number | null {
  const candidates = [shipment.finalArrivalTime, shipment.deliveredAt];
  for (const value of candidates) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (shipment.progress >= 1 && shipment.estimatedDelivery) {
    const normalized = shipment.estimatedDelivery.includes('T')
      ? shipment.estimatedDelivery
      : shipment.estimatedDelivery.replace(' ', 'T');
    const ms = new Date(normalized).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/** ENV-03: delivered within the last `windowMs` of simulated time. */
export function isDeliveredInSimWindow(
  shipment: Shipment,
  simulationTime: Date,
  windowMs: number = DELIVERED_WINDOW_MS,
): boolean {
  if (shipment.progress < 1) return false;
  const deliveryMs = getShipmentDeliveryTimeMs(shipment);
  if (deliveryMs == null) return false;
  const simMs = simulationTime.getTime();
  return deliveryMs <= simMs && deliveryMs >= simMs - windowMs;
}
