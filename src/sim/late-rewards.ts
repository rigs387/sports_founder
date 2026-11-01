import type { EventEffect } from "../content";
import { living, weighs } from "./culture";
import type { EventRecord, LateRewardKind } from "./events-state";
import { runningCostPerQuarter } from "./leagues";
import type { GameState, World } from "./types";

// Late card rewards by kind (GDD v1.39, decision 8a). From events.settings.lateRewards.fromTier a
// card's PP is noise against the sport's income, so a card that pays PP pays in what its story is
// about instead, by its family: season, business and star cards put cash into the flagship league,
// rival and sport cards into the league of the card's country, tradition cards and the Hall's class
// strengthen a tradition at home. No reward grows fans: measured, fans won locally (and a star's
// pull at the seat) fed the rivals' gain-keyed defense, and #1 was lost before the win far more
// often. The PP the cards stop paying becomes base income instead (lateRewards.incomeShare): taken
// away, it moved the contest too. A card whose kind has nothing to take its reward (no league, no
// tradition) pays nothing ("choose pain"). The reward is worked out from the state when the card
// is shown and again when it is collected.

/** Which news section a card belongs to (GDD v1.26): each family has its own look and reward. */
export type EventFamily = "season" | "star" | "tradition" | "hall" | "rival" | "business" | "sport";
export function eventFamily(event: Pick<EventRecord, "facts">): EventFamily {
  if (event.facts.hall) return "hall";
  if (event.facts.deal || event.facts.venue) return "business";
  if (event.facts.season) return "season";
  if (event.facts.star) return "star";
  if (event.facts.tradition) return "tradition";
  if (event.facts.rivalId) return "rival";
  return "sport";
}

/** Whether cards pay late rewards in place of PP at the current PP tier. */
export function lateRewardsOn(state: Pick<GameState, "ppTier">, world: World): boolean {
  return state.ppTier >= world.events.settings.lateRewards.fromTier;
}

/**
 * The base PP income factor (GDD v1.39): from the late tiers the PP cards stopped paying is paid
 * as income. Prices stay measured in income without it (`priceIncome`).
 */
export function lateIncomeFactor(state: Pick<GameState, "ppTier">, world: World): number {
  return lateRewardsOn(state, world) ? 1 + world.events.settings.lateRewards.incomeShare : 1;
}

/** The reward a card's PP becomes from the late tiers, or null when nothing can take it. */
export function lateReward(
  state: GameState,
  world: World,
  event: Pick<EventRecord, "facts" | "countryId">,
): EventEffect | null {
  switch (eventFamily(event)) {
    case "season":
    case "business":
    case "star":
      return leagueCash(state, world, state.flagship.countryId);
    case "tradition":
    case "hall":
      return traditionReward(state, world, event);
    default:
      return leagueCash(state, world, event.countryId);
  }
}

/** cashQuarters of a league's running cost into its cash; none without a league there. */
function leagueCash(state: GameState, world: World, countryId: string | null): EventEffect | null {
  const index = world.countries.findIndex((country) => country.id === countryId);
  const league = state.countries[index]?.league;
  const country = world.countries[index];
  if (!league || !country) return null;
  const quarters = world.events.settings.lateRewards.cashQuarters;
  const amount = quarters * runningCostPerQuarter(world, index, league.tier, state.growthNodes);
  return amount > 0 ? { type: "leagueCash", countryId: country.id, amount } : null;
}

/**
 * Strength for the card's own tradition if it lives and carries weight, else for the strongest
 * such tradition at home in the card's country (a Hall class's star legacies first). A tradition
 * at full strength takes nothing.
 */
function traditionReward(
  state: GameState,
  world: World,
  event: Pick<EventRecord, "facts" | "countryId">,
): EventEffect | null {
  const open = state.culture.traditions.filter(
    (t) => living(t) && weighs(t.type) && t.strength < 1,
  );
  const told = event.facts.tradition;
  const hall = event.facts.hall;
  const inducted = new Set(
    state.hallOfFame.inductees
      .filter((inductee) => hall?.inducteeIds.includes(inductee.id))
      .map((inductee) => inductee.playerId),
  );
  const honors = (t: (typeof open)[number]) =>
    t.type === "legacy" && t.playerId !== null && inducted.has(t.playerId) ? 1 : 0;
  const target =
    open.find((t) => t.id === told?.traditionId) ??
    open
      .filter((t) => t.countryId === event.countryId)
      .sort((a, b) => honors(b) - honors(a) || b.strength - a.strength || a.id - b.id)[0];
  if (!target) return null;
  const strength = Math.min(
    world.events.settings.lateRewards.traditionStrength,
    1 - target.strength,
  );
  return { type: "traditionWeight", traditionId: target.id, strength };
}

/** What a late reward delivered, for the record (cash in sim units, at the seat or elsewhere). */
export function rewardRecord(
  state: Pick<GameState, "flagship">,
  effects: readonly EventEffect[],
): { kind: LateRewardKind; amount: number } | null {
  for (const effect of effects) {
    if (effect.type === "leagueCash")
      return {
        kind: effect.countryId === state.flagship.countryId ? "seatCash" : "leagueCash",
        amount: effect.amount,
      };
    if (effect.type === "traditionWeight") return { kind: "tradition", amount: effect.strength };
  }
  return null;
}
