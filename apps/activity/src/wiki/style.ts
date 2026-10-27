/**
 * The wiki's stylesheet (`wiki.css`), made at build time from the game's own stylesheets plus a small
 * layout of its own. What comes from the game (read from `src/styles/` by the plugin, see `game-css.ts`):
 * the design tokens (colours, rarity colours, fonts, type scale, pixel frame), the self-hosted fonts (their
 * files are copied next to the page under `/wiki-fonts/`), and the rules of the element, role and rarity
 * chips, the tags and badges, the creature head and the stat table. So a restyle of the game carries over
 * to the page, and a renamed class fails the build instead of quietly dropping a look. What is the wiki's own
 * is only page layout (the column, the entries, the links, the hover card). The Content-Security-Policy
 * allows only the site's own files, so there is no remote font or inline style.
 */
import { fontFaces, pickRules, wholeCss } from './game-css.ts';

/** The game stylesheets the wiki reads, by name, relative to `src/styles/`. */
export const GAME_STYLES = {
  tokens: 'base/tokens.css',
  gearTokens: 'components/gear-tokens.css',
  fonts: 'base/fonts.css',
  elementChip: 'components/element-chip.css',
  cards: 'components/cards.css',
  app: 'views/app.css',
  festival: 'views/festival.css',
  itemFrame: 'components/item-frame.css',
  creatureFocus: 'components/creature-focus.css',
  dataTable: 'components/data-table.css',
  pixel: 'components/pixel.css',
  glossaryTag: 'components/glossary-tag.css',
  settings: 'views/settings.css',
} as const;

/** The text of each of those stylesheets. */
export type GameCss = Record<keyof typeof GAME_STYLES, string>;

/** The wiki's own rules that come first (page, text, links, entries, hover card). */
const BASE = `* { box-sizing: border-box; }
body {
  margin: 0;
  background-color: var(--night);
  background-image: radial-gradient(var(--dusk) 1px, transparent 1px);
  background-size: 6px 6px;
  color: var(--bone);
  font: 1rem/1.5 var(--body);
  font-synthesis-weight: none;
  overflow-wrap: anywhere;
}
.page { max-width: 46rem; margin: 0 auto; padding: 1rem 1rem 6rem; }
.top p { max-width: 46rem; }
main { min-width: 0; }
main > section > p { max-width: 46rem; }
h1, h2, h3, h4, h5 { font-family: var(--display); font-weight: 400; letter-spacing: 0.02em; line-height: 1.2; margin: 0 0 0.5rem; }
h1 { font-size: clamp(1.75rem, 8vw, 2.5rem); color: var(--gold); text-shadow: var(--px) var(--px) 0 var(--ink), calc(var(--px) * 2) calc(var(--px) * 2) 0 var(--plum); }
h2 { font-size: 1.75rem; margin-top: 4rem; padding-bottom: 0.375rem; border-bottom: calc(var(--px) * 2) solid var(--gold-shade); color: var(--gold); }
h3 { font-size: 1.4rem; margin-top: 1.75rem; }
main > section:first-of-type h2 { margin-top: 2.5rem; }
h4 { font-size: var(--fs-title); }
h2, h3 { scroll-margin-top: 0.75rem; }
p { margin: 0 0 0.5rem; }
a {
  color: var(--bone);
  text-decoration: underline dotted color-mix(in srgb, var(--haze) 60%, transparent);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.25em;
}
a:not(.chip):hover { color: var(--gold); text-decoration-color: var(--gold); }
a:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
a.self { text-decoration: none; color: var(--haze); margin-left: 0.25rem; }
.toc ol { padding-left: 1.25rem; margin: 0.5rem 0; }
.toc li { margin: 0.25rem 0; }
.toc-lines { display: none; }
.index { padding-left: 1.25rem; }
.index li { margin: 0.25rem 0; }
.entry {
  container-type: inline-size;
  background: var(--dusk);
  box-shadow: var(--frame);
  padding: 0.75rem;
  margin: 0 0 1rem;
  scroll-margin-top: 0.75rem;
}
.entry:target { box-shadow: var(--ring); }
.entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(22rem, 100%), 1fr)); gap: 1rem; align-items: start; }
.entries > .entry { margin: 0; }
.line-group {
  margin: 1.5rem 0 0;
  background: var(--dusk-2);
  box-shadow: var(--frame);
  scroll-margin-top: 0.75rem;
}
.line-group:target { box-shadow: var(--ring); }
.line-head { background: var(--plum); padding: 0.5rem 0.75rem; box-shadow: inset 0 calc(var(--px) * -1) 0 0 var(--ink); }
.line-head h3 { margin: 0; color: var(--bone); }
.line-forms { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(24rem, 100%), 1fr)); gap: 0.75rem; padding: 0.75rem; }
.line-forms > .entry { margin: 0; }
dl { margin: 0; }
.facts { margin-top: 0.75rem; }
.facts dt { color: var(--haze); font-size: var(--fs-row); margin-top: 0.5rem; }
.facts dd { margin: 0; }
.label { color: var(--haze); }
.flavor { color: var(--haze); font-style: italic; margin: 0.5rem 0 0; }
.intent { color: var(--haze); font-size: var(--fs-row); }
.none { color: var(--haze); }
.lines { margin: 0 0 0.5rem; padding-left: 1.25rem; }
.draft {
  border-left: 4px solid var(--gold);
  background: var(--dusk);
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0 1rem;
}
.to-top {
  position: fixed;
  z-index: 5;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.4rem 0.75rem;
  background: var(--gold);
  color: var(--ink);
  font-family: var(--display);
  font-size: var(--fs-row);
  text-decoration: none;
  box-shadow: 0 0 0 var(--px) var(--ink), inset 0 calc(var(--px) * -1) 0 0 var(--gold-shade);
}
.to-top:hover { filter: brightness(1.12); }
.to-top:focus-visible { outline: var(--px) solid var(--bone); outline-offset: calc(var(--px) * 2); }
.sprite { image-rendering: pixelated; vertical-align: middle; margin: -0.5rem 0.3rem -0.5rem 0; }
h3 .sprite, h4 .sprite { margin-right: 0.5rem; margin-top: -0.75rem; margin-bottom: -0.75rem; }
.stats { margin-top: 0.75rem; max-width: 26rem; }
.pv-card {
  position: fixed;
  z-index: 10;
  left: 0;
  top: 0;
  width: max-content;
  max-width: min(22rem, calc(100vw - 1rem));
  padding: 0.5rem 0.625rem 0.625rem;
  background: var(--dusk-2);
  box-shadow: var(--frame);
  font-size: var(--fs-row);
  line-height: 1.4;
  pointer-events: none;
}
.pv-card[hidden] { display: none; }
.pv-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
.pv-head > span { display: flex; flex-direction: column; min-width: 0; }
.pv-name { color: var(--gold); font-family: var(--display); font-weight: 400; font-size: var(--fs-heading); line-height: 1.2; }
.pv-kind, .pv-label { color: var(--haze); font-size: var(--fs-small); }
.pv-text { margin: 0.25rem 0 0; }
.pv-lines { margin: 0.25rem 0 0; padding-left: 1.125rem; }
.pv-tags { margin: 0.25rem 0; }
.pv-card .sprite { margin: 0; flex: none; }
.pv-tree { display: flex; align-items: center; gap: 0.35rem; margin: 0.35rem 0; }
.pv-stage { display: flex; flex-direction: column; gap: 0.25rem; }
.pv-form { display: flex; flex-direction: column; align-items: center; text-align: center; font-size: var(--fs-small); padding: 0.15rem 0.3rem; border: 1px solid transparent; }
.pv-form.here { border-color: var(--gold); background: var(--dusk); color: var(--gold); }
.pv-arrow { color: var(--haze); }
@media (min-width: 40rem) {
  .page { padding: 2rem 1.5rem 4rem; }
}
/* A fact list is two columns only when its entry is wide enough for them (a form in a grid of forms is not). */
@container (min-width: 34rem) {
  .facts { display: grid; grid-template-columns: 12rem 1fr; gap: 0.25rem 1rem; }
  .facts dt { margin-top: 0; }
}
/* Wide screens: the page grows to 90rem, and the table of contents is a sticky sidebar that keeps its own scroll. */
@media (min-width: 64rem) {
  .page { max-width: 90rem; padding: 2rem 2rem 4rem; }
  .layout { display: grid; grid-template-columns: 17rem minmax(0, 1fr); gap: 2rem; align-items: start; }
  .toc {
    position: sticky;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem 0.5rem 0.75rem;
    background: var(--dusk);
    box-shadow: var(--frame);
    font-size: var(--fs-row);
    line-height: 1.3;
  }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc-lines { display: block; margin: 0.125rem 0 0.5rem; padding-left: 0.75rem; }
  .toc li { margin: 0; }
  .toc li li { margin: 0; }
  .toc a { display: block; padding: 0.3rem 0.5rem; border-left: calc(var(--px) * 2) solid transparent; text-decoration: none; }
  .toc a:not(.chip):hover { background: var(--dusk-2); }
  .toc-lines a { display: flex; align-items: center; gap: 0.5rem; padding: 0.125rem 0.5rem; }
  .toc .sprite { width: 1.5rem; height: 1.5rem; margin: 0; flex: none; }
  .toc a[aria-current] { border-left-color: var(--gold); background: var(--dusk-2); color: var(--gold); }
  .toc a.in-section { border-left-color: var(--gold-shade); color: var(--gold); }
  main > section:first-of-type h2 { margin-top: 0; }
}`;

/** The wiki's own rules that must win over the game's: the portrait box, the chips' pictures and the cards' names. */
const TAIL = `html { scroll-behavior: auto; }
a.to-top:hover { color: var(--ink); }
.cc-head { margin-bottom: 0.25rem; }
.cc-head .portrait { width: 56px; height: 56px; margin: 0; padding: 0; background: var(--ink); box-shadow: none; }
.cc-head .portrait .sprite { display: block; margin: 0; }
.cc-tags { margin: 0; }
.chip .sprite { margin: 0; flex: none; }
.cc-name .self { font-family: var(--body); font-size: var(--fs-row); }
.cp-title { margin-bottom: 0.375rem; }
.stats .data-table { margin: 0; }
.pv-name.rarity-name { color: var(--rar-text, var(--gold)); }`;

/**
 * The two views of a section and the table view. The toggle is two radio inputs (visually hidden, still
 * focusable) before the toggle's labels and the two views, so `:checked ~` picks the view with no script;
 * the hidden view is `display: none`, so its links are out of the tab order and the reading order. The
 * toggle looks like the game's Segmented control (the button face, gold when chosen).
 */
const TABLES = `.vh, .view-radio { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.views { position: relative; }
.view-toggle { margin: 0.5rem var(--px) 0.875rem; }
.view-toggle label {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 4.5rem;
  min-height: 2.75rem;
  padding: 0.4rem 0.75rem;
  background: var(--dusk-2);
  color: var(--bone);
  font-family: var(--display);
  font-size: var(--fs-row);
  cursor: pointer;
  user-select: none;
  box-shadow: 0 0 0 var(--px) var(--ink), inset 0 calc(var(--px) * -1) 0 0 var(--bevel-lo);
}
.view-toggle label:hover { filter: brightness(1.12); }
.r-list:checked ~ .view-toggle .l-list,
.r-table:checked ~ .view-toggle .l-table {
  background: var(--gold);
  color: var(--ink);
  box-shadow: 0 0 0 var(--px) var(--ink), inset 0 calc(var(--px) * -1) 0 0 var(--gold-shade);
}
.r-list:focus-visible ~ .view-toggle .l-list,
.r-table:focus-visible ~ .view-toggle .l-table { outline: var(--px) solid var(--bone); outline-offset: calc(var(--px) * 2); }
.r-list:checked ~ .view-table, .r-table:checked ~ .view-list { display: none; }
.legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin: 0 0 0.75rem; padding: 0; list-style: none; font-size: var(--fs-row); color: var(--haze); }
.legend li { display: flex; align-items: center; gap: 0.5rem; }
.table-wrap {
  position: relative; /* the hidden words inside are clipped by the scroller, not part of the page's width */
  max-width: 100%;
  max-height: 80vh;
  overflow: auto;
  background: var(--dusk);
  box-shadow: var(--frame);
}
.table-wrap:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.matrix { border-collapse: separate; border-spacing: 0; font-size: var(--fs-row); line-height: 1.25; }
.matrix th, .matrix td { padding: 0; text-align: center; font-weight: 400; border-bottom: 1px solid var(--night); }
.matrix td { width: 2.25rem; min-width: 2.25rem; height: 2.25rem; }
.matrix .ls { border-left: 3px solid var(--ink); }
.matrix thead th { position: sticky; z-index: 2; background: var(--dusk-2); }
.matrix .lines th { top: 0; height: 2.5rem; background: var(--plum); }
.matrix .forms th { top: 2.5rem; height: 2.5rem; border-bottom: var(--px) solid var(--ink); }
.matrix .row-name {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 7.5rem;
  min-width: 7.5rem;
  max-width: 7.5rem;
  padding: 0.25rem 0.5rem;
  text-align: left;
  background: var(--dusk);
  border-right: var(--px) solid var(--ink);
}
.matrix thead .corner { z-index: 3; color: var(--haze); background: var(--dusk-2); vertical-align: bottom; }
.matrix .family-row > * { background: var(--dusk-2); color: var(--gold); }
.matrix .family-row .row-name { font-family: var(--display); font-size: var(--fs-heading); }
.matrix tbody tr:hover > * { background: var(--dusk-2); }
.matrix .family-row:hover > * { background: var(--dusk-2); }
.matrix .pic { display: flex; align-items: center; justify-content: center; min-height: 2.25rem; text-decoration: none; }
.matrix .pic:focus-visible { outline-offset: -2px; }
.matrix .sprite { display: block; margin: 0; }
.matrix .fallback { font-size: var(--fs-small); max-width: 2.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mark { display: inline-block; flex: none; width: 0.75rem; height: 0.75rem; vertical-align: middle; background: var(--gold); box-shadow: 0 0 0 2px var(--ink); }
.mark.alt { background: none; box-shadow: inset 0 0 0 2px var(--haze), 0 0 0 2px var(--ink); }
@media (min-width: 40rem) {
  .matrix .row-name { width: 9.5rem; min-width: 9.5rem; max-width: 9.5rem; }
}`;

/** The game rules the wiki takes, by file: whole files, or the rules with these selectors. */
function fromGame(game: GameCss): string {
  return [
    pickRules(game.pixel, ['.portrait', '.pix-panel', '.prose']),
    pickRules(game.cards, ['.tag']),
    pickRules(game.festival, ['.badge.festival']),
    pickRules(game.app, ['.role-chip']),
    pickRules(game.itemFrame, ['.rarity-tag']),
    pickRules(game.glossaryTag, ['.gtag-chip', '.gtag-chip:hover']),
    pickRules(game.settings, ['.segmented']),
    wholeCss(game.elementChip),
    wholeCss(game.dataTable),
    pickRules(game.creatureFocus, [
      '.cc-head',
      '.cc-id',
      '.cc-name',
      '.cc-tags',
      '.cc-tags > .chip',
      '.cc-tags > .tag',
      '.cc-tags > .badge',
      '.cp-title',
    ]),
  ].join('\n');
}

/** The wiki's stylesheet and the font files (`@fontsource/...` paths) it refers to. */
export function buildWikiCss(game: GameCss): { css: string; fonts: string[] } {
  const faces = fontFaces(game.fonts);
  const css = [
    faces.css,
    wholeCss(game.tokens),
    wholeCss(game.gearTokens),
    BASE,
    fromGame(game),
    TAIL,
    TABLES,
  ].join('\n');
  return { css: `${css}\n`, fonts: faces.files };
}
