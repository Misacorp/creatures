# The story layer

Status: **draft, not accepted** (2026-11-18). Misa asked for a slow story the whole server plays through, told by allusion. This folder is a first proposal and the test bed for the `lore` skill. **Nothing here is canon or ships until Misa accepts a story.** If he picks another, `truth.md`, `arc.md` and the lists are rewritten; the skill and the method stay.

**Spoilers.** `truth.md`, `arc.md`, `voices.md` and `ledger.md` hold what players are meant to work out for themselves. Agents writing texture do not need to read `truth.md`. Nobody quotes it outside this folder (see the skill, "Keeping the secret outside the game").

## How it works, in five lines

1. There is a hidden story, written down in full (`truth.md`), as numbered facts.
2. Players never read it. They read fragments on things the game already has: item lines, journal pages, quirks, plaques, finds, headlines, art.
3. A fragment is spoken by someone inside the world (`voices.md`) and carries at most one small odd detail. It never says what the detail means.
4. A server opens chapters together by what it builds and beats (`arc.md`). Nothing can be missed.
5. Every clue is recorded (`ledger.md`) so each fact can be found from three different kinds of thing, and none is given away.

How to write for it: the `lore` skill (`.claude/skills/lore/SKILL.md`). Why it is built this way: `docs/research/worldbuilding.md`.

## Files

| File          | What it holds                                                                               |
| ------------- | ------------------------------------------------------------------------------------------- |
| `truth.md`    | The hidden story as facts S01 ..., what is left for Misa, the planned false leads           |
| `arc.md`      | Chapters, the server milestones that open them, and the planned beats                       |
| `voices.md`   | Who speaks on which surface, what each cannot know, and the small stock of repeating names  |
| `ledger.md`   | Every clue per fact: grade, surface, status. Starts with the shipped lines that already fit |
| `sealed.json` | Word lists for `node .claude/skills/lore/check.mjs`                                         |

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
