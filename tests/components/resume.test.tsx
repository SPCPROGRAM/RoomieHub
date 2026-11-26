import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, VALENTINA } from '../helpers/renderApp';

describe('returning to the app (Android resume)', () => {
  it('keeps a form in progress when the session is refreshed on resume', async () => {
    const user = userEvent.setup();
    const { repo } = await renderApp('/maintenance');
    await screen.findByRole('heading', { level: 1, name: 'Reportes de daños' });
    await user.click(screen.getByRole('button', { name: 'Reportar daño' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar daño' });
    await user.type(within(dialog).getByLabelText('Qué pasó'), 'Ventana rota');

    // Supabase emits a new session object for the same person when the app comes back
    await act(async () => repo.signInAs(VALENTINA.id));

    const still = screen.getByRole('dialog', { name: 'Reportar daño' });
    expect(within(still).getByLabelText('Qué pasó')).toHaveValue('Ventana rota');
  });

  it('restores a report draft after the app was killed in the background', async () => {
    const user = userEvent.setup();
    const first = await renderApp('/maintenance');
    await screen.findByRole('heading', { level: 1, name: 'Reportes de daños' });
    await user.click(screen.getByRole('button', { name: 'Reportar daño' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar daño' });
    await user.type(within(dialog).getByLabelText('Qué pasó'), 'Fuga en la ducha');
    await new Promise((r) => setTimeout(r, 400)); // draft autosave debounce

    // Android kills the page: everything in memory is gone, localStorage survives
    const draft = localStorage.getItem(`rh.draft.report.${'de300000-0000-4000-8000-000000000001'}`);
    first.unmount();
    localStorage.setItem('rh.draft.report.de300000-0000-4000-8000-000000000001', draft!);

    // renderApp resets the demo data but keeps other keys, like the draft
    await renderApp('/maintenance');
    const restored = await screen.findByRole('dialog', { name: 'Reportar daño' });
    expect(within(restored).getByLabelText('Qué pasó')).toHaveValue('Fuga en la ducha');
    expect(within(restored).getByText('Recuperamos el reporte que estabas escribiendo.')).toBeInTheDocument();

    // discarding removes it for good
    await user.click(within(restored).getByRole('button', { name: 'Descartar borrador' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem('rh.draft.report.de300000-0000-4000-8000-000000000001')).toBeNull();
  });
});
