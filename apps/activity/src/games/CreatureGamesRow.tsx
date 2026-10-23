import { useEffect, useState } from 'preact/hooks';
import { GlossaryTag } from '../Glossary';
import { hasMedals, recordText } from '../games-view';
import type { CreatureGames } from '../games-types';
import { DataTable } from '../ui/DataTable';
import { BadgeShelf, MedalCountsRow } from './GamesParts';

/**
 * A creature's Valley Games block on its page: its event badges (one per event it has won, with the
 * count; events never won are not shown), its medals and its best score per event. Nothing when it has
 * none of them.
 */
export function CreatureGamesView({ games }: { games: CreatureGames }) {
  if (!hasMedals(games.medals) && games.records.length === 0 && games.badges.length === 0) {
    return null;
  }
  return (
    <div class="cp-block cp-games">
      <h3 class="cp-title">
        <GlossaryTag entry="games">Valley Games</GlossaryTag>
      </h3>
      <BadgeShelf badges={games.badges} />
      {hasMedals(games.medals) && <MedalCountsRow medals={games.medals} hideZero />}
      {games.records.length > 0 && (
        <DataTable
          tabular
          rows={games.records.map((r) => ({ label: r.name, value: recordText(r) }))}
        />
      )}
    </div>
  );
}

/**
 * Loads a creature's Games medals, badges and records when its page opens (`load` is the request; a failure
 * shows nothing, the block is extra).
 */
export function CreatureGamesRow({
  creatureId,
  load,
}: {
  creatureId: string;
  load: (creatureId: string) => Promise<CreatureGames>;
}) {
  const [games, setGames] = useState<{ id: string; data: CreatureGames } | null>(null);
  useEffect(() => {
    let live = true;
    load(creatureId).then(
      (data) => {
        if (live) setGames({ id: creatureId, data });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [creatureId]);
  if (games === null || games.id !== creatureId) return null;
  return <CreatureGamesView games={games.data} />;
}
