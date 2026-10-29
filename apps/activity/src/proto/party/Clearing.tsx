import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { ItemSprite } from '../../GearArt';
import { creatureName } from '../../game';
import { gearName } from '../../gear-view';
import { glyphOrUnknown } from '../../glyphs';
import { TILE } from '../../games/art/tiles';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { PipRow } from '../../ui/PipRow';
import { RAID_TEAM_SIZE, creatureOf, jobsReady, raidTeamIds, tripsHome } from '../world';
import { pipsLeft } from './camp-state';
import { paint } from './paint';
import type { PartyState, StationId } from './party-state';
import { STATIONS, stationVerdict, type Verdict } from './stations';
import { useSize } from './use-size';
import { clearingPlacements } from './world-draw';
import { centreOffset, fitScale, worldLayout, type Mode } from './world-layout';

const BAG_SIZE = 60;

function Face({ species, scale }: { species: string; scale: number }) {
  return <Sprite sprite={creatureSpriteOrFallback(species)} scale={scale} class="pp-face" />;
}

function Glyph({ id, scale, class: extra }: { id: string; scale: number; class?: string }) {
  return (
    <Sprite
      sprite={glyphOrUnknown(id)}
      scale={scale}
      {...(extra === undefined ? {} : { class: extra })}
    />
  );
}

/** What a station shows on its art (marks at the mark scale `m`), and the sentence that says it. */
function stationState(
  id: StationId,
  state: PartyState,
  m: number,
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
            <span class="pp-mk pp-mk-tl" role="img" aria-label={`Free trip slots: ${String(free)}`}>
              {Array.from({ length: free }, (_, i) => (
                <Glyph key={i} id="flag" scale={m} />
              ))}
            </span>
            {homeCreature !== null && (
              <span class="pp-mk pp-mk-br pp-bob">
                <Face species={homeCreature.species} scale={m} />
                <Glyph id="satchel" scale={m} />
              </span>
            )}
          </>
        ),
        says:
          `Trip slots free: ${String(free)} / ${String(world.slots.total)}.` +
          (homeCreature === null ? '' : ` ${creatureName(homeCreature)} is home with loot.`),
      };
    }
    case 'forge': {
      const open = world.jobs.filter((j) => j.status !== 'claimed');
      const ready = jobsReady(world)[0];
      const running = open.find((j) => j.status === 'running');
      const shown = ready ?? running;
      return {
        marks:
          shown === undefined ? null : (
            <span class="pp-mk pp-mk-br">
              {ready !== undefined && ready.input.baseId !== undefined && (
                <ItemSprite baseId={ready.input.baseId} scale={m} class="pp-bob pp-anvil-item" />
              )}
              <Face species={creatureOf(world, shown.creatureId).species} scale={m} />
              {ready === undefined && (
                <PipRow count={4} lit={pipsLeft(shown.startedAt, shown.endsAt, world.now)} />
              )}
            </span>
          ),
        says:
          ready === undefined
            ? `Anvils busy: ${String(open.length)} / ${String(world.jobSlots.total)}.`
            : `${gearName(ready.input.baseId ?? 'kelp-cap')} is ready.`,
      };
    }
    case 'arena': {
      const placed = raidTeamIds(world).length;
      const locked = world.raid.party === null || !world.raid.you.canEdit;
      return {
        marks: (
          <span class="pp-mk pp-mk-b">
            {locked ? (
              <Glyph id="lock" scale={m} />
            ) : (
              <PipRow count={RAID_TEAM_SIZE} lit={placed} size="md" />
            )}
          </span>
        ),
        says: locked
          ? `${world.raid.boss.name}. Locked.`
          : `${world.raid.boss.name}. Placed: ${String(placed)} / ${String(RAID_TEAM_SIZE)}.`,
      };
    }
    case 'cave':
      return {
        marks: world.dungeon.canRun ? null : (
          <span class="pp-mk pp-mk-c">
            <Glyph id="check" scale={m} />
          </span>
        ),
        says: world.dungeon.canRun ? 'Today’s run is open.' : 'Done for today.',
      };
    case 'house': {
      const lounger = state.lounger === null ? null : creatureOf(world, state.lounger);
      return {
        marks:
          lounger === null ? null : (
            <span class="pp-mk pp-mk-window">
              <Face species={lounger.species} scale={Math.max(1, m - 1)} />
            </span>
          ),
        says: lounger === null ? 'Nobody lounging.' : `${creatureName(lounger)} lounges.`,
      };
    }
    case 'chest':
      return {
        marks: state.chestNew ? (
          <span class="pp-mk pp-mk-tr pp-bob">
            <Glyph id="gift" scale={m} />
          </span>
        ) : null,
        says: `In the bag: ${String(world.items.length)} / ${String(BAG_SIZE)}.${state.chestNew ? ' Something new.' : ''}`,
      };
    case 'lectern':
      return {
        marks: state.readJournal ? null : (
          <span class="pp-mk pp-mk-tr">
            <span class="pp-bub pp-bub-say">
              <span class="pp-bang">!</span>
            </span>
          </span>
        ),
        says: state.readJournal ? 'The Journal.' : 'The Journal. A new page.',
      };
    case 'fair': {
      const events = world.games.next.open ? world.games.next.lineup.length : 0;
      return {
        marks:
          events === 0 ? null : (
            <span class="pp-mk pp-mk-tr">
              <Glyph id="trophy" scale={m} />
            </span>
          ),
        says: events === 0 ? 'The Games are closed.' : `Games events open: ${String(events)}.`,
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

/** The clearing: one pixel scene of grass, a road and the eight places, scaled to fill the field. */
export function Clearing({
  state,
  mode,
  over,
  shake,
  onTap,
  children,
}: {
  state: PartyState;
  mode: Mode;
  over: StationId | null;
  shake: StationId | null;
  onTap: (id: StationId) => void;
  children?: ComponentChildren;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(ref);
  const layout = worldLayout(mode);
  const s = fitScale(size, layout, 2, 6);
  const off = centreOffset(size, layout, s);
  const cols = Math.ceil(size.width / s / TILE) + 1;
  const rows = Math.ceil(size.height / s / TILE) + 1;
  const bossId = state.world.raid.boss.id;
  const placements = useMemo(
    () => clearingPlacements(layout, cols, rows, off.x, off.y, bossId),
    [mode, cols, rows, off.x, off.y, bossId],
  );
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, placements, s);
  }, [placements, s]);
  const m = Math.max(2, s - 1);
  return (
    <div ref={ref} class="pp-clearing">
      <canvas
        ref={canvasRef}
        class="pp-world"
        width={cols * TILE * s}
        height={rows * TILE * s}
        aria-hidden="true"
      />
      {size.width > 0 &&
        STATIONS.map((st) => {
          const box = layout.stations[st.id];
          const verdict = state.held === null ? null : stationVerdict(st.id, state.held, state);
          const { marks, says } = stationState(st.id, state, m);
          const classes = [
            'pp-station',
            `pp-st-${st.id}`,
            verdict?.ok === true ? 'is-lit' : '',
            verdict !== null && !verdict.ok ? 'is-dim' : '',
            over === st.id ? 'is-over' : '',
            shake === st.id ? 'is-shake' : '',
          ]
            .filter((c) => c !== '')
            .join(' ');
          return (
            <button
              key={st.id}
              type="button"
              class={classes}
              data-station={st.id}
              aria-label={stationLabel(st.name, says, verdict)}
              ref={cssVars({
                '--x': `${String((box.x + off.x) * s)}px`,
                '--y': `${String((box.y + off.y) * s)}px`,
                '--w': `${String(box.width * s)}px`,
                '--h': `${String(box.height * s)}px`,
              })}
              onClick={() => {
                onTap(st.id);
              }}
            >
              <span class="pp-st-marks">{marks}</span>
              {verdict?.ok === true && <i class="pp-arrow" aria-hidden="true" />}
              <span class="pp-plate">{st.name}</span>
              {verdict !== null && !verdict.ok && verdict.word !== null && (
                <span class="pp-word pp-st-word">{verdict.word}</span>
              )}
            </button>
          );
        })}
      {children}
    </div>
  );
}
