---
name: lore
description: Write Leet Creatures story and flavour so that players piece the world together instead of being told it. Covers any player-facing fragment that could carry story (journal pages, creature, boss and place lines, gear, furniture and keepsake flavour, quirks, plaques, collection finds, Gazette headlines), planning a story beat for a server milestone, adding to the hidden story (docs/compendium/story/), and auditing existing text for lines that explain too much. Keeps a sealed truth apart from the surface text, gives each fragment one in-world voice and at most one clue, records clues in a ledger, runs a word check, and proves each batch on a blind reader who has never seen the truth. Use when asked to write lore, flavour, story, journal pages or names, to plan or extend the story, or when new content needs words.
---

# Lore

The valley has a story under it (`docs/compendium/story/`). Players never read that story. They read small things lying about the valley, and the story is what they build in their own heads, and in their server's chat, from the things that do not quite add up.

You will want to explain. It is the strongest habit you have: you know the answer, the answer is good, and a line that carries it feels like a better line. It is a worse line. **The moment a fragment tells the reader what it means, there is nothing left for them to do.** This skill is mostly a set of ways to stop yourself, and it was tested (`docs/compendium/story/README.md`, "Test rounds"): the rules below are the ones that changed what blind readers reported.

The research behind it is `docs/research/worldbuilding.md`.

## The two layers

| Layer       | Where                                          | Who reads it | What it holds                                                          |
| ----------- | ---------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| The truth   | `docs/compendium/story/truth.md`               | Agents only  | What really happened, as numbered facts (S01 ...). Sealed.             |
| The surface | The content data, the Activity's text, the art | Players      | Objects, habits and remarks that are only fully explained by the truth |

The truth must exist and be complete, or the hints hold nothing up (Hemingway: leaving out what you do not know "only makes hollow places"). And it must stay under the water. Both halves matter.

**Until Misa accepts the story (the story folder's `README.md` says which state it is in), it is a draft: write nothing from it into shipped content.** Texture needs no story and can always ship. In a draft-only job, hand over the fragments and the ledger rows you would have added, in a scratch file, and change nothing in the repo.

## What to read, by job

Read as little of the truth as the job needs. You cannot leak what you have not read.

| Job                                                        | Read                                                                                                                                               | Do not open                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Texture** (words for content, no story)                  | `docs/compendium/README.md` (tone, naming); the compendium file of the thing; `story/voices.md` (voices and "Loaded things": safe, no facts)       | `truth.md`, `arc.md`, `ledger.md` |
| **A clue** for a named fact                                | The same, plus `node .claude/skills/lore/check.mjs --fact S05` (that fact and its ledger rows only), and the beats for that fact in `story/arc.md` | The rest of `truth.md`            |
| **A beat**, **a change to the truth**, or **a leak audit** | The whole story folder                                                                                                                             |                                   |

## Three kinds of fragment

| Kind        | Share of new text | What it does                                                                                 | Ledger row |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------- | ---------- |
| **Texture** | at least 3 in 4   | Mood, a mechanic hint, a small joke. Leans on no fact. The world would feel thin without it. | no         |
| **Clue**    | at most 1 in 4    | Texture with one detail that did not need to be there, which only the truth fully explains.  | yes        |
| **Beat**    | rare              | The one object or scene a server finds at a milestone. Still shown, not told.                | yes        |

A clue is never a different kind of sentence. It is an ordinary flavour line with something slightly off in it. A player who is not looking reads it as texture and loses nothing; that is the test of a good one.

Texture has one duty to the story: **stay out of its way.** `voices.md` lists the "Loaded things" (lamps, the number five, things made for a crowd, and so on). A texture line that uses one becomes a false clue, or spends a real one early.

## Grades of clue

Pick the grade before you write. Use the lightest that does the job.

- **Seed.** The first appearance of a word, shape or number from the stock of names (`ledger.md`), meaning nothing yet: "the usual five" in a list of nails and coal. A seed may be planted a chapter before its fact comes into reach. It must pass as texture completely.
- **Trace.** A thing out of place, with no comment: a count that does not fit, wear in the wrong spot, something kept for no reason, something made for more hands than are here.
- **Echo.** A trace that repeats a word, a shape or a number already seen somewhere else. One of anything is a detail; the second is a pattern. Echoes use the stock's exact words.
- **Slant.** A voice says something about the past that is partial, beside the point, or wrong, and is not corrected. The committee: "The long benches are for the crowds."
- **Key.** The piece that lets a reader holding two others join them. At most one per fact, ever. A key is still an object or a remark, never a statement of the fact.

There is no grade for a line that says the fact. If you have written one, it is not a strong clue; it is the end of that mystery.

## Writing a fragment

1. **Surface and budget.** Match the neighbours in the same data file: their length and sentence shapes.

   | Surface                               | Budget                                                                                                                            |
   | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
   | Gear, furniture, keepsake, quirk      | One sentence, at most 20 words. Gear slots are hat, scarf and charm.                                                              |
   | Journal page                          | Two or three sentences, at most 45 words. It still hints at a real mechanic (`docs/compendium/journal.md` lists which are taken). |
   | Ledger scrap, shelf label (the clerk) | At most 20 words: three or four plain entries. The loaded one is never first or last.                                             |
   | Plaque                                | At most 8 words round the names the game fills in. It may speak to the reader.                                                    |
   | Gazette headline                      | At most 10 words. A dry small-town joke is welcome.                                                                               |
   | A find (collection piece, landmark)   | Its name, and one sentence of at most 20 words about what it looks like.                                                          |

   A new thing's display name and a page's title follow the naming table in `docs/compendium/README.md`. Each fragment must read whole on its own: a player may meet it first, last or never.

2. **Voice.** Choose one row of `voices.md`. Write down, for yourself, what that voice does not know. That is the edge of the fragment. (A quirk is the creatures' voice: the field notes report the habit and add nothing.)
3. **Kind and grade.** Texture unless the plan for this batch says otherwise. For a clue: which one fact, which grade. Look at the fact's ledger rows: what they already said, on which surfaces, **with which device** (step 4). A new clue says something the others did not. Prefer a kind of surface the fact does not have yet; when the job fixes the surface, that is fine, but it adds nothing to the count rule. Check `arc.md`: a small fragment never uses the image a planned beat is saving.
4. **Find the object.** The fact is abstract; a clue is a thing. If this fact is true, what is lying in a drawer because of it? Pick a device, and not the one the last two clues for this fact used:

   | Device               | Example of the shape (not to copy)                                |
   | -------------------- | ----------------------------------------------------------------- |
   | Size or count        | A stamp inside the boot says 29                                   |
   | Wear                 | The handle is worn smooth on the left side only                   |
   | Readiness            | A bed made up in the loft, the blanket folded back                |
   | A habit past its use | The Forge bell is rung twice at dusk. The second ring is shorter. |
   | An exception         | Every bramble curls from a torch. The old vines do not.           |
   | A repair             | The same hinge, mended in three different metals                  |
   | A direction          | All the chairs in the hut are turned a little to the east         |
   | A gap                | The dust on the shelf is thinner in one square                    |

   Write the thing. Leave out why.

5. **Write several, not one.** Five for a clue, different objects, not five wordings of one. Two or three for texture. The first idea is the one every writer has: in the first test, two writers working apart both gave a creature the same habit with a stair. Keep the candidates in your scratch file.
6. **Cut** (next section), then keep one.
7. **Ledger.** For a clue or a beat, add the row to `ledger.md` in the same change, with its device in the "line or detail" cell.

### A journal page that also carries a clue

Three jobs in 45 words: a scene, a mechanic hint, a story detail. The mechanic leads. The story detail takes one clause, and it works best as **the scene's setting or the mechanic's exception**, never as a second point. The page's title names the scene, not the clue.

## The cut

Run every candidate through these, in order. Each is a way explaining gets in.

1. **Delete the last sentence** (of a fragment with more than one). If what is left still works, it stays deleted: last sentences are where the meaning gets announced. The one exception is when the last sentence is the object itself. (The shipped voice likes to end on "a quiet truth": keep that for mechanic hints, never for the story.)
2. **Strike the contrast.** This is the one that readers feel most. You wrote the odd thing and then, to make sure it was noticed, the normal thing beside it: "nine stools **and one cobbler**", "forty pairs, **and we have only ever needed six**", "steps over the creaky stair **even on its first visit**". Cut the second half. The player already has it: they know how many cobblers there are. "Soled at the bench with nine stools."
3. **Strike the cause.** No "because", "so that", "in order to", "which is why", "for the day when" attached to anything old. The object is the effect. The reader supplies the cause.
4. **Strike the caption.** No "as if waiting", "as though it remembered", no feeling named (sad, lonely, hopeful, strange). A creature sits facing the far hills at dusk. Stop there.
5. **Strike the pointer.** No "mysterious", "secret", "long ago", "forgotten", "legend", "it is said", no question to the reader, no trailing dots. These say "this is a clue" instead of being one. (`sealed.json` has the list.)
6. **Say it once.** One odd thing per fragment. If two details point the same way ("she stepped on none of the stores" and "she looked only at the fire"), keep the quieter one. If two details point at different facts, give one to another fragment, another surface, another week. Never a question and its answer in one fragment, or in one chapter.
7. **Take out the most telling word.** Find the single word carrying the most information about the truth. Remove or blunt it. If the line is still a clue to someone who has seen two others, it was too strong before. ("Oil, five measures, one to each far place" becomes "Lamp oil, the usual five.")
8. **Swap abstract for exact.** Numbers, materials, wear, quantities. "Many" becomes "29". "Old" becomes "worn on the left".
9. **No new names.** No new Capitalised Noun and no new person (a ledger that mentions "Carter" has started a character). Names come from the stock in `ledger.md`. A name that appears once is noise; the same plain phrase three times in three places is a mystery.
10. **The skimmer.** Read it as someone who does not care about story. Is it still a nice line about a hat? If it only works as a clue, it is not finished.

Then look at **the batch as a whole**, as a suspicious reader would:

- **Numbers.** Do any two numbers in the batch add up, match or differ by one? Readers will connect them ("six needed" and "the usual five, plus our own fire" became a theory about six households). Change one unless you meant it.
- **Texture that has started to look like a clue** because of its neighbours. Check it against "Loaded things" again.
- **Density.** If more than one in four leans on a fact, hold some back for a later batch.

Then run the word check on your drafts (one fragment per line in a scratch file):

```
node .claude/skills/lore/check.mjs <your-drafts.txt>
```

It catches only the wording writers reach for first. Passing it means little; failing it means a rewrite, not a synonym.

## The blind reader (required for any batch with a clue or a beat)

You have read the truth, so you cannot judge whether a fragment gives it away. Use a reader who has not.

Start a **fresh agent** (general-purpose; not a fork, which inherits what you know). Put in its prompt only: one line on what the game is; the fragments, each labelled with where a player would meet it and mixed in with the batch's texture; and the lines already shipped for the same facts (the ledger's "line" cells, without fact IDs), as "lines you have seen before". **No file paths under `docs/compendium/story/`, no fact IDs, no hint of what you hope it finds.** Tell it to open no files and use no tools. Ask exactly:

1. What do you now know for certain about this world's past? Quote the words that told you.
2. What do you suspect? For each, how sure are you, out of 10?
3. What do you want to find out next?
4. Which lines felt like the writer nudging you to notice something? Rate each: 1 I barely felt it, 2 I felt the writer's hand, 3 it is telling me.
5. Which lines would you skip past as plain flavour?

Read the answers against the truth:

| Answer               | Pass                                                                                                | Fail, and what to do                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Certain           | Nothing sealed. Only what the chapter's "can piece together" column in `arc.md` allows.             | A sealed fact is stated: find the quoted words and cut them (the cut, rule 7).         |
| 2. Suspects          | The right direction at 3 to 6 out of 10; or a planned false lead (`truth.md`).                      | 7 or more on a sealed fact: a clue is too strong or said twice. Blunt it (rules 6, 7). |
| 2. Suspects (other)  | No theory built from an accident (two numbers, a stray name).                                       | Remove the accident.                                                                   |
| 3. Wants to find out | At least one real question in the reader's own words, about a thing a server could go and look for. | Nothing: the batch is all texture, or all answers. Add a trace.                        |
| 4. Nudged            | Every clue at 1, or not listed. A reader asked this question always lists something.                | A 2: strike the contrast (rule 2). A 3: rewrite from a different object.               |
| 5. Skips             | All the texture, and ideally a clue or two.                                                         | A texture line is not skipped: it reads as a clue. See "Loaded things".                |

One fragment alone should teach a reader **nothing** certain. A whole chapter's set should get a careful reader to "I think I know, and I want to check". If your reader solved it from one batch, you blurted; do not argue with the reader. After a rewrite, use a **new** reader: the old one has seen the stronger version.

For a finished chapter, ask a second fresh agent the opposite question: given every fragment of the chapter, what happened here? If it cannot get near, the mystery is not fair: check the count rule in the ledger.

## Planning a beat

A beat is what a server finds when it reaches a milestone together (`arc.md`).

- **It is an object or a scene, in a place.** Not a page of text, not a speech, not a cutscene. One thing, where it would be.
- **It hangs on something the game already does:** a place's level, a finished collection, a first win over a boss, a dungeon landmark, a find on a trip, the fair, the Festival. If a beat needs a new mechanic, it is a question for Misa, not a beat.
- **The server did it.** The moment belongs to everyone; the plaque rules apply (no ranking, no amounts, your own part first: `docs/design/valley/systems/commons.md` V-COM-2, `return.md` V-RET-5).
- **Nothing is missable.** What a beat leaves stays where it was found for every later player. No timed reveals, no "you had to be there" (valley filters F-1, F-7).
- **It answers one earlier question and opens a smaller one.** Write both questions in the beat's row before writing a word of it.
- **The Gazette reports, it does not interpret:** "Lamp-housing found under the Hollow's roots." Never "...suggesting the old folk...".
- The beat's own line goes through the cut and the blind reader like any clue.

## Changing the truth

- A new fact, name, voice or false lead is added to `truth.md`, `ledger.md` (the stock) or `voices.md` first, with the date, and only then hinted at. Never hint at something you have not decided.
- **Grow from an open seed** (`docs/compendium/threads.md`) or a shipped line before inventing. The best facts explain three things that were already in the game.
- **What players have read is fixed; the truth under it is not.** If a better truth explains every shipped fragment at least as well, the truth may change. A shipped fragment is never contradicted.
- A fact must be worth finding: it changes how a player sees something they do every week. A fact that only fills in the map is not one (M. John Harrison's "great clomping foot").
- A new loaded object goes on the "Loaded things" list in `voices.md` the same day, as a plain noun.
- Large things are Misa's: who the story is about, how it ends, a new place or boss, anything in "deliberately not decided". Ask him. Small things you decide and record (`pnpm decisions new --topic direction`).
- Keep the tone rules: nobody dies, no villains, no horror. Loss lives in objects. The sad thing in this valley is a lamp left on, and nobody says it is sad.

## Keeping the secret outside the game

- No sealed fact, dev name or fact summary in PR titles or descriptions, commit messages, patch notes, Discord posts, code comments or test names. Refer to facts by ID ("adds two S04 clues").
- Pages and messages for Misa: he plays the game too. Unless he has asked for spoilers, describe story work by what players will see, not what it means.
- A reviewer of story text gets `docs/design/review-brief.md` and, if they must judge leaks, this skill; a blind reader gets neither.

## When you finish

- `node .claude/skills/lore/check.mjs --changed` (text added to the content data) and `--ledger` (the count rule for any fact whose chapter is open).
- The compendium entry for the content, as always (`docs/compendium/README.md`, "How to add an entry"), and `threads.md` if a seed was used: mark it "in use (story)", not answered. The answer is in `truth.md`; for players the thread is still open.
- `pnpm format:check`.
- Report in a few lines: what was written, how many clues at which grades, and the blind reader's result (certain: none sealed; highest suspicion; highest nudge).

## Worked example

The job: one line for a new neutral hat, a clue for "the valley was built for more folk than live here", grade trace, voice the makers. (Do not reuse this hat or its device; it is here to show the cut.)

First draft, the way it comes out:

> A travelling hat from the old days, when the valley was full of explorers who have long since gone.

Everything is wrong with it: it states the fact, points at the past, and the hat is not in it.

Five objects: a hat with a name sewn in and picked out again; a hat block with a tally cut in its base; a hat with a loop on the left for something that is not sold; a hat that comes in one size, too big; a row of hat pegs.

Second draft, from the tally:

> Shaped on the Forge's one hat block, which has a tally of two hundred cut in its base, though only a dozen folk have ever lived here.

Better, and still telling: the contrast ("though only a dozen") does the reader's work, and "ever lived here" is a claim the makers could not make.

After the cut:

> Shaped on the Forge's one hat block. Somebody kept a tally on its base and ran out of room.

A skimmer gets a small joke about a busy hatter. Someone who has also seen the long benches gets a second thing that was made for a crowd. The line never says there was one.
