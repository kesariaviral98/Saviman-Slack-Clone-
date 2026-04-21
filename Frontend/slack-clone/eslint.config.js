import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules'] },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        setInterval: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        process: 'readonly',
      },
    },

    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },

    settings: {
      react: { version: 'detect' },
    },

    rules: {
      // ── Google Style Guide — Code quality ──────────────────────────────────

      // Require === instead of == (Google: always use strict equality)
      'eqeqeq': ['error', 'always'],

      // Disallow var — use const or let (Google: prefer const)
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],

      // Disallow unused variables (Google: no dead code)
      'no-unused-vars': ['error', {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Disallow console.log in production (Google: use a logging abstraction)
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // No unreachable code after return/throw/break/continue
      'no-unreachable': 'error',

      // No duplicate case labels in switch statements
      'no-duplicate-case': 'error',

      // No empty block statements
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Require default case in switch (Google style)
      'default-case': 'error',

      // Disallow assignments in conditions (confusing intent)
      'no-cond-assign': 'error',

      // Disallow use of undefined variables
      'no-undef': 'error',

      // ── Google Style Guide — Functions ─────────────────────────────────────

      // Prefer arrow functions for callbacks (Google: arrow functions for anonymous)
      'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],

      // No useless .call() and .apply() when a regular call suffices
      'no-useless-call': 'error',

      // Require consistent return values from functions
      'consistent-return': 'error',

      // ── Google Style Guide — Naming ────────────────────────────────────────

      // Enforce camelCase for variables and functions (Google standard)
      'camelcase': ['error', {
        properties: 'never',        // allow snake_case in object keys
        ignoreDestructuring: true,  // allow const { some_key } = obj
        ignoreImports: true,
      }],

      // ── Google Style Guide — Strings ───────────────────────────────────────

      // Prefer template literals over string concatenation (Google: use template strings)
      'prefer-template': 'error',

      // No unnecessary string escapes
      'no-useless-escape': 'error',

      // ── Google Style Guide — Objects & Arrays ──────────────────────────────

      // Require shorthand for object methods and properties (Google: use ES6 shorthand)
      'object-shorthand': ['error', 'always'],

      // Prefer spread over Object.assign (Google: prefer spread)
      'prefer-spread': 'error',

      // Prefer destructuring from arrays and objects (Google: destructuring)
      'prefer-destructuring': ['warn', {
        array: false,  // allow arr[0] indexing
        object: true,
      }],

      // ── Google Style Guide — Imports ───────────────────────────────────────

      // No duplicate imports from the same module
      'no-duplicate-imports': 'error',

      // ── Google Style Guide — Error handling ────────────────────────────────

      // Always handle promise rejections (no floating promises)
      'no-promise-executor-return': 'error',

      // ── React rules ────────────────────────────────────────────────────────

      'react/react-in-jsx-scope': 'off',          // not needed with React 17+ JSX transform
      'react/prop-types': 'off',                  // project uses JSDoc / TypeScript elsewhere
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/no-unknown-property': 'error',
      'react/self-closing-comp': ['warn', { component: true, html: true }],
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],

      // ── React Hooks rules ──────────────────────────────────────────────────

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── React Refresh (Vite HMR) ───────────────────────────────────────────

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
