import { orphanCandidates, seatOrphaned } from "./flagship";
import { type GameState, PLAYER_INDEX, type World } from "./types";

// The birthplace outlived (GDD v1.40, tech plan 2.27 step 1): when the anchor league folds after
// the win with the seat at home, a decision asks where the seat goes among up to three eligible
// leagues. Its answer is read back by `settleOrphanedSeat` (flagship.ts), which moves the seat at
// once and free. With no eligible league the seat waits dark at home and the card comes once one
// qualifies; a league re-formed at the anchor first keeps it home.

/** Offers the orphaned-seat card at End Turn's end, once per orphaning, when a league can take it. */
export function offerOrphanedSeat(state: GameState, world: World): GameState {
  if (state.outcome !== null || !seatOrphaned(state, world)) {
    // A league re-formed at home: an open offer has nothing left to settle.
    return state.flagship.orphan === null
      ? state
      : { ...state, flagship: { ...state.flagship, orphan: null } };
  }
  if (state.flagship.orphan !== null) return state;
  const card = world.events.cards.find((c) => c.trigger === "seatOrphaned");
  const candidates = orphanCandidates(state, world);
  const home = state.countries.find((c) => c.countryId === state.anchorCountryId);
  const fans = home?.fans[PLAYER_INDEX];
  if (!card || candidates.length === 0 || !home || !fans) return state;
  const events = state.events;
  return {
    ...state,
    flagship: { ...state.flagship, orphan: { quarter: state.quarter, candidates } },
    events: {
      ...events,
      nextId: events.nextId + 1,
      pending: [
        ...events.pending,
        {
          id: events.nextId,
          templateId: card.id,
          countryId: home.countryId,
          turn: state.turn,
          quarter: state.quarter,
          facts: {
            casual: fans.casual,
            hardcore: fans.hardcore,
            leagueTier: null,
            health: null,
            rivalId: null,
            season: null,
            star: null,
            tradition: null,
            deal: null,
            venue: null,
            hall: null,
            countermove: null,
            championship: null,
            legacy: null,
            stoppage: null,
            seat: { candidates },
          },
          resolution: null,
        },
      ],
    },
  };
}
