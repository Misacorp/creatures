import { lineKey, type CardDiff, type Mark } from './creature-page/compare-diff';
import { GlossaryTag } from './Glossary';
import type { GearLine } from './gear-types';
import { lineEntry, lineIdle, linePips, pipsLabel } from './gear-view';

/**
 * The tier of a rolled line as five pips: filled up to its tier, open up to the best tier this
 * item level could roll, and faint beyond. The tier is also spoken, so the pips never carry it alone.
 */
function TierPips({ line }: { line: GearLine }) {
  const pips = linePips(line);
  if (pips === null) return null;
  return (
    <span class="tier-pips" role="img" aria-label={pipsLabel(pips)}>
      {Array.from({ length: pips.total }, (_, i) => (
        <span key={i} class={i < pips.filled ? 'pip on' : i < pips.reach ? 'pip off' : 'pip lock'}>
          {i < pips.filled ? '●' : '○'}
        </span>
      ))}
    </span>
  );
}

/**
 * A change of a number, after it, in its own look so it is never read as part of the number: "(▲2%)" in green
 * when better, "(▼2%)" in red when worse. The arrow and the brackets carry the meaning with the colour, and a
 * spoken copy says the sign in words ("plus 2%, better").
 */
export function DeltaMark({ mark }: { mark: Mark }) {
  return (
    <span class={mark.good ? 'cmp-delta good' : 'cmp-delta bad'}>
      <span aria-hidden="true">{`(${mark.good ? '\u25B2' : '\u25BC'}${mark.text.slice(1)})`}</span>
      <span class="visually-hidden"> {mark.spoken}</span>
    </span>
  );
}

/**
 * The lines of an item: each line's text (the server's, with its number) that explains itself when
 * tapped, and its tier as pips. A line that does nothing for the wearer says so in words.
 */
export function ItemLines({
  lines,
  diff,
}: {
  lines: readonly GearLine[];
  /** The compare against the worn item: new and changed lines are marked, lost ones listed at the end. */
  diff?: Pick<CardDiff, 'lines' | 'goneLines'>;
}) {
  return (
    <ul class="line-list" aria-label="Lines">
      {lines.map((line) => {
        const change = diff?.lines.get(lineKey(line));
        const cls = `${lineIdle(line) ? 'line idle' : 'line'}${change?.kind === 'new' ? ' cmp-new' : ''}`;
        return (
          <li key={`${line.id}-${line.source}`} class={cls}>
            {change?.kind === 'new' && (
              <>
                <span class="cmp-marker" aria-hidden="true">
                  +
                </span>
                <span class="visually-hidden">New: </span>
              </>
            )}
            <GlossaryTag entry={line.local ? 'gear-local' : lineEntry(line)} class="line-text">
              {line.text}
            </GlossaryTag>
            {change?.kind === 'changed' && <DeltaMark mark={change.mark} />}
            <TierPips line={line} />
            {lineIdle(line) && <span class="muted line-note"> does nothing for this creature</span>}
          </li>
        );
      })}
      {diff?.goneLines.map((line) => (
        <li key={`gone-${line.id}-${line.source}`} class="line cmp-gone">
          <span class="cmp-marker" aria-hidden="true">
            {'−'}
          </span>
          <span class="visually-hidden">Lost: </span>
          <span class="line-text">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
