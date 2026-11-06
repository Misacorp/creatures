/**
 * The Forge's fire (V-COM-13): a flame that grows with the fire's level, the item level pieces come out at, and what the next
 * threshold brings. A tap opens its numbers in a drawer (the fire's total and the last things that warmed it). The flame is the
 * valley's own small flame sprite at a pixel scale that steps up at each threshold; nothing floats over anything.
 */
import { useRef, useState } from 'preact/hooks';
import type { ValleyVisit } from '../api';
import { DataTable } from '../ui/DataTable';
import { Drawer } from '../ui/Drawer';
import { Pic } from './parts';
import {
  FIRE_THRESHOLDS,
  commonsOf,
  fireLine,
  fireNextLine,
  flameScale,
  warmthWords,
} from './commons-view';
import { WARMING_FLAME } from './valley-art';

export function CommonsFire({ visit, start = false }: { visit: ValleyVisit; start?: boolean }) {
  const [open, setOpen] = useState(start);
  const opener = useRef<HTMLElement | null>(null);
  const fire = commonsOf(visit)?.fire;
  if (fire === undefined) return null;
  const next = fireNextLine(fire);
  return (
    <>
      <button
        type="button"
        class="cm-fire"
        aria-haspopup="dialog"
        aria-label={`The fire. ${fireLine(fire)} ${next ?? ''} Show its numbers`}
        ref={(el) => {
          opener.current = el;
        }}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span class="cm-flame" aria-hidden="true">
          <Pic sprite={WARMING_FLAME} scale={flameScale(fire.level, FIRE_THRESHOLDS)} />
        </span>
        <span class="cm-fire-text">
          <strong class="pix cm-fire-name">The fire</strong>
          <span class="cm-fire-line">{fireLine(fire)}</span>
          {next !== null && <span class="cm-fire-line">{next}</span>}
        </span>
      </button>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="The fire"
        meta={`Level ${String(fire.level)}`}
        returnFocusTo={opener.current}
      >
        <div class="dr-stack pix-panel">
          <p class="sp-note">
            Everything the valley builds or beats makes the fire hotter, and a hotter fire makes
            better pieces.
          </p>
          <DataTable
            rows={[
              { label: 'Pieces come out at level', value: String(fire.level) },
              {
                label: 'A stronger modifier tier at',
                value: fire.next === null ? 'The top' : `Level ${String(fire.next)}`,
              },
            ]}
            tabular
          />
          <h4 class="pix sp-sub">What warmed it last</h4>
          {fire.recent.length === 0 ? (
            <p class="muted">Nothing yet.</p>
          ) : (
            <ul class="cm-log" aria-label="What warmed the fire">
              {fire.recent.map((r, i) => (
                <li key={`${String(i)}-${String(r.at)}`}>{warmthWords(r.source, r.place)}</li>
              ))}
            </ul>
          )}
        </div>
      </Drawer>
    </>
  );
}
