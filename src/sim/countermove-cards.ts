import { yearOfQuarter } from "./calendar";
import type { EventState } from "./events-state";
import { type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// A rival's countermove at the seat as news (GDD v1.34). A playtest lost its TV offers to a rival's
// broadcast deal twice without a word; now every timed countermove landing in the seat country is
// a big moment naming the rival, the move and when it ends. Told from the landmark recorded at the
// time; it takes no moment slot, as deal news does. Reclaim has its own card.

/** Offers the countermove moments the recent landmarks call for, oldest fact first. */
export function offerCountermoveCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
): EventState {
  const card = world.events.cards.find((c) => c.trigger === "countermove");
  if (!card || state.ppTier < card.minTier) return events;
  const pending = [...events.pending];
  let nextId = events.nextId;
  for (const landmark of recent) {
    if (landmark.kind !== "rivalCountermove" || landmark.move === "reclaim") continue;
    if (landmark.countryId !== state.flagship.countryId) continue;
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
        rivalId: landmark.sportId,
        season: null,
        star: null,
        tradition: null,
        deal: null,
        venue: null,
        hall: null,
        countermove: {
          move: landmark.move,
          endQuarter: landmark.endQuarter,
          endYear: yearOfQuarter(landmark.endQuarter, world.config),
        },
      },
      resolution: null,
    });
  }
  return { ...events, pending, nextId };
}
