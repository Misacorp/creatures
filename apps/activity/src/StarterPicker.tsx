import { capitalize, getSpecies } from './game';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

interface Props {
  options: string[];
  busy: boolean;
  onChoose: (species: string) => void;
}

export function StarterPicker({ options, busy, onChoose }: Props) {
  return (
    <section aria-labelledby="starter-heading">
      <h2 id="starter-heading">Choose your first creature</h2>
      <p class="muted">You can only choose once. More creatures come from expeditions.</p>
      <ul class="cards">
        {options.map((id) => {
          const species = getSpecies(id);
          if (species === undefined) return null;
          return (
            <li key={id} class="card-item">
              <div class="portrait">
                <Sprite
                  sprite={creatureSpriteOrFallback(id)}
                  scale={6}
                  alt={`${species.name} sprite`}
                  bob
                />
              </div>
              <h3>{species.name}</h3>
              <p class="tags">
                <ElementChip element={species.element} role={capitalize(species.role)} />
              </p>
              <p class="flavor">{species.flavor}</p>
              <button
                type="button"
                class="primary"
                disabled={busy}
                aria-label={`Choose ${species.name}`}
                onClick={() => {
                  onChoose(id);
                }}
              >
                Choose
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
