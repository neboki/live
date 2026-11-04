import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default defineConfig(
  mergeConfig(viteConfig({ command: 'serve', mode: 'test' }), {
    test: {
      environment: 'jsdom',
      // One jsdom per worker, each spec file still in its own context: ~6x faster than a fresh
      // jsdom per file. Node's web streams fill what the VM context lacks (tests/unit/setup.ts)
      pool: 'vmThreads',
      setupFiles: ['tests/unit/setup.ts'],
      include: ['src/**/*.spec.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        // The worklet runs on the audio thread (covered by e2e), main.ts only bootstraps
        // and *.fakes.ts are test doubles
        exclude: [
          'src/**/*.spec.ts',
          'src/**/*.fakes.ts',
          'src/**/*.worklet.ts',
          'src/main.ts',
          'src/**/*.d.ts',
        ],
        reporter: ['text', 'html', 'lcov'],
        thresholds: {
          'src/shared/**': { lines: 80 },
          'src/modules/live/**': { lines: 80 },
        },
      },
    },
  }),
);
