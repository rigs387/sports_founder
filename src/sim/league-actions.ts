import { offseasonOpen } from "./calendar";
import { leagueIncomePerQuarter } from "./deals";
import { leagueCosts } from "./league-costs";
import { bailoutTerms, leagueTierIndex, promotionTerms } from "./leagues";
import {
  type GameState,
  type HealthLevel,
  LEAGUE_TIERS,
  type LeagueTierId,
  PLAYER_INDEX,
  type World,
} from "./types";

export type LeagueActionKind = "promoteLeague" | "stepDownLeague" | "bailoutLeague";
export type LeagueActionBlocker =
  | { kind: "ended" }
  | { kind: "window" }
  | { kind: "topTier"; tier: LeagueTierId }
  | { kind: "hardcore"; to: LeagueTierId; needed: number; current: number }
  | { kind: "venue"; to: LeagueTierId; needed: number; current: number }
  | { kind: "unhealthy"; health: HealthLevel }
  | { kind: "notNearCollapse"; health: HealthLevel }
  | { kind: "bottomTier" }
  | { kind: "healthy" }
  | { kind: "cooldown"; readyQuarter: number; remainingQuarters: number }
  | { kind: "prestige"; cost: number; current: number };

export interface LeagueActions {
  promoteLeague: {
    blocker: LeagueActionBlocker | null;
    terms: {
      to: LeagueTierId;
      hardcoreNeeded: number;
      /** Cash investors put in when the league steps up (GDD v1.34). */
      investment: number;
      runningCostPerQuarter: number;
      /** Income a quarter at the new tier with today's fans and venue (GDD v1.30). */
      revenuePerQuarter: number;
    } | null;
  };
  stepDownLeague: {
    blocker: LeagueActionBlocker | null;
    terms: {
      to: LeagueTierId;
      hardcoreDemotionShare: number;
      hardcoreDemoted: number;
      runningCostPerQuarter: number;
    } | null;
  };
  bailoutLeague: {
    blocker: LeagueActionBlocker | null;
    terms: {
      ppCost: number;
      cash: number;
      cooldownQuarters: number;
      remainingCooldownQuarters: number;
    };
  };
}

/** Shared by action validation and snapshots: UI explanations cannot drift from legality. */
export function leagueActions(state: GameState, world: World, index: number): LeagueActions | null {
  const country = state.countries[index];
  const league = country?.league;
  if (!country || !league) return null;
  const hardcore = country.fans[PLAYER_INDEX]?.hardcore ?? 0;
  const promotion = promotionTerms(world, index, league.tier, state.growthNodes);
  const to = LEAGUE_TIERS[leagueTierIndex(league.tier) - 1];
  // At the seat, promotion needs the venue (GDD v1.30).
  const atSeat = world.countries[index]?.id === state.flagship.countryId;
  const levels: Partial<Record<LeagueTierId, number>> = world.config.leagues.venue.promotionLevel;
  const venueNeeded = atSeat && promotion ? (levels[promotion.to] ?? 1) : 1;
  const bailout = bailoutTerms(state, world, index);
  const remainingQuarters = Math.max(0, league.bailoutReadyQuarter - state.quarter);
  const ended: LeagueActionBlocker | null = state.outcome ? { kind: "ended" } : null;
  const promotionBlocker: LeagueActionBlocker | null =
    ended ??
    (!offseasonOpen(state)
      ? { kind: "window" }
      : !promotion
        ? { kind: "topTier", tier: league.tier }
        : hardcore < promotion.hardcoreNeeded
          ? {
              kind: "hardcore",
              to: promotion.to,
              needed: promotion.hardcoreNeeded,
              current: hardcore,
            }
          : venueNeeded > league.venue.level
            ? { kind: "venue", to: promotion.to, needed: venueNeeded, current: league.venue.level }
            : league.health !== "healthy"
              ? { kind: "unhealthy", health: league.health }
              : null);
  const stepDownBlocker: LeagueActionBlocker | null =
    ended ??
    (league.health !== "near-collapse"
      ? { kind: "notNearCollapse", health: league.health }
      : !to
        ? { kind: "bottomTier" }
        : null);
  const bailoutBlocker: LeagueActionBlocker | null =
    ended ??
    (league.health === "healthy"
      ? { kind: "healthy" }
      : remainingQuarters > 0
        ? { kind: "cooldown", readyQuarter: league.bailoutReadyQuarter, remainingQuarters }
        : state.pp < bailout.ppCost
          ? { kind: "prestige", cost: bailout.ppCost, current: state.pp }
          : null);
  return {
    promoteLeague: {
      blocker: promotionBlocker,
      terms: promotion
        ? {
            ...promotion,
            runningCostPerQuarter: leagueCosts(state, world, index, undefined, promotion.to).total,
            revenuePerQuarter: leagueIncomePerQuarter(state, world, index, undefined, promotion.to),
          }
        : null,
    },
    stepDownLeague: {
      blocker: stepDownBlocker,
      terms: to
        ? {
            to,
            hardcoreDemotionShare: world.config.leagues.stepDown.hardcoreDemotionShare,
            hardcoreDemoted: Math.floor(
              hardcore * world.config.leagues.stepDown.hardcoreDemotionShare,
            ),
            runningCostPerQuarter: leagueCosts(state, world, index, undefined, to).total,
          }
        : null,
    },
    bailoutLeague: {
      blocker: bailoutBlocker,
      terms: {
        ...bailout,
        cooldownQuarters: world.config.leagues.bailout.cooldownQuarters,
        remainingCooldownQuarters: remainingQuarters,
      },
    },
  };
}

/** Existing engine diagnostics. Player-facing translations use the structured blocker instead. */
export function leagueActionReason(blocker: LeagueActionBlocker | null): string | null {
  if (!blocker) return null;
  switch (blocker.kind) {
    case "ended":
      return "the campaign has ended";
    case "window":
      return "leagues can only be promoted in the offseason";
    case "topTier":
      return `the league is already ${blocker.tier}, the top tier`;
    case "hardcore":
      return `not enough hardcore fans for ${blocker.to}: needs ${blocker.needed}, has ${blocker.current}`;
    case "venue":
      return `${blocker.to} at the seat needs venue level ${blocker.needed}, it is ${blocker.current}`;
    case "unhealthy":
      return `investors back only a healthy league (it is ${blocker.health})`;
    case "notNearCollapse":
      return `a league can only step down at near-collapse (it is ${blocker.health})`;
    case "bottomTier":
      return "an amateur league cannot step down further";
    case "healthy":
      return "bailouts are only for leagues in trouble";
    case "cooldown":
      return `bailout cooldown: available again at quarter ${blocker.readyQuarter}`;
    case "prestige":
      return `not enough PP: a bailout costs ${blocker.cost.toFixed(1)}, you have ${blocker.current.toFixed(1)}`;
  }
}
