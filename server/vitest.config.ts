import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/__fixtures__/**',
        'src/**/*.d.ts',
        'dist/**',
        'src/index.ts',
        'src/db/migrate-cli.ts',
        'src/db/reset-cli.ts',
        'src/db/seed-cli.ts',
        'src/db/seed.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
});
