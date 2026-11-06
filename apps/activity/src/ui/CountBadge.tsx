import type { ComponentChildren } from 'preact';
import { sayText, type Price, type Say, type ShortOf } from '../resource-count';
import { GlossaryTag } from '../Glossary';
import type { CountBadgeProps, CountItem } from '../count-types';
import { GameIcon } from './GameIcon';

export type { CountBadgeProps, CountItem };

/**
 * An icon with a number (and, when asked for, its name): the one count badge of parts, Bait,
 * Essence and supplies on every reward and cost line.
 */
export function CountBadge({
  icon,
  amount,
  spokenAmount,
  label,
  entry,
  name,
  size = 'chip',
}: CountBadgeProps) {
  const cls = size === 'inline' ? 'part-count inline' : 'part-count';
  const body = (
    <>
      <GameIcon icon={icon} scale={2} />
      {amount !== undefined && <span class="part-amount pix">{amount}</span>}
      {name !== undefined && <span class="cost-name">{name}</span>}
    </>
  );
  const spoken =
    label === undefined
      ? undefined
      : amount === undefined
        ? label
        : `${label}: ${spokenAmount ?? String(amount)}`;
  if (entry !== undefined) {
    return (
      <GlossaryTag
        entry={entry}
        look="chip"
        class={cls}
        {...(spoken === undefined ? {} : { label: spoken })}
      >
        {body}
      </GlossaryTag>
    );
  }
  return spoken === undefined ? (
    <span class={cls}>{body}</span>
  ) : (
    <span class={cls} role="img" aria-label={spoken}>
      {body}
    </span>
  );
}

/**
 * A list of count badges: a `<ul>` with one `<li>` per item, named for assistive technology. `children` are
 * further `<li>` rows after the badges (a job's time beside what it gives).
 */
export function CountBadgeList({
  items,
  label,
  class: cls,
  children,
}: {
  items: readonly CountItem[];
  label: string;
  class?: string;
  children?: ComponentChildren;
}) {
  return (
    <ul {...(cls === undefined ? {} : { class: cls })} aria-label={label}>
      {items.map(({ key, ...badge }) => (
        <li key={key}>
          <CountBadge {...badge} />
        </li>
      ))}
      {children}
    </ul>
  );
}

/**
 * Amounts in a line ("Still needed", a button's cost): inline count badges side by side. The one way to say
 * what something costs, takes or holds in the valley and in buttons; resource names are never spelled out
 * (`resource-count.ts` makes the items; `no-resource-words.test.ts` guards it).
 */
export function CostLine({ items, class: cls }: { items: readonly CountItem[]; class?: string }) {
  return (
    <span class={cls === undefined ? 'cost-line' : `cost-line ${cls}`}>
      {items.map(({ key, ...badge }) => (
        <CountBadge key={key} size="inline" {...badge} />
      ))}
    </span>
  );
}

/** A price: its amounts as inline badges, or its word ("free"). */
export function PriceLine({ price }: { price: Price }) {
  return price.items.length === 0 ? <>{price.text}</> : <CostLine items={price.items} />;
}

/** Why something cannot be paid: "You have [3]; this costs [10]." as badges. */
export function ShortOfLine({ short }: { short: ShortOf }) {
  return (
    <>
      You have <CostLine items={short.have} />; this costs <CostLine items={short.cost} />.
    </>
  );
}

/** A line of words with amounts in it: the strings as text, each count item as an inline badge. */
export function SayLine({ say }: { say: Say }) {
  return (
    <>
      {say.map((part, i) => {
        if (typeof part === 'string') return part;
        const { key, ...badge } = part;
        return <CountBadge key={`${String(i)}-${key}`} size="inline" {...badge} />;
      })}
    </>
  );
}

/** What a screen reader says for a `Say`: its words, and each badge as its spoken label. */
export function spokenSay(say: Say): string {
  return sayText(say);
}
