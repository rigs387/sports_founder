import { offseasonOpen } from "./calendar";
import { seasonInterest, seatStars } from "./flagship";
import { landmarks } from "./records";
import { type Deal, type GameState, type Landmark, PLAYER_INDEX, type World } from "./types";

// Deal clauses (GDD v1.29): what partners want of the product, judged softly at each season's
// end. Competitive balance (TV): the season was no runaway or foregone league. A star
// (sponsors): a star plays at the seat. Fans (any partner): the seat country's fans are no fewer
// than at the last judgement. Met: a bonus to the seat's league and one more season met (a larger
// renewal edge, src/sim/deals.ts). Missed: one more miss in a row; enough and the partner walks,
// with the rest of the deal lost but no penalty and no shunning. Runs once an offseason, before
// its offers are made (src/sim/turn.ts), so a deal in its final season is judged before it ends.

/** Whether a deal's clause was met in the season just finished. */
function met(state: GameState, world: World, deal: Deal, fans: number): boolean {
  const { flagship } = state;
  switch (deal.demand?.kind) {
    case "balance": {
      const last = flagship.seasons.length - 1;
      return last < 0 || seasonInterest(flagship.seasons, last, world) !== "runaway";
    }
    case "star":
      return seatStars(flagship).length > 0;
    case "fans":
      return fans >= deal.fansMark;
    default:
      return true;
  }
}

const CLAUSE_KINDS: readonly string[] = ["balance", "star", "fans"];

/**
 * Judges every clause of a deal that paid in the season just finished, once an offseason (the
 * same offseason `offerDeals` then fills). Outside the offseason, or once its offers are made,
 * nothing changes.
 */
export function judgeClauses(state: GameState, world: World): GameState {
  const { flagship } = state;
  if (!offseasonOpen(state) || flagship.deals.offeredSeason === flagship.season) return state;
  const finished = flagship.season - 1;
  const settings = world.config.flagship.deals.clauses;
  const seat = world.countries.findIndex((country) => country.id === flagship.countryId);
  const country = state.countries[seat];
  const playerFans = country?.fans[PLAYER_INDEX];
  const fans = playerFans ? playerFans.casual + playerFans.hardcore : 0;
  let bonus = 0;
  const found: Landmark[] = [];
  const signed: Deal[] = [];
  for (const deal of flagship.deals.signed) {
    const judged =
      CLAUSE_KINDS.includes(deal.demand?.kind ?? "") &&
      deal.firstSeason <= finished &&
      deal.lastSeason >= finished;
    if (!judged) {
      signed.push(deal);
      continue;
    }
    if (met(state, world, deal, fans)) {
      bonus += settings.bonusShare * deal.annualValue;
      signed.push({ ...deal, clauseMet: deal.clauseMet + 1, clauseMisses: 0, fansMark: fans });
      continue;
    }
    const misses = deal.clauseMisses + 1;
    if (misses < settings.walkAfterMisses) {
      signed.push({ ...deal, clauseMisses: misses, fansMark: fans });
      continue;
    }
    // The partner walks: the rest of the deal is lost, no penalty, no shunning.
    found.push(
      landmarks.dealWalked(
        state.turn,
        state.quarter,
        deal.countryId,
        deal.id,
        deal.partnerId,
        deal.slot,
        deal.demand?.kind === "balance" || deal.demand?.kind === "star" ? deal.demand.kind : "fans",
      ),
    );
  }
  const countries = [...state.countries];
  const league = country?.league ?? null;
  if (country && league && bonus > 0) {
    countries[seat] = { ...country, league: { ...league, cash: league.cash + bonus } };
  }
  return {
    ...state,
    countries,
    flagship: { ...flagship, deals: { ...flagship.deals, signed } },
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
  };
}
