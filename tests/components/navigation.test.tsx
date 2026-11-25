import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { features } from '@/config/features';
import { renderApp } from '../helpers/renderApp';

describe('routing and guards', () => {
  it('redirects guests to the login page', async () => {
    const { router } = await renderApp('/finances', { signedInAs: null });
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows the dashboard for a signed-in roomie', async () => {
    await renderApp('/');
    expect(await screen.findByRole('heading', { name: /Hola, Valentina/ })).toBeInTheDocument();
    expect(screen.getByText('Mis tareas de la semana')).toBeInTheDocument();
    expect(screen.getAllByText(/Modo demostración/).length).toBeGreaterThan(0);
  });

  it.each(
    [
      ['/chores', 'Tareas y obligaciones'],
      ...(features.finances ? [['/finances', 'Finanzas']] : []),
      ['/calendar', 'Calendario'],
      ...(features.shopping ? [['/shopping', 'Lista de mercado']] : []),
      ['/stats', 'Estadísticas'],
      ['/maintenance', 'Reportes de daños'],
      ['/settings', 'Ajustes'],
    ] as [string, string][],
  )('renders %s without broken imports', async (path, heading) => {
    await renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it.skipIf(features.finances && features.shopping)('hides the money modules: no menu entry and their URLs go home', async () => {
    const { router } = await renderApp('/finances');
    expect(await screen.findByRole('heading', { name: /Hola, Valentina/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    for (const nav of screen.getAllByRole('navigation', { name: 'Navegación principal' })) {
      expect(within(nav).queryByRole('link', { name: 'Finanzas' })).toBeNull();
      expect(within(nav).queryByRole('link', { name: 'Mercado' })).toBeNull();
    }
    expect(screen.queryByText('Gastos del mes')).toBeNull();
  });

  it('shows a not-found page for unknown routes', async () => {
    await renderApp('/does-not-exist');
    expect(await screen.findByText('Esta página no existe.')).toBeInTheDocument();
  });

  it('navigates with the main navigation', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    await screen.findByRole('heading', { name: /Hola, Valentina/ });
    const navs = screen.getAllByRole('navigation', { name: 'Navegación principal' });
    await user.click(within(navs[0]!).getByRole('link', { name: 'Calendario' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendario' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/calendar');
  });

  it('switches the interface language to English', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Ajustes' });
    const [langGroup] = screen.getAllByRole('radiogroup', { name: 'Idioma' });
    await user.click(within(langGroup!).getByRole('radio', { name: 'en' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(localStorage.getItem('rh.lang')).toBe('en');
  });

  it('persists the dark theme preference', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Ajustes' });
    const [themeGroup] = screen.getAllByRole('radiogroup', { name: 'Tema' });
    await user.click(within(themeGroup!).getByRole('radio', { name: 'Oscuro' }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect(localStorage.getItem('rh.theme')).toBe('dark');
  });
});
