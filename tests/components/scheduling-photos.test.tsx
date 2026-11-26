import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../helpers/renderApp';

describe('chore scheduling form', () => {
  it('creates an every-other-day chore that rotates each time, with a live preview', async () => {
    const user = userEvent.setup();
    await renderApp('/chores?new=1');
    const dialog = await screen.findByRole('dialog', { name: 'Nueva tarea' });
    await user.type(within(dialog).getByLabelText('Nombre de la tarea'), 'Limpiar cocina LXV');
    await user.selectOptions(within(dialog).getByLabelText('Frecuencia'), 'custom_days');
    await user.click(within(dialog).getByRole('button', { name: 'Día por medio (L · X · V)' }));
    expect(within(dialog).getByRole('radio', { name: /Rota cada vez/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByText('Así queda esta semana')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    expect(await screen.findByText('L · X · V')).toBeInTheDocument();
  });

  it('requires a person for a fixed assignment', async () => {
    const user = userEvent.setup();
    await renderApp('/chores?new=1');
    const dialog = await screen.findByRole('dialog', { name: 'Nueva tarea' });
    await user.type(within(dialog).getByLabelText('Nombre de la tarea'), 'Regar plantas');
    await user.click(within(dialog).getByRole('radio', { name: /Persona fija/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Elige quién hará la tarea.')).toBeInTheDocument();
  });

  it('opens edit (with delete) from a weekly turn', async () => {
    const user = userEvent.setup();
    await renderApp('/chores');
    await screen.findByRole('heading', { level: 1, name: 'Tareas y obligaciones' });
    await user.click(screen.getAllByRole('button', { name: 'Acciones' })[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Editar o eliminar tarea' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar tarea' });
    expect(within(dialog).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });
});

describe('damage report photos', () => {
  it('offers camera and gallery buttons when reporting damage', async () => {
    const user = userEvent.setup();
    await renderApp('/maintenance');
    await screen.findByRole('heading', { level: 1, name: 'Reportes de daños' });
    await user.click(screen.getByRole('button', { name: 'Reportar daño' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar daño' });
    expect(within(dialog).getByRole('button', { name: 'Tomar foto' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Elegir de la galería' })).toBeInTheDocument();
    // a picked photo shows as a thumbnail before saving
    await user.upload(within(dialog).getByTestId('photo-gallery'), new File(['x'], 'fuga.jpg', { type: 'image/jpeg' }));
    expect(within(dialog).getByRole('button', { name: 'Quitar foto' })).toBeInTheDocument();
  });
});
