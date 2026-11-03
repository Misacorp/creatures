# The School and visiting teachers

Status: **accepted in part** (Misa, round 18, Q45: B, "Talents can be discovered but creatures still need to learn them a first time. This could be the place to do it"), with visiting teachers; reconciled with combat v2's talents as built (2026-11-03, below). The first-draft rules are kept for history; "As decided" and "Against combat v2 as built" replace them where they differ.

## The idea

A creature placed at the School teaches the talents it knows to other creatures in the valley. Visiting teachers come by on a known rhythm and offer talents nobody in the valley knows. Teaching gives spare and duplicate creatures a use, which makes collecting itself rewarding (G-2).

## As decided (round 18)

- **V-SCH-7 Learning.** A creature learns a talent from its line's Talent Book (combat v2) for the first time at the School: it takes a School seat for a short stay (example: a day) and the first learning is paid once (example: Acorns). After that, swapping between learned talents is free from the creature's card, until the raid locks (combat v2).
- **V-SCH-8 Visiting teachers** (Misa: "learn undiscovered talents from visiting teachers... if that talent is applicable for the creature's talent book, and also adds it to its talent book"). A teacher arrives on a known day with a talent nobody on the server has found; a student whose line's pool holds that talent learns it and adds it to the line's book. Teachers lean toward talents the server lacks (V-SCH-5).
- **V-SCH-9 Graduation** (trials, V-TRIAL-4) is held at the School.
- Teaching between creatures (V-SCH-1, V-SCH-6) is gone: combat v2's book records every talent found, duplicates included.

## Against combat v2 as built (2026-11-03)

Combat v2 is in the game behind a staging flag (`COMBAT_V2`). What it does today, from the code, and what the School takes over:

- **The book is per player and per line**: `line_talents(user_id, line, talent_id, golden)`; each line's pool has 7 of 34 talents (`packages/game/src/combat-v2/data/talents.json`); a talent found on one line never enters another line's book.
- **How a talent is found:** a new creature rolls one (role-filtered) and learns it free into its first slot; a duplicate's talent is added to the book automatically.
- **How a talent is learned today:** instantly on the creature's card, for 10 Bait, once per creature and talent; slotting is free until the creature has fought that weekend. Slots open at levels 1, 20 and 25 (two for common lines, three for rare and epic).
- So the open questions are answered: a creature learns only its own line's talents (an off-role talent sits idle), and learning costs Bait (Acorns in the valley), not Essence or a page.

The valley's rules, read against that:

- **V-SCH-7, as built:** learning moves from the creature's card to the School in phase 5: a creature takes a School seat until the next morning (no countdown: "learns it by morning") and pays the same one-time price (today's 10 Bait, Acorns in the valley). Swapping among learned talents stays free from the card, until the creature has fought that weekend. Until phase 5 the card keeps today's instant learning.
- **V-SCH-8, as built:** books are per player, so a visiting teacher's offer is per player too, like the visitor's stock: for each player, a talent from the pool of a line they own that their book for that line lacks (V-SCH-5: leaning toward what you lack). A student of that line learns it and it enters that player's book. "Nobody on the server has found" no longer applies.
- **V-SCH-9:** graduation is held at the School (prototyped in phase 3).
- **For combat v2 (told to that session, not the valley's to fix):** the duplicate choice still offers Teach alongside the automatic book entry; golden talents are stored but have no effect in v2 fights yet.

## Rules (first draft, 2026-10-29)

- **V-SCH-1** Teaching is chosen and previewed: the teacher's talents are listed; picking a student shows "learns X in N hours" before committing. No random inheritance (Palworld's breeding is the anti-example).
- **V-SCH-2** Nothing is consumed: the teacher stays a teacher, the student keeps its level (the anti-examples: Monster Hunter Stories 2's donor, Dragon Quest Monsters' level reset).
- **V-SCH-3** The School has seats for a teacher and a few students; learning progresses while they sit there (a post, see `posts.md`).
- **V-SCH-4** A visiting teacher arrives on a fixed, visible day ("a teacher from Storm Ridge arrives Thursday"), with the offer shown in advance and kept until claimed or replaced by the next visitor.
- **V-SCH-5** Offers lean toward what the player lacks and can be nudged (the creature standing at the School, the server's School level), never rerolled for a price.
- **V-SCH-6** Lending: a player may lend a teacher to a friend's School seat; the friend's student learns, the lender gets a small thank-you (see `commons.md`).

## Open questions

Answered by combat v2 as built (above): only the line's own talents; learning costs Bait (Acorns).

## What combat v2 decided about talents (2026-10-31, from `combat-v2-roster`)

- **Knacks** come from the species: a creature knows every Knack of its form from the moment it is caught; nothing teaches them (Misa, R11).
- **A talent** is one modifier with its number, from one shared library; each creature **line** has a pool of 7 (Misa, 2026-10-27).
- **The Talent Book is per line and fills itself:** every talent found goes into its line's book automatically; a duplicate's talent is recorded there, and the duplicate choice becomes Fuse, Release or Keep. **Teaching as a duplicate option goes away** (Misa, 2026-10-28).
- **Learning costs once, swapping is free:** a creature pays the first time it learns a talent from its line's book, then swaps freely until the raid locks (Misa, 2026-10-28). Slots: one at catch, a second at level 20, a third at 25 for rare and epic lines (unchanged so far).
- Combat's own note: "**Idea for later:** if creatures ever 'work' at places, a school where a creature learns a **random** talent from its line's book after some time."

So the School's first purpose (teaching between creatures, a use for duplicates) is already done by the book, and talents stay inside a line.

## The lead's first take (2026-10-30, for the **school** question)

Misa (Q32): "What do we want to teach in a school? Or is the school building even necessary? Is it a dumb way to do things that I just came up with because it felt cool?"

Not dumb: the need behind it is real. Spare and duplicate creatures need a use (G-2), and a place where creatures grow in ways other than levels gives the valley a reason to collect. But it is the one place whose purpose is borrowed: it exists to teach combat v2's talents, so it is only as good as what there is to teach. A place earns its spot if it gives a decision no other place gives.

- If combat v2's talents are **learnable and swappable**, the School is the natural home: a known teacher, a chosen student, a visible wait.
- If talents are **few and fixed per species**, there is nothing to teach: scrap the School, and give duplicates their use elsewhere (fusion at the Paddock, or a gift to a project).
- A middle way: fold teaching into the **bonfire**, where resting creatures learn from each other in the small moments, with no seats to manage.

Decided with Misa in round 18 (Q45: B, the School teaches a line's talents, hosts visiting teachers and graduation).
