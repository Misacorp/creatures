# A returning raid boss, and measuring progress instead of kills

Research for Misa's question of 2026-10-30: should a boss the server failed return next week at full HP, and should raids measure damage done rather than kills? Decision: `docs/design/decisions/raids.md`, "A failed raid boss returns next week; raids measure HP removed".

Confidence: **confirmed** means an official or primary page was read; **secondary** means a wiki, news item or summary. No source tests this exact setup (a weekly co-op boss that repeats at full HP), so the design is a bet to measure in the simulator and in play.

## Psychology

- **Goal gradient** (Kivetz, Urminsky and Zheng 2006, Journal of Marketing Research 43:39-58; field and online data, secondary read): people put in more effort as a visible goal gets closer. It needs a visible goal; a goal that feels far off shows little effect. https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf
- **Endowed progress** (Nunes and Drèze 2006, Journal of Consumer Research 32(4); one field study, about 300 car-wash customers, secondary): a card that starts partly filled is completed more often. Supports showing last week's best as a starting line. https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/
- **Showing progress** (Cheema and Bagchi 2011, Journal of Marketing 75(2); lab, secondary): people watching a bar fill persisted more near the goal. After negative feedback, focusing on what is left helped more than focusing on what was done (Current Psychology 2020, abstract only). So after a failed week: "12% left", not "you got 88%".
- **Progress principle** (Amabile and Kramer 2011; diary study, 238 workers, correlational): small visible progress is the strongest motivator; setbacks hurt most. https://hbswk.hbs.edu/item/6685.html
- **Near misses** (Clark et al. 2009; Barton et al. 2017 review of 51 studies; contested): near misses raise motivation to keep playing, but the evidence comes from slot machines and is mixed. Not leaned on (and `progression.md` already says never to fake one).
- **Being stuck** (Maier and Seligman 2016, "Learned Helplessness at Fifty"): perceived control is the key variable; no game data on how many failures is too many. https://pmc.ncbi.nlm.nih.gov/articles/PMC4920136

## Games that repeat a boss or score damage

- **Clash of Clans, Capital raids** (confirmed): damage carries between clanmates' attacks within a raid weekend, progress shows as percent and stars, rewards follow what was destroyed. https://supercell.com/en/games/clashofclans/blog/game-updates/clan-capital-raids
- **Raid: Shadow Legends** (secondary): clan bosses are scored on damage; chests by damage thresholds, not kills. https://hellhades.com/hydra-clan-boss-guide/
- **WoW, Determination** (Patch 5.2, Raid Finder; secondary): +5% health, damage and healing per wipe on a boss, up to 10 stacks, cleared on a kill, to keep groups from quitting. https://warcraft.wiki.gg/wiki/Determination
- **WoW, Icecrown Citadel buff** (2010; secondary): a zone-wide buff from 5% rising about every 4 weeks to 30%, time-based catch-up. https://warcraft.wiki.gg/wiki/Hellscream%27s_Warsong
- **FFXIV, the Echo** (secondary): a stacking bonus after wipes in older trials (+10% per stack up to 50%; extreme +5% up to 25%). https://ffxiv.consolegameswiki.com/wiki/The_Echo
- **Destiny 2, Contest Mode** (Bungie press): a fixed handicap for 48 hours after launch, then normal difficulty. A time-based drop, not per failure.

Not verified, so not cited: boss carry-over in Marvel Strike Force, AFK Arena, Summoners War and Monster Hunter; any churn numbers from stuck raid groups; any study comparing a progress bar with pass/fail in a co-op game.

## What we took from it

- Measure and show the share of HP removed; a kill moves the rank.
- A returning boss shows last week's best on its HP bar.
- Relief against getting stuck exists in every precedent (a stacking boost or a time-based buff). We start without one (Misa declined "Resolve") and let the simulator show whether servers get stuck.
