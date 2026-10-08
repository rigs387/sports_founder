import type { EventRecord, EventState } from "./events-state";
import { type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// Traditions as cards (GDD v1.22). Every tradition born or lost is a moment, told from the facts
// recorded on the tradition itself, and so is a chant's first follower abroad (GDD v1.31, a
// toast in the country now singing it); each uses a moment slot. A birth pays PP by its type (config
// culture.birthPP); a loss pays nothing.

/**
 * Offers the tradition moments the recent landmarks call for, within the moment slots left
 * (`room`), oldest fact first.
 */
export function offerTraditionCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
  room: number,
): EventState {
  const pending = [...events.pending];
  let nextId = events.nextId;
  let left = room;
  for (const landmark of recent) {
    if (left <= 0) break;
    if (
      landmark.kind !== "traditionBorn" &&
      landmark.kind !== "traditionLost" &&
      landmark.kind !== "chantSpread"
    )
      continue;
    const told =
      landmark.kind === "traditionBorn"
        ? "born"
        : landmark.kind === "traditionLost"
          ? "lost"
          : "spread";
    const card = world.events.cards.find((c) => c.tradition === told);
    if (!card || state.ppTier < card.minTier) continue;
    const country = state.countries.find((c) => c.countryId === landmark.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!country || !fans) continue;
    left -= 1;
    pending.push({
      id: nextId++,
      templateId: card.id,
      countryId: country.countryId,
      turn: state.turn,
      // When the tradition was born or lost (GDD v1.24).
      quarter: landmark.quarter,
      facts: {
        casual: fans.casual,
        hardcore: fans.hardcore,
        leagueTier: country.league?.tier ?? null,
        health: country.league?.health ?? null,
        rivalId: null,
        season: null,
        star: null,
        tradition: {
          traditionId: landmark.traditionId,
          type: landmark.kind === "chantSpread" ? "chant" : landmark.type,
        },
        deal: null,
        venue: null,
        hall: null,
      },
      resolution: null,
    });
  }
  return { ...events, pending, nextId };
}

/** A birth moment's PP by the tradition's type. */
export function birthPP(world: World, event: Pick<EventRecord, "facts">): number {
  const type = event.facts.tradition?.type;
  return type ? world.config.culture.birthPP[type] : 0;
}
