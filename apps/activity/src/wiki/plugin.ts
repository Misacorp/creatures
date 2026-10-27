import { runnerImport, type Plugin } from 'vite';
import type { buildWiki as BuildWiki } from './build.ts';
import type { loadWikiData as LoadWikiData } from './data.ts';
import { WIKI_CSS } from './style.ts';

/**
 * Emits `wiki.html` and `wiki.css`: a reference page of the game's configuration, generated from the
 * content data on every build (production and staging alike), so it is never out of date. Static text
 * only: it adds no JavaScript to the bundle. The data comes from `@creatures/game` and `@creatures/lab`,
 * which are TypeScript sources, so `data.ts` is loaded with Vite's module runner at build time, outside
 * the bundle (nothing the app imports reaches it). The page is not linked from the game.
 */
export function wikiPlugin(): Plugin {
  return {
    name: 'creatures-wiki',
    apply: 'build',
    async generateBundle() {
      const dir = new URL('.', import.meta.url);
      const path = (file: string): string => decodeURIComponent(new URL(file, dir).pathname);
      const dataModule = await runnerImport<{ loadWikiData: typeof LoadWikiData }>(
        path('data.ts'),
        { configFile: false, logLevel: 'silent' },
      );
      const builderModule = await runnerImport<{ buildWiki: typeof BuildWiki }>(path('build.ts'), {
        configFile: false,
        logLevel: 'silent',
      });
      this.emitFile({
        type: 'asset',
        fileName: 'wiki.html',
        source: builderModule.module.buildWiki(dataModule.module.loadWikiData()),
      });
      this.emitFile({ type: 'asset', fileName: 'wiki.css', source: WIKI_CSS });
    },
  };
}
