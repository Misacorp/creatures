/**
 * Inside the arena (the Raid), full screen: this week's boss stands on the sand at the world's scale (more
 * pixels than a creature, the same pixel size), its name on a plate with its element, and three pips by it
 * for the creatures you still place. In front of it the board: three lines (front nearest the boss) of three
 * seats, drawn as rugs in the sand's own tones. The other players' creatures sit on their seats with their
 * owner's name on an ink plate; yours carry a pennant. Pick a seat (the next free one is picked for you) and a
 * creature in the tray; Place is pinned at the bottom. Tap the boss for its card.
 */
import { useEffect, useState } from 'preact/hooks';
import { BossCard } from '../../BossCard';
import { bossArt } from '../../art';
import { cssVars } from '../../css-vars';
import { creatureName } from '../../game';
import { propSprite } from '../../games/art/props';
import { Sprite } from '../../sprites/Sprite';
import { ElementChip } from '../../sprites/ElementChip';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { PipRow } from '../../ui/PipRow';
import { RAID_TEAM_SIZE, isFree, raidTeamIds, type ProtoWorld } from '../world';
import { At, CreatureSprite, Pic, Plate, isStill } from './parts';
import { SceneFrame } from './SceneFrame';
import { arenaDraw, arenaSpots } from './scene-art';
import { placeRaidAt } from './valley-logic';

const ZONES = ['front', 'middle', 'back'] as const;

/** The first empty seat, front line first (the seat picked for you). */
export function firstEmptySeat(world: ProtoWorld): number | null {
  return (world.raid.party?.row ?? []).find((s) => s.creature === null)?.slot ?? null;
}

export function ArenaScene({
  world,
  setWorld,
  held,
  setHeld,
  onLeave,
  onDone,
  onProgress,
}: {
  world: ProtoWorld;
  setWorld: (w: ProtoWorld) => void;
  held: string | null;
  setHeld: (id: string | null) => void;
  onLeave: () => void;
  /** All placed: back to the valley. */
  onDone: () => void;
  onProgress: () => void;
}) {
  const still = isStill();
  const left = RAID_TEAM_SIZE - raidTeamIds(world).length;
  const [seatPicked, setSeat] = useState<number | null>(left > 0 ? firstEmptySeat(world) : null);
  const [dust, setDust] = useState<{ slot: number; frame: number } | null>(null);
  const [card, setCard] = useState(false);

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
  const boss = world.raid.boss;
  const art = bossArt(boss.id);
  const pick =
    held === null ? undefined : world.creatures.find((c) => c.id === held && isFree(world, c));

  const place = (slot: number | null): void => {
    if (slot === null || pick === undefined || left === 0) return;
    const after = placeRaidAt(world, pick.id, slot);
    setWorld(after);
    setHeld(null);
    if (!still) setDust({ slot, frame: 0 });
    const done = raidTeamIds(after).length >= RAID_TEAM_SIZE;
    setSeat(done ? null : firstEmptySeat(after));
    if (done) onProgress();
  };

  const act =
    left > 0 ? (
      <ActionButton
        label={pick === undefined ? 'Pick a creature below' : `Place ${creatureName(pick)}`}
        detail={`${String(left)} to place`}
        wide
        large
        disabled={pick === undefined || seatPicked === null}
        onClick={() => {
          place(seatPicked);
        }}
      />
    ) : (
      <ActionButton label="Team placed · back to the valley" wide large onClick={onDone} />
    );

  return (
    <>
      <SceneFrame
        id="arena"
        label="Arena, Raid"
        draw={arenaDraw}
        onLeave={onLeave}
        act={act}
        ground="#e2bc72"
      >
        {(g) => {
          const { s, X, Y } = g;
          const at = arenaSpots(g);
          return (
            <>
              <button
                type="button"
                class="pv-boss-button"
                aria-label={`${boss.name}, this week's boss. Open its card`}
                aria-haspopup="dialog"
                ref={cssVars({
                  '--x': `${String(X(at.boss.x))}px`,
                  '--y': `${String(Y(at.boss.y))}px`,
                })}
                onClick={() => {
                  setCard(true);
                }}
              >
                <Sprite sprite={art.sprite} scale={s} />
              </button>
              <At x={X(at.boss.x + 12)} y={Y(at.boss.y + 25)} class="pv-centred" hidden={false}>
                <span class="pv-boss-plate">
                  <Plate>{boss.name}</Plate>
                  <ElementChip element={boss.element} as="plain" />
                </span>
              </At>
              <At x={X(at.boss.x + 28)} y={Y(at.boss.y + 4)} hidden={false}>
                <span class="pv-pips">
                  <PipRow
                    count={RAID_TEAM_SIZE}
                    lit={RAID_TEAM_SIZE - left}
                    size="md"
                    label={`Placed: ${String(RAID_TEAM_SIZE - left)} / ${String(RAID_TEAM_SIZE)}`}
                  />
                </span>
              </At>
              <ul class="pv-board" aria-label="Your party's board, front line nearest the boss">
                {row.map((slot) => {
                  const line = ZONES.indexOf(slot.zone);
                  const lane = row.filter((r) => r.zone === slot.zone).indexOf(slot);
                  const x = at.board.x + lane * at.board.step;
                  const y = at.board.y + line * at.board.step;
                  const c = slot.creature;
                  const mine = c?.mine === true;
                  const label =
                    c === null
                      ? `${slot.zone} line, seat ${String(lane + 1)}: empty`
                      : `${slot.zone} line, seat ${String(lane + 1)}: ${c.name}, level ${String(c.level)}, ${mine ? 'yours' : c.ownerName}`;
                  const empty = c === null;
                  const on = seatPicked === slot.slot;
                  return (
                    <li key={slot.slot}>
                      <button
                        type="button"
                        class={`pv-seat${empty ? ' empty' : ''}${mine ? ' mine' : ''}${on ? ' on' : ''}`}
                        aria-label={label}
                        aria-pressed={empty ? on : undefined}
                        disabled={!empty || left === 0}
                        ref={cssVars({
                          '--x': `${String(X(x))}px`,
                          '--y': `${String(Y(y))}px`,
                          '--pw': `${String(at.board.seat * s)}px`,
                          '--ph': `${String(at.board.seat * s)}px`,
                        })}
                        onClick={() => {
                          if (pick !== undefined) place(slot.slot);
                          else setSeat(slot.slot);
                        }}
                      >
                        {c !== null && (
                          <CreatureSprite
                            creature={{ species: c.species, shiny: false }}
                            scale={s}
                          />
                        )}
                        {mine && (
                          <span class="pv-pennant" aria-hidden="true">
                            <Pic sprite={propSprite('pennant', 0, 'red')} scale={2} />
                          </span>
                        )}
                        {c !== null && !mine && (
                          <span class="pv-owner" aria-hidden="true">
                            <Plate>{c.ownerName}</Plate>
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
          );
        }}
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
