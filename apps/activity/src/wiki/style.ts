/**
 * The wiki's stylesheet, emitted as `wiki.css` next to the page. No fonts to load (the Content-Security-
 * Policy allows only the site's own), no images. The colours are the game's dark tokens (`--night`,
 * `--dusk`, `--bone`, `--haze`, `--gold`), all at least 4.5:1 on their background.
 */
export const WIKI_CSS = `:root {
  color-scheme: dark;
  --night: #17132b;
  --dusk: #241e42;
  --line: #4a4170;
  --bone: #f4eedc;
  --haze: #b4aed4;
  --gold: #ffd25a;
  --link: #9fc6ff;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--night);
  color: var(--bone);
  font: 1rem/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  overflow-wrap: anywhere;
}
main { max-width: 46rem; margin: 0 auto; padding: 1rem 1rem 3rem; }
h1, h2, h3, h4 { line-height: 1.25; margin: 0 0 0.5rem; }
h1 { font-size: 1.75rem; color: var(--gold); }
h2 { font-size: 1.4rem; margin-top: 2.5rem; padding-bottom: 0.25rem; border-bottom: 2px solid var(--line); color: var(--gold); }
h3 { font-size: 1.15rem; margin-top: 1.75rem; }
h4 { font-size: 1rem; }
p { margin: 0 0 0.5rem; }
a { color: var(--link); }
a:visited { color: #c9b3f0; }
a:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
a.self { text-decoration: none; color: var(--haze); font-weight: normal; margin-left: 0.25rem; }
nav ol { padding-left: 1.25rem; margin: 0.5rem 0; }
nav li { margin: 0.25rem 0; }
.index { padding-left: 1.25rem; }
.index li { margin: 0.25rem 0; }
.entry {
  background: var(--dusk);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.75rem;
  margin: 0 0 0.75rem;
  scroll-margin-top: 0.75rem;
}
h2, h3 { scroll-margin-top: 0.75rem; }
.entry:target { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold); }
.line { scroll-margin-top: 0.75rem; }
dl { margin: 0; }
dt { color: var(--haze); font-size: 0.875rem; margin-top: 0.5rem; }
dd { margin: 0; }
.label { color: var(--haze); }
.flavor { color: var(--haze); font-style: italic; }
.intent { color: var(--haze); font-size: 0.875rem; }
.none { color: var(--haze); }
.draft {
  border-left: 4px solid var(--gold);
  background: var(--dusk);
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0 1rem;
}
.tag {
  font-size: 0.75rem;
  border: 1px solid var(--gold);
  color: var(--gold);
  border-radius: 3px;
  padding: 0 0.35rem;
}
footer { margin-top: 2.5rem; }
@media (min-width: 40rem) {
  main { padding: 2rem 1.5rem 4rem; }
  dl { display: grid; grid-template-columns: 14rem 1fr; gap: 0.25rem 1rem; }
  dt { margin-top: 0; }
}
`;
