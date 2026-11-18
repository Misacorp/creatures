# The story layer

Status: **direction accepted by Misa, 2026-11-18** ("someone lived here before, and the server pieces together why"). **Misa plays the game and has asked to keep the secret hidden from him:** he approves the direction and each chapter's player-facing text, never `truth.md`. So the facts below the surface are the lead's to keep consistent and to record; what players read still needs his OK before it ships. Chapter one's words are in `chapter-1.md`, waiting for him.

**Spoilers.** `truth.md`, `arc.md`, `voices.md` and `ledger.md` hold what players are meant to work out for themselves. Agents writing texture do not need to read `truth.md`. Nobody quotes it outside this folder (see the skill, "Keeping the secret outside the game").

## How it works, in five lines

1. There is a hidden story, written down in full (`truth.md`), as numbered facts.
2. Players never read it. They read fragments on things the game already has: item lines, journal pages, quirks, plaques, finds, headlines, art.
3. A fragment is spoken by someone inside the world (`voices.md`) and carries at most one small odd detail. It never says what the detail means.
4. A server opens chapters together by what it builds and beats (`arc.md`). Nothing can be missed.
5. Every clue is recorded (`ledger.md`) so each fact can be found from three different kinds of thing, and none is given away.

How to write for it: the `lore` skill (`.claude/skills/lore/SKILL.md`). Why it is built this way: `docs/research/worldbuilding.md`.

## Files

| File           | What it holds                                                                               |
| -------------- | ------------------------------------------------------------------------------------------- |
| `truth.md`     | The hidden story as facts S01 ..., what is left for Misa, the planned false leads           |
| `arc.md`       | Chapters, the server milestones that open them, and the planned beats                       |
| `voices.md`    | Who speaks on which surface, what each cannot know, and the small stock of repeating names  |
| `ledger.md`    | Every clue per fact: grade, surface, status. Starts with the shipped lines that already fit |
| `chapter-1.md` | Chapter one: the player-facing text for the guided start, and what blind readers made of it |
| `sealed.json`  | Word lists for `node .claude/skills/lore/check.mjs`                                         |

## How it sits with the rest of the compendium

- `threads.md` lists open seeds. The story answers many of them **here**, not there: a thread used by the story is marked "in use (story)" and stays open, because for players it is.
- `world.md`'s motifs (light in the dark, remembering, keeping, a home carried on the back, waiting pays) are the story's surface. The story was grown from them and from shipped lines, and contradicts none.
- The tone guide in `../README.md` holds without exception: nobody dies, no villains, no horror.

## Test rounds

The skill was tried before it was proposed. A **writer** agent wrote a batch of fragments; a **blind reader** agent, which had seen neither the truth nor the skill, read them as a player and said what it now knew for certain, what it suspected (out of 10), and which lines it felt nudged by.

### Round 1 (2026-11-18): ten fragments, four leaning on a fact

| Writer was given                                    | Sealed facts the reader called certain                                                          | Highest suspicion of a sealed fact | Accidents                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| The story as a paragraph, the tone guide            | **One** (S04, nearly whole: "Oil, five measures, one to each far place. Carried by the eldest") | 8                                  |                                                                   |
| `truth.md` and `voices.md`, no skill                | Part of one (S04: "the usual five, one to each")                                                | 8                                  | A named person; two numbers the reader joined into a wrong theory |
| The skill, version 1 (two writers, two model sizes) | None                                                                                            | 7 and 6                            |                                                                   |

What it showed, and what changed in the skill:

- **Asked only to "allude", a writer still states the fact** in the one fragment where a knowing voice speaks. The folder alone (voices, facts as objects) removed most of that; the skill's cut removed the rest.
- **Readers feel the contrast clause.** Every writer put the normal thing beside the odd thing so it would be noticed ("nine stools and one cobbler", "even on its first visit"). Readers named exactly those lines as nudges. The cut now has "strike the contrast", and the reader rates nudges 1 to 3.
- **Two writers working apart chose the same habit** for the same fact. The skill now lists devices and asks for one the fact's last clues did not use.
- **Texture next to clues gets read as a clue,** and stray numbers get joined up. The skill now has a batch pass and `voices.md` a list of loaded things to keep out of texture.
- **A writer could not read one fact without seeing the whole secret.** `check.mjs --fact` prints one fact; the summary moved to the bottom of `truth.md`; `voices.md` was made safe for texture jobs.
- The word check found nothing in any batch. It stays as a cheap guard for the content data, not as the test.

### Round 2 (2026-11-18): twelve fragments, three leaning on a fact

Two new writers followed the rewritten skill end to end, with the reading limits (one fact at a time) and their own blind readers.

| Writer                               | Sealed facts called certain | Highest suspicion of a sealed fact | Highest story nudge (1 to 3)         | Reader wanted                                               |
| ------------------------------------ | --------------------------- | ---------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| C (three readers, two rewrites)      | None                        | 5                                  | 3, from the game's own frame (below) | To know what the find was a part of                         |
| D (smaller model; the lead's reader) | None                        | 7 (one find, a notch too strong)   | 2                                    | "What else the Fen is holding. I'd send more scouts there." |

What it showed, and what changed:

- **The loop works without the lead.** Writer C failed its first reader on one find, rewrote from a different object, and passed on suspicion. Writer D's too-strong find was caught by the reader, as intended.
- **Texture stayed texture:** readers skipped every texture line, and both S02 and S10 clues passed as flavour on a first read.
- **A frame can be the pointer.** A find that the game announces with "This belongs at the Signpost!" is rated a nudge whatever its sentence says. The reader's labels are now plain, and how loudly the game presents a story find is a design question for the beat, not the writer.
- **A delegated writer has no Agent tool.** The skill now allows a fresh tool-less `claude -p` process as the reader, or hands the prompt to the lead.
- **A clue writer needed three things from files it must not open:** the stock names, the planned false leads and the images saved for beats. `check.mjs --fact` now prints all three.
- Smaller fixes: an "out of place" device, old shipped lines in the batch check, which rule wins when the telling word is the thing's name.

Not yet tested: a whole chapter read by one reader ("what happened here?"), which needs a chapter's worth of fragments; and real players, who talk to each other.
