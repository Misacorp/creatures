#!/bin/sh
# usage: tunetidal.sh <label>   (tunes slots 6 and 11 separately into the scratchpad)
S=/tmp/claude-0/-home-user-creatures/20e2220f-bc3c-594a-b8bc-5003bc0d47c8/scratchpad/tidal
L=$1
node scripts/report.mjs --tune --track --slots 6 --out $S/$L-6.md > $S/$L-6.log 2>&1
node scripts/report.mjs --tune --track --slots 11 --out $S/$L-11.md > $S/$L-11.log 2>&1
for s in 6 11; do
  echo "== $L slot $s"
  grep -E "^\| $s \|" $S/$L-$s.md | cut -c1-700
  grep -E "^- Slot $s" $S/$L-$s.md
  grep -E "^  $s: \{" $S/$L-$s.md
done
