import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Banner } from './Banner';
import { Stars } from './ExpeditionIcons';
import { getSpecies, speciesName } from './game';
import { LootList } from './GearLoot';
import type { GrantLoot } from './gear-types';
import { glyphOrUnknown } from './glyphs';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { TalentChip } from './TalentChip';
import type { ChoiceRequest, TalentView } from './talent-types';
import { Accordion } from './ui/Accordion';
import { CountBadge, type CountItem } from './ui/CountBadge';
import { Tag } from './ui/Tag';
import { XpBar } from './XpBar';

/** One way a duplicate can go, as a radio option: what it does, and why not when it cannot. */
export interface FindOption {
  key: string;
  /** "Fuse", "Teach", "Release". */
  label: string;
  /** What it does, in a few words: "Fusion 3 → 4 / 5", "Into slot 2", or the Release refund (shown as counts). */
  detail: string;
  /** What Release pays, as count badges (instead of `detail` words). */
  pays?: CountItem[];
  /** Why it cannot be picked ("Already in Splashet's Talent Book"); null when it can. */
  blocked: string | null;
  recommended: boolean;
  request: ChoiceRequest;
}

/** A creature the trip found: a new one, or a duplicate that waits for a choice. */
export type Find =
  | {
      kind: 'new';
      key: string;
      species: string;
      talent: TalentView;
      badges: { text: string; entry: string | null }[];
    }
  | {
      kind: 'duplicate';
      key: string;
      species: string;
      talent: TalentView;
      /** Grouped by choice: each group is one radio row; Teach can have one row per place it can go. */
      options: FindOption[];
    };

/** Everything the screen shows, already worked out from the server's claim result. */
export interface TripResultView {
  explorer: { id: string; species: string; name: string };
  place: { id: string; name: string };
  hours: number;
  finds: Find[];
  counts: CountItem[];
  loot: GrantLoot | null;
  xp: { gained: number; value: number; max: number; startCap: string; endCap?: string };
  growth: { gained: number; treat: boolean; from: number; to: number };
  stars: { stars: number; gained: boolean; trips: number };
  journal: { title: string; text: string }[];
}

/** The header picture: the place's banner with the explorer standing on it, or the banner behind the whole card. */
export type HeaderLook = 'strip' | 'backdrop';

function FindHead({ species, badge }: { species: string; badge?: ComponentChildren }) {
  const def = getSpecies(species);
  return (
    <div class="tr-find-head">
      <Sprite sprite={creatureSpriteOrFallback(species)} scale={3} bob />
      <div class="tr-find-name">
        <strong class={`pix rarity-name rarity-${def?.rarity ?? 'common'}`}>
          {speciesName(species)}
        </strong>
        <span class="tr-find-tags">
          {def !== undefined && <ElementChip element={def.element} />}
          {badge}
        </span>
      </div>
    </div>
  );
}

/** One radio row: a pixel box, the choice's name and what it does; a blocked one is greyed and says why. */
function OptionRow({
  group,
  option,
  checked,
  onPick,
}: {
  group: string;
  option: FindOption;
  checked: boolean;
  onPick: () => void;
}) {
  const id = `${group}-${option.key}`;
  const blocked = option.blocked !== null;
  return (
    <li class={`tr-option${checked ? ' on' : ''}${blocked ? ' blocked' : ''}`}>
      <input
        type="radio"
        id={id}
        name={group}
        class="visually-hidden"
        checked={checked}
        disabled={blocked}
        onChange={onPick}
      />
      <label for={id}>
        <span class="tr-radio" aria-hidden="true" />
        <span class="tr-option-label pix">{option.label}</span>
        <span class="tr-option-detail">
          {blocked ? (
            option.blocked
          ) : option.pays !== undefined ? (
            <span class="tr-pays">
              {option.pays.map(({ key, ...badge }) => (
                <CountBadge key={key} {...badge} />
              ))}
            </span>
          ) : (
            option.detail
          )}
        </span>
        {option.recommended && !blocked && (
          <span class="tr-rec pix" aria-label="Recommended">
            ★
          </span>
        )}
      </label>
    </li>
  );
}

/**
 * Draft (2026-10-17): the expedition result as one screen. A header that says who went where for how
 * long over the place's banner; the creatures found, each a card, a duplicate with its choice as radio
 * rows (Recommended preselected, a choice that cannot be made greyed with the reason); what came home as
 * count badges and item rows; one compact progress block; journal pages; one Claim button for it all.
 */
export function TripResult({
  view,
  header = 'strip',
  journalOpen = true,
  onClaim,
}: {
  view: TripResultView;
  header?: HeaderLook;
  journalOpen?: boolean;
  onClaim: (choices: Record<string, ChoiceRequest>) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    const first: Record<string, string> = {};
    for (const find of view.finds) {
      if (find.kind !== 'duplicate') continue;
      const rec = find.options.find((o) => o.recommended && o.blocked === null);
      const open = find.options.find((o) => o.blocked === null);
      const pick = rec ?? open;
      if (pick !== undefined) first[find.key] = pick.key;
    }
    return first;
  });
  const duplicates = view.finds.filter((f) => f.kind === 'duplicate');
  const found = view.finds.length;
  return (
    <section class={`tr card-item${header === 'backdrop' ? ' tr-backdrop' : ''}`}>
      {header === 'backdrop' && (
        <div class="tr-backdrop-art" aria-hidden="true">
          <Banner destination={view.place.id} />
        </div>
      )}
      <header class="tr-head">
        {header === 'strip' && (
          <Banner
            destination={view.place.id}
            walker={{
              species: view.explorer.species,
              shiny: false,
              fraction: 0.82,
              info: null,
              id: view.explorer.id,
            }}
          />
        )}
        <h3 class="tr-title">
          <span class="pix">{view.explorer.name}</span> spent {view.hours} hours at{' '}
          <span class="pix">{view.place.name}</span>
          {found > 0 ? ' and found…' : '.'}
        </h3>
      </header>

      {found > 0 && (
        <ul class="tr-finds" aria-label="Creatures found">
          {view.finds.map((find) =>
            find.kind === 'new' ? (
              <li key={find.key} class="tr-find">
                <FindHead
                  species={find.species}
                  badge={find.badges.map((b) => (
                    <Tag
                      key={b.text}
                      kind="badge"
                      {...(b.entry === null ? {} : { entry: b.entry })}
                    >
                      {b.text}
                    </Tag>
                  ))}
                />
                <TalentChip talent={find.talent} />
              </li>
            ) : (
              <li key={find.key} class="tr-find dup">
                <FindHead
                  species={find.species}
                  badge={
                    <Tag kind="badge" entry="duplicate-choice">
                      Duplicate
                    </Tag>
                  }
                />
                <TalentChip talent={find.talent} />
                <fieldset class="tr-choice">
                  <legend class="visually-hidden">
                    What to do with this {speciesName(find.species)}
                  </legend>
                  <ul class="tr-options">
                    {find.options.map((option) => (
                      <OptionRow
                        key={option.key}
                        group={find.key}
                        option={option}
                        checked={picked[find.key] === option.key}
                        onPick={() => {
                          setPicked({ ...picked, [find.key]: option.key });
                        }}
                      />
                    ))}
                  </ul>
                </fieldset>
              </li>
            ),
          )}
        </ul>
      )}

      {(view.counts.length > 0 || view.loot !== null) && (
        <div class="tr-loot">
          <p class="label">Brought home</p>
          <p class="tr-counts">
            {view.counts.map(({ key, ...badge }) => (
              <CountBadge key={key} {...badge} />
            ))}
          </p>
          {view.loot !== null && <LootList loot={view.loot} counted label="Gear and blueprints" />}
        </div>
      )}

      <dl class="tr-progress">
        <dt class="pix">Explorer</dt>
        <dd>
          <span class="pix">{view.xp.startCap}</span>
          <span class="tr-gain pix">+{view.xp.gained} XP</span>
        </dd>
        <dd class="tr-bar">
          <XpBar
            value={view.xp.value}
            max={view.xp.max}
            label={`${view.explorer.name}'s explorer XP`}
          />
        </dd>
        <dt class="pix">Level</dt>
        <dd class="tr-level">
          <span class="lvl-tag pix">Lv {view.growth.from}</span>
          {view.growth.to > view.growth.from && (
            <>
              <Sprite sprite={glyphOrUnknown('left_to_right')} scale={2} />
              <span class="lvl-tag pix">Lv {view.growth.to}</span>
            </>
          )}
          <span class="tr-gain pix">+{view.growth.gained}</span>
          {view.growth.treat && (
            <Tag kind="badge" entry="treat">
              Treat
            </Tag>
          )}
        </dd>
        <dt class="pix">Familiarity</dt>
        <dd>
          <Stars stars={view.stars.stars} />
          {view.stars.gained ? (
            <strong class="good-note">New star!</strong>
          ) : (
            <span class="muted">{view.stars.trips} trips</span>
          )}
        </dd>
      </dl>

      {view.journal.map((page) =>
        journalOpen ? (
          <div key={page.title} class="tr-journal">
            <p class="pix">
              <Sprite sprite={glyphOrUnknown('journal')} scale={2} /> {page.title}
            </p>
            <p class="journal-text">{page.text}</p>
          </div>
        ) : (
          <Accordion key={page.title} title={`Journal: ${page.title}`} variant="compact">
            <p class="journal-text">{page.text}</p>
          </Accordion>
        ),
      )}

      <div class="tr-foot">
        <button
          type="button"
          class="primary"
          onClick={() => {
            const choices: Record<string, ChoiceRequest> = {};
            for (const find of duplicates) {
              const option = find.options.find((o) => o.key === picked[find.key]);
              if (option !== undefined) choices[find.key] = option.request;
            }
            onClaim(choices);
          }}
        >
          Claim
        </button>
      </div>
    </section>
  );
}
