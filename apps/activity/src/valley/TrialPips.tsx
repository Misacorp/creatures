/**
 * A creature's next trial on its card (phase 5 step 9b, `systems/trials.md` V-TRIAL-3): only the next trial, as pips for its boxes (the
 * ticked ones lit), the honour's name beside them; the list is a tap away in the game's one popover (`PopoverHost.openCustom`, as the raid
 * boss's rule cards open theirs): a picture and a short line per box, ticked or not, and one line of what it means. The server decides what
 * is ticked (`valley.creatures[].trial`); this only shows it. Nothing for a creature the server has no trial for (the valley's systems off),
 * or one that holds Gold.
 */
import type { Creature } from '../api';
import { glyphOrUnknown } from '../glyphs';
import { usePopoverTrigger } from '../PopoverHost';
import { Sprite } from '../sprites/Sprite';
import { PipRow } from '../ui/PipRow';
import { useTrial } from './HonourRibbon';
import { nextTrial, trialLabel, trialNote, type NextTrial } from './honours-view';

/** The trial's list: what each box asks, ticked or not (the popover's body, also drawn by the workbench). */
export function TrialList({ next, level }: { next: NextTrial; level: number }) {
  return (
    <div class="pop-stack trial-pop">
      <strong class="pix">{`${next.name} trial`}</strong>
      <ul class="trial-list" aria-label={`${next.name} trial boxes`}>
        {next.rows.map((row) => (
          <li key={row.id} class={row.ticked ? 'trial-box done' : 'trial-box'}>
            <Sprite sprite={glyphOrUnknown(row.glyph)} scale={2} />
            <span class="trial-box-label">{row.label}</span>
            <span class="visually-hidden">{row.ticked ? 'Ticked' : 'Not yet'}</span>
            <span class={row.ticked ? 'trial-tick done' : 'trial-tick'} aria-hidden="true">
              {row.ticked && <Sprite sprite={glyphOrUnknown('check')} scale={2} />}
            </span>
          </li>
        ))}
      </ul>
      <p class="muted">{trialNote(next, level)}</p>
    </div>
  );
}

export function TrialPips({ creature }: { creature: Pick<Creature, 'id' | 'level'> }) {
  const next = nextTrial(useTrial(creature.id));
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  if (next === null) return null;
  return (
    <button
      type="button"
      class="trial-pips"
      ref={ref}
      aria-label={trialLabel(next)}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => {
        host?.openCustom(`trial:${creature.id}`, event.currentTarget, {
          label: `${next.name} trial`,
          body: <TrialList next={next} level={creature.level} />,
        });
      }}
    >
      <span class="trial-pips-name pix">{next.name}</span>
      <PipRow count={next.rows.length} lit={(i) => next.rows[i]?.ticked === true} />
    </button>
  );
}
