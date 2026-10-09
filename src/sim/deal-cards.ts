import type { EventState } from "./events-state";
import { type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// Deals as news (GDD v1.28, v1.29). A broken deal is a big moment telling what the breach cost;
// a partner walking over a clause missed too often is a big moment telling which; a deal that ran
// its term is a minor toast. All are told from the landmark recorded at the time (the
// deal itself is gone by then) and take no moment slot: a breach must reach the player.

/** Offers the deal moments the recent landmarks call for, oldest fact first. */
export function offerDealCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
): EventState {
  const pending = [...events.pending];
  let nextId = events.nextId;
  for (const landmark of recent) {
    if (
      landmark.kind !== "dealBroken" &&
      landmark.kind !== "dealEnded" &&
      landmark.kind !== "dealWalked"
    )
      continue;
    const told =
      landmark.kind === "dealBroken"
        ? "broken"
        : landmark.kind === "dealWalked"
          ? "walked"
          : "ended";
    const card = world.events.cards.find((c) => c.deal === told);
    if (!card || state.ppTier < card.minTier) continue;
    const country = state.countries.find((c) => c.countryId === landmark.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!country || !fans) continue;
    pending.push({
      id: nextId++,
      templateId: card.id,
      countryId: country.countryId,
      turn: state.turn,
      // When the deal broke or ended (GDD v1.24).
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
        deal: {
          dealId: landmark.dealId,
          partnerId: landmark.partnerId,
          slot: landmark.slot,
          demand:
            landmark.kind === "dealBroken"
              ? landmark.demand
              : landmark.kind === "dealWalked"
                ? landmark.clause
                : null,
          penalty: landmark.kind === "dealBroken" ? landmark.penalty : 0,
        },
        venue: null,
        hall: null,
        countermove: null,
      },
      resolution: null,
    });
  }
  return { ...events, pending, nextId };
}
