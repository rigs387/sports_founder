import type { Config, CountryState, SportState } from "./types";

// Hardcore poaching between sports (GDD Fan Model, v1.4: "Winning over rival hardcore fans is
// slow"). One rule both ways: where a sport is strong, a small share of another sport's hardcore
// fans in that country demote to casual about the sport they held. From there they can become
// hardcore about any sport through normal conversion.
//   - The player's sport pulls from every rival and from the "other sports" bucket.
//   - Each rival pulls from the player's sport. Rivals do not pull from each other (rival-vs-rival
//     competition is later), and "other" never pulls and never defends.
//   - A rival's escalation level in the country resists the player's pull ("rival defense slows the
//     pull further").
// Demotion rate per quarter for a held sport = rate × Σ over its pullers (strength × resistance),
// applied only to hardcore fans above the floor. Every number is config.

/** Pull strength of a sport holding `hardcoreShare` of a country's population. */
export function pullStrength(hardcoreShare: number, config: Config): number {
  const { referenceShare, maxStrength } = config.poaching;
  return Math.min(maxStrength, Math.max(0, hardcoreShare) / referenceShare);
}

/**
 * Per-quarter demotion rate of each sport's hardcore fans in a country, in fans order. Computed
 * from the start-of-quarter state.
 */
export function poachingRates(
  country: Pick<CountryState, "fans" | "defense">,
  sports: readonly SportState[],
  population: number,
  config: Config,
): number[] {
  const { rate, defenseResistance } = config.poaching;
  const strengths = country.fans.map((fans) => pullStrength(fans.hardcore / population, config));
  const playerIndex = sports.findIndex((sport) => sport.kind === "player");
  const playerStrength = strengths[playerIndex] ?? 0;
  return country.fans.map((_fans, index) => {
    const sport = sports[index];
    if (!sport) throw new Error(`No sport #${index}`);
    if (sport.kind === "player") {
      let pull = 0;
      sports.forEach((other, i) => {
        if (other.kind === "rival") pull += strengths[i] ?? 0;
      });
      return rate * pull;
    }
    if (sport.kind === "rival") {
      const level = country.defense.find((front) => front.sportId === sport.id)?.level ?? "none";
      return rate * playerStrength * defenseResistance[level];
    }
    return rate * playerStrength;
  });
}

/** Hardcore fans poaching may take from a sport in a country: everything above the floor. */
export function poachableHardcore(hardcore: number, population: number, config: Config): number {
  return Math.max(0, hardcore - Math.ceil(config.poaching.floorShare * population));
}
