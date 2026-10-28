import { readFileSync } from 'node:fs';
import { runnerImport, transformWithOxc, type Plugin } from 'vite';
import type { buildWiki as BuildWiki } from './build.ts';
import type { loadWikiData as LoadWikiData } from './data.ts';
import { buildWikiCss, GAME_STYLES, type GameCss } from './style.ts';

/**
 * Emits `wiki.html`, `wiki.css`, `wiki.js`, `wiki-art/*.svg` and `wiki-fonts/*.woff2`: a reference page of the game's
 * configuration, generated from the content data on every build (production and staging alike), so it
 * is never out of date. The page's text and creature pictures are generated; its one script
 * (`hover.ts`, compiled here with no bundling) only shows hover cards and holds no game data. None of
 * it is part of the app's bundle. The data comes from `@creatures/game` and `@creatures/lab`, which are
 * TypeScript sources, so `data.ts` is loaded with Vite's module runner at build time, outside the
 * bundle (nothing the app imports reaches it). The page is not linked from the game. Its stylesheet is made
 * from the game's own (`style.ts`, `game-css.ts`): the tokens, the chip and stat table rules, and the two
 * self-hosted fonts, whose files are copied next to the page.
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
      const game = Object.fromEntries(
        Object.entries(GAME_STYLES).map(([name, file]) => [
          name,
          readFileSync(path(`../styles/${file}`), 'utf8'),
        ]),
      ) as GameCss;
      const { css, fonts } = buildWikiCss(game);
      this.emitFile({ type: 'asset', fileName: 'wiki.css', source: css });
      for (const font of fonts) {
        // `fonts` holds only `@fontsource/<package>/files/<name>.woff2` (checked by `fontFaces`).
        const file = readFileSync(path(`../../node_modules/${font}`));
        this.emitFile({
          type: 'asset',
          fileName: `wiki-fonts/${font.slice(font.lastIndexOf('/') + 1)}`,
          source: file,
        });
      }
      for (const art of [...data.art, ...data.elementArt]) {
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
