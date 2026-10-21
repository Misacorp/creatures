import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { baitCount } from './count-items';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { CountBadge } from './ui/CountBadge';
import { Switch } from './ui/Switch';
import { Tag } from './ui/Tag';

/**
 * Today's treat multiplier from the forecast (`WeatherDay.treatTimes`; the server freezes the day's weather
 * when an activity starts). `Game` provides it; without a forecast it is the usual doubling.
 */
export const TreatTimesContext = createContext(2);

/** How long "Not enough Bait" stays in the row after a tap the player cannot afford. */
export const SHORT_NOTE_MS = 3000;

/**
 * "Pack a treat": the one compact line where a creature is sent on a trip, put in the dungeon team or
 * given a Workshop job. A treat costs Bait (the server's price, `Creature.treatCost`, paid when the
 * activity starts) and doubles the experience that activity gives this creature. Nothing is stored or
 * stocked; the box only says what the player wants for this one start. It cannot be switched on without
 * the Bait (the server checks again and refuses a short purse).
 *
 * One row on ink, the whole row a `ui/Switch`: the switch, the treat icon (lit when packed), "Pack a treat"
 * with "for Cindle" under it (one line, a long name ends in "…"), then what it does and what it costs as chips
 * ("2x", the Bait badge; its number red when the player is short). Short of Bait, the switch still takes a
 * tap: the row shakes and "Not enough Bait" stands in for "for Cindle" for a few seconds (Misa, 2026-10-20:
 * no reason line outside the row). The "?" beside it opens the treat's help; a list of boxes under one
 * "Treats" heading that has the "?" passes `help={false}` and `listed` (the row then says only the name).
 */
export function TreatBox({
  cost,
  bait,
  checked,
  disabled = false,
  onChange,
  who,
  times: timesProp,
  help = true,
  listed = false,
}: {
  /** What the treat costs for this creature, in Bait. */
  cost: number;
  /** The player's Bait now. */
  bait: number;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** The creature's name, said in the label (several boxes can be on one screen). */
  who?: string;
  /** The treat's experience multiplier; by default today's, from `TreatTimesContext`. */
  times?: number;
  /** Draw the "?" beside the row (off when a heading above a list of boxes has it). */
  help?: boolean;
  /**
   * One of a list under a "Treats" heading (the dungeon team): the row's words are just the creature's
   * name, since the heading already says what the switches are.
   */
  listed?: boolean;
}) {
  const dayTimes = useContext(TreatTimesContext);
  const times = timesProp ?? dayTimes;
  // Each refused tap counts up, so a second tap restarts the shake and the timer; 0 is no note.
  const [refused, setRefused] = useState(0);
  useEffect(() => {
    if (refused === 0) return undefined;
    const timer = setTimeout(() => {
      setRefused(0);
    }, SHORT_NOTE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [refused]);
  const short = bait < cost && !checked;
  const noting = short && refused > 0;
  const forWho = who === undefined ? '' : `for ${who}`;
  const label = forWho === '' ? 'Pack a treat' : `Pack a treat ${forWho}`;
  const nameOnly = listed && who !== undefined;
  const solo = (forWho === '' || nameOnly) && !noting;
  const classes = ['treat-box', checked ? 'on' : '', short ? 'short' : '']
    .filter((c) => c !== '')
    .join(' ');
  return (
    <div class={classes}>
      <Switch
        on={checked}
        label={nameOnly ? who : 'Pack a treat'}
        spoken={`${label} (${String(times)}x experience, ${String(cost)} Bait${short ? ', not enough Bait' : ''})`}
        disabled={disabled}
        class={solo ? 'treat-switch solo' : 'treat-switch'}
        onChange={(on) => {
          if (on && short) {
            setRefused((n) => n + 1);
            return;
          }
          onChange(on);
        }}
      >
        <Sprite sprite={glyphOrUnknown('treat')} scale={2} class="treat-icon" />
        {noting ? (
          <span key={refused} class="treat-who treat-note">
            Not enough Bait
          </span>
        ) : (
          forWho !== '' && !nameOnly && <span class="treat-who">{forWho}</span>
        )}
        <span class="treat-chips">
          <Tag class="xp-times">{`${String(times)}x`}</Tag>
          <CountBadge {...baitCount(cost)} />
        </span>
      </Switch>
      {help && <GlossaryTag entry="treat" look="help" class="treat-help" />}
      <span class="visually-hidden" role="status">
        {noting ? 'Not enough Bait' : ''}
      </span>
    </div>
  );
}
