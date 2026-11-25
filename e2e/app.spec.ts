import { expect, test, type Page } from '@playwright/test';
import { features } from '../src/config/features';

async function enterDemo(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explorar la demo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Valentina/ }).click();
  await expect(page.getByRole('heading', { name: /Hola, Valentina/ })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('serves a valid web app manifest and service worker', async ({ page, request }) => {
  await page.goto('/login');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({ name: 'RoomieHub', display: 'standalone', start_url: '/' });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  expect((await request.get('/sw.js')).ok()).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined), { timeout: 10_000 }).toBe(true);
});

test('demo walkthrough across every module without layout overflow', async ({ page }) => {
  await enterDemo(page);
  await expectNoHorizontalOverflow(page);
  const isMobile = (page.viewportSize()?.width ?? 1000) < 1024;
  const nav = page.getByRole('navigation', { name: 'Navegación principal' }).filter({ visible: true });
  await expect(nav).toHaveCount(1);

  const go = async (label: string, heading: string) => {
    const link = nav.getByRole('link', { name: label });
    if (await link.count()) {
      await link.click();
    } else {
      // secondary sections live under "Más" in the Android bottom bar
      await nav.getByRole('button', { name: 'Más' }).click();
      await page.getByRole('dialog').getByRole('link', { name: label }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  };

  await go('Tareas', 'Tareas y obligaciones');
  if (features.finances) await go('Finanzas', 'Finanzas');
  if (features.shopping) await go('Mercado', 'Lista de mercado');
  await go('Calendario', 'Calendario');
  await go('Daños', 'Reportes de daños');
  await go('Estadísticas', 'Estadísticas');
  await go('Ajustes', 'Ajustes');
  await go('Inicio', `Hola, Valentina`);

  if (isMobile) await expect(page.locator('aside')).toBeHidden();
  else await expect(page.locator('aside')).toBeVisible();
});

test('records an expense end to end and updates balances', async ({ page }) => {
  test.skip(!features.finances, 'finances module hidden');
  await enterDemo(page);
  await page.goto('/finances?new=1');
  const dialog = page.getByRole('dialog', { name: 'Nuevo gasto' });
  await dialog.getByLabel('Descripción').fill('Gas natural E2E');
  await dialog.getByLabel('Monto').fill('90.000');
  await expect(dialog.getByText('$ 30.000').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Gas natural E2E')).toBeVisible();
  await page.getByRole('tab', { name: 'Saldos' }).click();
  await expect(page.getByText('Pagos sugeridos para quedar a paz y salvo')).toBeVisible();
});

test('keeps demo data after a reload (persisted locally)', async ({ page }) => {
  await enterDemo(page);
  await page.goto('/chores?new=1');
  const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  await dialog.getByLabel('Nombre de la tarea').fill('Tarea persistente');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tarea persistente').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Tarea persistente').first()).toBeVisible();
});
