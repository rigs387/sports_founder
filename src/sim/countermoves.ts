import type { Config, CountryState, TimedCountermoveKind } from "./types";

// Effects of rival countermoves in effect in a country (GDD Rival AI). A countermove stored in a
// country's state is in effect for every quarter until its end quarter; the rival AI removes it
// after that (src/sim/rivals.ts). Every size is config. `effect` is the growth tree's countermove
// factor in that country (1 = full size; countermove resistance lowers it; src/sim/growth.ts).

type WithCountermoves = Pick<CountryState, "countermoves">;

/** Whether a countermove of this kind is in effect in the country, by any rival or by `sportId`. */
export function hasCountermove(
  country: WithCountermoves,
  kind: TimedCountermoveKind,
  sportId?: string,
): boolean {
  return country.countermoves.some(
    (move) => move.kind === kind && (sportId === undefined || move.sportId === sportId),
  );
}

/** An exclusive broadcast deal blocks the player's media reach spread channel into the country. */
export function mediaReachBlocked(country: WithCountermoves): boolean {
  return hasCountermove(country, "broadcastDeal");
}

/** A sponsor lockout lowers the player's league media and sponsor revenue in the country. */
export function mediaRevenueFactor(
  country: WithCountermoves,
  config: Config,
  effect: number,
): number {
  return hasCountermove(country, "sponsorLockout")
    ? 1 - config.rivalAI.countermoves.sponsorLockout.mediaRevenueCut * effect
    : 1;
}

/**
 * Multipliers on one rival's own conversion rates from its media blitz and youth programs, and on
 * the hardcore level it rebuilds toward (youth programs lift it above home while they run).
 */
export function rivalConversionBoosts(
  country: WithCountermoves,
  sportId: string,
  config: Config,
  effect: number,
): { casual: number; hardcore: number; homeLift: number } {
  const { mediaBlitz, youthPrograms } = config.rivalAI.countermoves;
  const youth = hasCountermove(country, "youthPrograms", sportId);
  return {
    homeLift: 1 + (youth ? youthPrograms.homeLift * effect : 0),
    casual:
      1 +
      (hasCountermove(country, "mediaBlitz", sportId)
        ? mediaBlitz.casualConversionBoost * effect
        : 0),
    hardcore: 1 + (youth ? youthPrograms.hardcoreConversionBoost * effect : 0),
  };
}
