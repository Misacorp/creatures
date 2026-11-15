# The School and visiting teachers

Status: **accepted in part** (Misa, round 18, Q45: B, "Talents can be discovered but creatures still need to learn them a first time. This could be the place to do it"), with visiting teachers; reconciled with combat v2's talents as built (2026-11-03, below). **Misa's vision (2026-11-03, below) leads**, decided in round 22 (Q51 to Q53; "As decided (round 22)"). The first-draft rules are kept for history; "As decided" and "Against combat v2 as built" replace them where they differ.

## The idea

A creature placed at the School teaches the talents it knows to other creatures in the valley. Visiting teachers come by on a known rhythm and offer talents nobody in the valley knows. Teaching gives spare and duplicate creatures a use, which makes collecting itself rewarding (G-2).

## As decided (round 22, 2026-11-03)

After research (`docs/research/school-teachers.md`) and the panel (`reviews/2026-11-03-school.md`). These replace V-SCH-7 and V-SCH-8 below.

- **V-SCH-10 Finds come first.** Talents (and golden ones) come mainly from creatures found. A found talent is learned on the creature's card, as today, for the one-time price (Acorns), except the talent a creature is born with, which is free (Misa, 2026-11-09); swapping among learned talents is free until the creature has fought that weekend (Q53, B).
- **V-SCH-11 The visiting teacher** comes weekly and stays **Monday to Wednesday** (Q51, B). It is announced a few days ahead in the Gazette and the server's channel, with the talent's name and the days in each reader's local time (Discord time stamps); the valley shows it coming (the School's bell, a lectern at the door).
- **V-SCH-12 One talent that benefits someone** (Q52). Drawn among the talents that would benefit at least one player on the server (a line they own whose pool has it and whose book lacks it), preferring one that benefits a few players (from 2 up to a quarter of the server's players), never everyone, so it seems random; else one that benefits a single player. Never golden. Most players miss most visits, by design: the School is secondary. A **role-specialist** teacher (each student learns a random talent of one role from its own line's pool) is a **festival special**, not the weekly rule.
- **V-SCH-13 A lesson.** A creature seated at the School before the arrival or on any day of the stay learns by the next morning if its line can take the talent and its owner's book for that line lacks it; the talent enters that player's book for the line (then any creature of the line learns it on its card, V-SCH-10). The student then goes back to its post by itself. A few student seats per player (example: 2); a student leaves its post while seated. The School shows the faces of your creatures that would learn, with one Send, or "none of yours this time" in words.
- **V-SCH-14 Later: a player's own teacher** (Misa's point 4), not at the start: it opens with a School level the server builds, shown as being built before it opens. Each player has their own teacher seat; the learner asks and the teacher is never asked; teaching stays within a line; a student takes at most one player-taught lesson a week; nothing is consumed and the teacher keeps growing; "taught N" shows on its card, never a ranking.
- **V-SCH-15 From the start.** The teacher visits from the server's first weeks; a player with few lines simply benefits less often (the School is secondary).

## Misa's vision (2026-11-03)

Misa: "As players explore and find new creatures, it would still be pretty cool if they could learn the talents from the creatures they find. So this is a source of random talents, and it's also the source for golden talents, like primarily. But then to patch those gaps and give players some sort of agency in what their creatures can learn and maybe accommodate for that roles, or just give some determinism into the system, the school would be where this would be made available. So I don't intend it to be a like surefire guaranteed way to make up for talents that are missing, more like a communal random talent acquisition place. Its main focus as a building can span more than just talents and learning them. But I would like to see this kind of a teacher show up. I don't know how often, once a day, once a week, how often it would be there. Remains to be seen. But that teacher would kind of like announce when they're arriving, and then the creatures in the school during that day would be able to sit there and learn the talent at the end of the day. And then it would be added to that creature's talent book. I'm assuming it's eligible for the talent book, because we can't have creatures learning talents that they aren't supposed to know. So this would be a random talent that comes in kind of like from the outside. But what my vision here also entails is that because we are building a community co-op game, it would be cool to somehow eventually give players the option to have their own creatures teach a talent to other creatures. And this could be done by opening up a teacher slot at the school, and then one player's creature could occupy it, and then it would then teach that talent to others. So this would allow some sharing, and we could even expand it to futures that allow improving talents over time if we need that. I don't want to put it in now, and this whole teaching mechanic probably could unlock like at some point in the game, but not at the start. Let's let players find their talents for quite a while. ... It would be like a secondary source for learning talents that players can plan for. So I want to bring in these moments of, oh, I really want to have my creature available on this day so they can go to school and learn. That's the whole point here."

In short:

1. **Finding creatures stays the main source** of talents (random) and the main source of golden ones.
2. **The School is a secondary, communal source you can plan for**: not a guaranteed way to fill a missing talent, but some agency and determinism (for roles, for gaps).
3. **A visiting teacher** announces its arrival (how often is open: daily, weekly); creatures sitting at the School that day learn its talent at the end of the day, if the talent belongs in their line's book, and it is added to the book.
4. **Later, not at the start:** a teacher seat that a player's own creature can take, teaching its talent to other players' creatures (sharing in a co-op game); perhaps later still, improving talents over time.
5. **The point:** planning moments: "I really want my creature available on this day so it can go to school and learn."
6. The building can do more than talents (graduation is already there).

What it changes against the rules below, pending the review: V-SCH-7's "learn a found talent for the first time at the School" is not in the vision (open: does a found talent still need a first learning, and where?); V-SCH-8's teacher teaches every eligible creature present that day, not one chosen pupil; the teacher seat (V-SCH-6, lending) comes back as a later unlock.

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
