// Runs the Cinder Wyrm reflect study (src/reflect-study.ts) without a build step.
//
// The study tries other rules for Backdraft (the reflected hit) WITHOUT touching the engine: a Vite
// plugin rewrites one line of `packages/engine/src/fight.ts` in memory while it is loaded (the file on
// disk is never changed, and no other process sees the rewrite). The rewritten line reads a study
// switch from `globalThis.__reflectStudy`; with no switch it does exactly what the shipped line does.
// The plugin refuses to run if the line is not found, so a refactor of the engine cannot make the study
// silently measure the shipped rule.
/* global console */
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

const SHIPPED = "if (reflected) hurt(c, hit.reflect, 'reflect', 'direct');";
const STUDY = `if (reflected) {
        const study = (globalThis as { __reflectStudy?: { mode: string; capBp: number } }).__reflectStudy;
        if (study === undefined || study.mode === 'shipped') {
          hurt(c, hit.reflect, 'reflect', 'direct');
        } else if (study.mode === 'cap') {
          // Study: the reflected hit takes at most capBp of the payoff's max HP.
          hurt(c, Math.min(hit.reflect, Math.floor((c.maxHp * study.capBp) / 10_000)), 'reflect', 'direct');
        } else {
          // Study: a living Guard right beside the payoff takes the whole backlash (left one first).
          let taker: Creature = c;
          if (c.role !== 'guard') {
            for (const i of besides(c.idx)) {
              const g = creatures[i] as Creature;
              if (g.alive && g.role === 'guard') {
                taker = g;
                break;
              }
            }
          }
          hurt(taker, hit.reflect, 'reflect', 'direct');
        }
      }`;

const reflectStudyPlugin = {
  name: 'reflect-study',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('packages/engine/src/fight.ts')) return null;
    if (!code.includes(SHIPPED)) {
      throw new Error('reflect study: the reflect line of fight.ts changed; update this script');
    }
    return { code: code.replace(SHIPPED, STUDY), map: null };
  },
};

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  plugins: [reflectStudyPlugin],
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let code;
try {
  const cli = await server.ssrLoadModule('/src/reflect-study.ts');
  code = cli.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  code = 1;
} finally {
  await server.close();
}
process.exitCode = code;
