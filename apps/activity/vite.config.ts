import preact from '@preact/preset-vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  // The staging-only debug panel (`src/dev/`). Fail closed: a build includes it only when the deploy
  // says it is for staging (`TARGET_ENV=staging`, which deploy.yml already sets for the job) or when
  // someone asks for it locally. Every other build (production, a plain `pnpm build`) strips it: the
  // flag becomes a literal `false`, so the dynamic `import()` of the panel is dead code and the panel
  // chunk is never emitted. `pnpm dev` and the tests (the `serve` command) always have it.
  // (Not `mode`: `vite build` is `production` mode for staging too.)
  const targetEnv = loadEnv(mode, '.', 'TARGET_ENV')['TARGET_ENV'];
  const devToolsBuild = command === 'serve' || targetEnv === 'staging';
  return {
    plugins: [preact()],
    define: { __DEV_TOOLS_BUILD__: JSON.stringify(devToolsBuild) },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // CSP forbids inline resources (and the font/img policies are strict): never inline assets.
      assetsInlineLimit: 0,
    },
    server: {
      // `pnpm dev` in apps/worker serves the API on 8787.
      proxy: { '/api': 'http://localhost:8787' },
    },
  };
});
