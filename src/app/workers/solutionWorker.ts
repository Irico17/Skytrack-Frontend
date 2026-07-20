/**
 * Web Worker: fetch + JSON.parse + mapSolutionToShipments fuera del hilo principal.
 * Evita long tasks (~0.5s) al llegar un CYCLE_UPDATE cuando /solution ya pesa MBs.
 */
import { mapSolutionToShipments } from '../services/mapper';
import type { BackendSolution } from '../types/backend';
import type { Shipment } from '../data/mockData';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export type SolutionWorkerRequest = {
  type: 'fetch';
  seq: number;
  simId: string;
  simulatedTimeMs: number;
};

export type SolutionWorkerSuccess = {
  type: 'result';
  seq: number;
  mapped: Shipment[];
  empty: boolean;
};

export type SolutionWorkerFailure = {
  type: 'error';
  seq: number;
  message: string;
};

export type SolutionWorkerResponse = SolutionWorkerSuccess | SolutionWorkerFailure;

async function fetchSolution(simId: string): Promise<BackendSolution> {
  const res = await fetch(`${BASE}/simulations/${encodeURIComponent(simId)}/solution`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : { routes: [], totalRoutes: 0 }) as BackendSolution;
}

self.onmessage = async (event: MessageEvent<SolutionWorkerRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'fetch') return;

  try {
    const solution = await fetchSolution(msg.simId);
    const empty = (!solution.routes || solution.routes.length === 0)
      && (solution.totalRoutes ?? 0) === 0;

    if (empty) {
      const response: SolutionWorkerSuccess = {
        type: 'result',
        seq: msg.seq,
        mapped: [],
        empty: true,
      };
      self.postMessage(response);
      return;
    }

    const mapped = mapSolutionToShipments(solution, new Date(msg.simulatedTimeMs));
    const response: SolutionWorkerSuccess = {
      type: 'result',
      seq: msg.seq,
      mapped,
      empty: false,
    };
    self.postMessage(response);
  } catch (err) {
    const response: SolutionWorkerFailure = {
      type: 'error',
      seq: msg.seq,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
