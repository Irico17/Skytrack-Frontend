import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * ENSAYO E2E POR ESCENARIO — cancelación, escalas (hops) y sub-lotes.
 *
 * Corre contra un backend REAL que sirve también el frontend (imagen combinada), uno por
 * escenario, para que las tres simulaciones no compartan estado:
 *
 *   E2E_SCENARIO=realtime|5day|collapse   escenario a probar
 *   E2E_BASE_URL=http://localhost:1830X   frontend (mismo puerto que la API)
 *   E2E_API_BASE=http://localhost:1830X/api
 *   E2E_START_DATE=2028-02-25T00:00       fecha/hora del input datetime-local (opcional)
 *   E2E_KEEP_RUNNING=1                    no detener la simulación al terminar (5 días / colapso)
 *
 * Lo que verifica, TODO por interfaz salvo la lectura de apoyo por API:
 *  1. La simulación arranca desde la UI y llega a rutear lotes.
 *  2. Hay rutas con ESCALAS (≥2 vuelos) y se ven sus tramos en el detalle del envío.
 *  3. Un envío partido por capacidad muestra TODOS sus sub-lotes con ruta propia en el mapa
 *     (leyenda por color) y en el detalle de maletas.
 *  4. Cancelación de vuelo registrada por UI, y después:
 *       · aparece en la zona de CANCELADOS de la lista de UT, con badge CANCELADO,
 *       · desaparece del filtro "En vuelo",
 *       · su ruta YA NO se dibuja en el mapa al seleccionarla,
 *       · el backend confirma que ningún lote lo sigue usando ese día.
 */

const SCENARIO = (process.env.E2E_SCENARIO ?? 'realtime') as 'realtime' | '5day' | 'collapse';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:18301/api';
const START_DATE = process.env.E2E_START_DATE ?? '';
const KEEP_RUNNING = process.env.E2E_KEEP_RUNNING === '1';
/**
 * Día a día: la cola arranca vacía, así que los envíos se registran por interfaz. Un lote de
 * 400 maletas supera la capacidad de cualquier UT del plan (obliga al split) y los dos
 * intercontinentales no tienen vuelo directo (obligan a rutas con escalas).
 */
const REGISTER_SHIPMENTS = process.env.E2E_REGISTER_SHIPMENTS === '1';
const MANUAL_SHIPMENTS: Array<[string, string, number]> = [
  ['SPIM', 'SKBO', 400],
  ['SPIM', 'EKCH', 60],
  ['SPIM', 'VIDP', 60],
  ['SABE', 'EKCH', 60],
];

const MODE_LABEL: Record<typeof SCENARIO, string> = {
  realtime: 'Operación Día a Día',
  '5day': 'Simulación 5 Días',
  collapse: 'Escenario de Colapso',
};

function log(step: string, msg: string) {
  console.log(`\n[${new Date().toISOString().slice(11, 19)}] ▶ ${step}: ${msg}`);
}

async function apiGet(request: APIRequestContext, path: string) {
  const res = await request.get(`${API_BASE}${path}`);
  expect(res.ok(), `GET ${path} → ${res.status()}`).toBeTruthy();
  return res.json();
}

/** ID base del vuelo, sin el sufijo de día que añade el planificador ("-D3"). */
function baseFlightId(id: string): string {
  return id.replace(/-D\d+$/, '');
}

/** Lote base de un sub-lote: "0001234-S2" → "0001234". */
function baseBatchId(id: string): string {
  return id.replace(/(-S\d+)+$/, '');
}

async function waitForActive(request: APIRequestContext, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`${API_BASE}/simulations/active`);
    if (res.ok()) {
      const body = await res.json().catch(() => null);
      if (body?.simulationId && body.status === 'RUNNING') return body.simulationId as string;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timeout esperando simulación activa');
}

/** Espera a que la solución tenga al menos `minRoutes` rutas asignadas. */
async function waitForRoutes(request: APIRequestContext, simId: string, minRoutes: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    const sol = await apiGet(request, `/simulations/${simId}/solution`).catch(() => null);
    last = sol?.routes?.length ?? 0;
    if (last >= minRoutes) return sol;
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Timeout esperando ${minRoutes} rutas (vistas: ${last})`);
}

/** Abre el panel izquierdo si está colapsado (App lo colapsa al iniciar para dar foco al mapa). */
async function ensureLeftPanel(page: Page) {
  const showLeft = page.getByTitle('Mostrar panel izquierdo');
  if (await showLeft.isVisible().catch(() => false)) await showLeft.click();
}

/** Cierra el cajón de detalle de envío si quedó abierto (tapa el panel derecho). */
async function closeShipmentDetail(page: Page) {
  const close = page.getByTitle('Cerrar detalle del envío');
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(close).toBeHidden({ timeout: 10_000 });
  }
}

/** Registra un envío desde el modal "Registrar Maletas" del centro de operaciones. */
async function registerShipment(page: Page, origin: string, dest: string, qty: number) {
  await closeShipmentDetail(page);
  await ensureLeftPanel(page);
  await page.getByRole('button', { name: 'Registrar Maletas' }).click();
  const selects = page.locator('form select');
  await selects.nth(0).selectOption(origin);
  await selects.nth(1).selectOption(dest);
  await page.locator('form input[type="number"]').fill(String(qty));
  const submit = page.getByRole('button', { name: 'Registrar', exact: true });
  await submit.click();
  await expect(submit, `el modal debe cerrarse tras registrar ${origin}→${dest}`)
    .toBeHidden({ timeout: 30_000 });
}

/** Abre la pestaña indicada del panel derecho. */
async function openRightTab(page: Page, label: string) {
  await closeShipmentDetail(page);
  const showRight = page.getByTitle('Mostrar panel derecho');
  if (await showRight.isVisible().catch(() => false)) await showRight.click();
  await page.getByRole('button', { name: label, exact: true }).first().click();
}

test.describe(`Escenario ${SCENARIO} — cancelación, escalas y sub-lotes`, () => {
  test(`${MODE_LABEL[SCENARIO]}: flujo completo verificado por interfaz`, async ({ page, request }) => {
    let simId = '';

    // ───────────────────────── 1. Arranque desde la UI ─────────────────────────
    await test.step('Iniciar la simulación desde el frontend', async () => {
      await page.goto('/');

      // Se pregunta al BACKEND, no a la pantalla: al cargar, la UI muestra "Iniciar" durante
      // un instante y solo después restaura la sesión activa y deshabilita el selector de modo,
      // así que mirar el botón nada más entrar da un falso negativo y el siguiente clic falla.
      const activeRes = await request.get(`${API_BASE}/simulations/active`);
      const activeBody = activeRes.status() === 200 ? await activeRes.json().catch(() => null) : null;
      if (activeBody?.simulationId) {
        log('PREP', `Había una simulación previa (${activeBody.simulationId}): cancelándola`);
        const cancelBtn = page.getByRole('button', { name: 'Cancelar simulación' });
        await expect(cancelBtn).toBeVisible({ timeout: 60_000 });
        await cancelBtn.click();
        await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible({ timeout: 60_000 });
      }

      log('PREP', `Seleccionando modo "${MODE_LABEL[SCENARIO]}"`);
      const modeBtn = page.getByRole('button', { name: /Operación Día a Día|Simulación 5 Días|Escenario de Colapso/i }).first();
      await expect(modeBtn, 'el selector de modo debe quedar habilitado (sin simulación activa)')
        .toBeEnabled({ timeout: 60_000 });
      await modeBtn.click();
      // .last(): el botón que abre el desplegable lleva el nombre del modo ACTUAL, así que
      // cuando el modo pedido ya es el activo hay dos coincidencias — la opción es la segunda.
      await page.getByRole('button', { name: MODE_LABEL[SCENARIO], exact: true }).last().click();

      if (START_DATE) {
        log('PREP', `Fijando fecha de inicio: ${START_DATE}`);
        await ensureLeftPanel(page);
        const dateInput = page.locator('input[type="datetime-local"]');
        await expect(dateInput).toBeEnabled({ timeout: 10_000 });
        await dateInput.fill(START_DATE);
        await expect(dateInput).toHaveValue(START_DATE);
      }

      log('PREP', 'Pulsando Iniciar');
      await page.getByRole('button', { name: 'Iniciar', exact: true }).click();

      simId = await waitForActive(request);
      log('PREP', `Simulación activa: ${simId}`);
      await expect(page.getByText('EN CURSO')).toBeVisible({ timeout: 120_000 });
    });

    // ─── 1.bis Registro manual (día a día): la cola arranca VACÍA en este escenario ───
    // Se registran por UI los envíos que dan material a las dos comprobaciones siguientes:
    //  · uno de 400 maletas → no cabe en ninguna UT (cap. máx. del plan) ⇒ obliga a partir
    //    el lote en sub-lotes con ruta propia;
    //  · dos intercontinentales → no hay vuelo directo ⇒ obligan a rutas con escalas.
    if (REGISTER_SHIPMENTS) {
      await test.step('Registrar envíos por UI (lote grande + intercontinentales)', async () => {
        for (const [origin, dest, qty] of MANUAL_SHIPMENTS) {
          await registerShipment(page, origin, dest, qty);
          log('REGISTRO', `${origin} → ${dest} · ${qty} maletas ✅`);
        }
      });
    }

    // ───────────── 2. Esperar a que el planificador produzca rutas ─────────────
    let solution: any;
    await test.step('Esperar rutas asignadas', async () => {
      log('WAIT', 'Esperando ciclos de planificación…');
      solution = await waitForRoutes(request, simId, REGISTER_SHIPMENTS ? 3 : 20, 25 * 60_000);
      log('WAIT', `Solución con ${solution.routes.length} rutas · ${solution.totalBags} maletas ✅`);
    });

    // ───────────────────── 3. Escalas (hops) ─────────────────────
    await test.step('Verificar que existen rutas con escalas y verlas en el detalle del envío', async () => {
      const multiLeg = (solution.routes as any[]).filter(r => (r.flights ?? []).length >= 2);
      log('HOPS', `Rutas con escala: ${multiLeg.length} de ${solution.routes.length}`);
      expect(multiLeg.length, 'debe existir al menos una ruta con escalas').toBeGreaterThan(0);

      const maxHops = Math.max(...(solution.routes as any[]).map(r => (r.flights ?? []).length));
      log('HOPS', `Máximo de tramos en una ruta: ${maxHops}`);

      // Evidencia en UI: buscar ese envío en el panel inferior y comprobar que su detalle
      // enumera los tramos (origen → escala → destino).
      const target = multiLeg[0];
      log('HOPS', `Envío con escalas: ${target.batchId} (${target.originId} → ${target.destinationId}, ${target.flights.length} tramos)`);

      const bottomToggle = page.getByTitle('Mostrar panel inferior');
      if (await bottomToggle.isVisible().catch(() => false)) await bottomToggle.click();
      await page.getByRole('button', { name: 'Todos los Envíos' }).click();

      const bottomSearch = page.getByPlaceholder('Buscar por código, cliente, UT o ruta');
      await bottomSearch.fill(target.batchId);
      const rows = page.getByTestId('shipment-row');
      await expect(rows.first()).toBeVisible({ timeout: 60_000 });
      await rows.first().click();

      // El detalle dibuja un círculo ámbar por escala intermedia (leg no final).
      const stopover = page.locator('svg circle[fill="#FFC857"]');
      await expect(stopover.first(), 'el mapa debe marcar al menos una escala intermedia')
        .toBeVisible({ timeout: 20_000 });
      log('HOPS', 'Escala intermedia dibujada en el mapa ✅');
    });

    // ───────────────────── 4. Sub-lotes de un envío partido ─────────────────────
    await test.step('Verificar sub-lotes de un envío partido por capacidad', async () => {
      const families = new Map<string, any[]>();
      for (const r of solution.routes as any[]) {
        const base = baseBatchId(r.batchId);
        if (!families.has(base)) families.set(base, []);
        families.get(base)!.push(r);
      }
      const split = [...families.entries()].filter(([, rs]) => rs.length > 1)
        .sort((a, b) => b[1].length - a[1].length);

      if (split.length === 0) {
        // Con E2E_REGISTER_SHIPMENTS se registró un envío que NO cabe en una UT: si aun así no se
        // partió, es un fallo real, no un "no tocó en este ciclo".
        expect(REGISTER_SHIPMENTS, 'se registró un envío de 400 maletas y no se partió en sub-lotes').toBe(false);
        log('SPLIT', '⚠️  Ningún envío se partió en sub-lotes en este ciclo (no aplica el chequeo visual)');
        return;
      }

      const [baseId, sublots] = split[0];
      log('SPLIT', `Envío partido: ${baseId} → ${sublots.length} sub-lotes (${sublots.map((s: any) => s.batchId).join(', ')})`);

      // Seleccionar cualquiera de los sub-lotes debe dibujar la FAMILIA completa, con
      // un color por sub-lote y la leyenda "id · N maletas".
      await closeShipmentDetail(page);
      const search = page.getByPlaceholder('Buscar por código, cliente, UT o ruta');
      await search.fill(baseId);
      const rows = page.getByTestId('shipment-row');
      await expect(rows.first()).toBeVisible({ timeout: 20_000 });
      await rows.first().click();

      // Leyenda de sub-lotes: solo aparece cuando hay más de uno.
      const legend = page.locator('svg text', { hasText: /maletas/ });
      await expect(legend.first(), 'el mapa debe mostrar la leyenda de sub-lotes')
        .toBeVisible({ timeout: 20_000 });
      const legendCount = await legend.count();
      log('SPLIT', `Leyenda del mapa con ${legendCount} sub-lotes visibles ✅`);
      expect(legendCount).toBeGreaterThan(1);

      // Colores distintos por sub-lote (SUBLOT_COLORS[0] y [1]).
      await expect(page.locator('svg path[stroke="#00FF9C"]').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('svg path[stroke="#4DA6FF"]').first()).toBeVisible({ timeout: 10_000 });
      log('SPLIT', 'Rutas de los sub-lotes dibujadas con colores distintos ✅');

      await search.fill('');
    });

    // ───────────────────── 5. Cancelación de vuelo, rigurosa ─────────────────────
    await test.step('Cancelar un vuelo por UI y verificar que deja de operar', async () => {
      const fresh = await apiGet(request, `/simulations/${simId}/solution`);
      const routeWithFlight = (fresh.routes ?? []).find((r: any) => (r.flights ?? []).length > 0);
      expect(routeWithFlight, 'debe haber una ruta con vuelo asignado').toBeTruthy();
      const flightId = baseFlightId(routeWithFlight.flights[0].flightId);
      log('CANCEL', `Vuelo a cancelar (en uso por ${routeWithFlight.batchId}): ${flightId}`);

      // — 5a. ANTES: la UT existe, no está cancelada, y su ruta SÍ se dibuja en el mapa.
      await openRightTab(page, 'UT');
      const rightPanel = page.getByTestId('right-panel');
      const utSearch = rightPanel.getByPlaceholder('Buscar UT por código o ruta');
      await utSearch.fill(flightId);
      await expect(rightPanel.getByText(flightId, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      // /^CANCELADO$/: getByText con string hace substring case-insensitive y engancharía
      // el chip de filtro "Cancelados" — hace falta la coincidencia exacta del badge.
      await expect(rightPanel.getByText(/^CANCELADO$/)).toHaveCount(0);

      // El plan proyecta una instancia del vuelo POR DÍA (mismo código base, sufijo -D{n}) y
      // la cancelación aplica solo a la del día objetivo, así que se cuentan las rutas dibujadas
      // al filtrar el mapa por esa UT: después de cancelar debe haber exactamente UNA menos.
      await page.getByTitle('Centrar y filtrar UT en mapa').first().click();
      const plannedRoute = page.locator('svg path[stroke="#4DA6FF"][stroke-dasharray="5 5"]');
      await expect(plannedRoute.first(), 'antes de cancelar, la ruta del vuelo se dibuja')
        .toBeVisible({ timeout: 15_000 });
      const routesBefore = await plannedRoute.count();
      log('CANCEL', `Antes de cancelar: ${routesBefore} instancia(s) de ${flightId} dibujadas en el mapa ✅`);
      // Quitar el filtro del mapa para no arrastrar estado al resto del paso.
      await page.getByTitle('Quitar filtro del mapa').first().click();

      // — 5b. Cancelar desde la UI (modal "Cancelar Vuelo" del panel izquierdo).
      await ensureLeftPanel(page);
      await page.getByRole('button', { name: 'Cancelar Vuelo' }).click();
      const searchInput = page.getByPlaceholder('Buscar por código, origen o destino…').last();
      await searchInput.fill(flightId);
      const option = page.locator('button', { hasText: flightId }).first();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await page.getByRole('button', { name: /Cancelar Vuelo/i }).last().click();
      // El modal solo se cierra si la petición terminó BIEN (si falla se queda abierto con el
      // error). Antes se aceptaba cualquier texto con "cancelad", que también encaja con el
      // botón "Cancelar simulación": la aserción pasaba aunque la cancelación hubiera fallado.
      await expect(
        page.getByPlaceholder('Buscar por código, origen o destino…'),
        'el modal de cancelación debe cerrarse (si falla, se queda abierto con el error)'
      ).toHaveCount(0, { timeout: 60_000 });
      log('CANCEL', 'Cancelación aceptada por el backend (modal cerrado) ✅');

      // — 5c. Zona de CANCELADOS de la lista de UT.
      await openRightTab(page, 'UT');
      await rightPanel.getByPlaceholder('Buscar UT por código o ruta').fill(flightId);
      await rightPanel.getByRole('button', { name: 'Cancelados', exact: true }).click();
      await expect(
        rightPanel.getByText(flightId, { exact: false }).first(),
        'la UT debe aparecer en el filtro Cancelados'
      ).toBeVisible({ timeout: 20_000 });
      await expect(rightPanel.getByText(/^CANCELADO$/).first()).toBeVisible({ timeout: 10_000 });
      log('CANCEL', 'La UT aparece en la zona de CANCELADOS con su badge ✅');

      // — 5d. Ya no está entre las que vuelan.
      await rightPanel.getByRole('button', { name: 'En vuelo', exact: true }).click();
      await expect(
        rightPanel.getByText(flightId, { exact: false }),
        'la UT cancelada no debe listarse como En vuelo'
      ).toHaveCount(0, { timeout: 15_000 });
      log('CANCEL', 'No aparece bajo el filtro "En vuelo" ✅');

      // — 5e. La instancia cancelada ya no se dibuja en el mapa (las de otros días, sí).
      await rightPanel.getByRole('button', { name: 'Cancelados', exact: true }).click();
      const cancelledInstance = await rightPanel.getByText(new RegExp(`^${flightId}(-D\\d+)?$`))
        .first().textContent().catch(() => null);
      log('CANCEL', `Instancia cancelada según la UI: ${cancelledInstance?.trim() ?? '(no legible)'}`);
      // Se centra el mapa en la UT CANCELADA (sin salir del filtro "Cancelados", para no
      // acabar seleccionando la instancia de otro día del mismo código de vuelo).
      await page.getByTitle('Centrar y filtrar UT en mapa').first().click();
      await expect(
        plannedRoute,
        `la instancia cancelada ${cancelledInstance} no debe dibujar ruta en el mapa`
      ).toHaveCount(0, { timeout: 15_000 });
      log('CANCEL', `La instancia cancelada ya NO se dibuja en el mapa (antes: ${routesBefore}) ✅`);
      await page.getByTitle('Quitar filtro del mapa').first().click();

      // — 5f. El backend confirma que ningún lote lo sigue usando ese día.
      const after = await apiGet(request, `/simulations/${simId}/solution`);
      const stillUsed = (after.routes ?? []).flatMap((r: any) => (r.flights ?? []))
        .filter((f: any) => baseFlightId(f.flightId) === flightId);
      log('CANCEL', `Tramos que siguen usando el vuelo cancelado: ${stillUsed.length}`);
      expect(stillUsed.length, 'ningún lote debe seguir asignado al vuelo cancelado').toBe(0);
      log('CANCEL', 'Backend confirma la reasignación ✅');
    });

    // ───────────────────────────── 6. Cierre ─────────────────────────────
    await test.step('Cierre', async () => {
      if (KEEP_RUNNING) {
        log('CLOSE', 'Se deja la simulación CORRIENDO a propósito (5 días / colapso)');
        return;
      }
      await page.getByRole('button', { name: 'Cancelar simulación' }).click();
      await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible({ timeout: 30_000 });
      log('CLOSE', 'Simulación detenida ✅');
    });
  });
});
