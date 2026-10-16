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
    <span class="pips" role="img" aria-label={pipsLabel(pips)}>
      {Array.from({ length: pips.total }, (_, i) => (
        <span key={i} class={i < pips.filled ? 'pip on' : i < pips.reach ? 'pip off' : 'pip lock'}>
          {i < pips.filled ? '●' : '○'}
        </span>
      ))}
    </span>
  );
}

/**
 * The lines of an item: each line's text (the server's, with its number) that explains itself when
 * tapped, and its tier as pips. A line that does nothing for the wearer says so in words.
 */
export function ItemLines({ lines }: { lines: readonly GearLine[] }) {
  return (
    <ul class="line-list" aria-label="Lines">
      {lines.map((line) => (
        <li key={`${line.id}-${line.source}`} class={lineIdle(line) ? 'line idle' : 'line'}>
          <GlossaryTag entry={lineEntry(line)} class="line-text">
            {line.text}
          </GlossaryTag>
          <TierPips line={line} />
          {lineIdle(line) && <span class="muted line-note"> does nothing for this creature</span>}
        </li>
      ))}
    </ul>
  );
}
