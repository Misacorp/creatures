import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { creatureInfoOf } from './creature-info';
import { packItems, tileLabel, tileState } from './dungeon-run';
import { lastEventText, packLine, runHpText, runStatusLine } from './dungeon-text';
import type {
  DungeonKeepsakeView,
  DungeonPack,
  DungeonRunCreature,
  DungeonRunState,
} from './dungeon-types';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { SmallCreature } from './SmallCreature';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Bar } from './ui/Bar';
import { CountBadge } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';
import { LandmarkChip, Tag } from './ui/Tag';

/**
 * One creature of the open run's row: its sprite (tap for its role and element), its name, an HP bar
 * and its HP in words. A knocked-out creature is grey with the skull and says "Knocked out"; the
 * words say it as well, so colour is never the only cue. `children` (the camp's move buttons) sit
 * under it. Names are the player's own: drawn as text.
 */
export function RunTile({
  creature,
  children,
}: {
  creature: DungeonRunCreature;
  children?: ComponentChildren;
}) {
  const state = tileState(creature);
  return (
    <li class={`team-member run-tile ${state}`}>
      <SmallCreature
        id={creature.id}
        info={creatureInfoOf({
          name: creature.name,
          species: creature.speciesId,
          level: creature.level,
          element: creature.element,
          role: creature.role,
        })}
        class="tm-face"
        label={`${tileLabel(creature)} Shows its role and element.`}
      >
        <span class="tm-art">
          <Sprite sprite={creatureSpriteOrFallback(creature.speciesId)} scale={4} />
          {state === 'ko' && (
            <span class="ko-mark">
              <Sprite sprite={glyphOrUnknown('skull')} scale={2} />
            </span>
          )}
        </span>
        <span class="tm-name pix">{creature.name}</span>
      </SmallCreature>
      <Bar
        value={creature.hp}
        max={Math.max(1, creature.hpMax)}
        label={`${creature.name}: HP`}
        class="run-hp"
      />
      <span class="tm-hp pix">{runHpText(creature)}</span>
      {children}
    </li>
  );
}

/** The row of the run, left to right. */
export function RunRow({
  team,
  children,
}: {
  team: readonly DungeonRunCreature[];
  children?: ComponentChildren;
}) {
  return (
    <ul class="team-row run-row" aria-label="Your team, left to right">
      {team.map((creature) => (
        <RunTile key={creature.id} creature={creature} />
      ))}
      {children}
    </ul>
  );
}

/**
 * The pack as icons with numbers ("In your pack: 2 Bait, 1 Scrap") and, when it holds anything, an
 * "At risk" tag: a defeat keeps only half of it. Empty, it says so in a quiet line.
 */
export function RunPack({ pack }: { pack: DungeonPack }) {
  const items = packItems(pack);
  if (items.length === 0) return <p class="muted run-pack">{packLine(pack)}</p>;
  return (
    <div class="run-pack">
      <span class="run-pack-label">In your pack:</span>
      <ul class="run-pack-items" aria-label={packLine(pack)}>
        {items.map(({ key, ...badge }) => (
          <li key={key}>
            <CountBadge {...badge} />
          </li>
        ))}
      </ul>
      <Tag kind="badge" tone="bad" entry="dungeon-pack">
        At risk
      </Tag>
    </div>
  );
}

/** What the sheet of a keepsake adds under its text: it was for this run only. */
export const KEEPSAKE_ONLY_LINE = 'Only for this run. It is gone when the run ends.';

/**
 * The keepsakes the run holds: a "Keepsakes" label with a "?" that explains they last only for the
 * run, then one chip each; a tap opens a sheet with what that one does. Nothing when there are none.
 */
export function RunKeepsakes({ keepsakes }: { keepsakes: readonly DungeonKeepsakeView[] }) {
  const [shown, setShown] = useState<DungeonKeepsakeView | null>(null);
  if (keepsakes.length === 0) return null;
  return (
    <div class="run-keepsakes-row">
      <span class="run-keepsakes-label">
        Keepsakes <GlossaryTag entry="keepsake" look="help" />
      </span>
      <ul class="run-keepsakes" aria-label="Keepsakes">
        {keepsakes.map((k) => (
          <li key={k.id}>
            <button
              type="button"
              class="chip run-keepsake"
              aria-label={`${k.name}: ${k.description}`}
              onClick={() => {
                setShown(k);
              }}
            >
              <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} />
              <span>{k.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <Drawer
        open={shown !== null}
        title={shown?.name ?? ''}
        onClose={() => {
          setShown(null);
        }}
      >
        <p>{shown?.description}</p>
        <p class="muted">{KEEPSAKE_ONLY_LINE}</p>
      </Drawer>
    </div>
  );
}

/**
 * The strip above the map (and above an event or the camp): where the run is, the row with its HP,
 * the keepsakes, the pack, and what the last mystery room did. It is the state of the run at a glance.
 */
export function DungeonRunStrip({ state }: { state: DungeonRunState }) {
  const event =
    state.pending === null && state.lastEvent !== null ? lastEventText(state.lastEvent) : null;
  return (
    <section class="raid-section dungeon-run-strip" aria-label="Your run">
      <p class="run-status">
        <span class="pix">{runStatusLine(state)}</span>
        {state.landmark && (
          <>
            {' '}
            <LandmarkChip />
          </>
        )}
        {state.level > 0 && (
          <>
            {' '}
            <Tag kind="chip" tone="bad" entry="undercroft" class="run-undercroft-chip">
              Foes are fiercer here
            </Tag>
          </>
        )}
      </p>
      <RunRow team={state.team} />
      <RunKeepsakes keepsakes={state.keepsakes} />
      <RunPack pack={state.pack} />
      {event !== null && (
        <p class="run-event" role="status">
          <strong>{event.title}.</strong> {event.outcome}
        </p>
      )}
    </section>
  );
}
