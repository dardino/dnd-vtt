import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.e2e/**',
      'server/src/srd/data/**',
    ],
  },
  { ...js.configs.recommended, files: ['**/*.{js,mjs,ts}'] },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: ['**/*.ts'] })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,ts}'],
    plugins: { '@stylistic': stylistic },
    rules: {
      ...stylistic.configs.recommended.rules,
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/max-len': ['error', { code: 110, ignoreUrls: true, ignoreStrings: true }],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'semi', requireLast: true },
        singleline: { delimiter: 'semi', requireLast: false },
      }],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/arrow-parens': ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@angular/*',
            'fastify',
            'fastify/*',
            'node:*',
            'ws',
            'drizzle-orm',
            'drizzle-orm/*',
            'sharp',
            'better-sqlite3',
          ],
          message: 'shared deve restare isomorfo: niente Angular, Node o database.',
        }],
      }],
    },
  },
  {
    files: ['client/src/**/*.ts', 'client/e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@dnd-vtt/shared/src/*', '../../server/*', '../../../server/*'],
          message: 'Il client può importare solo il barrel @dnd-vtt/shared.',
        }],
      }],
    },
  },
  {
    files: ['server/src/**/*.ts', 'server/test/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['../../client/*', '../../../client/*', '@angular/*'],
          message: 'Il server non può dipendere dal client o da Angular.',
        }],
      }],
    },
  },
  {
    files: ['client/src/**/*.{ts,html}', 'server/src/**/*.ts', 'shared/src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Debito R0: ogni split rimuove il proprio file da questo elenco (vedi TODO.md).
    // Gli .scss non passano da ESLint: restano tracciati solo da `npm run files:report`.
    files: [
      'client/src/app/features/dm/dm-shell.page.ts',
      'client/src/app/features/scene/scene-canvas.component.ts',
      'client/src/app/features/dm/dm-shell.page.html',
      'client/src/app/features/maps/map-editor-canvas.component.ts',
      'client/src/app/features/actor/actor-sheet.page.ts',
      'shared/src/lib/sheet/validate.ts',
      'client/src/app/features/maps/map-editor.page.ts',
      'client/src/app/features/character/character-wizard.page.html',
      'client/src/app/features/character/character-wizard.store.ts',
      'client/src/app/features/actor/actor-sheet.page.html',
      'shared/src/schemas/sheet.ts',
      'shared/src/lib/sheet/__fixtures__/catalog.ts',
      'client/src/app/features/maps/map-editor.page.html',
    ],
    rules: { 'max-lines': 'off' },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'server/scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  ...angular.configs.tsRecommended.map((config) => ({ ...config, files: ['client/**/*.ts'] })),
  {
    files: ['client/**/*.ts'],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
    },
  },
  ...angular.configs.templateRecommended.map((config) => ({ ...config, files: ['client/**/*.html'] })),
  ...angular.configs.templateAccessibility.map((config) => ({ ...config, files: ['client/**/*.html'] })),
  {
    files: ['client/public/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
      },
    },
  },
  {
    files: ['**/*.config.ts'],
    languageOptions: {
      parserOptions: { projectService: false },
    },
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      parserOptions: { projectService: false },
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: { 'no-undef': 'off' },
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Gli script di root usano solo API Node globali: il preset disableTypeChecked va prima
    // delle languageOptions, altrimenti sovrascrive i globals e `no-undef` segnala process.
    files: ['scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false },
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: { 'no-undef': 'off' },
  },
);
