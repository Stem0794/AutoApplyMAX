import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  eslint.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        AAM: 'readonly',
        AAM_COMMUNITY_API_URL: 'readonly',
        AAM_COMMUNITY_PUBLISHABLE_KEY: 'readonly',
        importScripts: 'readonly',
      },
    },
    rules: {
      'no-redeclare': 'off',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^(_|result$|tab$|err$)',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['*.{js,mjs}', 'scripts/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['src/**/*.ts', 'tests/**/*.ts', 'playwright.config.ts', 'vitest.config.ts'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        chrome: 'readonly',
      },
    },
  })),
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty-pattern': 'off',
    },
  },
];
