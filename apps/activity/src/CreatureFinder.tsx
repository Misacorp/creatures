import { useId, useState } from 'preact/hooks';
import type { Creature } from './api';
import {
  ELEMENT_OPTIONS,
  QUERY_MAX,
  ROLE_OPTIONS,
  isFiltered,
  resultLine,
  suggest,
  suggestionCount,
  toggled,
  type Filters,
  NO_FILTERS,
} from './creature-find';
import { shinyPalette } from './art';
import { GameIcon } from './ui/GameIcon';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** The magnifying glass of the search field, as crisp pixels. */
export function Magnifier() {
  return (
    <svg class="finder-mag" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="1" y="0" width="3" height="1" />
      <rect x="0" y="1" width="1" height="3" />
      <rect x="4" y="1" width="1" height="3" />
      <rect x="1" y="4" width="3" height="1" />
      <rect x="4" y="4" width="2" height="2" />
      <rect x="6" y="6" width="2" height="2" />
    </svg>
  );
}

/**
 * Find and filter, at the top of the Creatures tab. A search field with live suggestions (the name,
 * nickname or species you type; Arrow keys and Enter, or a tap, choose one and the page scrolls to that
 * card), and a row of filter chips under it: "Needs you" with how many, the elements and the roles. Chips
 * combine (any chosen element and any chosen role, and "Needs you" on top). It is a combobox: the
 * field names the list it controls, the highlighted suggestion is announced, and the count is spoken.
 */
export function CreatureFinder({
  creatures,
  needyCount,
  filters,
  shown,
  onFilters,
  onPick,
}: {
  creatures: readonly Creature[];
  /** How many creatures need the player (the number on the "Needs you" chip). */
  needyCount: number;
  filters: Filters;
  /** How many creatures the chips let through. */
  shown: number;
  onFilters: (next: Filters) => void;
  /** A suggestion was chosen: the page should show that creature's card. */
  onPick: (creature: Creature) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const base = useId();
  const listId = `${base}-list`;
  const matches = suggest(creatures, query);
  const open = query.trim() !== '' && !dismissed;
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));
  const optionId = (index: number): string => `${base}-opt-${String(index)}`;

  function choose(index: number): void {
    const hit = matches[index];
    if (hit === undefined) return;
    setQuery('');
    setActive(0);
    setDismissed(false);
    onPick(hit.creature);
  }

  return (
    <section class="finder" aria-label="Find a creature">
      <div class="finder-search">
        <div class="finder-field">
          <Magnifier />
          <input
            type="text"
            role="combobox"
            class="finder-input"
            aria-label="Find a creature by name, nickname or species"
            aria-autocomplete="list"
            aria-expanded={open && matches.length > 0}
            aria-controls={listId}
            {...(open && matches.length > 0
              ? { 'aria-activedescendant': optionId(activeIndex) }
              : {})}
            placeholder="Find a creature"
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            enterKeyHint="go"
            maxLength={QUERY_MAX}
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
              setDismissed(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && matches.length > 0) {
                event.preventDefault();
                setDismissed(false);
                setActive((activeIndex + 1) % matches.length);
              } else if (event.key === 'ArrowUp' && matches.length > 0) {
                event.preventDefault();
                setDismissed(false);
                setActive((activeIndex + matches.length - 1) % matches.length);
              } else if (event.key === 'Enter' && open && matches.length > 0) {
                event.preventDefault();
                choose(activeIndex);
              } else if (event.key === 'Escape' && query !== '') {
                event.preventDefault();
                if (open) setDismissed(true);
                else setQuery('');
              }
            }}
          />
          {query !== '' && (
            <button
              type="button"
              class="finder-clear"
              aria-label="Clear the search"
              onClick={() => {
                setQuery('');
                setDismissed(false);
              }}
            >
              ×
            </button>
          )}
        </div>
        <ul
          id={listId}
          class="finder-list"
          role="listbox"
          aria-label="Suggestions"
          hidden={!open || matches.length === 0}
        >
          {open &&
            matches.map((hit, index) => {
              const shiny = hit.creature.shiny ? shinyPalette(hit.creature.species) : undefined;
              return (
                <li
                  key={hit.creature.id}
                  id={optionId(index)}
                  role="option"
                  class={index === activeIndex ? 'finder-option active' : 'finder-option'}
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => {
                    // Keep the focus in the field: a tap on a suggestion is not a blur.
                    event.preventDefault();
                  }}
                  onClick={() => {
                    choose(index);
                  }}
                >
                  <Sprite
                    sprite={creatureSpriteOrFallback(hit.creature.species)}
                    scale={2}
                    {...(shiny === undefined ? {} : { palette: shiny })}
                  />
                  <span class="finder-names">
                    <span class="finder-name pix">{hit.name}</span>
                    {hit.species !== null && <span class="muted">{hit.species}</span>}
                  </span>
                  <span class="lvl-tag pix">Lv {hit.creature.level}</span>
                </li>
              );
            })}
        </ul>
        <p class="visually-hidden" role="status">
          {open ? suggestionCount(matches.length) : ''}
        </p>
      </div>

      <div class="finder-chips" role="group" aria-label="Filters">
        <button
          type="button"
          class={`fchip need${filters.needs ? ' on' : ''}`}
          aria-pressed={filters.needs}
          onClick={() => {
            onFilters({ ...filters, needs: !filters.needs });
          }}
        >
          <span class="need-pip" aria-hidden="true" />
          Needs you {needyCount}
        </button>
        <span class="fsep" aria-hidden="true" />
        {ELEMENT_OPTIONS.map((element) => (
          <button
            key={element.id}
            type="button"
            class={`fchip${filters.elements.includes(element.id) ? ' on' : ''}`}
            aria-pressed={filters.elements.includes(element.id)}
            onClick={() => {
              onFilters({ ...filters, elements: toggled(filters.elements, element.id) });
            }}
          >
            <GameIcon icon={{ kind: 'element', element: element.id }} scale={2} />
            {element.name}
          </button>
        ))}
        <span class="fsep" aria-hidden="true" />
        {ROLE_OPTIONS.map((role) => (
          <button
            key={role.id}
            type="button"
            class={`fchip${filters.roles.includes(role.id) ? ' on' : ''}`}
            aria-pressed={filters.roles.includes(role.id)}
            onClick={() => {
              onFilters({ ...filters, roles: toggled(filters.roles, role.id) });
            }}
          >
            {role.name}
          </button>
        ))}
      </div>
      <div class="finder-result">
        <p class="muted" role="status">
          {resultLine(shown, creatures.length, filters)}
        </p>
        {isFiltered(filters) && (
          <button
            type="button"
            class="ghost small"
            onClick={() => {
              onFilters(NO_FILTERS);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
}
