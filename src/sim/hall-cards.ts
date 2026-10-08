import type { EventState } from "./events-state";
import { type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// The Hall of Fame as cards (GDD v1.31): one moment per class, told from the class recorded. It
// takes no moment slot and pays PP per inductee by wing and the flagship league's tier.

/** Offers a class card for each Hall of Fame class the recent landmarks record. */
export function offerHallCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
): EventState {
  const card = world.events.cards.find((c) => c.trigger === "hall");
  if (!card) return events;
  const pending = [...events.pending];
  let nextId = events.nextId;
  for (const landmark of recent) {
    if (landmark.kind !== "hallOfFameClass" || state.ppTier < card.minTier) continue;
    const inducteeIds = state.hallOfFame.inductees
      .filter((inductee) => inductee.season === landmark.season)
      .map((inductee) => inductee.id);
    const country = state.countries.find((c) => c.countryId === landmark.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!country || !fans || inducteeIds.length === 0) continue;
    pending.push({
      id: nextId++,
      templateId: card.id,
      countryId: country.countryId,
      turn: state.turn,
      // When the class was inducted: the season's end (GDD v1.24).
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
        hall: { season: landmark.season, inducteeIds },
      },
      resolution: null,
    });
  }
  return { ...events, pending, nextId };
}
