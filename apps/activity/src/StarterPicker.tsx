import { capitalize, elementName, getSpecies } from './game';

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
              <h3>{species.name}</h3>
              <p class="tags">
                <span class="tag">{elementName(species.element)}</span>
                <span class="tag">{capitalize(species.role)}</span>
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
