import { runnerImport, transformWithOxc, type Plugin } from 'vite';
import type { buildWiki as BuildWiki } from './build.ts';
import type { loadWikiData as LoadWikiData } from './data.ts';
import { WIKI_CSS } from './style.ts';

/**
 * Emits `wiki.html`, `wiki.css`, `wiki.js` and `wiki-art/*.svg`: a reference page of the game's
 * configuration, generated from the content data on every build (production and staging alike), so it
 * is never out of date. The page's text and creature pictures are generated; its one script
 * (`hover.ts`, compiled here with no bundling) only shows hover cards and holds no game data. None of
 * it is part of the app's bundle. The data comes from `@creatures/game` and `@creatures/lab`, which are
 * TypeScript sources, so `data.ts` is loaded with Vite's module runner at build time, outside the
 * bundle (nothing the app imports reaches it). The page is not linked from the game.
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
      const data = dataModule.module.loadWikiData();
      this.emitFile({
        type: 'asset',
        fileName: 'wiki.html',
        source: builderModule.module.buildWiki(data),
      });
      this.emitFile({ type: 'asset', fileName: 'wiki.css', source: WIKI_CSS });
      for (const art of data.art) {
        this.emitFile({ type: 'asset', fileName: art.src.replace(/^\//, ''), source: art.svg });
      }
      // The script is one self-contained file: strip its types, nothing else.
      const hover = path('hover.ts');
      const source = await runnerImport<{ default: string }>(`${hover}?raw`, {
        configFile: false,
        logLevel: 'silent',
      });
      const script = await transformWithOxc(source.module.default, hover, {
        lang: 'ts',
        target: 'es2022',
      });
      this.emitFile({ type: 'asset', fileName: 'wiki.js', source: script.code });
    },
  };
}
