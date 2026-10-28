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
      '**/.turbo/**',
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
      '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true, ignoreStrings: true }],
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
    },
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
);
