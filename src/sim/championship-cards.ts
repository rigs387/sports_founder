import type { ChampionshipCard } from "../content";
import type { ChampionshipFacts, EventState } from "./events-state";
import {
  type ChampionshipTournament,
  type GameState,
  type Landmark,
  PLAYER_INDEX,
  type World,
} from "./types";
import { roundsWon, underdogs } from "./world-championship";

// The World Championship as news (GDD v1.37), told from the tournament on record. The champion
// is a headline from the champion's country; the seat country's run and an underdog's deep run
// are stories of their own when they are not the champion's. None takes a moment slot.

/** Who knocked a team out, or for the champion, whom it beat in the final. */
function opponentOf(tournament: ChampionshipTournament, countryId: string): string | null {
  const played = tournament.rounds.flatMap((round) =>
    round.filter((match) => match.a === countryId || match.b === countryId),
  );
  const last = played.at(-1);
  if (!last) return null;
  return last.a === countryId ? last.b : last.a;
}

function factsFor(
  tournament: ChampionshipTournament,
  countryId: string,
  number: number,
): ChampionshipFacts {
  return {
    season: tournament.season,
    year: tournament.year,
    number,
    hostId: tournament.hostId,
    roundsWon: roundsWon(tournament, countryId),
    rounds: tournament.rounds.length,
    opponentId: opponentOf(tournament, countryId),
    champion: tournament.championId === countryId,
  };
}

/** Offers the cards each tournament the recent landmarks record calls for. */
export function offerChampionshipCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
): EventState {
  const pending = [...events.pending];
  let nextId = events.nextId;
  const tournaments = state.worldChampionship.tournaments;
  for (const landmark of recent) {
    if (landmark.kind !== "championshipPlayed") continue;
    const index = tournaments.findIndex((entry) => entry.season === landmark.season);
    const tournament = tournaments[index];
    if (!tournament) continue;
    const inField = (id: string) => tournament.teams.some((team) => team.countryId === id);
    const seat = state.flagship.countryId;
    // The deepest underdog run that is neither the champion's nor the seat's own story.
    const surprise = underdogs(tournament, world)
      .filter((id) => id !== tournament.championId && id !== seat)
      .sort((a, b) => roundsWon(tournament, b) - roundsWon(tournament, a))[0];
    const told: [ChampionshipCard, string | undefined][] = [
      ["champion", tournament.championId],
      ["seatRun", inField(seat) && seat !== tournament.championId ? seat : undefined],
      ["underdog", surprise],
    ];
    for (const [kind, countryId] of told) {
      const card = world.events.cards.find((c) => c.championship === kind);
      const country = state.countries.find((c) => c.countryId === countryId);
      const fans = country?.fans[PLAYER_INDEX];
      if (!card || !country || !fans || state.ppTier < card.minTier) continue;
      pending.push({
        id: nextId++,
        templateId: card.id,
        countryId: country.countryId,
        turn: state.turn,
        quarter: landmark.quarter,
        facts: {
          casual: fans.casual,
          hardcore: fans.hardcore,
          leagueTier: country.league?.tier ?? null,
          health: country.league?.health ?? null,
          rivalId: null,
          season: null,
          star: null,
          tradition: null,
          deal: null,
          venue: null,
          hall: null,
          countermove: null,
          championship: factsFor(tournament, country.countryId, index + 1),
        },
        resolution: null,
      });
    }
  }
  return { ...events, pending, nextId };
}
