import { RecipeCard } from '../ui/RecipeCard';
import type { RecipeView } from './workbench-view';

/**
 * One blueprint as a recipe card: the materials, Acorns and scrap in (have / need, short ones marked), the piece or
 * skin out, "Make" as the one action. The workbench, the spot picker's "Make" and the skin picker's all draw it.
 */
export function MakeCard({
  recipe,
  busy,
  onMake,
}: {
  recipe: RecipeView;
  busy: boolean;
  onMake: (itemId: string) => void;
}) {
  return (
    <RecipeCard
      inputs={recipe.inputs}
      outputs={[recipe.output]}
      actionLabel="Make"
      disabledReason={recipe.reason}
      busy={busy}
      onStart={() => {
        onMake(recipe.id);
      }}
    />
  );
}
