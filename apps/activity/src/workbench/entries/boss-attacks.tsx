import { content } from '@creatures/game';
import { PACING_SLOW, paceOfPacing, planRound, type FightEvent } from '@creatures/engine';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { LiveStage } from '../../Stage';
import { phaseLine } from '../../raid-text';
import { TRACK_LOOKS, type TrackLook } from '../../stage/MoveTrack';
import { bool, num, str } from '../props';
import { bigRaidFight } from '../raid-fight';
import type { Entry } from '../types';

/** The bosses the player can fight, by id. */
const BOSSES = content.bosses.map((b) => b.id);

/** The events a creature's own turn makes; the "boss turns only" view leaves them out. */
const CREATURE_TURN = new Set<FightEvent['t']>([
  'turn',
  'hit',
  'mark',
  'reaction',
  'skip',
  'ability',
  'support_buff',
  'heal',
  'cleanse',
  'proc',
]);

/** The event index where round `r` ends (the start of round r + 1), or the log's end. */
function roundEnd(events: readonly FightEvent[], r: number): number {
  const next = events.findIndex((e) => e.t === 'round_start' && e.round === r + 1);
  return next === -1 ? events.length : next;
}

/**
 * A seeded raid fight of a big party playing on its own, one round after another from `from` to
 * `to`, then again from the start: the live finale's stage at its slow pace (or the replays' classic one),
 * so the boss's attacks can be watched in motion.
 */
function Player({
  bossId,
  players,
  from,
  to,
  look,
  loop,
  slow,
  bossOnly,
}: {
  bossId: string;
  players: number;
  from: number;
  to: number;
  look: TrackLook;
  loop: boolean;
  /** The live finale's slow pace (pacing 2), or the replays' classic one. */
  slow: boolean;
  /** Leave the creatures' turns out, so only the boss acts (to watch its attacks). */
  bossOnly: boolean;
}) {
  const pacing = slow ? PACING_SLOW : 1;
  const fight = useMemo(() => {
    const full = bigRaidFight(players, 0, bossId);
    return bossOnly
      ? { ...full, events: full.events.filter((e) => !CREATURE_TURN.has(e.t)) }
      : full;
  }, [players, bossId, bossOnly]);
  const first = Math.max(1, from);
  const last = Math.max(first, to);
  const [round, setRound] = useState(first - 1);
  // Each pass from the start is a new stage, so the first rounds are shown at once, not played.
  const [pass, setPass] = useState(0);
  useEffect(() => {
    // Round `round` has just been handed to the stage: wait for it to play, then hand it the next.
    const shown = fight.events.slice(
      roundEnd(fight.events, round - 1),
      roundEnd(fight.events, round),
    );
    // How long the stage takes to play the round: its intro and every beat (not padded to the
    // shortest round, so a round with only the boss in it does not sit still).
    const plan = planRound(shown, { pace: paceOfPacing(pacing) });
    const wait =
      round < first ? 800 : plan.introMs + plan.beats.reduce((sum, b) => sum + b.ms, 0) + 600;
    const timer = setTimeout(() => {
      if (round >= last) {
        if (loop) {
          setPass((n) => n + 1);
          setRound(first - 1);
        }
      } else {
        setRound(round + 1);
      }
    }, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [round, first, last, loop, fight, pacing]);
  const events = fight.events.slice(0, roundEnd(fight.events, round));
  return (
    <LiveStage
      key={`${bossId}:${String(players)}:${String(pass)}`}
      boss={fight.boss}
      hpMax={fight.hpMax}
      hpStart={fight.hpMax}
      rounds={fight.rounds}
      row={fight.row}
      mineIds={fight.mineIds}
      names={fight.names}
      events={events}
      pacing={pacing}
      place={phaseLine('finale')}
      trackLook={look}
    />
  );
}

const bossAttacks: Entry = {
  name: 'BossFx',
  file: 'apps/activity/src/stage/BossFx.tsx',
  group: 'Creatures & game pieces',
  description:
    "The boss's attacks in motion: a seeded raid fight plays on its own, round after round, so the shots can be watched (a glowing crescent for a plain attack, a wave across the row for a zone hit or a sweep, falling orbs for a barrage or a charge landing, a spear of light down a lane, two crescents closing in for a pincer, violet crescents for a silence), each tinted with the boss's element and ending in an impact ring, the white flash and big numbers. Pick the boss, the party size, the rounds and the move track's look.",
  controls: {
    boss: { kind: 'select', options: BOSSES },
    players: { kind: 'number', min: 1, max: 15 },
    from: { kind: 'number', min: 1, max: 12 },
    to: { kind: 'number', min: 1, max: 12 },
    track: { kind: 'select', options: TRACK_LOOKS },
    loop: { kind: 'toggle' },
    slow: { kind: 'toggle' },
    bossOnly: { kind: 'toggle' },
  },
  defaults: {
    boss: BOSSES[0] ?? '',
    players: 4,
    from: 2,
    to: 6,
    track: 'rows',
    loop: true,
    slow: true,
    bossOnly: false,
  },
  presets: [
    {
      name: 'Tidal Colossus: Undertow, Riptide, Great Wave',
      props: { boss: 'tidal-colossus', from: 2, to: 6 },
    },
    {
      name: 'Cinder Wyrm: Cinder Fall, Coil Crush, Magma Spit',
      props: { boss: 'cinder-wyrm', from: 1, to: 5 },
    },
    {
      name: 'Thornmother: Bramble Bind, Briar Pincer, Seed Burst',
      props: { boss: 'thornmother', from: 1, to: 6 },
    },
    {
      name: 'Storm Sovereign: Lightning Rod, Thunderclap, Static Field',
      props: { boss: 'storm-sovereign', from: 3, to: 5 },
    },
    {
      name: 'Old Bogback: Sinking Mud, Belly Flop',
      props: { boss: 'old-bogback', from: 2, to: 4 },
    },
  ],
  render: (p) => (
    <Player
      bossId={str(p, 'boss')}
      players={num(p, 'players')}
      from={num(p, 'from')}
      to={num(p, 'to')}
      look={str(p, 'track') as TrackLook}
      loop={bool(p, 'loop')}
      slow={bool(p, 'slow')}
      bossOnly={bool(p, 'bossOnly')}
    />
  ),
};

export const bossAttackEntries: readonly Entry[] = [bossAttacks];
