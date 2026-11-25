import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom lacks matchMedia; components read it for the theme and responsive layout.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(async () => {
  if (typeof window !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    window.localStorage.clear();
  }
});
