/**
 * Inside the arena (the Raid): this week's boss stands in the middle, big, with its moves small under it
 * (`BossIconList`), and the sand in front of it is the board: three lines (front nearest the boss) of three
 * lanes. The other players' creatures stand in their slots; your empty slots are dashed squares that flash in
 * steps. Tap one, pick a creature from the line-up on the floor, and it drops into the slot with a puff of dust.
 * The phase and its time hang on a small wooden sign. Tap the boss for its card.
 */
import { useEffect, useState } from 'preact/hooks';
import { BossCard } from '../../BossCard';
import { BossIconList } from '../../BossIcons';
import { bossArt } from '../../art';
import { cssVars } from '../../css-vars';
import { whenText } from '../../home-view';
import { eventTitle } from '../../raid-time';
import { Sprite } from '../../sprites/Sprite';
import { propSprite } from '../../games/art/props';
import { Drawer } from '../../ui/Drawer';
import { RAID_TEAM_SIZE, freeCreatures, raidTeamIds, type ProtoWorld } from '../world';
import { LineUp } from './LineUp';
import { At, CreatureSprite, Glyph, Pic, isStill } from './parts';
import { SceneFrame } from './SceneFrame';
import { ARENA_BOARD, ARENA_BOSS_AT, ARENA_SIZE, arenaDraw } from './scene-art';
import { placeRaidAt } from './valley-logic';

const ZONES = ['front', 'middle', 'back'] as const;

export function ArenaScene({
  world,
  setWorld,
  pickSlot,
  onLeave,
  onProgress,
}: {
  world: ProtoWorld;
  setWorld: (w: ProtoWorld) => void;
  /** A slot whose line-up is open at first (the step's moment), or null. */
  pickSlot: number | null;
  onLeave: () => void;
  onProgress: () => void;
}) {
  const still = isStill();
  const [picking, setPicking] = useState<number | null>(pickSlot);
  const [dust, setDust] = useState<{ slot: number; frame: number } | null>(null);
  const [card, setCard] = useState(false);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (still) return undefined;
    const id = window.setInterval(() => {
      setFlash((f) => f + 1);
    }, 400);
    return () => {
      window.clearInterval(id);
    };
  }, [still]);
  useEffect(() => {
    if (dust === null) return undefined;
    const id = window.setTimeout(() => {
      setDust(dust.frame >= 3 ? null : { ...dust, frame: dust.frame + 1 });
    }, 90);
    return () => {
      window.clearTimeout(id);
    };
  }, [dust]);

  const row = world.raid.party?.row ?? [];
  const placed = raidTeamIds(world).length;
  const left = RAID_TEAM_SIZE - placed;
  const boss = world.raid.boss;
  const art = bossArt(boss.id);
  const next = world.raid.next;

  const pick = (creatureId: string): void => {
    if (picking === null) return;
    const after = placeRaidAt(world, creatureId, picking);
    setWorld(after);
    if (!still) setDust({ slot: picking, frame: 0 });
    // The next empty slot opens on its own while there are creatures to place.
    const team = raidTeamIds(after).length;
    const nextEmpty = (after.raid.party?.row ?? []).find((s) => s.creature === null);
    if (team >= RAID_TEAM_SIZE) {
      setPicking(null);
      onProgress();
    } else setPicking(nextEmpty?.slot ?? null);
  };

  const floor =
    picking !== null && left > 0 ? (
      <div class="pv-setup">
        <p class="pv-floor-note pix" aria-hidden="true">
          {[...Array(left).keys()].map((k) => (
            <span key={k} class="pv-slot-square" />
          ))}
        </p>
        <LineUp
          label={`Who stands in this slot? ${String(left)} to place`}
          creatures={freeCreatures(world)}
          picked={null}
          onPick={pick}
        />
      </div>
    ) : (
      <div class="pv-raid-icons">
        <BossIconList boss={boss} effectiveRank={world.raid.effectiveRank} compact />
      </div>
    );

  return (
    <>
      <SceneFrame
        id="arena"
        label="Arena, Raid"
        width={ARENA_SIZE.width}
        height={ARENA_SIZE.height}
        draw={arenaDraw}
        onLeave={onLeave}
        floor={floor}
        ground="#5e3620"
      >
        {({ s, X, Y }) => (
          <>
            <span
              class="pv-sign pix"
              ref={cssVars({ '--x': `${String(X(4))}px`, '--y': `${String(Y(38))}px` })}
            >
              <Glyph id="clock" scale={2} />
              <span>
                {next === null
                  ? ''
                  : `${eventTitle(next.event)} ${whenText(world.now, next.at, world.timezone)}`}
              </span>
            </span>
            <button
              type="button"
              class="pv-boss-button"
              aria-label={`${boss.name}, this week's boss. Open its card`}
              aria-haspopup="dialog"
              ref={cssVars({
                '--x': `${String(X(ARENA_BOSS_AT.x) - 12 * s)}px`,
                '--y': `${String(Y(ARENA_BOSS_AT.y) - 6 * s)}px`,
              })}
              onClick={() => {
                setCard(true);
              }}
            >
              <Sprite sprite={art.sprite} scale={s + 1} />
            </button>
            <ul class="pv-board" aria-label="Your party's board, front line nearest the boss">
              {row.map((slot) => {
                const zone = ZONES.indexOf(slot.zone);
                const lane = row.filter((r) => r.zone === slot.zone).indexOf(slot);
                const x = ARENA_BOARD.x + lane * ARENA_BOARD.step;
                const y = ARENA_BOARD.y + zone * ARENA_BOARD.step;
                const c = slot.creature;
                const mine = c?.mine === true;
                const name = c === null ? '' : c.name;
                const label =
                  c === null
                    ? `${slot.zone} line, lane ${String(lane + 1)}: empty. Place a creature`
                    : `${slot.zone} line, lane ${String(lane + 1)}: ${name}, level ${String(c.level)}, ${mine ? 'yours' : c.ownerName}`;
                const empty = c === null;
                const lit = empty && left > 0 && (flash % 2 === 0 || picking === slot.slot);
                return (
                  <li key={slot.slot}>
                    <button
                      type="button"
                      class={`pv-raid-slot${empty ? ' empty' : ''}${mine ? ' mine' : ''}${lit ? ' lit' : ''}${picking === slot.slot ? ' on' : ''}`}
                      aria-label={label}
                      disabled={!empty || left === 0}
                      ref={cssVars({
                        '--x': `${String(X(x))}px`,
                        '--y': `${String(Y(y))}px`,
                        '--pw': `${String(20 * s)}px`,
                        '--ph': `${String(20 * s)}px`,
                      })}
                      onClick={() => {
                        setPicking(slot.slot);
                      }}
                    >
                      {c !== null && (
                        <CreatureSprite creature={{ species: c.species, shiny: false }} scale={s} />
                      )}
                      {c !== null && !mine && (
                        <span class="pv-owner pix" aria-hidden="true">
                          {c.ownerName}
                        </span>
                      )}
                    </button>
                    {dust?.slot === slot.slot && (
                      <At x={X(x + 1)} y={Y(y + 14)}>
                        <Pic sprite={propSprite('dust', dust.frame % 2)} scale={s} />
                      </At>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SceneFrame>
      <Drawer
        open={card}
        onClose={() => {
          setCard(false);
        }}
        title={boss.name}
      >
        <BossCard view={world.raid} />
      </Drawer>
    </>
  );
}
