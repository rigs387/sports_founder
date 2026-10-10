import type { EventRecord, EventState } from "./events-state";
import { type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// Traditions as cards (GDD v1.22). Every tradition born or lost is a moment, told from the facts
// recorded on the tradition itself, and so is a chant's first follower abroad (GDD v1.31, a
// toast in the country now singing it); each uses a moment slot. A birth pays PP by its type (config
// culture.birthPP); a loss pays nothing. Since GDD v1.35 national names outside the
// culture.nationalName.bigMarkets most populous markets are minor and take no slot, a curse's birth
// is its own pressure card, and a lifted curse is told by the redemption it becomes.

/** The card a tradition landmark is told with, or null for none (GDD v1.35). */
function traditionCard(world: World, landmark: Landmark): string | null {
  if (landmark.kind === "chantSpread") return "chant-spread";
  if (landmark.kind !== "traditionBorn" && landmark.kind !== "traditionLost") return null;
  const born = landmark.kind === "traditionBorn";
  if (landmark.type === "curse") {
    if (born) return "curse-born";
    return landmark.reason === "lifted" ? null : "tradition-lost";
  }
  if (landmark.type === "nationalName" && !bigMarket(world, landmark.countryId))
    return born ? "national-name-born" : "national-name-lost";
  return born ? "tradition-born" : "tradition-lost";
}

/** Whether a country is among the most populous markets whose national name is big news. */
function bigMarket(world: World, countryId: string): boolean {
  const country = world.countries.find((c) => c.id === countryId);
  if (!country) return false;
  const larger = world.countries.filter((c) => c.population > country.population).length;
  return larger < world.config.culture.nationalName.bigMarkets;
}

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
    if (
      landmark.kind !== "traditionBorn" &&
      landmark.kind !== "traditionLost" &&
      landmark.kind !== "chantSpread"
    )
      continue;
    const templateId = traditionCard(world, landmark);
    const card = world.events.cards.find((c) => c.id === templateId);
    if (!card || state.ppTier < card.minTier) continue;
    // Minor national names take no moment slot (GDD v1.35).
    if (!card.noSlot && left <= 0) continue;
    const country = state.countries.find((c) => c.countryId === landmark.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!country || !fans) continue;
    if (!card.noSlot) left -= 1;
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
        countermove: null,
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
