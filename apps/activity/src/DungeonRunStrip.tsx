import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { creatureInfoOf, type CreatureInfo } from './creature-info';
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
import { LOCKET_ART, PACK_ART } from './sprites/pack-art';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Bar } from './ui/Bar';
import { CountBadgeList } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';
import { LandmarkChip, Tag } from './ui/Tag';

/**
 * A creature's face in a team row: its sprite (a skull over it when it is knocked out) and its name, in a
 * button that opens the creature popover with its role and element. Names are the player's own: text.
 */
export function TeamFace({
  id,
  info,
  speciesId,
  name,
  ko,
  label,
}: {
  id: string;
  info: CreatureInfo;
  speciesId: string;
  name: string;
  ko: boolean;
  /** What assistive technology says; keep the creature's name in it. */
  label: string;
}) {
  return (
    <SmallCreature id={id} info={info} class="tm-face" label={label}>
      <span class="tm-art">
        <Sprite sprite={creatureSpriteOrFallback(speciesId)} scale={4} />
        {ko && (
          <span class="ko-mark">
            <Sprite sprite={glyphOrUnknown('skull')} scale={2} />
          </span>
        )}
      </span>
      <span class="tm-name pix">{name}</span>
    </SmallCreature>
  );
}

/**
 * One creature of the open run's row: its sprite (tap for its role, element and the gear it carries in this
 * run), its name, an HP bar
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
      <TeamFace
        id={creature.id}
        info={{
          ...creatureInfoOf({
            name: creature.name,
            species: creature.speciesId,
            level: creature.level,
            element: creature.element,
            role: creature.role,
          }),
          // What it wears in this run (frozen when it joined): the popover lists it, locked.
          ...(creature.gear.length === 0 ? {} : { gear: creature.gear }),
        }}
        speciesId={creature.speciesId}
        name={creature.name}
        ko={state === 'ko'}
        label={`${tileLabel(creature)} Shows its role and element${creature.gear.length === 0 ? '' : ' and its gear'}.`}
      />
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
 * The pack: the pixel backpack on the left, breaking out of its box, and a leather canvas that rolls out
 * from under it holding what the pack carries: the "Pack" title with the "At risk" tag beside it (a
 * defeat keeps only half; the tag opens why), then the loot as icons with numbers. Empty, there is no
 * tag and the canvas says so.
 */
export function RunPack({ pack }: { pack: DungeonPack }) {
  const items = packItems(pack);
  return (
    <section class="run-ledger-cell run-stash run-pack" aria-label="Your pack">
      <span class="run-stash-art" aria-hidden="true">
        <Sprite sprite={PACK_ART} scale={4} />
      </span>
      <div class="run-stash-canvas">
        <p class="run-ledger-title">
          Pack
          {items.length > 0 && (
            <Tag kind="badge" tone="bad" entry="dungeon-pack" class="run-pack-risk">
              At risk
            </Tag>
          )}
        </p>
        {items.length === 0 ? (
          <p class="run-pack-empty">Empty</p>
        ) : (
          <CountBadgeList items={items} label={packLine(pack)} class="run-pack-items" />
        )}
      </div>
    </section>
  );
}

/** What the sheet of a keepsake adds under its text: it was for this run only. */
export const KEEPSAKE_ONLY_LINE = 'Only for this run. It is gone when the run ends.';

/**
 * The keepsakes the run holds, laid out like the pack: a gold locket on the left breaking out of its
 * box, and a velvet canvas from under it with the "Keepsakes" title and its "?" (they last only for
 * the run), then one chip each; a tap opens a sheet with what that one does. Nothing when there
 * are none.
 */
export function RunKeepsakes({ keepsakes }: { keepsakes: readonly DungeonKeepsakeView[] }) {
  const [shown, setShown] = useState<DungeonKeepsakeView | null>(null);
  if (keepsakes.length === 0) return null;
  return (
    <section class="run-ledger-cell run-stash run-keepsakes-row" aria-label="Keepsakes">
      <span class="run-stash-art" aria-hidden="true">
        <Sprite sprite={LOCKET_ART} scale={4} />
      </span>
      <div class="run-stash-canvas">
        <p class="run-ledger-title">
          Keepsakes <GlossaryTag entry="keepsake" look="help" />
        </p>
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
      </div>
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
    </section>
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
    <section class="raid-section dungeon-run-strip pix-panel" aria-label="Your run">
      <p class="run-status">
        <span>{runStatusLine(state)}</span>
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
      {/* At the camp the card has the row itself (to rearrange, with the same HP under each). */}
      {state.pending?.kind !== 'camp' && <RunRow team={state.team} />}
      {/* What the run carries: the pack and the keepsakes, side by side when there is room. */}
      <div class="run-ledger">
        <RunPack pack={state.pack} />
        <RunKeepsakes keepsakes={state.keepsakes} />
      </div>
      {event !== null && (
        <p class="run-event prose" role="status">
          <strong>{event.title}.</strong> {event.outcome}
        </p>
      )}
    </section>
  );
}
