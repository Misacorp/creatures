import type { CatalogueView } from '@creatures/game';
import { useRef, useState } from 'preact/hooks';
import { Accordion } from '../ui/Accordion';
import { Alert } from '../ui/Alert';
import { CountBadge } from '../ui/CountBadge';
import { GameIcon } from '../ui/GameIcon';
import { Popover, PopoverCard } from '../ui/Popover';
import { Segmented } from '../ui/Segmented';
import { SupplyGrid, type SupplyCell } from '../ui/SupplyGrid';
import { Tag } from '../ui/Tag';
import {
  CATALOGUE_KINDS,
  catalogueGroups,
  catalogueTotals,
  type CatalogueGroup,
  type CatalogueKind,
  type CatalogueTile,
} from './catalogue-view';
import { HouseThumb } from './HouseThumb';

export interface CataloguePanelProps {
  /** The catalogue, or null while it loads. */
  catalogue: CatalogueView | null;
  /** The last load failed: say so and offer a retry. */
  failed: boolean;
  onRetry: () => void;
}

function Picture({ tile }: { tile: CatalogueTile }) {
  return tile.picture.kind === 'house' ? (
    <HouseThumb id={tile.picture.id} silhouette={tile.unknown} />
  ) : (
    <GameIcon icon={tile.picture} scale={4} />
  );
}

function cellOf(tile: CatalogueTile): SupplyCell {
  return {
    id: tile.id,
    kind: tile.id,
    tier: 'basic',
    label: tile.label,
    owned: tile.badge,
    muted: tile.dim || tile.unknown,
    picture: <Picture tile={tile} />,
  };
}

function TileCard({ tile }: { tile: CatalogueTile }) {
  const counts =
    tile.placed === null ? String(tile.owned) : `${String(tile.owned)} / ${String(tile.placed)}`;
  return (
    <PopoverCard
      visual={<Picture tile={tile} />}
      title={tile.name}
      short={tile.hint}
      lines={tile.line === null ? [] : [tile.line]}
      beside={tile.set === null ? undefined : <Tag>{tile.set}</Tag>}
    >
      {!tile.unknown && (
        <p class="hp-tile-counts">
          <CountBadge
            icon={tile.picture}
            amount={counts}
            label={tile.name}
            spokenAmount={
              tile.placed === null
                ? `${String(tile.owned)} owned`
                : `${String(tile.owned)} owned, ${String(tile.placed)} placed`
            }
          />
          {tile.placed !== null && <span class="hp-count-key muted">owned / placed</span>}
        </p>
      )}
    </PopoverCard>
  );
}

function Tiles({
  group,
  label,
  open,
  onOpen,
}: {
  group: CatalogueGroup;
  label: string;
  open: string | null;
  onOpen: (id: string, button: HTMLButtonElement) => void;
}) {
  if (group.rows !== undefined) {
    // Outside and Rooms: a labelled row per layer, as the spot picker labels its sets
    return (
      <>
        {group.rows.map((row) => (
          <div key={row.id} class="hp-set-group">
            <p class="hp-set-label pix">{row.title}</p>
            <SupplyGrid
              flat
              label={`${label}: ${row.title}`}
              cells={row.tiles.map(cellOf)}
              selected={open}
              onSelect={onOpen}
            />
          </div>
        ))}
      </>
    );
  }
  return (
    <SupplyGrid
      flat
      label={label}
      cells={group.tiles.map(cellOf)}
      selected={open}
      onSelect={onOpen}
    />
  );
}

/**
 * Everything that exists, by kind (Furniture, Garden, Skins, Stamps, Materials, Parts) with a tile for each: sets in
 * accordions, what is not found yet as a silhouette. A tile opens a popover with its name, set, where it comes from
 * and the counts. Data in, callbacks out: it fetches nothing.
 */
export function CataloguePanel({ catalogue, failed, onRetry }: CataloguePanelProps) {
  const [kind, setKind] = useState<CatalogueKind>('furniture');
  const [open, setOpen] = useState<{ id: string; tile: CatalogueTile } | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  if (catalogue === null) {
    return (
      <div class="hp-panel hp-catalogue">
        {failed ? (
          <Alert level="alert">
            The catalogue would not load.{' '}
            <button type="button" class="ghost" onClick={onRetry}>
              Try again
            </button>
          </Alert>
        ) : (
          <p class="hp-empty" role="status">
            Loading the catalogue…
          </p>
        )}
      </div>
    );
  }
  const { found, total } = catalogueTotals(catalogue);
  const groups = catalogueGroups(catalogue, kind);
  const label = CATALOGUE_KINDS.find((k) => k.id === kind)?.label ?? kind;
  const firstWithFinds = Math.max(
    0,
    groups.findIndex((g) => g.found > 0),
  );
  const choose = (id: string, button: HTMLButtonElement) => {
    anchor.current = button;
    const tile = groups.flatMap((g) => g.tiles).find((t) => t.id === id);
    setOpen(open?.id === id || tile === undefined ? null : { id, tile });
  };
  return (
    <div class="hp-panel hp-catalogue">
      <p class="hp-found pix" role="status">
        {found} / {total} found
      </p>
      <Segmented
        label="Kind"
        options={CATALOGUE_KINDS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setOpen(null);
        }}
      />
      {groups.length === 1 && groups[0] !== undefined ? (
        <Tiles group={groups[0]} label={label} open={open?.id ?? null} onOpen={choose} />
      ) : (
        groups.map((group, index) => (
          <Accordion
            key={`${kind}:${group.id}`}
            title={group.title}
            meta={`${String(group.found)} / ${String(group.tiles.length)}`}
            metaTone={group.found > 0 ? 'gold' : 'quiet'}
            label={`${group.title}, ${String(group.found)} / ${String(group.tiles.length)} found`}
            headingLevel={3}
            defaultOpen={index === firstWithFinds}
          >
            <Tiles group={group} label={group.title} open={open?.id ?? null} onOpen={choose} />
          </Accordion>
        ))
      )}
      {open !== null && (
        <Popover
          anchor={() => anchor.current}
          label={open.tile.name}
          layer="page"
          onClose={() => {
            setOpen(null);
          }}
        >
          <TileCard tile={open.tile} />
        </Popover>
      )}
    </div>
  );
}
