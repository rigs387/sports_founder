import type { Config, CountryState, TimedCountermoveKind } from "./types";

// Effects of rival countermoves in effect in a country (GDD Rival AI). A countermove stored in a
// country's state is in effect for every quarter until its end quarter; the rival AI removes it
// after that (src/sim/rivals.ts). Every size is config.

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
export function mediaRevenueFactor(country: WithCountermoves, config: Config): number {
  return hasCountermove(country, "sponsorLockout")
    ? 1 - config.rivalAI.countermoves.sponsorLockout.mediaRevenueCut
    : 1;
}

/** Multipliers on one rival's own conversion rates from its media blitz and youth programs. */
export function rivalConversionBoosts(
  country: WithCountermoves,
  sportId: string,
  config: Config,
): { casual: number; hardcore: number } {
  const { mediaBlitz, youthPrograms } = config.rivalAI.countermoves;
  return {
    casual:
      1 + (hasCountermove(country, "mediaBlitz", sportId) ? mediaBlitz.casualConversionBoost : 0),
    hardcore:
      1 +
      (hasCountermove(country, "youthPrograms", sportId)
        ? youthPrograms.hardcoreConversionBoost
        : 0),
  };
}
