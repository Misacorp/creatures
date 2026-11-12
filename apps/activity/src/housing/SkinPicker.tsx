import { lookValue, type OwnHouseView } from '@creatures/game';
import { useState } from 'preact/hooks';
import { Sprite } from '../sprites/Sprite';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { SupplyGrid, type SupplyCell } from '../ui/SupplyGrid';
import { HouseThumb } from './HouseThumb';
import { itemName } from './house-names';
import { colourName, colourSwatch, drawnLook } from './interior-art';
import { MakeCard } from './MakeCard';
import { PickCard } from './PickCard';
import { skinChoices, type SkinChoice, type SkinKind } from './spot-view';
import { recipeFor } from './workbench-view';

export interface SkinPickerProps {
  kind: SkinKind;
  /** The look in use now (`paper-damask:rose`), or null for a trim, ceiling or frame left as built. */
  current: string | null;
  own: OwnHouseView;
  /** A request is running: every button waits. */
  busy: boolean;
  /** A look the player has was chosen (null: back to as built). */
  onPick: (value: string | null) => void;
  /** "Make" was pressed on a blueprint's recipe. */
  onMake: (itemId: string) => void;
}

export const SKIN_KIND_NAMES: Readonly<Record<SkinKind, string>> = {
  wall: 'Wallpaper',
  floor: 'Floor',
  trim: 'Trim',
  ceiling: 'Ceiling',
  roof: 'Roof',
  walls: 'Walls',
  frame: 'Frame',
  ground: 'Ground',
};

function Picture({ choice }: { choice: SkinChoice }) {
  return choice.kind === 'bare' ? (
    <span class="hp-empty-mark" aria-hidden="true" />
  ) : (
    <HouseThumb id={choice.id} />
  );
}

function cellOf(choice: SkinChoice): SupplyCell {
  return {
    id: choice.id,
    kind: choice.id,
    tier: 'basic',
    label: choice.label,
    owned: 0,
    muted: choice.kind === 'blueprint',
    picture: <Picture choice={choice} />,
  };
}

/** A colour of a pattern as a cell of the colour row: its swatch, named. */
function colourCell(kind: SkinKind, colour: string, worn: boolean): SupplyCell {
  const name = colourName(kind, colour);
  return {
    id: colour,
    kind: colour,
    tier: 'basic',
    label: worn ? `${name}, in use` : name,
    owned: 0,
    muted: false,
    picture: <Sprite sprite={colourSwatch(kind, colour)} scale={2} />,
  };
}

/**
 * The wallpaper, floor, trim, ceiling, roof, walls or frame to choose from, as the body of a drawer: "As built" first for a layer that
 * can be left bare, the skins the player has as pictures (the one in use first), then the ones known but not made yet, greyed; under
 * a generated pattern (housing C5) a row of its colours; the chosen one as a card with "Use it" (or "Make", which opens its recipe in
 * the same drawer). Data in, callbacks out: it fetches nothing.
 */
export function SkinPicker({ kind, current, own, busy, onPick, onMake }: SkinPickerProps) {
  const choices = skinChoices(kind, current, own);
  const [picked, setPicked] = useState<string | null>(null);
  const [colourPicked, setColourPicked] = useState<{ skin: string; colour: string } | null>(null);
  const [making, setMaking] = useState(false);
  const choice = choices.find((c) => c.id === picked) ?? choices.find((c) => c.here) ?? choices[0];
  if (choice === undefined) {
    return (
      <p class="hp-empty" role="status">
        Nothing to choose from yet.
      </p>
    );
  }
  const recipe = making ? recipeFor(choice.id, own) : undefined;
  if (making && recipe !== undefined) {
    const back = () => {
      setMaking(false);
    };
    return (
      <div class="hp-spot" onKeyDown={onDrillKey(back)}>
        <DrillHead
          title={recipe.name}
          onBack={back}
          backLabel={`to the ${SKIN_KIND_NAMES[kind].toLowerCase()}`}
          focus
        />
        <MakeCard recipe={recipe} busy={busy} onMake={onMake} />
      </div>
    );
  }
  // A generated pattern is worn in one of its colours: the one picked here, else the one in use, else its first.
  const colour =
    choice.colours.length === 0
      ? null
      : colourPicked?.skin === choice.id
        ? colourPicked.colour
        : (choice.colour ?? choice.colours[0] ?? null);
  const value = choice.kind === 'bare' ? null : lookValue(choice.id, colour);
  // a ceiling or frame left as built is its starter: choosing that starter changes nothing
  const inUse = value === drawnLook(kind, current);
  return (
    <div class="hp-spot">
      <SupplyGrid
        flat
        label={`${SKIN_KIND_NAMES[kind]} to choose from`}
        cells={choices.map(cellOf)}
        selected={choice.id}
        onSelect={(id) => {
          setPicked(id);
        }}
      />
      {colour !== null && (
        <div class="hp-colours">
          <SupplyGrid
            flat
            label="Colours"
            cells={choice.colours.map((c) =>
              colourCell(kind, c, choice.here && c === choice.colour),
            )}
            selected={colour}
            onSelect={(id) => {
              setColourPicked({ skin: choice.id, colour: id });
            }}
          />
        </div>
      )}
      <PickCard
        picture={value === null ? <Picture choice={choice} /> : <HouseThumb id={value} />}
        name={value === null ? choice.name : itemName(value)}
        set={choice.set}
        action={
          choice.kind === 'blueprint'
            ? {
                label: 'Make',
                detail: choice.colours.length > 0 ? 'Every colour' : undefined,
                disabled: busy,
                onClick: () => {
                  setMaking(true);
                },
              }
            : {
                label: 'Use it',
                detail: inUse ? 'In use' : undefined,
                disabled: busy || inUse,
                onClick: () => {
                  onPick(value);
                },
              }
        }
      />
    </div>
  );
}
