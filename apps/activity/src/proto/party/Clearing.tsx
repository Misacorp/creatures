import type { ComponentChildren, JSX } from 'preact';
import { greyed, stationArt } from './art';
import { ItemSprite } from '../../GearArt';
import { creatureName } from '../../game';
import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { PipRow } from '../../ui/PipRow';
import { gearName } from '../../gear-view';
import { RAID_TEAM_SIZE, creatureOf, jobsReady, raidTeamIds, tripsHome } from '../world';
import { pipsLeft } from './camp-state';
import type { PartyState, StationId } from './party-state';
import { Ground, PixelScene } from './Scene';
import { STATIONS, stationVerdict, type Verdict } from './stations';

const BAG_SIZE = 60;

function Face({ species, class: extra }: { species: string; class?: string }) {
  return (
    <Sprite
      sprite={creatureSpriteOrFallback(species)}
      scale={2}
      class={extra === undefined ? 'pp-face' : `pp-face ${extra}`}
    />
  );
}

function Glyph({ id, scale = 2, class: extra }: { id: string; scale?: number; class?: string }) {
  return (
    <Sprite
      sprite={glyphOrUnknown(id)}
      scale={scale}
      {...(extra === undefined ? {} : { class: extra })}
    />
  );
}

/** What a station shows on its art, and the sentence that says it. */
function stationState(
  id: StationId,
  state: PartyState,
): { marks: ComponentChildren; says: string } {
  const { world } = state;
  switch (id) {
    case 'road': {
      const free = world.slots.total - world.slots.used;
      const home = tripsHome(world)[0];
      const homeCreature = home === undefined ? null : creatureOf(world, home.creatureId);
      return {
        marks: (
          <>
            <span class="pp-flags">
              {Array.from({ length: world.slots.total }, (_, i) => (
                <Sprite
                  key={i}
                  sprite={i < free ? glyphOrUnknown('flag') : greyed(glyphOrUnknown('flag'))}
                  scale={2}
                />
              ))}
            </span>
            {homeCreature !== null && (
              <span class="pp-sign-face">
                <Face species={homeCreature.species} />
                <Glyph id="satchel" />
              </span>
            )}
          </>
        ),
        says:
          `${String(free)} of ${String(world.slots.total)} trip slots free.` +
          (homeCreature === null ? '' : ` ${creatureName(homeCreature)} is home with loot.`),
      };
    }
    case 'forge': {
      const open = world.jobs.filter((j) => j.status !== 'claimed');
      const ready = jobsReady(world)[0];
      const anvils = Array.from({ length: world.jobSlots.total }, (_, i) => open[i] ?? null);
      return {
        marks: (
          <span class="pp-anvils">
            {anvils.map((job, i) =>
              job === null ? (
                <span key={i} class="pp-anvil is-empty">
                  <Sprite sprite={greyed(glyphOrUnknown('anvil'))} scale={3} />
                </span>
              ) : (
                <span key={i} class="pp-anvil">
                  {job.status === 'ready' && job.input.baseId !== undefined && (
                    <ItemSprite baseId={job.input.baseId} scale={2} class="pp-float" />
                  )}
                  <Glyph id="anvil" scale={3} />
                  <Face species={creatureOf(world, job.creatureId).species} class="pp-worker" />
                  {job.status !== 'ready' && (
                    <PipRow count={4} lit={pipsLeft(job.startedAt, job.endsAt, world.now)} />
                  )}
                </span>
              ),
            )}
          </span>
        ),
        says:
          ready === undefined
            ? `${String(open.length)} of ${String(world.jobSlots.total)} anvils busy.`
            : `${gearName(ready.input.baseId ?? 'kelp-cap')} is ready.`,
      };
    }
    case 'arena': {
      const placed = raidTeamIds(world).length;
      const locked = world.raid.party === null || !world.raid.you.canEdit;
      return {
        marks: (
          <span class="pp-arena-pips">
            {locked ? (
              <Glyph id="lock" />
            ) : (
              <PipRow count={RAID_TEAM_SIZE} lit={placed} size="md" />
            )}
          </span>
        ),
        says: locked
          ? `${world.raid.boss.name}. Locked.`
          : `${world.raid.boss.name}. ${String(placed)} of ${String(RAID_TEAM_SIZE)} placed.`,
      };
    }
    case 'cave':
      return {
        marks: (
          <span class={world.dungeon.canRun ? 'pp-door is-open' : 'pp-door'}>
            <Glyph id={world.dungeon.canRun ? 'map-door' : 'check'} scale={3} />
          </span>
        ),
        says: world.dungeon.canRun ? 'Today’s run is open.' : 'Done for today.',
      };
    case 'house': {
      const lounger = state.lounger === null ? null : creatureOf(world, state.lounger);
      const others = world.residents.filter((r) => r.name !== 'You').length;
      return {
        marks: (
          <>
            {lounger !== null && <Face species={lounger.species} class="pp-lounger" />}
            <span class="pp-count">{String(others)}</span>
          </>
        ),
        says:
          (lounger === null ? 'Nobody lounging.' : `${creatureName(lounger)} lounges.`) +
          ` ${String(others)} friends here.`,
      };
    }
    case 'chest':
      return {
        marks: (
          <>
            <Glyph id="map-cache" scale={5} class="pp-chest" />
            {state.chestNew && <Glyph id="gift" class="pp-gift" />}
            <span class="pp-count">
              {String(world.items.length)}/{String(BAG_SIZE)}
            </span>
          </>
        ),
        says: `${String(world.items.length)} of ${String(BAG_SIZE)} in the bag.${state.chestNew ? ' Something new.' : ''}`,
      };
    case 'lectern':
      return {
        marks: (
          <>
            <Glyph id="journal" scale={3} class="pp-book" />
            {!state.readJournal && (
              <span class="pp-bub pp-bub-say pp-station-bang">
                <span class="pp-bang">!</span>
              </span>
            )}
          </>
        ),
        says: state.readJournal ? 'The Journal.' : 'The Journal. A new page.',
      };
    case 'fair': {
      const events = world.games.next.open ? world.games.next.lineup.length : 0;
      return {
        marks: (
          <span class="pp-trophy">
            <Glyph id="trophy" scale={2} />
            <span class="pp-count">{String(events)}</span>
          </span>
        ),
        says: events === 0 ? 'The Games are closed.' : `${String(events)} Games events open.`,
      };
    }
  }
}

/** The spoken name of a station, with a held creature in mind. */
function stationLabel(name: string, says: string, verdict: Verdict | null): string {
  if (verdict === null) return `${name}. ${says}`;
  if (verdict.ok) return `${name}, can ${verdict.does}. ${says}`;
  return verdict.word === null
    ? `${name}, takes no creature. ${says}`
    : `${name}, unavailable: ${verdict.word.toLowerCase()}. ${says}`;
}

export function Station({
  id,
  name,
  state,
  scale,
  over,
  shaking,
  onTap,
}: {
  id: StationId;
  name: string;
  state: PartyState;
  scale: number;
  /** A carried creature is over it. */
  over: boolean;
  shaking: boolean;
  onTap: () => void;
}) {
  const verdict = state.held === null ? null : stationVerdict(id, state.held, state);
  const { marks, says } = stationState(id, state);
  const classes = [
    'pp-station',
    `pp-st-${id}`,
    verdict?.ok === true ? 'is-lit' : '',
    verdict !== null && !verdict.ok ? 'is-dim' : '',
    over ? 'is-over' : '',
    shaking ? 'is-shake' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  return (
    <button
      type="button"
      class={classes}
      data-station={id}
      aria-label={stationLabel(name, says, verdict)}
      onClick={onTap}
    >
      <span class="pp-st-art">
        <PixelScene art={stationArt(id, state.world.raid.boss.id)} scale={scale} />
        <span class="pp-st-marks">{marks}</span>
        {verdict?.ok === true && <i class="pp-arrow" aria-hidden="true" />}
      </span>
      <span class="pp-st-name">{name}</span>
      {verdict !== null && !verdict.ok && verdict.word !== null && (
        <span class="pp-word pp-st-word">{verdict.word}</span>
      )}
    </button>
  );
}

/** The clearing: the eight stations on the grass, the trails between them and the camp fire. */
export function Clearing({
  state,
  scale,
  over,
  shake,
  onTap,
  children,
}: {
  state: PartyState;
  scale: number;
  over: StationId | null;
  shake: StationId | null;
  onTap: (id: StationId) => void;
  /** Laid over the clearing (a haul on the grass). */
  children?: ComponentChildren;
}): JSX.Element {
  return (
    <div class="pp-clearing">
      <Ground scale={scale} version={`${String(scale)}`} />
      <span class="pp-hub" data-hub aria-hidden="true" />
      <div class="pp-stations">
        {STATIONS.map((s) => (
          <Station
            key={s.id}
            id={s.id}
            name={s.name}
            state={state}
            scale={scale}
            over={over === s.id}
            shaking={shake === s.id}
            onTap={() => {
              onTap(s.id);
            }}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
