import { baitCount } from './count-items';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { CountBadge } from './ui/CountBadge';
import { Switch } from './ui/Switch';
import { Tag } from './ui/Tag';

/**
 * "Pack a treat": the one compact line where a creature is sent on a trip, put in the dungeon team or
 * given a Workshop job. A treat costs Bait (the server's price, `Creature.treatCost`, paid when the
 * activity starts) and doubles the experience that activity gives this creature. Nothing is stored or
 * stocked; the box only says what the player wants for this one start. It cannot be switched on without
 * the Bait (the server checks again and refuses a short purse).
 *
 * One row on ink, the whole row a `ui/Switch`: the switch, the treat icon (lit when packed), "Pack a treat"
 * with "for Cindle" under it (one line, a long name ends in "…"), then what it does and what it costs as chips
 * ("2x", the Bait badge). Packed, the row's edge turns gold. The "?"
 * beside it opens the treat's help.
 */
export function TreatBox({
  cost,
  bait,
  checked,
  disabled = false,
  onChange,
  who,
  times = 2,
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
  /** The treat's experience multiplier (2, or the day's 3 or 4 when a Boon raises it). */
  times?: number;
}) {
  const short = bait < cost;
  const forWho = who === undefined ? '' : `for ${who}`;
  const label = forWho === '' ? 'Pack a treat' : `Pack a treat ${forWho}`;
  const classes = ['treat-box', checked ? 'on' : '', short && !checked ? 'short' : '']
    .filter((c) => c !== '')
    .join(' ');
  return (
    <div class={classes}>
      <Switch
        on={checked}
        label="Pack a treat"
        spoken={`${label} (${String(times)}x experience, ${String(cost)} Bait)`}
        disabled={disabled || (short && !checked)}
        class={forWho === '' ? 'treat-switch solo' : 'treat-switch'}
        onChange={onChange}
      >
        <Sprite sprite={glyphOrUnknown('treat')} scale={2} class="treat-icon" />
        {forWho !== '' && <span class="treat-who">{forWho}</span>}
        <span class="treat-chips">
          <Tag class="xp-times">{`${String(times)}x`}</Tag>
          <CountBadge {...baitCount(cost)} />
        </span>
      </Switch>
      <GlossaryTag entry="treat" look="help" class="treat-help" />
      {short && !checked && <p class="reason treat-reason">Not enough Bait</p>}
    </div>
  );
}
