import { useState } from 'preact/hooks';
import { conversionViews, shortText } from '../../conversion-view';
import { partCountItems } from '../../count-items';
import { nominalDurationCountItem } from '../../gear-view';
import { RecipeCard, type RecipeInput } from '../../ui/RecipeCard';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const RECIPES = [
  'Refine: 3 Plain Lure into 1 Sweet Lure',
  'Recycle: Golden Lure into scrap',
  'Refine: needs level 5',
  'Two inputs, two outputs',
] as const;

const HOUR = 3_600_000;

/** The card from fixture stock: the recipe's own data for the two Workshop kinds, and a made-up one for several things. */
function RecipeCardDemo({ p }: { p: Props }) {
  const [started, setStarted] = useState(0);
  const recipe = str(p, 'recipe');
  const have = num(p, 'have');
  const levelTooLow = bool(p, 'levelTooLow');
  const level = recipe === RECIPES[2] ? 5 : 3;
  const stock = { 'lure-basic': have, 'lure-great': have, 'satchel-good': have };
  let inputs: RecipeInput[];
  let outputs;
  let verb = 'Refine';
  let hours: number;
  if (recipe === RECIPES[3]) {
    // Not a Workshop recipe: shows that a card takes any number of things in and out.
    inputs = partCountItems({ scrap: 4, 'tide-shard': 2 }).map((i) => {
      const need = typeof i.amount === 'number' ? i.amount : 0;
      return { ...i, amount: need, have: Math.min(have, need) };
    });
    outputs = partCountItems({ glimmer: 1, 'spark-shard': 1 });
    hours = 3;
  } else {
    const kind = recipe === RECIPES[1] ? 'recycle' : 'refine';
    const views = conversionViews(kind, stock, {});
    const view = views.find((v) =>
      recipe === RECIPES[1]
        ? v.id === 'recycle-lure-great'
        : recipe === RECIPES[2]
          ? v.id === 'refine-satchel-good'
          : v.id === 'refine-lure-basic',
    );
    inputs = view?.inputs ?? [];
    outputs = view?.outputs ?? [];
    verb = view?.verb ?? verb;
    hours = recipe === RECIPES[1] ? 2 : recipe === RECIPES[2] ? 4 : 2;
  }
  const reason =
    shortText(inputs) ?? (levelTooLow ? `Needs Crafting level ${String(level)}.` : null);
  return (
    <>
      <RecipeCard
        inputs={inputs}
        outputs={outputs}
        duration={nominalDurationCountItem(hours * HOUR)}
        disabledReason={reason}
        actionLabel={verb}
        busy={bool(p, 'busy')}
        onStart={() => {
          setStarted((n) => n + 1);
        }}
      />
      <p class="muted" aria-live="polite">
        Started {started} times
      </p>
    </>
  );
}

const recipeCard: Entry = {
  name: 'RecipeCard',
  file: 'apps/activity/src/ui/RecipeCard.tsx',
  group: 'Controls',
  description:
    'Combines one or more things into one or more other things: the inputs with have / need, an arrow, the outputs, the time and one button, with the reason under the row when it cannot start. It is the Workshop card for Refine and Recycle, and takes any recipe a later currency adds.',
  controls: {
    recipe: { kind: 'select', options: RECIPES },
    have: { kind: 'number', min: 1, max: 5 },
    levelTooLow: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: { recipe: RECIPES[0], have: 3, levelTooLow: false, busy: false },
  presets: [
    { name: 'Can afford', props: { recipe: RECIPES[0], have: 3, levelTooLow: false } },
    { name: 'Missing inputs', props: { recipe: RECIPES[0], have: 1, levelTooLow: false } },
    { name: 'Level too low', props: { recipe: RECIPES[2], have: 3, levelTooLow: true } },
    { name: 'Recycle', props: { recipe: RECIPES[1], have: 1, levelTooLow: false } },
    { name: 'Two in, two out', props: { recipe: RECIPES[3], have: 5, levelTooLow: false } },
  ],
  render: (p) => <RecipeCardDemo p={p} />,
};

export const recipeCardEntries: readonly Entry[] = [recipeCard];
