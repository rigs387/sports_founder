import type { CountryState, GameState, SportKind, World } from "./types";

export interface SportTotals {
  sportId: string;
  kind: SportKind;
  uninterested: number;
  casual: number;
  hardcore: number;
  fandomScore: number;
}

/** GDD Fandom Score: hardcore + casual × casual weight. */
export function fandomScore(casual: number, hardcore: number, casualWeight: number): number {
  return hardcore + casual * casualWeight;
}

/** World totals per sport, in GameState.sports order. */
export function sportTotals(
  state: Pick<GameState, "sports" | "countries">,
  world: World,
): SportTotals[] {
  const worldPopulation = world.countries.reduce((sum, country) => sum + country.population, 0);
  return state.sports.map((sport, index) => {
    let casual = 0;
    let hardcore = 0;
    for (const country of state.countries) {
      const fans = country.fans[index];
      if (!fans) continue;
      casual += fans.casual;
      hardcore += fans.hardcore;
    }
    return {
      sportId: sport.id,
      kind: sport.kind,
      uninterested: worldPopulation - casual - hardcore,
      casual,
      hardcore,
      fandomScore: fandomScore(casual, hardcore, world.config.fandomScore.casualWeight),
    };
  });
}

export function playerFandomScore(
  sports: GameState["sports"],
  countries: readonly CountryState[],
  casualWeight: number,
): number {
  const playerIndex = sports.findIndex((sport) => sport.kind === "player");
  let score = 0;
  for (const country of countries) {
    const fans = country.fans[playerIndex];
    if (fans) score += fandomScore(fans.casual, fans.hardcore, casualWeight);
  }
  return score;
}
