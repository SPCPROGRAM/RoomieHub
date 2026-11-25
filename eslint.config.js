import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // the Edge Function entry runs on Deno (npm:/Deno globals); its logic.ts is linted and tested
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'public/push-sw.js', 'supabase/functions/*/index.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Context providers export their hook, and the route table holds lazy components:
    // both are intentional, the rule only concerns dev hot-reload granularity.
    files: ['src/providers/**', 'src/router/**', 'src/components/ui/**', 'src/components/shared/**', 'src/features/**/*Card.tsx', 'src/features/**/*Sheet.tsx', 'tests/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
