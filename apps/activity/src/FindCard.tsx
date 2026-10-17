import { FusionStars } from './ExpeditionIcons';
import type { Find, FindOption } from './find-view';
import { getSpecies, speciesName } from './game';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { shinyPalette } from './art';
import { TalentChip } from './TalentChip';
import { CountBadge } from './ui/CountBadge';
import { Tag } from './ui/Tag';

/** What a row does, in as few words as it takes: the stars a fusion adds, the book, the parts. */
function OptionDetail({ option }: { option: FindOption }) {
  if (option.blocked !== null) {
    return (
      <>
        {option.who !== null && <span class="find-who">{option.who}</span>}
        <span>{option.blocked}</span>
      </>
    );
  }
  return (
    <>
      {option.who !== null && <span class="find-who">{option.who}</span>}
      {option.fusion !== undefined && <FusionStars count={option.fusion.count} gain />}
      {option.book !== undefined && option.who === null && <span>To its Talent Book</span>}
      {option.book !== undefined && option.who !== null && <span>Talent Book</span>}
      {option.pays !== undefined && (
        <span class="find-pays">
          {option.pays.map(({ key, ...badge }) => (
            <CountBadge key={key} {...badge} />
          ))}
        </span>
      )}
      {option.note !== undefined && <span>{option.note}</span>}
    </>
  );
}

/** One radio row: a round pixel radio, the choice's name and what it does; a blocked one is greyed and says why. */
function OptionRow({
  group,
  option,
  checked,
  disabled,
  onPick,
}: {
  group: string;
  option: FindOption;
  checked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const id = `${group}-${option.key}`;
  const blocked = option.blocked !== null;
  return (
    <li class={`find-option${checked ? ' on' : ''}${blocked ? ' blocked' : ''}`}>
      <input
        type="radio"
        id={id}
        name={group}
        class="visually-hidden"
        checked={checked}
        disabled={disabled || blocked}
        onChange={onPick}
      />
      <label for={id}>
        <span class="find-radio" aria-hidden="true" />
        <span class="find-option-label pix">{option.label}</span>
        <span class="find-option-detail">
          <OptionDetail option={option} />
        </span>
        {option.recommended && !blocked && (
          <span class="find-rec pix" title="Recommended">
            ★<span class="visually-hidden"> Recommended</span>
          </span>
        )}
      </label>
    </li>
  );
}

/**
 * One creature a trip found (or a duplicate waiting on the Collection tab): its picture, name in its
 * rarity's colour, element and role, its badges, and the talent it rolled in a box headed "Discovered
 * talent" (with a green New when no creature of its line has it yet). A duplicate adds its choice as
 * radio rows; the screen that holds the cards keeps the picks and confirms them all with one button.
 */
export function FindCard({
  find,
  picked,
  disabled = false,
  onPick,
}: {
  find: Find;
  /** The picked row of a duplicate (its key). */
  picked: string | null;
  disabled?: boolean;
  onPick: (key: string) => void;
}) {
  const def = getSpecies(find.species);
  const palette = find.shiny ? shinyPalette(find.species) : undefined;
  return (
    <li class={`find-card${find.choice === null ? '' : ' dup'}`}>
      <div class="find-head">
        <Sprite
          sprite={creatureSpriteOrFallback(find.species)}
          scale={3}
          bob
          {...(palette === undefined ? {} : { palette })}
        />
        <div class="find-name">
          <strong class={`pix rarity-name rarity-${def?.rarity ?? 'common'}`}>
            {speciesName(find.species)}
          </strong>
          <span class="find-tags">
            {def !== undefined && <ElementChip element={def.element} role={def.role} />}
            {find.badges.map((b) => (
              <Tag key={b.text} kind="badge" {...(b.entry === null ? {} : { entry: b.entry })}>
                {b.text}
              </Tag>
            ))}
            {find.shiny && (
              <Tag kind="badge" tone="shiny" entry="shiny">
                Shiny!
              </Tag>
            )}
          </span>
        </div>
      </div>
      {find.talent !== null && (
        <div class="find-talent">
          <p class="find-talent-head">
            Discovered talent
            {find.talentNew && <span class="find-new pix">New</span>}
          </p>
          <TalentChip talent={find.talent} />
        </div>
      )}
      {find.choice !== null && (
        <fieldset class="find-choice">
          <legend class="visually-hidden">What to do with this {speciesName(find.species)}</legend>
          <ul class="find-options">
            {find.choice.options.map((option) => (
              <OptionRow
                key={option.key}
                group={find.key}
                option={option}
                checked={picked === option.key}
                disabled={disabled}
                onPick={() => {
                  onPick(option.key);
                }}
              />
            ))}
          </ul>
        </fieldset>
      )}
      {find.answered !== null && <p class="muted find-answered">{find.answered}</p>}
    </li>
  );
}
