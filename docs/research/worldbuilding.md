# Worldbuilding by allusion: how to tell a story in fragments

Status: research, 2026-11-18. Evidence, not rules (`docs/design/valley/README.md`, authority order). The rules drawn from it are in the `lore` skill (`.claude/skills/lore/SKILL.md`).

**The question.** Misa (2026-11-18): the game "could use some kind of a story. It can play out slowly"; the world needs "depth and lore"; and Claude "is generally bad at not blurting out everything, and instead just alluding to characters, places, events, etc. here and there, allowing players to piece together the interesting bits". How do writers who are good at this do it, and how do we make an agent do it?

**How it was researched.** Two passes by the read-only researcher agent. The second pass opened the pages. Each source below is marked: **read** (the page was opened and said this), **snippet** (seen only in a search result), or **memory** (the model's own knowledge, unchecked). Quotes come through a summarising fetcher and were not checked against print. Do not quote "snippet" or "memory" lines anywhere as fact.

## The short answer

1. **Know everything, show an eighth.** The hidden story must be written down and complete; the surface shows objects and leaves the meaning out.
2. **Fragments are spoken by someone inside the world** who knows only part of it, and may be wrong.
3. **Repeat a small stock of names and shapes** across unlike things, so players can connect them.
4. **Three clues, on three different kinds of thing,** for anything players are meant to work out.
5. **Lore is optional, found where players already look,** and never blocks play.
6. **Progress paces the story, not the calendar,** and nothing is ever missed for good.
7. **Short.** Twenty to thirty words. One voice for the whole game.
8. **Models state the theme.** A check has to be built for that, because the writer cannot see it in their own text.

## What the sources say

### 1. Omission needs a real thing to omit

- Hemingway, _Death in the Afternoon_ (1932), as quoted on Wikipedia's "Iceberg theory" page (**read**, secondary): "If a writer of prose knows enough of what he is writing about he may omit things that he knows"; "The dignity of movement of an ice-berg is due to only one-eighth of it being above water"; and the half that matters most for us: "A writer who omits things because he does not know them only makes hollow places in his writing." On "Out of Season" (_A Moveable Feast_): he left out the real ending on the theory that "the omitted part would strengthen the story." <https://en.wikipedia.org/wiki/Iceberg_theory>
- Alexis Kennedy (Failbetter, Weather Factory), interview (**read**): "Go short. Value pithiness over lushness." "Get in late, leave early." And: "An audience can tell whether there's really something behind the curtain." <https://gamedaily.biz/?p=1750>
- The mystery-box criticism (Wikipedia, "Mystery box show", **read**): critics call the form "purpose built to not add up", ending "in irresolution, deferral and ellipsis". We found no source that any particular show had no answers planned; the lesson stands without it.

**For us:** a truth file with every answer in it, written before the first hint (`docs/compendium/story/truth.md`), and a rule that nothing is hinted at before it is decided.

### 2. A sense of depth comes from what is named and not told

- Tolkien, letter to Christopher Tolkien, 30 January 1945 (**read**, Tolkien Estate): a glimpse of an old name moves the reader "because it conveys a sudden sense of endless untold stories: mountains seen far away, never to be climbed". <https://www.tolkienestate.com/letters/christopher-tolkien-30-jan-1945/> (The often-cited 1963 letter on "unattainable vistas" could not be opened: **snippet**.)
- M. John Harrison, as excerpted on two blogs (**read**, secondary; original post and date unconfirmed): "worldbuilding is not technically necessary. It is the great clomping foot of nerdism. It is the attempt to exhaustively survey a place that isn't there." And, of over-rationalised fiction: the reader is "not being invited to interpret", which "is patronising to the reader". <https://thehelleborediaries.blogspot.com/2007/04/m-john-harrison-on-worldbuilding.html>, <https://www.jeffvandermeer.com/blog/2008/01/21/m-john-harrison-on-world-building>
- A former Fallen London creative lead on lore practice (**read**; one writer's view): "There is no canon but player-facing canon"; unreleased material "is subject to change"; "Lore serves story and not the other way around"; "wanting to answer a lore question is not a valid reason to write a story." <https://azhdarchid.bearblog.dev/the-fallen-london-approach-to-worldbuilding-or-how-i-learned-to-stop-worrying-and-love-the-lore/>

**For us:** a detail earns its place by inviting a guess, never by completing the map. What players have read is fixed; the hidden truth may still be improved as long as it explains every shipped fragment.

### 3. Item descriptions: a voice that is not all-knowing

- First Person Scholar on Dark Souls (**read**): the describing voice is "authorial but not omniscient"; a description is "fragmentary and possibly unreliable", a "balancing act between factual information and speculation"; items connect through shared figures, and through where they lie ("the spatial a semantic proximity"); questions "are posed throughout Dark Souls but never answered". <https://www.firstpersonscholar.com/?p=2844>
- Kotaku on Dark Souls 3's cut epitaphs (**read**): descriptions "more often than not ... tell us about something a person believed or thought"; the cut lines may have been "too much of a commitment to the idea of a master narrator". <https://kotaku.com/dark-souls-3s-cut-epitaphs-would-have-been-a-change-for-1828908757>
- Game Developer on Demon's Souls (**read**): "the banishment of exposition to item descriptions" is part of why it works; players "who are explicitly interested in the story will find it when they look for it". <https://gamedeveloper.com/design/story-where-there-is-none-lessons-from-demon-s-souls>
- Miyazaki himself: we could **not** read a first-hand quote (the Guardian interview was blocked). Secondary pages report that he read English fantasy as a child, understood part of it and filled the gaps with imagination. Treat as "reported" only.

**For us:** `voices.md`: every fragment has a speaker with a stated limit; no master narrator; two voices may disagree; where a thing is found is part of what it says.

### 4. Players decode space and objects

- Henry Jenkins, "Game Design as Narrative Architecture" (**read**): four ways a game's space carries story. The one that fits us is **embedded** narrative: "the game space becomes a memory palace whose contents must be deciphered as the player tries to reconstruct the plot". Our raids and trips are **enacted**; a server's own history is **emergent**. <http://web.mit.edu/~21fms/People/henry3/games&narrative.html>
- Smith and Worch, GDC 2010, "What Happened Here?" (**snippet**; the talk is behind a login): environmental storytelling as staging a space so that players actively interpret it as a whole.
- Alex Beachum on Outer Wilds (**read**): "the sole purpose of exploration is to answer questions about the world you're in"; the world "constantly makes references to things players can actually go out and discover". <https://gamedeveloper.com/design/road-to-the-igf-alex-beachum-s-i-outer-wilds-i->

**For us:** a clue is an object in a place. The best fragments point at something a server can go and reach.

### 5. Fair mysteries are redundant

- The Alexandrian, "Three Clue Rule" (**read**): "For any conclusion you want the PCs to make, include at least three clues." Clues that say the same thing count once. Be permissive about how players get there. Red herrings are "overrated". <https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule>

**For us:** the ledger's count rule (three clues on three kinds of surface per fact, one key at most), and only a few planned false leads, each recorded.

### 6. A shared story paced by what players do

- _A Dark Room_, GDC 2021 narrative review (**read**): the game "makes a point to give the player only what they need"; events arrive as one-line reports with the links between them "left in silence, given over to imagination". An idle game's story told entirely by what its systems report. <https://media.gdcvault.com/GDC+2021/ArthurDavis_ADarkRoomNarrativeReview.pdf>
- Hades (**read**): the game looks at where the player is and offers one of many small written events, weighted by the designers; the aim is that time spent "wasn't a waste". <https://gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death>
- Helldivers 2 (**read**): a story "told by the players themselves" through shared goals, with a game master who "has to win every now and then" to keep it on course. <https://techradar.com/gaming/helldivers-2s-greatest-asset-is-its-story-which-is-being-told-by-the-players-themselves>
- Guild Wars 2's first Living World season was removed after it ran, so later players never saw it; later seasons were made permanent (**snippet**). Destiny's community puzzles drew hundreds of solvers and complaints when the reward was small (**snippet**). Destiny's grimoire kept lore outside the game and was dropped for the sequel (**snippet**).

**For us:** chapters open on a server's shared milestones, the moment is one reported find, nothing expires, and all of it is inside the game where the thing lies. Our servers are 5 to 15 players, so nothing may need a crowd to solve.

### 7. Short text, one voice

- Failbetter's Fallen London writer guidelines (**read**): a description "should not go longer than 30 words"; "Don't tell them they're scared; scare them"; clichés are read without being noticed. <https://www.failbettergames.com/fallen-london-writer-guidelines-part-iii>
- Mark Rosewater on Magic's flavour text (**read**): "A single misplaced text shatters this work of art"; "We want Magic to have its own world and its own voice"; and, since a card may be seen first, last or alone, each piece "needs to stand on its own"; "details are where players fall in love with your game". <https://magic.wizards.com/en/news/making-magic/add-text-flavor-2002-03-25>, <https://www.hipstersofthecoast.com/2022/07/flavor-makes-the-world/>

**For us:** the budgets in the skill, the compendium's tone guide as the one voice, and "each fragment reads whole on its own".

### 8. Warm on top, sad underneath

- Essays on Tove Jansson's Moomin books (**snippet**) read them as warm but shadowed: a valley ringed by wilderness, written by someone "sad and scared of bombs". The Groke, who wants warmth and puts out every fire she sits by, is the model for a "threat" that is not a villain (**memory**).

**For us:** the tone rules already forbid death and horror. Loss sits in an object and is never named.

### 9. What language models do wrong

- StoryScope, a 2026 preprint (**snippet**; methods unchecked): model-written stories state their theme outright far more often than human ones (reported as 77% against 52%) and resolve more neatly; human stories carry more ambiguity.
- Our own test (below) is the evidence we trust.

**For us:** the cut (delete the last sentence, strike cause, caption and pointer), a word check for the phrases a model reaches for, and above all a **blind reader**: a fresh agent that has never seen the truth says what it learned. A writer who knows the answer cannot tell a hint from a statement.

## Our own test of the skill

See "Test rounds" in `docs/compendium/story/README.md`: the same assignment written with and without the skill, each read by an agent that had not seen the truth.

## Not found, or not checked

Hollow Knight, Noita, Sky, Stardew's community centre, Cookie Clicker, Hearthstone, Slay the Spire, Gene Wolfe, Le Guin: nothing solid was read. Miyazaki first-hand, Tolkien's 1963 letter, Harrison's original post: not opened. A follow-up could fill these; none of them would change the rules above.
