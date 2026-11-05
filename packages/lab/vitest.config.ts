import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Files in one worker share their modules: with isolation each of the 40 files re-imported the whole lab (a third of the CPU of
    // the suite). Safe here because the modules hold no state a test changes (checked with --sequence.shuffle, files and tests, on
    // three seeds). A test that mocks a module or sets a global must undo it before it ends (none does today).
    isolate: false,
    // Transform time was most of the import cost; persist it between runs (the cache lives in node_modules, gitignored).
    fsModuleCache: true,
  },
});
