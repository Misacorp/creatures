# Combat v2 principles

Filters every idea must pass. Each entry is written so a reviewer can answer it with yes or no, with an example that passes and one that fails. **Status:** `proposed` entries are drafts from the design conversation and reviews; only Misa moves an entry to `accepted`. Agents may propose new entries at the end (next free number) or a change to one (as a note under it), never edit an accepted statement.

Template:

```
### P-NN Short name
Status: proposed | accepted (decision date) | superseded by P-NN
Statement: one sentence.
Pass: a real example, and why.
Fail: a real or hypothetical example, and why.
Review question: yes or no.
Check: a lab test or report section, or "review only".
Trades against: other principles it can pull against.
```

### P-01 The species is the reason to bring a creature

Status: proposed (Misa's direction, 2026-10-25)
Statement: What a creature can do this week comes from its species and its Knack; level and gear make it stronger but do not decide whether it is useful.
Pass: Halcyray's Clear Skies answers an Elusive boss at any level.
Fail: a Knack that unlocks only at level 25, so a new catch is useless for a month.
Review question: Can a freshly levelled creature of this species do its job in this week's fight?
Check: review only; report "Best teams per card" shows non-classic species winning.
Trades against: P-10 (strong builds come from investment too).

### P-02 Roles own verbs (primer and detonator)

Status: proposed (Misa agreed to the direction, 2026-10-26)
Statement: Setters prime the boss with marks, Payoffs cash them, Guards take hits, Supports shape the round; another role borrows a verb only through a named Knack, and never does it better than the owner.
Pass: Ready the Mark lets a Support prime, at the cost of its boost and heal.
Fail: a Guard that marks for free every turn and still intercepts.
Review question: Does this give a role's verb to another role, and if so, does it cost something?
Check: lab tests "without a Setter nothing marks" and "only a Payoff cashes".
Trades against: P-01.

### P-03 Every step has a place

Status: proposed
Statement: Every rule, keyword and Knack names the step of the round or hit where it happens, in the proposal's numbered order.
Pass: Taunt replaces only the plain attack's target (R9).
Fail: "acts first" without saying where it goes in the turn order (the dropped Swift).
Review question: Can you point to the rule step this changes?
Check: review only (rules reviewer).
Trades against: P-08 (more precision, more words).

### P-04 Luck adds, it never decides

Status: proposed (Misa, 2026-10-26)
Statement: A plan never depends on a roll; dodges and crits may add on top of something certain.
Pass: a Setter's mark is left even when the boss dodges or the hit is Blocked.
Fail: "when it dodges, it marks the boss" as the creature's main job.
Review question: If every roll goes badly, does the plan still do its main thing?
Check: lab test "a hit at or below armour is Blocked, and a Setter still marks".
Trades against: P-10.

### P-05 Knacks are sidegrades

Status: proposed
Statement: Every Knack has a situation where it is the best pick and one where it is worse than another; none is a free upgrade.
Pass: Detonate is worse than no Knack on a single stack and better on several.
Fail: v0.2 Detonate, strictly better than nothing (in 107 of 130 top teams in the first run).
Review question: Name a fight where this Knack is the wrong pick.
Check: report "Knack usage": never used means rework, used almost everywhere means it needs a counter card (P-10).
Trades against: P-10.

### P-06 Same effect, same name

Status: proposed (Misa, 2026-10-26)
Statement: An effect keeps one name wherever it appears (another species, a gear piece, a talent); a different effect gets a different name.
Pass: Ready the Mark on Sunfawn, Ashmole and Magmole; Leave a Trail on five Payoffs.
Fail: Stand Close (Knack) and Stands Close (talent) with different effects.
Review question: Does another Knack, talent or gear line already do exactly this?
Check: lab test "no two Knacks share a name".
Trades against: none.

### P-07 Use the whole board

Status: proposed (Misa, 2026-10-26)
Statement: Effects and boss patterns may use rows, columns, slot shapes and distance, not only "beside".
Pass: Sunbeam heals every creature in front of it in its column, so healers belong at the back, and a back-row boss move punishes that.
Fail: every effect worded "the creatures beside it".
Review question: Does this make a placement choice that was not there before?
Check: lab test "Sunbeam heals the creature in front of it".
Trades against: P-08 (shapes must stay readable on the board).

### P-08 Show it on the board

Status: proposed
Statement: Everything a fight uses is visible before it starts: marks with counts (x3), the boss's next patterns as slot highlights, and rule-card icons on the creatures whose Knack answers them.
Pass: a boss card that lights up the three slots its slam will hit.
Fail: a hidden rule players must read about after a loss.
Review question: Could a player predict this effect from the board alone?
Check: review only (readability reviewer).
Trades against: P-07, P-03.

### P-09 Families, not one-offs

Status: proposed
Statement: Knacks come from a small grammar of families (see `grammar.md`) plus at most one signature per species, so 100 species stay buildable and learnable.
Pass: the Detonator family (Detonate, Big Spout) shares one rule with different numbers.
Fail: a Knack needing a new engine step that only one species will ever use.
Review question: Which family is this in, and if none, why does it deserve a new one?
Check: review only (systems reviewer).
Trades against: P-01 (species identity).

### P-10 Spiky, not flat

Status: proposed (Misa, 2026-10-26)
Statement: Strong combos may stand out; a dominant build is answered first by a counter card in the rotation, and nerfed only when it wins against every card.
Pass: Leave a Trail chains stand out in the first full run; the answer is a counter card, not a nerf.
Fail: a balance pass that pulls every Knack to the same value.
Review question: Is there a rule card this build loses to?
Check: report "Best teams per card" and "Knack usage".
Trades against: P-05.

### P-11 Rotate the question, not the roster

Status: proposed
Statement: Rule cards change week to week so the best team changes too; nobody is reset.
Pass: the classic trio is more than 10% behind the best gauntlet line on most cards.
Fail: one rule card set that one team beats every week.
Review question: Does this week's card set change which team is best?
Check: report line "The classic line is more than 10% behind ...".
Trades against: none.

### P-12 Bosses have agency

Status: proposed (Misa, 2026-10-26)
Statement: The boss acts between rows, aims with readable patterns, and punishes setups, never whole builds.
Pass: Payoff Hunter slams the strongest Payoff's slot and the two beside it; a Guard there answers it.
Fail: a boss that ignores where creatures stand, or one that makes a whole element useless.
Review question: Is there a placement or Knack answer, and is no build locked out?
Check: report "Raid weekend" and "Best teams per card".
Trades against: P-01.
