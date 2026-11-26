import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEMO_APARTMENT_ID } from '@/services/demoSeed';
import { renderApp } from '../helpers/renderApp';

describe('deleting chores', () => {
  it('removes a chore created by mistake completely, including skipped turns', async () => {
    const user = userEvent.setup();
    const { repo } = await renderApp('/chores?new=1');
    const form = await screen.findByRole('dialog', { name: 'Nueva tarea' });
    await user.type(within(form).getByLabelText('Nombre de la tarea'), 'Tarea equivocada');
    await user.click(within(form).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // skip one of its turns first (this used to leave it stuck in the week)
    let snap = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    const created = snap.chores.find((c) => c.title === 'Tarea equivocada')!;
    const turn = snap.assignments.find((a) => a.chore_id === created.id)!;
    await repo.setAssignmentSkipped(turn.id, true);

    const row = (await screen.findAllByText('Tarea equivocada'))[0]!.closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Acciones' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar o eliminar tarea' }));
    const edit = await screen.findByRole('dialog', { name: 'Editar tarea' });
    await user.click(within(edit).getByRole('button', { name: 'Eliminar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Eliminar tarea' });
    await user.click(within(confirm).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('Tarea equivocada')).not.toBeInTheDocument());
    snap = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    expect(snap.chores.some((c) => c.id === created.id)).toBe(false);
    expect(snap.assignments.some((a) => a.chore_id === created.id)).toBe(false);
  });

  it('archives a chore with completed history and hides it from the week', async () => {
    const user = userEvent.setup();
    const { repo } = await renderApp('/chores');
    await screen.findByRole('heading', { level: 1, name: 'Tareas y obligaciones' });
    const snap = await repo.loadSnapshot(DEMO_APARTMENT_ID);
    const withHistory = snap.chores.find((c) => snap.assignments.some((a) => a.chore_id === c.id && a.status === 'done'))!;

    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    const card = (await screen.findByText(withHistory.title)).closest('li')!;
    await user.click(within(card).getByRole('button', { name: 'Eliminar' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Eliminar tarea' })).getByRole('button', { name: 'Eliminar' }));

    await waitFor(async () => {
      const after = await repo.loadSnapshot(DEMO_APARTMENT_ID);
      expect(after.chores.find((c) => c.id === withHistory.id)?.archived_at).not.toBeNull();
      // completed turns stay as history
      expect(after.assignments.some((a) => a.chore_id === withHistory.id && a.status === 'done')).toBe(true);
    });
    await user.click(screen.getByRole('tab', { name: /Esta semana/ }));
    expect(screen.queryByText(withHistory.title)).not.toBeInTheDocument();
  });
});
