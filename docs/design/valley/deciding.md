# How we decide: question rounds with Misa

Status: **accepted** (Misa, 2026-10-29). This is how the valley plan moves forward. The `valley-round` skill (`.claude/skills/valley-round/SKILL.md`) runs it.

## Misa's words

> "I am more inclined to scrap existing features, systems and design choices than cling on to them. I want to be brave. Any existing players and their achievements can be remembered by an "I was there" type of memento if nothing else... Don't cling to what exists if it stops us from building a genuinely better and more enjoyable experience that matches the grand vision."

> "Your plan is to go step by step and you can ask me questions along the way. Ask them simply and plainly, but offering enough context to understand what is being decided. An example never hurts. If you have multiple questions, ask them 1-3 at a time and always numbered... I need you to challenge my principles and answers, even to questions I've previously answered, if they contradict with my own output, research or demonstrable facts. I am not an expert in game design. I just have a vision and opinions, but I need help designing systems that are fun and engaging."

## The rules

1. **Step by step.** We follow the roadmap's order inside the current phase ([`roadmap.md`](roadmap.md)). Misa never has to hold the whole plan in his head; each round is small and stands on its own.
2. **One to three questions a round, numbered.** Numbers run on across rounds (Q1, Q2, Q3, then Q4...), so "4: yes" is never ambiguous. A question gets its number when it is asked, not when it is queued.
3. **Every question has the same shape** (template below): what is being decided in one line, why it matters in two or three sentences, the options each with an example, and the lead's recommendation with its reason. Plain words. No rule ids or jargon in the chat; those stay in the docs.
4. **Fewer, bigger questions.** Ask what changes the game. Details that follow from an answer, or that are technical, the lead decides and records (`CLAUDE.md`: ask Misa about feel and priorities, not implementation).
5. **Challenge.** Before asking and after every answer, the lead checks the answer against Misa's accepted goals and earlier answers, the research, and hard facts (simulation and live numbers, the read budget, how much art or content it needs). A conflict is said plainly, once, with the evidence, as a numbered question in the next round: keep the answer, or change it. This applies to answers given long ago too. The lead never overrides an answer silently and never drops one.
6. **Be brave.** Nothing in today's game is kept because it exists. Every existing system is judged on whether it serves the vision. The challenge works both ways: when the evidence says players love something (live numbers, feedback), the lead says so before it is scrapped.
7. **Remember the players, not the systems.** When a change removes something players earned, they keep an "I was there" memento (a title, a badge, a relic in the house). Since 2026-10-31 this is settled by the reset: the game resets when both reworks ship, and today's players and their creatures are recorded and become the lore's pioneering first settlers (Misa). It was first to be decided once at the migration (roadmap phase 6). Old systems are not kept alive to protect progress.
8. **Follow-ups are welcome.** An answer that raises new questions puts them at the head of the queue. Several rounds in a row on one topic are fine.
9. **A waiting round is asked once.** If Misa has not answered, the lead does other work that does not depend on it and does not repeat the questions (`CLAUDE.md`).
10. **Show numbers as pictures.** When a round or a report rests on numbers over time, show them as a few simple charts on the phone page, with the tables behind them (Misa, 2026-10-30: "those graphs were really interesting and I like that way of presenting information"). Charts are generated from the lab's data (`reader/charts.py`), never drawn by hand.

## The question template

What Misa sees in chat:

```
**Q4. Does a creature picked for the raid leave its post?**
Why it matters: (two or three plain sentences: what this decides and what it touches.)
- **A. It leaves.** (what that means) Example: (a concrete moment in the game.)
- **B. Its post waits.** (what that means) Example: ...
**I'd pick A**, because (one or two sentences, naming the goal, research or number it rests on).
```

A challenge looks the same, with a first line saying what it challenges: "You said X (round 2). The research / numbers say Y."

## Where things are kept

| What                                            | Where                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Every question, asked or queued, and its answer | [`questions.md`](questions.md) (the ledger)                                                  |
| Misa's decisions                                | `docs/design/decisions.md`, tagged "Valley", his words quoted                                |
| What a decision changes                         | the system docs in [`systems/`](systems/) and [`goals.md`](goals.md), statuses updated       |
| What happened each session                      | [`log.md`](log.md)                                                                           |
| The plan on Misa's phone                        | the "Valley Plan" artifact, rebuilt by `reader/build.py` after every round (link in the log) |

## A round, start to finish

1. **Prepare.** Pick the next one to three questions from the head of the queue whose dependencies are answered. Write each in full in the ledger (the template's fields), run the challenge check on the options, and mark it `asked (round N)`.
2. **Ask.** Send the round to Misa in chat. Rebuild and republish the phone page so its "Waiting on you" tile shows the round.
3. **Record.** When Misa answers: write each answer into its ledger entry (his words), a decision entry in `decisions.md`, and the changes in the system docs and goals. Run the challenge check on each answer; conflicts and new questions go to the head of the queue.
4. **Log and publish.** A `log.md` entry, the page rebuilt and republished, the docs committed and pushed.
5. **Next round**, in the same reply: one or two lines on what changed, then the next questions.
