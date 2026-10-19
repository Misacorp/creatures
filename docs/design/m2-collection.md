# M2 design: starters, expeditions, training, fusion

Status: **shipped** in #1 (M2). Later changes live in `decisions.md` and the newer docs named there. The numbers were starting values that the balance simulator (M3) tuned. Rules that Misa decided are in `decisions.md`.

## Elements

Four elements in one cycle. Strong matchups deal ×1.5, weak ones ×0.75.

| Element | Strong against | Flavour                  |
| ------- | -------------- | ------------------------ |
| Tide    | Ember          | water, mist, coral       |
| Ember   | Grove          | fire, ash, magma         |
| Grove   | Spark          | plants, moss, stone      |
| Spark   | Tide           | lightning, storms, light |

Reactions (M3) use visible marks: each element applies its mark, and a matching element consumes it for a payoff.

## Roster (20 creatures)

Each catchable species belongs to a **line**. Lines with an evolution have two stages; evolved forms are never caught directly, only reached by evolving.

| Line      | Element | Rarity           | Stage 1   | Stage 2        |
| --------- | ------- | ---------------- | --------- | -------------- |
| splashet  | Tide    | Common (starter) | Splashet  | Tidewing       |
| cindle    | Ember   | Common (starter) | Cindle    | Pyrelynx       |
| sproutle  | Grove   | Common (starter) | Sproutle  | Thornbuck      |
| zipmouse  | Spark   | Common           | Zipmouse  | Voltaro        |
| mistnewt  | Tide    | Common           | Mistnewt  | Fogwyrm        |
| ashmole   | Ember   | Common           | Ashmole   | Magmole        |
| stormray  | Spark   | Rare             | Stormray  | Tempestray     |
| mossback  | Grove   | Rare             | Mossback  | Ancientshell   |
| coralynx  | Tide    | Rare             | Coralynx  | (no evolution) |
| solmane   | Ember   | Epic             | Solmane   | (no evolution) |
| gaiadrake | Grove   | Epic             | Gaiadrake | (no evolution) |
| aurorix   | Spark   | Epic             | Aurorix   | (no evolution) |

12 catchable species, 20 creatures in total. Names are placeholders until Misa renames them.

Each creature has base stats (HP, Attack, Speed), per-level growth, a role tag (Setter, Payoff, Support, Guard) and, from M3, an ability. Stats live in the content data, not in code.

## Starters

- On first launch the player picks one of Splashet, Cindle or Sproutle.
- Spark is the "gap" element. The player's **first expedition always brings back a Zipmouse** (if they don't own one), so every early team can cover all four elements soon.

## Levels, training and evolution

- Creatures start at level 1. Stage 1 caps at level 15; evolving raises the cap to 30. Single-stage creatures cap at 30.
- **Training** is instant: spend Bait, gain one level. Cost to go from level L to L+1: `3 + 2 × L` Bait (level 1→2 costs 5, 14→15 costs 31; the first draft was `10 + 5 × L`, cut by the balance simulator so a casual player can evolve a first creature within a month).
- **Catch-up discount:** training costs half while the creature's level is more than 5 below the server's median top-creature level.
- A creature that is on an expedition can't train.
- **Evolution** (stage 1 at level 15): costs Essence, which only drops from raids (M4). In M2 the button shows the requirement but stays locked until raids exist.

## Expeditions

- Every player has **3 expedition slots**. Each expedition sends one creature (the _explorer_) that isn't already away.
- The player picks a **duration** and a **supply level**.

| Duration | Time | Catch rolls |
| -------- | ---- | ----------- |
| Short    | 1 h  | 1           |
| Medium   | 6 h  | 2           |
| Long     | 12 h | 3           |

| Supplies | Bait cost per roll | Common | Rare | Epic |
| -------- | ------------------ | ------ | ---- | ---- |
| Basic    | 10                 | 72%    | 25%  | 3%   |
| Good     | 25                 | 60%    | 33%  | 7%   |
| Great    | 50                 | 50%    | 38%  | 12%  |

Cost = rolls × supplies cost (so a Long, Great expedition costs 150 Bait). Odds are shown in the UI.

- **Explorer affinity:** within the rolled rarity, species of the explorer's element are twice as likely.
- **Shiny:** each catch has a 1/500 chance to be shiny. Shinies are cosmetic only.
- **Dupe shield:** after 3 duplicate catches in a row (4 until 2026-10-16; fewer catches make a long streak rarer), the next catch is guaranteed to be a species the player doesn't own yet (same rarity roll; if they own every species of that rarity, normal rules apply).
- **Recall:** an expedition can be recalled for free at any time. The player gets `floor(rolls × elapsed / duration)` catches and no refund.
- Rolls happen **on the server when the player claims** a finished (or recalled) expedition, using `crypto.getRandomValues`. Nothing is pre-rolled.
- Gear drops from expeditions come in a later step of M2 (gear is out of this first cut).

## Fusion

- A catch of a line the player already owns used to **fuse** into the existing creature (into the evolved form if it has evolved); since 2026-10-16 it waits as a card and Fuse is one of four choices.
- Each fusion adds a permanent stat boost: +6%, +5%, +4%, +3%, +2% for fusions 1 to 5 (+20% total, then capped).
- **Superseded 2026-10-16 (Creatures A):** a duplicate no longer fuses by itself and never turns into Bait. It waits as a card with a talent and the player chooses Teach, Fuse (these steps, up to 5), Release (parts, never Bait) or Keep; see `gear-and-creatures-v2.md` section 8.2 and `decisions.md`.
- A shiny duplicate makes the existing creature shiny (if it wasn't already).

## Nicknames

1–20 characters after cleaning: NFKC-normalised, trimmed, whitespace collapsed, no control, format (zero-width, bidi) or unassigned characters. Stored as plain text and always rendered as text. Players can clear a nickname to go back to the species name.

## First on server

The first player in a server to catch each species, and later to evolve each line, gets a "First on server" record shown in the collection. Everyone who gets it from the **same drop** shares the record **[Misa]**. In expeditions one claim is one drop, so ties only happen in raids. Announcements to Discord come with M4.

## API (all server-authoritative)

- `GET /api/state`: balances, creatures, expeditions, slots, starter choice if not made, server firsts.
- `POST /api/starter` `{ species, idempotencyKey }`
- `POST /api/expeditions` `{ creatureId, duration, supplies, idempotencyKey }`, which charges Bait via the ledger.
- `POST /api/expeditions/{id}/claim` `{ idempotencyKey }`: finishes or recalls and rolls the catches; replaying the key returns the same catches.
- `POST /api/creatures/{id}/train` `{ idempotencyKey }`
- `PATCH /api/creatures/{id}` `{ nickname }`

Every spend goes through the ledger's `spend()`, so retries and double clicks can't charge twice or duplicate rewards.
