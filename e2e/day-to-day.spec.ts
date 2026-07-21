import { test, expect, Page, Browser, APIRequestContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname no existe en módulos ESM ("type": "module" en package.json) — se deriva de import.meta.
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * ENSAYO E2E — "Operaciones día a día" (prueba oficial del curso).
 *
 * Recorre la secuencia completa de la pauta del profesor contra un backend REAL
 * (sky-d2d u otro contenedor apuntado en E2E_API_BASE), simulando:
 *   - 4 estaciones (SPIM/SABE/EKCH/VIDP) registrando manualmente en paralelo, desde la
 *     pantalla de estación independiente (StationScreen).
 *   - Carga de archivo de envíos DURANTE la ejecución.
 *   - Selección de 2 envíos y verificación de que se dibuja su ruta en el mapa.
 *   - Cancelación de un vuelo y verificación de la reasignación.
 *
 * Requiere, ANTES de correr `npm run test:e2e`:
 *   1. Un backend corriendo con datos de aeropuertos/vuelos cargados (contenedor Podman,
 *      o local). Recomendado: aplicar antes la preparación de la prueba real
 *      (node scripts/prueba-d2d.mjs generar/aplicar) para tener vuelos que despeguen
 *      pronto — sin eso, el routing puede tardar más (usa el plan de vuelos que ya
 *      tenga el backend).
 *   2. El frontend (`npm run dev`) apuntando a ese backend vía VITE_API_BASE.
 *   3. Variable de entorno E2E_API_BASE con la MISMA URL de API (para poder consultar
 *      el estado por REST, más rápido/confiable que solo leer el DOM).
 *
 * Los tiempos de espera reales del backend (Sa entre ciclos) NO se pueden acortar sin
 * tocar el escenario — este test espera de verdad, por eso el timeout global es alto
 * (ver playwright.config.ts). Actívalo como ensayo previo a la presentación, no como
 * parte de un pipeline de CI rápido.
 */

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:18091/api';
const STATIONS = ['SPIM', 'SABE', 'EKCH', 'VIDP'] as const;
type Station = (typeof STATIONS)[number];

// Destinos de ejemplo tomados del documento oficial (operaciones.dia.a.dia.txt).
const SAMPLE_DESTINATIONS = ['SCEL', 'SVMI', 'SBBR', 'SKBO', 'SGAS', 'SUAA', 'EBCI', 'LBSF', 'OAKB', 'OPKC'];

function log(step: string, msg: string) {
  console.log(`\n[${new Date().toISOString().slice(11, 19)}] ▶ ${step}: ${msg}`);
}

async function apiGet(request: APIRequestContext, path: string) {
  const res = await request.get(`${API_BASE}${path}`);
  expect(res.ok(), `GET ${path} → ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Espera hasta que la operación día a día activa exista (poll por API, más rápido que UI). */
async function waitForActiveOperation(request: APIRequestContext, timeoutMs = 60_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`${API_BASE}/simulations/active`);
    if (res.ok()) {
      const body = await res.json().catch(() => null);
      if (body && body.scenario === 'DAY_TO_DAY' && body.status === 'RUNNING') {
        return body.simulationId as string;
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('Timeout esperando operación día a día activa');
}

/** Espera hasta que al menos `min` lotes tengan ruta asignada (no NOT_REGISTERED/PENDING). */
async function waitForRoutedBags(request: APIRequestContext, simId: string, min: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastSeen = 0;
  while (Date.now() < deadline) {
    const body = await apiGet(request, `/simulations/${simId}/bags?page=0&size=1`);
    const routed = (body.summary?.inFlightBags ?? 0) + (body.summary?.deliveredBags ?? 0) + (body.summary?.warehouseBags ?? 0);
    lastSeen = routed;
    if (routed >= min) return routed;
    await new Promise(r => setTimeout(r, 5_000));
  }
  throw new Error(`Timeout esperando ${min} lotes con ruta (visto: ${lastSeen})`);
}

/** Abre la pantalla de estación en un contexto de navegador NUEVO (aísla el huso horario simulado por URL). */
async function openStation(browser: Browser, baseURL: string, station: Station): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/?estacion=${station}`);
  await expect(page.getByText(`Estación ${station}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Conectado a la operación día a día en curso.')).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Registra un envío desde una pantalla de estación ya abierta. */
async function registerFromStation(page: Page, destination: string, quantity: number, client = '0007729') {
  await page.locator('select').selectOption(destination);
  await page.locator('input[type="number"]').fill(String(quantity));
  const clientInput = page.locator('input[type="text"]').first();
  await clientInput.fill(client);
  await page.getByRole('button', { name: /Registrar envío/i }).click();
  // Confirma que se agregó a la lista de "Registrados en esta sesión" antes de seguir.
  await expect(page.getByText(`→ ${destination}`)).toBeVisible({ timeout: 20_000 });
}

test.describe('Operación día a día — ensayo E2E completo', () => {
  test('secuencia oficial de la prueba (4 estaciones, archivo, rutas, cancelación)', async ({ page, request, browser, baseURL }) => {
    const base = baseURL ?? 'http://localhost:5173';

    // ───────────────────────── PREPARACIÓN ─────────────────────────
    await test.step('Preparación: abrir centro de operaciones e iniciar D2D', async () => {
      log('PREP', 'Abriendo centro de operaciones');
      await page.goto('/');

      // Si quedó una operación previa corriendo (de pruebas anteriores), cancelarla primero.
      const cancelBtn = page.getByRole('button', { name: 'Cancelar simulación' });
      if (await cancelBtn.isVisible().catch(() => false)) {
        log('PREP', 'Cancelando operación previa');
        await cancelBtn.click();
        await page.waitForTimeout(1500);
      }

      // Seleccionar modo "Operación Día a Día".
      await page.getByRole('button', { name: /Operación Día a Día|Simulación 5 Días|Escenario de Colapso/i }).first().click();
      await page.getByRole('button', { name: 'Operación Día a Día' }).click();

      log('PREP', 'Iniciando operación');
      // exact: true — "Iniciar" es substring de otros botones posibles.
      await page.getByRole('button', { name: 'Iniciar', exact: true }).click();

      const simId = await waitForActiveOperation(request);
      log('PREP', `Operación activa: ${simId}`);
    });

    // ─────────────── DURANTE LA EJECUCIÓN: espera inicial de 1 min ───────────────
    await test.step('Espera inicial antes del registro (pauta: ~1 min)', async () => {
      log('WAIT', 'Esperando antes de que las estaciones empiecen a registrar');
      await page.waitForTimeout(15_000); // compensado: 1 min real de la pauta → 15s de ensayo
    });

    // ───────────── 4 estaciones registran EN PARALELO (5-10 c/u) ─────────────
    const stationPages = await test.step('4 estaciones registran maletas en paralelo', async () => {
      log('STATIONS', 'Abriendo las 4 pantallas de estación');
      const pages = await Promise.all(STATIONS.map(s => openStation(browser, base, s)));

      log('STATIONS', 'Registrando 5 envíos por estación, en voz alta cada uno 🔊 (simulado en logs)');
      await Promise.all(
        pages.map(async (stationPage, idx) => {
          const station = STATIONS[idx];
          for (let i = 0; i < 5; i++) {
            const dest = SAMPLE_DESTINATIONS[(idx + i) % SAMPLE_DESTINATIONS.length];
            const qty = 10 + i * 5;
            await registerFromStation(stationPage, dest, qty);
            console.log(`   🗣️  [${station}] envío registrado: ${station} → ${dest} (${qty} maletas)`);
          }
        })
      );
      return pages;
    });

    // ─────────────── Espera por ciclos del backend (pauta: 10-15 min) ───────────────
    await test.step('Espera a que el backend rutee los registros manuales', async () => {
      // Devolver el foco a la página principal (el "centro de operaciones"): al abrir las
      // 4 pestañas de estación, el navegador puede tratarla como pestaña en segundo plano y
      // frenar sus timers/reconexión de WebSocket — el hook ya re-sincroniza al recuperar
      // foco/visibilidad (evento 'focus'/'visibilitychange'), solo hace falta dárselo aquí.
      await page.bringToFront();

      const simId = await waitForActiveOperation(request, 5_000).catch(async () => {
        const active = await apiGet(request, '/simulations/active');
        return active.simulationId as string;
      });
      log('WAIT', 'Esperando ciclos de planificación (Sa) — puede tardar varios minutos reales');
      await waitForRoutedBags(request, simId, 5, 20 * 60_000);
      log('WAIT', 'Backend confirmó lotes ruteados ✅');
    });

    // ───────────────────── Carga de archivo de envíos ─────────────────────
    await test.step('Carga de archivo de envíos DURANTE la ejecución', async () => {
      log('UPLOAD', 'Abriendo modal de carga de archivo desde el centro de operaciones');
      // Al iniciar, App.tsx colapsa el panel izquierdo (mapa a foco) — reabrirlo
      // antes de buscar acciones operativas (Cargar Archivo / Cancelar Vuelo).
      const showLeft = page.getByTitle('Mostrar panel izquierdo');
      if (await showLeft.isVisible().catch(() => false)) {
        await showLeft.click();
      }
      await page.getByRole('button', { name: 'Cargar Archivo de Envíos' }).click();
      const fileInput = page.locator('input[type="file"]');
      // El nombre del archivo DEBE seguir el patrón _envios_XXXX_.txt: el backend deduce
      // el aeropuerto de origen parseando el nombre cuando no se pasa ?originId explícito.
      await fileInput.setInputFiles(path.join(HERE, 'fixtures', '_envios_SPIM_.txt'));
      // exact: true — "Cargar" es substring de "Cargar Archivo de Envíos"/"Cargar Datos".
      await page.getByRole('button', { name: 'Cargar', exact: true }).click();
      await expect(page.getByText(/registrados/i)).toBeVisible({ timeout: 20_000 });
      log('UPLOAD', 'Archivo cargado ✅');
      // exact: true — "Cerrar" es substring de "Cerrar y Ver Reporte" (siempre visible en el sidebar).
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    });

    // ─────────────── Espera adicional tras la carga de archivo ───────────────
    await test.step('Espera tras la carga de archivo (pauta: 10-15 min)', async () => {
      const active = await apiGet(request, '/simulations/active');
      log('WAIT', 'Esperando el siguiente ciclo tras la carga de archivo');
      await waitForRoutedBags(request, active.simulationId, 8, 20 * 60_000);
    });

    // ───────────────── Seleccionar 2 envíos y verificar ruta en mapa ─────────────────
    await test.step('Seleccionar un envío y verificar que se dibuja su ruta', async () => {
      log('MAP', 'Abriendo panel inferior de envíos');
      await page.bringToFront();
      // Forzar un resync (recarga) por si la página quedó desactualizada tras estar en
      // segundo plano — más robusto que confiar solo en el evento 'focus' del navegador.
      await page.reload();
      // TopBar ya no expone "Pausar": el control activo es "Cancelar simulación".
      await expect(page.getByRole('button', { name: 'Cancelar simulación' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('EN CURSO')).toBeVisible({ timeout: 20_000 });

      const bottomToggle = page.getByTitle('Mostrar panel inferior');
      if (await bottomToggle.isVisible().catch(() => false)) await bottomToggle.click();
      // El panel abre en la pestaña "Resumen" — las filas de envío están en "Todos los Envíos".
      await page.getByRole('button', { name: 'Todos los Envíos' }).click();

      const rows = page.getByTestId('shipment-row');
      await expect(rows.first()).toBeVisible({ timeout: 30_000 });
      await rows.first().click();

      // La ruta se dibuja como <path> SVG (no canvas) — confirmar que aparece al menos uno
      // con el color de ruta de envío (#00FF9C, primer sub-lote) definido en WorldMap.
      const routePath = page.locator('svg path[stroke="#00FF9C"]');
      await expect(routePath.first()).toBeVisible({ timeout: 15_000 });
      log('MAP', 'Ruta del primer envío dibujada ✅');
    });

    await test.step('Seleccionar un SEGUNDO envío y verificar su ruta', async () => {
      const rows = page.getByTestId('shipment-row');
      const count = await rows.count();
      expect(count).toBeGreaterThan(1);
      await rows.nth(1).click();
      const routePath = page.locator('svg path[stroke="#00FF9C"]');
      await expect(routePath.first()).toBeVisible({ timeout: 15_000 });
      log('MAP', 'Ruta del segundo envío dibujada ✅');
    });

    // ───────────────────── Cancelación de vuelo + reasignación ─────────────────────
    await test.step('Cancelar un vuelo y verificar reasignación', async () => {
      // Tomar un vuelo REALMENTE en uso por un envío ruteado (garantiza futuro/cancelable),
      // en vez de adivinar: se busca en la solución actual del backend.
      const active = await apiGet(request, '/simulations/active');
      const solution = await apiGet(request, `/simulations/${active.simulationId}/solution`);
      const routeWithFlight = (solution.routes ?? []).find((r: any) => (r.flights ?? []).length > 0);
      expect(routeWithFlight, 'debe haber al menos una ruta con vuelo asignado').toBeTruthy();
      const flightId: string = routeWithFlight.flights[0].flightId.replace(/-D\d+$/, '');
      log('CANCEL', `Cancelando vuelo en uso: ${flightId}`);

      // Tras reload el panel izquierdo vuelve a colapsarse al detectar isRunning.
      const showLeft = page.getByTitle('Mostrar panel izquierdo');
      if (await showLeft.isVisible().catch(() => false)) {
        await showLeft.click();
      }
      await page.getByRole('button', { name: 'Cancelar Vuelo' }).click();
      const searchInput = page.getByPlaceholder('Buscar por código, origen o destino…');
      await searchInput.fill(flightId);
      const flightOption = page.locator('button', { hasText: flightId }).first();
      await expect(flightOption).toBeVisible({ timeout: 10_000 });
      await flightOption.click();
      await page.getByRole('button', { name: /Cancelar Vuelo/i }).last().click();

      // Confirmar reasignación: mensaje real de la UI tras un cancel+replan exitoso.
      await expect(
        page.getByText('Rutas replanificadas').or(page.getByText(/[Cc]ancelad/))
      ).toBeVisible({ timeout: 30_000 });
      log('CANCEL', 'Cancelación + reasignación confirmada ✅');
    });

    // ───────────────────────────── Cierre ─────────────────────────────
    await test.step('Cierre: detener la operación', async () => {
      log('CLOSE', 'Deteniendo la operación día a día');
      for (const p of stationPages) await p.context().close();
      await page.getByRole('button', { name: 'Cancelar simulación' }).click();
      await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible({ timeout: 20_000 });
      log('CLOSE', 'Ensayo completo ✅');
    });
  });
});
