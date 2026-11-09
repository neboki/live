import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MODULES = ['core', 'live', 'onboarding', 'overlay', 'session', 'settings'];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'functions/lib/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // A module is used from outside through its index.ts only (`@/modules/session`, not
  // `@/modules/session/utils/download`). Tests may still reach inside to mock or set up.
  ...[...MODULES, null].map((own) => ({
    files: own ? [`src/modules/${own}/**/*.{ts,vue}`] : ['src/**/*.{ts,vue}'],
    ignores: [...(own ? [] : ['src/modules/**']), '**/*.spec.ts', '**/*.fakes.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*/**', ...(own ? [`!@/modules/${own}/**`] : [])],
              message:
                "Import another module from its index.ts ('@/modules/<name>'), not a file inside it.",
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['*.config.{js,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  prettier,
);
