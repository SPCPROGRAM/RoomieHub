import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import i18n from '@/i18n';
import { AppProviders } from '@/App';
import { routes } from '@/router/routes';
import { DemoRepository } from '@/services/demoRepository';
import { DEMO_USERS } from '@/services/demoSeed';

export const [VALENTINA, MATEO, SOFIA] = DEMO_USERS;

/** Render the real app (all providers + routes) on top of a fresh demo repository. */
export async function renderApp(path = '/', opts: { signedInAs?: string | null; lang?: 'es' | 'en' } = {}) {
  await i18n.changeLanguage(opts.lang ?? 'es');
  localStorage.setItem('rh.mode', 'demo');
  const repo = new DemoRepository(localStorage);
  repo.reset();
  const who = opts.signedInAs === undefined ? VALENTINA.id : opts.signedInAs;
  if (who) repo.signInAs(who);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProviders repository={repo} withServiceWorker={false}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, repo, router };
}
