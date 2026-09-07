import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint configuration for the workspace.
 *
 * ## Why Babel parses TypeScript here, and not typescript-eslint
 *
 * This repository is on TypeScript 7, whose npm package is a thin wrapper around
 * the native Go compiler. Its main export is `{ version, versionMajorMinor }` —
 * the classic JavaScript compiler API is gone:
 *
 *     import ts from 'typescript';
 *     ts.createSourceFile  // undefined
 *     ts.createProgram     // undefined
 *     ts.SyntaxKind        // undefined
 *
 * `@typescript-eslint/typescript-estree` is built on exactly those functions, so
 * it cannot parse this codebase at any version — its own peer range stops at
 * `typescript <6.1.0`, which is a symptom rather than the cause. Babel has always
 * parsed TypeScript with its own grammar and never touches the TS compiler, so it
 * reads these files happily.
 *
 * The trade-off is real and worth naming: **no type-aware rules.** Anything that
 * needs a type checker — `no-floating-promises`, `no-misused-promises`,
 * `no-unnecessary-condition` — is unavailable. That work is done by `pnpm
 * typecheck`, which runs the real compiler across every package, so the two
 * commands are complementary rather than overlapping. Treat `tsc` as the
 * correctness gate and ESLint as the consistency gate.
 *
 * Revisit this when typescript-eslint adopts TypeScript 7's `unstable/ast` API.
 */

/**
 * The Babel presets live in a file, not inline, and that is not a style choice.
 *
 * ESLint deep-merges `languageOptions.parserOptions` when it flattens the config,
 * and that merge does not preserve arrays — a nested `presets: [[a], [b]]` arrives
 * at Babel as `{ "0": { "0": a }, "1": { ... } }`. Babel sees a non-array, ignores
 * it, and every TypeScript file fails to parse with a misleading
 * "Unexpected token, expected ," on the first type annotation it meets.
 * `--print-config` is what shows this; the error message never hints at it.
 *
 * Passing a path sends one string through the merger instead, and Babel reads the
 * presets itself. The filename is deliberately not `babel.config.json`: Babel
 * auto-discovers that name, and `@vitejs/plugin-react` runs Babel during the web
 * build, so a discoverable config here would quietly change what ships.
 *
 * Babel 8 also removed `isTSX`, `allExtensions` and `allowDeclareFields`; the
 * TypeScript preset now picks TS or TSX from the file extension. `preset-react`
 * only enables the JSX grammar — ESLint parses, it never transforms — and the
 * Babel file scopes it to `.tsx`/`.jsx` with an `overrides` block. That scoping
 * matters: with JSX enabled in a plain `.ts` file, the generic arrow functions in
 * `lib/api.ts` (`get: <T>(path: string) => ...`) read as unclosed JSX tags.
 */
const babelConfigPath = fileURLToPath(new URL('./babel.eslint.config.json', import.meta.url));

const typescriptParser = {
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    sourceType: 'module',
    ecmaVersion: 'latest',
    babelOptions: { babelrc: false, configFile: babelConfigPath },
  },
};

/**
 * Rules applied everywhere.
 *
 * Deliberately short. A linter that shouts about formatting earns the `--fix`
 * reflex, and the rules that matter get skimmed along with the noise. Every rule
 * below either catches a bug or enforces something the codebase already does
 * consistently.
 */
const sharedRules = {
  // `catch {}` that swallows an error is nearly always a mistake; the codebase
  // uses `catch { /* comment */ }` where it is deliberate.
  'no-empty': ['error', { allowEmptyCatch: false }],

  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-debugger': 'error',
  'no-alert': 'error',
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  'object-shorthand': ['error', 'properties'],
  'no-useless-rename': 'error',
  'no-lonely-if': 'error',
  'prefer-template': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-implicit-coercion': ['error', { boolean: false }],

  // Money is stored in integer minor units throughout. A float creeping into an
  // amount is the kind of bug that only shows up in a customer's invoice.
  'no-loss-of-precision': 'error',

  // Caught by `tsc` with better messages, and the base rule cannot see
  // TypeScript's type-only imports or declaration merging.
  'no-undef': 'off',
  'no-unused-vars': 'off',
  'no-redeclare': 'off',
  'no-dupe-class-members': 'off',
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.vite/**',
      '**/generated/**',
      'apps/api/prisma/migrations/**',
      'apps/web/public/**',
      'apps/web/dev-dist/**',
    ],
  },

  js.configs.recommended,

  /* ---------------------------------------------------------------------- */
  /* API — Node                                                             */
  /* ---------------------------------------------------------------------- */
  {
    files: ['apps/api/**/*.{ts,js}', 'packages/types/**/*.ts'],
    languageOptions: {
      ...typescriptParser,
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      // The server logs through pino; a stray console bypasses redaction, and
      // redaction is what keeps tokens and payment credentials out of the logs.
      'no-console': 'error',
    },
  },

  /* Scripts and seeds report to a human at a terminal. */
  {
    files: ['apps/api/src/scripts/**/*.ts', 'apps/api/prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  /* ---------------------------------------------------------------------- */
  /* Web — browser + React                                                  */
  /* ---------------------------------------------------------------------- */
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ...typescriptParser,
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...sharedRules,
      ...reactHooks.configs.recommended.rules,

      // Fast Refresh only replaces a module whose exports are all components.
      // A screen file that also exports a helper silently loses hot reload.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  /* ---------------------------------------------------------------------- */
  /* Tests                                                                  */
  /* ---------------------------------------------------------------------- */
  {
    files: ['apps/api/tests/**/*.ts', '**/*.test.{ts,tsx}'],
    languageOptions: {
      ...typescriptParser,
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'no-console': 'off',
    },
  },

  /* ---------------------------------------------------------------------- */
  /* Config files                                                           */
  /* ---------------------------------------------------------------------- */
  {
    files: ['*.config.{js,ts}', '**/*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      ...typescriptParser,
      globals: { ...globals.node },
    },
    rules: { ...sharedRules, 'no-console': 'off' },
  },
];
