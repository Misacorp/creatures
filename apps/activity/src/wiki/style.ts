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
main { max-width: 46rem; margin: 0 auto; padding: 1rem 1rem 6rem; }
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
nav ol { padding-left: 1.25rem; margin: 0.5rem 0; }
nav li { margin: 0.25rem 0; }
.index { padding-left: 1.25rem; }
.index li { margin: 0.25rem 0; }
.entry {
  background: var(--dusk);
  box-shadow: var(--frame);
  padding: 0.75rem;
  margin: 0 0 1rem;
  scroll-margin-top: 0.75rem;
}
.entry:target { box-shadow: var(--ring); }
.line-group {
  margin: 2.5rem 0 0;
  background: var(--dusk-2);
  box-shadow: var(--frame);
  scroll-margin-top: 0.75rem;
}
.line-group:target { box-shadow: var(--ring); }
.line-head { background: var(--plum); padding: 0.5rem 0.75rem; box-shadow: inset 0 calc(var(--px) * -1) 0 0 var(--ink); }
.line-head h3 { margin: 0; color: var(--bone); }
.line-forms { padding: 0.75rem 0.75rem 0; }
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
  main { padding: 2rem 1.5rem 4rem; }
  .facts { display: grid; grid-template-columns: 14rem 1fr; gap: 0.25rem 1rem; }
  .facts dt { margin-top: 0; }
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

/** The game rules the wiki takes, by file: whole files, or the rules with these selectors. */
function fromGame(game: GameCss): string {
  return [
    pickRules(game.pixel, ['.portrait', '.pix-panel', '.prose']),
    pickRules(game.cards, ['.tag']),
    pickRules(game.festival, ['.badge.festival']),
    pickRules(game.app, ['.role-chip']),
    pickRules(game.itemFrame, ['.rarity-tag']),
    pickRules(game.glossaryTag, ['.gtag-chip', '.gtag-chip:hover']),
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
  ].join('\n');
  return { css: `${css}\n`, fonts: faces.files };
}
