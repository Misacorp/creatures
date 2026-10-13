# How to play and clickable tags

Status: **built** on branch `howto` (2026-10-13), roadmap item 1. The player-facing text lives in `packages/game/src/content/data/glossary.json` and `how-to-play.json`; tests pin its numbers to `RULES`. Where this page and the code disagreed, the code won (corrections below are already applied).

## Goal

Misa: "All the roles, elements, etc. are not intuitive at all. Just being able to click on the tags that display stuff like Grove and Setter would help here."

Teach the game where players already look. Every tag, chip and status word can be tapped for a short explanation, and a "How to play" page puts it all together. Show more than tell: the explanations use the same sprites, icons and colours as the game.

## Clickable tags (glossary popovers)

- **What is tappable:**
  - element chips (Tide, Ember, Grove, Spark);
  - role chips (Setter, Payoff, Guard, Support);
  - boss marks (Soaked, Charged, Overgrown, Scorched) and reactions (Overload, Grounding, Wildfire, Steam);
  - ability names, basic abilities and the Auto fire badge;
  - the Rank tag, Festival and season pips;
  - the readiness word;
  - zone labels (Front, Middle, Back) and the boss turn-order glyph;
  - gimmick glyphs, Essence, Bait, shiny, the level and the training cost.
- **How:**
  - Tapping, or Enter/Space, opens a small popover. It reuses the in-stage popover shell (`StagePopover`) with a page-level variant.
  - The popover has a title, two or three short lines, a tiny visual where useful, and a "More in How to play" link to the right section.
  - Escape or tapping outside closes it.
  - Tags look tappable: a dotted underline or a small "?" corner. They must never conflict with drag and drop (a tap without movement only).
- **Content is data:**
  - Add `packages/game/src/content/data/glossary.json`, with entries `{ id, title, short, lines[], visual?, section }`, schema-validated with length limits. The client renders text only.
  - Tests check that every element, role, reaction, mark, gimmick op and basic ability in content has a glossary entry.

## Core text to include

These are the rules as the engine implements them; keep them exact.

- **Roles:**
  - **Setter:** leaves its element's mark on the boss, and replaces a mark of another element.
  - **Payoff:** gets an extra 10% when it sets off a reaction (4.5× becomes 4.95×). Any role can set off a reaction.
  - **Guard:** +30% HP; takes single-target boss hits aimed at its zone. Zone-wide hits and reflected reactions still reach everyone.
  - **Support:** +15% on each neighbour's next hit, given at the start of each round. A silenced or knocked-out Support gives nothing.
- **Marks and reactions:**
  - If the boss has no mark, the first creature to hit it marks it with its own element.
  - Only a Setter replaces an existing mark, and only with a different element.
  - A hit by the **cashing element** sets off the reaction, whatever the hitter's role. It deals about 4.5× damage and **uses up the mark**.
  - The hit that reacts doesn't leave a new mark; the next hitter does.
  - A same-element hit does nothing to the mark.
- **The reaction loop:**

  | Mark (from)       | Cashed in by | Reaction  |
  | ----------------- | ------------ | --------- |
  | Soaked (Tide)     | Spark        | Overload  |
  | Charged (Spark)   | Grove        | Grounding |
  | Overgrown (Grove) | Ember        | Wildfire  |
  | Scorched (Ember)  | Tide         | Steam     |

  Show it as a four-node loop graphic with element icons.

- **Turn order:** the boss's turn order decides who acts first: left to right, right to left, or fastest first. Place setters before the cashing creature, and alternate setter and cashing creature for repeated reactions.
- **Abilities:**
  - Creature abilities unlock at level 10 and grow stronger on evolution.
  - Everyone has one basic ability.
  - An ability fires on its own at its round unless Auto fire is off. Fire makes it take effect next round. With Auto fire off, an unused ability still fires in the last round.
- **The week:**
  - Monday 13:37: the boss reveal.
  - Friday and Saturday 13:37: Phases 1 and 2.
  - Sunday 20:00: the live finale (countdown, then rounds). All times in the guild's timezone.
  - The Boss Rank goes up by 1 on a normal-week win and stays the same on a loss. Each Rank adds 40% boss HP (compounding).
  - Every 5th week is a Festival: the boss fights 3 Ranks lower, Essence pays +50%, a Festival win gives +0 Rank, and after any Festival the Rank eases by 1.
  - Jackpot and pity stay hidden from players (Misa).
- **Expeditions, training, evolution and fusion:** a short version of `m2-collection.md`, plus expeditions v2 when it ships.

## "How to play" page

- **Placement:** a "?" in the header opens a full page (a new tab or an overlay), with sections in this order:
  1. Your first week.
  2. Creatures (roles, elements, levels and abilities).
  3. Combos (the reaction loop, plus a worked example in sprites: Splashet marks, Stormray sets off Overload).
  4. The raid week.
  5. The live finale (tap-to-fire, Auto fire, telegraphs).
  6. Expeditions.
  7. Ranks and Festivals.
  8. Rewards.
- **Each section** has one small illustration built from existing sprites and glyphs, and a 3–5 line explanation.
- **First-time hints,** optional: a one-time coach mark on the first visit to the Raid tab ("Tap any tag to learn what it means"). It is dismissed forever per player, stored server-side or as a local convenience.

## Order of work

1. The glossary data, schema and tests.
2. Popovers on the existing chips and tags.
3. The "How to play" page with illustrations.
4. The coach mark.
