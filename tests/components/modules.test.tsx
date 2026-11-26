import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { features } from '@/config/features';
import { renderApp } from '../helpers/renderApp';

describe.skipIf(!features.finances)('finances', () => {
  it('validates and records an expense split between the three roomies', async () => {
    const user = userEvent.setup();
    const { repo } = await renderApp('/finances');
    await screen.findByRole('heading', { level: 1, name: 'Finanzas' });
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo gasto' });

    // invalid amount is rejected with a visible message
    await user.type(within(dialog).getByLabelText('Descripción'), 'Pizza de viernes');
    await user.type(within(dialog).getByLabelText('Monto'), '12,5');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText(/monto válido/)).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Monto'));
    await user.type(within(dialog).getByLabelText('Monto'), '100000');
    // live preview of the shares, remainder goes to the first person
    expect(within(dialog).getAllByText(/33\.334/).length).toBe(1);
    expect(within(dialog).getAllByText(/33\.333/).length).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo gasto' })).not.toBeInTheDocument());
    expect(await screen.findByText('Pizza de viernes')).toBeInTheDocument();
    const snap = await repo.loadSnapshot('de300000-0000-4000-8000-000000000001');
    const expense = snap.expenses.find((e) => e.description === 'Pizza de viernes')!;
    const shares = snap.shares.filter((s) => s.expense_id === expense.id);
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(100000);
  });

  it('requires at least one participant', async () => {
    const user = userEvent.setup();
    await renderApp('/finances');
    await screen.findByRole('heading', { level: 1, name: 'Finanzas' });
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo gasto' });
    await user.type(within(dialog).getByLabelText('Descripción'), 'Algo');
    await user.type(within(dialog).getByLabelText('Monto'), '9000');
    for (const chip of within(dialog).getAllByRole('button', { pressed: true })) await user.click(chip);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Elige al menos una persona.')).toBeInTheDocument();
  });
});

describe('chores', () => {
  it('lets a roomie complete and un-complete a chore from the weekly list', async () => {
    const user = userEvent.setup();
    await renderApp('/chores');
    await screen.findByRole('heading', { level: 1, name: 'Tareas y obligaciones' });
    const toggles = await screen.findAllByRole('button', { name: 'Marcar como hecha' });
    const before = toggles.length;
    await user.click(toggles[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Marcar como hecha' }).length).toBe(before - 1));
    await user.click(screen.getAllByRole('button', { name: 'Desmarcar' })[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Marcar como hecha' }).length).toBe(before));
  });

  it('creates a chore that immediately gets an assignee this week', async () => {
    const user = userEvent.setup();
    await renderApp('/chores');
    await screen.findByRole('heading', { level: 1, name: 'Tareas y obligaciones' });
    await user.click(screen.getByRole('button', { name: 'Nueva tarea' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva tarea' });
    await user.type(within(dialog).getByLabelText('Nombre de la tarea'), 'Regar las plantas');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // new chores default to daily + rotating every time: several turns this week
    expect((await screen.findAllByText('Regar las plantas')).length).toBeGreaterThan(1);
  });
});

describe.skipIf(!features.shopping)('shopping', () => {
  it('quick-adds an item and marks it as purchased', async () => {
    const user = userEvent.setup();
    await renderApp('/shopping');
    await screen.findByRole('heading', { level: 1, name: 'Lista de mercado' });
    await user.type(screen.getByLabelText('Agregar rápido…'), 'Aguacates{Enter}');
    expect(await screen.findByText('Aguacates')).toBeInTheDocument();
    const row = screen.getByText('Aguacates').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Marcar como comprado' }));
    await waitFor(() => expect(screen.queryByText('Aguacates')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Historial de compras/ }));
    expect(await screen.findByText('Aguacates')).toBeInTheDocument();
  });
});

describe('maintenance', () => {
  it('reports damage and shows it in the open list', async () => {
    const user = userEvent.setup();
    await renderApp('/maintenance');
    await screen.findByRole('heading', { level: 1, name: 'Reportes de daños' });
    await user.click(screen.getByRole('button', { name: 'Reportar daño' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar daño' });
    await user.type(within(dialog).getByLabelText('Qué pasó'), 'Ventana rota');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    // after creating, the detail sheet opens with the change history
    expect(await screen.findByRole('dialog', { name: 'Ventana rota' })).toBeInTheDocument();
  });
});
