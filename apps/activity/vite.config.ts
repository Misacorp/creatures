/// <reference types="vitest/config" />
import preact from '@preact/preset-vite';
import { defineConfig, loadEnv } from 'vite';
import { wikiPlugin } from './src/wiki/plugin.ts';

export default defineConfig(({ command, mode }) => {
  // The staging-only debug panel (`src/dev/`). Fail closed: a build includes it only when the deploy
  // says it is for staging (`TARGET_ENV=staging`, which deploy.yml already sets for the job) or when
  // someone asks for it locally. Every other build (production, a plain `pnpm build`) strips it: the
  // flag becomes a literal `false`, so the dynamic `import()` of the panel is dead code and the panel
  // chunk is never emitted. `pnpm dev` and the tests (the `serve` command) always have it.
  // (Not `mode`: `vite build` is `production` mode for staging too.)
  const targetEnv = loadEnv(mode, '.', 'TARGET_ENV')['TARGET_ENV'];
  const devToolsBuild = command === 'serve' || targetEnv === 'staging';
  // The component workbench (`workbench.html`, `src/workbench/`) is a second page behind the same
  // gate: it is a build input only when the dev tools are in, so a production build never emits it.
  const input: Record<string, string> = { index: 'index.html' };
  if (devToolsBuild) input['workbench'] = 'workbench.html';
  // The combat lab (`combat-lab.html`, `src/combat-lab/`, the combat v2 prototype) is a third page
  // behind the same gate: staging and `pnpm dev` only, so it (and the lab engine it bundles) never
  // reaches a production build.
  if (devToolsBuild) input['combat-lab'] = 'combat-lab.html';
  // The wiki (`wiki.html`, `src/wiki/`) is generated text with no script, for every build; see `wikiPlugin`.
  return {
    plugins: [preact(), wikiPlugin()],
    define: { __DEV_TOOLS_BUILD__: JSON.stringify(devToolsBuild) },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // CSP forbids inline resources (and the font/img policies are strict): never inline assets.
      assetsInlineLimit: 0,
      rollupOptions: { input },
    },
    server: {
      // `pnpm dev` in apps/worker serves the API on 8787.
      proxy: { '/api': 'http://localhost:8787' },
    },
    test: {
      // A few property-style tests loop over many instants and zones. They take about 1 s alone, but
      // on a busy CI runner (all packages test in parallel) they can pass the 5 s default.
      testTimeout: 30_000,
      css: { include: [/\.css\?raw$/] },
    },
  };
});
