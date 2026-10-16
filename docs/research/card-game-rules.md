# How card games write combat rules (research, 2026-10-15)

Why: Misa wants Leet Creatures' combat rules as precise as a card game's rules reference (Magic: The Gathering, Arkham Horror LCG). This note collects the patterns worth borrowing; `docs/design/combat-rules.md` applies them. Researched by the researcher agent from the official MTG Comprehensive Rules, the Arkham Horror LCG Rules Reference (ArkhamDB mirror) and the community Hearthstone Advanced rulebook. Quotes are paraphrases; check the source before quoting one to players.

## Vocabulary

- **MTG (CR 120):** objects deal damage; the object that deals it is the _source_. An attack is a game action; damage is its result. Damage does not destroy anything by itself: destruction is a separate check (state-based actions).
- **Arkham:** damage is _dealt_; "take X damage" means the same. Dealing damage has two steps: assign it (to the investigator or an asset), then apply what was not prevented. Prevented damage is never dealt. _Direct_ damage "cannot be assigned or re-assigned elsewhere": the clean wording for a hit that cannot be redirected.
- **Hearthstone:** _proposed_ damage becomes _dealt_ damage; prevented damage is not dealt and fires no "when damaged" triggers.
- **Slay the Spire:** thorns and poison are non-attack damage, so attack modifiers skip them.

Borrow: separate words for the act (**attack**), one instance on one creature (**hit**), the amount before changes (**proposed**) and after (**damage**, dealt = taken).

## Redirects and protectors

- **MTG 614.9:** redirection is a replacement effect ("instead"). If the new recipient is no longer valid, nothing happens. Preventing damage and then dealing new damage is not redirection.
- **Arkham:** the player may assign damage to eligible assets: ties are a player choice.
- **Hearthstone Taunt** limits _attacks_ only; spells and random effects ignore it. **Bolf Ramshield** ("whenever your hero takes damage, this minion takes it instead") is the closest model to our Guard: a new damage event with the same source and amount; ties go to the earliest played.
- Rule worth stating: **a hit is redirected at most once**, never to a defeated creature.

## Order of modifiers

- **MTG 616.1:** the affected player chooses the order of replacement effects. **Hearthstone** uses a fixed pipeline: proposed damage, increases, multipliers, prevention, Divine Shield, predamage effects, then Armor before Health.
- An auto-battler has no player to choose, so a **fixed, named order** (as Hearthstone) is the right model: increases, redirect, reductions in a fixed order, the cap last, rounding down once.

## Timing

- **Arkham:** a round is a numbered list of framework steps with windows for triggered abilities; "when" happens before the effect resolves, "after" once it has. Forced abilities resolve before reactions.
- **MTG:** state-based actions (lethal damage, defeat) are checked together, repeatedly, before triggers go on the stack.
- **Hearthstone:** deaths happen in the Death Creation Step after the outer phase, all at once; removed entities cannot trigger.

## Reflection and retaliation

- MTG: "deals damage to that source's controller" is **new damage with a new source**, not a redirect.
- Hearthstone: "when damaged" fires only after damage is dealt (more than 0).

## Presentation

- Arkham ships a Learn to Play and an alphabetical Rules Reference, with a precedence rule (card text beats the reference). MTG: numbered rules and subrules with examples; keywords carry short reminder text.
- What keeps them precise and readable: one term per concept, a numbered list per procedure, fixed meanings for "instead", "would", "when" and "after", an example under each tricky rule, and short reminder text that points at the rule.

## Two protectors and randomness

Hearthstone and Arkham avoid rolls (play order, player choice). Misa wants a roll between two Guards. Pitfalls to handle: fix the eligible set before rolling (living, in reach); say whether the roll is per hit or per attack; store the roll with the fight so replays are exact; say in the reminder text that it is random; never let one Guard pass a hit on to the other (once-only redirect).

## Sources

- MTG Comprehensive Rules: https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt
- Arkham Horror LCG Rules Reference (mirror): https://arkhamdb.com/rules
- Hearthstone Advanced rulebook: https://hearthstone.wiki.gg/wiki/Advanced_rulebook, Damage: https://hearthstone.wiki.gg/wiki/Damage, Bolf Ramshield: https://hearthstone.wiki.gg/wiki/Bolf_Ramshield, Taunt: https://hearthstone.wiki.gg/wiki/Taunt
- Slay the Spire, Vulnerable: https://slay-the-spire.fandom.com/wiki/Vulnerable
