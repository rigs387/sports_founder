import type { EventState } from "./events-state";
import { type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// Venues as news (GDD v1.30). A level opening is a minor toast, and a big moment when it modernizes
// the grounds; a record crowd is a minor toast naming the ground it is credited to. All are told
// from the landmark recorded at the time and take no moment slot, as deal news does.

/** Offers the venue moments the recent landmarks call for, oldest fact first. */
export function offerVenueCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
): EventState {
  const pending = [...events.pending];
  let nextId = events.nextId;
  for (const landmark of recent) {
    if (landmark.kind !== "venueOpened" && landmark.kind !== "recordCrowd") continue;
    const told =
      landmark.kind === "recordCrowd" ? "record" : landmark.modernized ? "modernized" : "opened";
    const card = world.events.cards.find((c) => c.venue === told);
    if (!card || state.ppTier < card.minTier) continue;
    const country = state.countries.find((c) => c.countryId === landmark.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!country || !fans) continue;
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
        venue:
          landmark.kind === "recordCrowd"
            ? { level: landmark.level, crowd: landmark.crowd, clubId: landmark.clubId }
            : { level: landmark.level, crowd: null, clubId: null },
        hall: null,
      },
      resolution: null,
    });
  }
  return { ...events, pending, nextId };
}
