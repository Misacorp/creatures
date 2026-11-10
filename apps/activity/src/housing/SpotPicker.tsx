import type { HousemateView, OwnHouseView, RoomView } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from '../api';
import { creatureName } from '../game';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { CreatureList } from '../ui/CreatureList';
import { DrillHead } from '../ui/DrillHead';
import { Slot } from '../ui/Slot';
import { onDrillKey } from '../ui/drill-keys';
import { SupplyGrid, type SupplyCell } from '../ui/SupplyGrid';
import { HouseThumb } from './HouseThumb';
import { MakeCard } from './MakeCard';
import { PickCard } from './PickCard';
import {
  EMPTY_CHOICE,
  NOBODY,
  sleeperAt,
  sleeperOptions,
  spotDef,
  spotView,
  type SpotChoice,
} from './spot-view';
import { recipeFor } from './workbench-view';

export interface SpotPickerProps {
  room: RoomView;
  spotId: string;
  own: OwnHouseView;
  housemates: HousemateView[];
  creatures: readonly Creature[];
  /**
   * Where each piece whose every copy is placed stands now, by piece id (the room's name): choosing one moves it here, and the
   * button says from where. A piece missing from it just says "Moves here".
   */
  placedIn?: Readonly<Record<string, string>> | undefined;
  /** A request is running: every button waits. */
  busy: boolean;
  /** A piece (or null: empty the spot) was chosen for the spot. */
  onPlace: (pieceId: string | null) => void;
  /** A creature (or null: nobody) was chosen to sleep in the spot's bed. */
  onHousemate: (creatureId: string | null) => void;
  /** "Make" was pressed on a blueprint's recipe. */
  onMake: (itemId: string) => void;
}

function Picture({ choice }: { choice: SpotChoice }) {
  return choice.kind === 'empty' ? (
    <span class="hp-empty-mark" aria-hidden="true" />
  ) : (
    <HouseThumb id={choice.id} />
  );
}

function cellOf(choice: SpotChoice): SupplyCell {
  return {
    id: choice.id,
    kind: choice.id,
    tier: 'basic',
    label: choice.label,
    owned: choice.owned > 1 ? choice.free : 0,
    muted: choice.kind === 'placed' || choice.kind === 'blueprint',
    picture: <Picture choice={choice} />,
  };
}

type Drill = 'sleeper' | 'make' | null;

/**
 * What goes in one spot of a room, as the body of a drawer: "Empty" first, then the pieces that fit (the pieces with
 * free copies first, then those with every copy placed, then the blueprints not made yet), as pictures; the chosen one
 * as a card with "Place here" (or "Make", which opens its recipe in the same drawer). A bed also shows "Who sleeps
 * here", which opens the list of creatures. Data in, callbacks out: it fetches nothing.
 */
export function SpotPicker({
  room,
  spotId,
  own,
  housemates,
  creatures,
  placedIn,
  busy,
  onPlace,
  onHousemate,
  onMake,
}: SpotPickerProps) {
  const view = spotView(room, spotId, own);
  const key = `${room.id}/${spotId}`;
  const [picked, setPicked] = useState<{ key: string; id: string } | null>(null);
  const [drill, setDrill] = useState<Drill>(null);
  const selectedId = picked?.key === key ? picked.id : (view.current ?? EMPTY_CHOICE);
  const choice = view.choices.find((c) => c.id === selectedId) ?? view.choices[0];
  const sleeper = sleeperAt(housemates, room.id, spotId);
  const def = spotDef(room, spotId);

  if (def === undefined || def.type === 'display' || choice === undefined) {
    return (
      <p class="hp-empty" role="status">
        Nothing to place here. This one fills itself.
      </p>
    );
  }

  if (drill === 'sleeper') {
    const back = () => {
      setDrill(null);
    };
    return (
      <div class="hp-spot" onKeyDown={onDrillKey(back)}>
        <DrillHead title="Who sleeps here" onBack={back} backLabel="to the spot" focus />
        <CreatureList
          options={sleeperOptions(creatures, housemates, room.id, spotId)}
          selection={{
            mode: 'pick',
            label: 'Creatures that can sleep here',
            onPick: (id) => {
              setDrill(null);
              onHousemate(id === NOBODY ? null : id);
            },
          }}
          placedNote="In another bed · moves here"
          reasonSide
          class="flat"
        />
      </div>
    );
  }

  const recipe = drill === 'make' ? recipeFor(choice.id, own) : undefined;
  if (drill === 'make' && recipe !== undefined) {
    const back = () => {
      setDrill(null);
    };
    return (
      <div class="hp-spot" onKeyDown={onDrillKey(back)}>
        <DrillHead title={recipe.name} onBack={back} backLabel="to the spot" focus />
        <MakeCard recipe={recipe} busy={busy} onMake={onMake} />
      </div>
    );
  }

  const action = (() => {
    switch (choice.kind) {
      case 'empty':
        return {
          label: 'Empty the spot',
          detail: choice.here ? 'Already empty' : undefined,
          disabled: busy || choice.here,
          onClick: () => {
            onPlace(null);
          },
        };
      case 'free':
        return {
          label: 'Place here',
          detail: choice.here ? 'Already here' : undefined,
          disabled: busy || choice.here,
          onClick: () => {
            onPlace(choice.id);
          },
        };
      case 'placed':
        // Every copy stands in a spot already: choosing it takes it from there (the host empties that spot, then places it here).
        return {
          label: 'Move here',
          detail:
            placedIn?.[choice.id] === undefined
              ? undefined
              : `From the ${placedIn[choice.id] ?? ''}`,
          disabled: busy,
          onClick: () => {
            onPlace(choice.id);
          },
        };
      case 'blueprint':
        return {
          label: 'Make',
          detail: undefined,
          disabled: busy,
          onClick: () => {
            setDrill('make');
          },
        };
    }
  })();

  const sleeperSlot = view.bed && (
    <Slot
      kind="talent"
      state={sleeper === undefined ? 'empty' : 'filled'}
      label={`Who sleeps here: ${sleeper === undefined ? 'nobody' : creatureName(sleeper.creature)}. Change`}
      name="Who sleeps here"
      onClick={() => {
        setDrill('sleeper');
      }}
    >
      {sleeper !== undefined && (
        <>
          <Sprite sprite={creatureSpriteOrFallback(sleeper.creature.species)} scale={2} />
          <span class="pix">{creatureName(sleeper.creature)}</span>
        </>
      )}
    </Slot>
  );

  return (
    <div class="hp-spot">
      {view.groups.map((group, i) => (
        <div key={group.choices[0]?.id ?? i} class="hp-set-group">
          {group.label !== null && <p class="hp-set-label pix">{group.label}</p>}
          <SupplyGrid
            flat
            label={`${view.name}: ${group.label ?? 'pieces'}`}
            cells={group.choices.map(cellOf)}
            selected={choice.id}
            onSelect={(id) => {
              setPicked({ key, id });
            }}
          />
        </div>
      ))}
      <PickCard
        picture={<Picture choice={choice} />}
        name={choice.name}
        set={choice.set}
        free={choice.kind === 'free' || choice.kind === 'placed' ? choice.free : undefined}
        iconId={choice.id}
        between={sleeperSlot === false ? undefined : sleeperSlot}
        action={action}
      />
    </div>
  );
}
