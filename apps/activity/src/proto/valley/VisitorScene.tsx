/**
 * The visitor's stall, full screen (prototype, V-VIS). Away (Monday to Wednesday): his shuttered stall under
 * the "visitor-away" poster and a "Back Thursday" sign, nothing to do, no timer. Here (Thursday until Sunday
 * ends): the hooded visitor at his stall, and his stock for this visit on the ground before it, as pictures:
 * the reroll service (the orb) and the week's one rare blueprint. The main button is the reroll: pick a worn
 * piece (the item grid), see its card, the price and the odds in words, confirm once, then the card before
 * and after with the changes marked; a second reroll shows the price x1.5. The blueprint opens its price and
 * a buy. All sample state (`visitor-sample.ts`); his stories show as the place's slim strip above.
 */
import { useMemo, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { diffItems } from '../../creature-page/compare-diff';
import { ItemFrame, ItemSprite } from '../../GearArt';
import type { GearItem } from '../../gear-types';
import { gearName } from '../../gear-view';
import { partBadge } from '../../count-items';
import { glyphOrUnknown } from '../../glyphs';
import { ItemCard } from '../../ItemCard';
import { ItemTile } from '../../ItemTile';
import { Sprite } from '../../sprites/Sprite';
import type { SpriteDef } from '../../sprites/sprite-data';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { Drawer } from '../../ui/Drawer';
import { FindBlueprint } from '../../ui/FindBlueprint';
import { FindList } from '../../ui/FindRow';
import { glowNameOf, glowSceneDraw, glowSceneSpots, type PlaceSceneProps } from './glow-scene-art';
import { Glyph } from './parts';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';
import {
  SAMPLE_PURSE,
  SAMPLE_STOCK,
  canPay,
  oddsText,
  rerollPiece,
  rerollPrice,
  shortOf,
  wornPieces,
  type Price,
  type Purse,
} from './visitor-sample';
import './visitor-scene.css';

/** The Acorn: no count-badge icon exists for it yet, so it is drawn here (a cap and a nut, 8 x 8). */
const ACORN: SpriteDef = {
  mirror: true,
  palette: { k: '#0d0a1a', c: '#c98a52', d: '#9a6036', n: '#e3b26b' },
  rows: ['...k', '.kkc', 'kccd', 'kddd', '.knn', 'knnn', 'knnn', '.kkn'],
};

/** Acorns as the same badge the other amounts use (`part-count`). */
function AcornBadge({ amount }: { amount: number }) {
  return (
    <span class="part-count" role="img" aria-label={`Acorns: ${String(amount)}`}>
      <Sprite sprite={ACORN} scale={2} />
      <span class="part-amount pix">{amount}</span>
    </span>
  );
}

/** What a price or a purse is made of: Acorns and scrap. */
function Cost({ acorns, scrap }: { acorns: number; scrap: number }) {
  return (
    <span class="vs-cost">
      <AcornBadge amount={acorns} />
      <CountBadge {...partBadge('scrap', scrap)} />
    </span>
  );
}

type Mode = 'reroll' | 'blueprint' | null;

interface Result {
  before: GearItem;
  after: GearItem;
}

export function VisitorScene({ world, onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const here = look.visitorHere;
  const name = glowNameOf('visitor', { visitorHere: here });
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);
  const [mode, setMode] = useState<Mode>(null);
  const [purse, setPurse] = useState<Purse>({ ...SAMPLE_PURSE });
  /** Rerolls made this week by this player (the price rises with it). */
  const [rerolls, setRerolls] = useState(0);
  /** How many times each piece was rerolled (it picks the sample roll). */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pieces, setPieces] = useState<GearItem[]>(() => wornPieces(world.items));
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [bought, setBought] = useState(false);

  const piece = pieces.find((p) => p.id === picked);
  const price: Price | null = piece === undefined ? null : rerollPrice(piece.itemLevel, rerolls);
  const lacking = price === null ? null : shortOf(purse, price);

  const confirm = (): void => {
    if (piece === undefined || price === null || !canPay(purse, price)) return;
    const nth = counts[piece.id] ?? 0;
    const after = rerollPiece(piece, nth);
    setPurse({ ...purse, acorns: purse.acorns - price.acorns, scrap: purse.scrap - price.scrap });
    setRerolls(rerolls + 1);
    setCounts({ ...counts, [piece.id]: nth + 1 });
    setPieces(pieces.map((p) => (p.id === piece.id ? after : p)));
    setResult({ before: piece, after });
  };

  const close = (): void => {
    setMode(null);
    setResult(null);
  };

  const blueprintId = SAMPLE_STOCK.blueprintBaseId;
  const known = world.blueprints.includes(blueprintId);
  const blueprintLacks =
    purse.acorns < SAMPLE_STOCK.blueprintAcorns
      ? 'Not enough Acorns'
      : purse.shards < SAMPLE_STOCK.blueprintShards
        ? 'Not enough shards'
        : null;

  return (
    <>
      <SceneFrame
        id="visitor"
        label={here ? "Visitor's stall, weekly stall" : "Visitor's stall, shuttered until Thursday"}
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        act={
          here ? (
            <ActionButton
              label="Reroll a piece"
              wide
              large
              onClick={() => {
                setMode('reroll');
              }}
            />
          ) : undefined
        }
      >
        {(g) => {
          const y = g.Y(glowSceneSpots(g).below + 4);
          if (!here) {
            return (
              <span
                class="vs-sign"
                ref={cssVars({ '--x': `${String(g.X(g.cx))}px`, '--y': `${String(y)}px` })}
              >
                <span class="pv-sign pix">
                  <Glyph id="moon" scale={2} />
                  <span>Back Thursday</span>
                </span>
              </span>
            );
          }
          return (
            <ul
              class="vs-stock"
              aria-label="His stock this visit"
              ref={cssVars({ '--x': `${String(g.X(g.cx))}px`, '--y': `${String(y)}px` })}
            >
              <li>
                <button
                  type="button"
                  class="vs-item"
                  aria-label="Reroll service: change a worn piece's modifier lines"
                  onClick={() => {
                    setMode('reroll');
                  }}
                >
                  <Sprite sprite={glyphOrUnknown('orb')} scale={g.s * 2} />
                  <span class="pv-plate pix">Reroll</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="vs-item"
                  aria-label={`This week's blueprint: ${gearName(blueprintId)}`}
                  onClick={() => {
                    setMode('blueprint');
                  }}
                >
                  <ItemFrame rarity="rare" class="blueprint">
                    <ItemSprite baseId={blueprintId} scale={g.s} />
                  </ItemFrame>
                  <span class="pv-plate pix">{gearName(blueprintId)}</span>
                </button>
              </li>
            </ul>
          );
        }}
      </SceneFrame>
      <Drawer
        open={mode === 'reroll'}
        onClose={close}
        title="Reroll a piece"
        footer={
          result === null ? (
            <ActionButton
              label={piece === undefined ? 'Pick a worn piece' : 'Reroll'}
              detail={
                price === null
                  ? undefined
                  : (lacking ?? `${String(price.acorns)} Acorns, ${String(price.scrap)} scrap`)
              }
              wide
              large
              disabled={piece === undefined || lacking !== null}
              onClick={confirm}
            />
          ) : (
            <ActionButton
              label="Reroll again"
              detail={(() => {
                const next = rerollPrice(result.after.itemLevel, rerolls);
                return (
                  shortOf(purse, next) ??
                  `${String(next.acorns)} Acorns, ${String(next.scrap)} scrap`
                );
              })()}
              wide
              large
              disabled={!canPay(purse, rerollPrice(result.after.itemLevel, rerolls))}
              onClick={() => {
                setPicked(result.after.id);
                setResult(null);
              }}
            />
          )
        }
      >
        {result === null ? (
          <div class="dr-stack vs-body">
            <ul class="item-grid" aria-label="Your worn pieces">
              {pieces.map((p) => (
                <ItemTile
                  key={p.id}
                  item={p}
                  label={`${gearName(p.baseId)}, ${p.rarity}, item level ${String(p.itemLevel)}`}
                  selected={p.id === picked}
                  onSelect={() => {
                    setPicked(p.id);
                  }}
                />
              ))}
            </ul>
            {piece !== undefined && (
              <>
                <ItemCard item={piece} plainRarity />
                <p class="vs-odds">{oddsText(piece)}</p>
              </>
            )}
            <div class="vs-purse">
              <span class="vs-quiet">You have</span>
              <Cost acorns={purse.acorns} scrap={purse.scrap} />
            </div>
          </div>
        ) : (
          <div class="dr-stack vs-body">
            <p class="vs-quiet">Before</p>
            <ItemCard item={result.before} plainRarity />
            <p class="vs-quiet">After</p>
            <ItemCard
              item={result.after}
              plainRarity
              diff={diffItems(result.after, result.before)}
            />
            <div class="vs-purse">
              <span class="vs-quiet">You have</span>
              <Cost acorns={purse.acorns} scrap={purse.scrap} />
            </div>
          </div>
        )}
      </Drawer>
      <Drawer
        open={mode === 'blueprint'}
        onClose={close}
        title="This week's blueprint"
        footer={
          <ActionButton
            label={bought ? 'Bought' : 'Buy'}
            detail={
              bought
                ? undefined
                : (blueprintLacks ??
                  `${String(SAMPLE_STOCK.blueprintAcorns)} Acorns, ${String(SAMPLE_STOCK.blueprintShards)} shards`)
            }
            wide
            large
            disabled={bought || blueprintLacks !== null}
            onClick={() => {
              setBought(true);
              setPurse({
                ...purse,
                acorns: purse.acorns - SAMPLE_STOCK.blueprintAcorns,
                shards: purse.shards - SAMPLE_STOCK.blueprintShards,
              });
            }}
          />
        }
      >
        <div class="dr-stack vs-body">
          <FindList label="The blueprint">
            <FindBlueprint baseId={blueprintId} duplicate={known || bought} />
          </FindList>
          <p class="vs-odds">
            Found nowhere else.{' '}
            {known
              ? 'You know it: a copy raises its quality.'
              : 'A new one for you; a copy of it later raises its quality.'}
          </p>
          <div class="vs-purse">
            <span class="vs-quiet">You have</span>
            <span class="vs-cost">
              <AcornBadge amount={purse.acorns} />
              <CountBadge
                icon={{ kind: 'glyph', id: 'shard-any' }}
                amount={purse.shards}
                label="Shards"
              />
            </span>
          </div>
        </div>
      </Drawer>
    </>
  );
}
