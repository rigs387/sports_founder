import { fandomScore } from "./fandom";
import type { GameState, World } from "./types";

// Standings (GDD v1.35): the player's sport against the rival sports, in the world and in each
// country. Read from today's fans and the yearly records; presentation only.

/** One sport's standing in the world. */
export interface SportStanding {
  sportId: string;
  fandomScore: number;
  casual: number;
  hardcore: number;
  /** Countries where this sport leads by Fandom Score with fans of its own. */
  numberOne: number;
}

/** One sport's fans in one country. */
export interface CountrySportStanding {
  sportId: string;
  casual: number;
  hardcore: number;
  fandomScore: number;
}

export interface StandingsSnapshot {
  /** The player and the rival sports (the "other sports" bucket is not a sport), best first. */
  sports: SportStanding[];
  /** Each recorded year's world Fandom Score by sport, oldest first. */
  series: { year: number; scores: Record<string, number> }[];
}

/** The modeled sports' indexes in state order: the player and the rivals. */
function modeled(state: Pick<GameState, "sports">): number[] {
  return state.sports.flatMap((sport, i) => (sport.kind === "other" ? [] : [i]));
}

/** Every modeled sport's fans in one country, best first. */
export function countryStandings(
  state: Pick<GameState, "sports" | "countries">,
  world: World,
  index: number,
): CountrySportStanding[] {
  const { casualWeight } = world.config.fandomScore;
  const country = state.countries[index];
  return modeled(state)
    .map((i) => {
      const fans = country?.fans[i];
      const casual = fans?.casual ?? 0;
      const hardcore = fans?.hardcore ?? 0;
      return {
        sportId: state.sports[i]?.id ?? "",
        casual,
        hardcore,
        fandomScore: fandomScore(casual, hardcore, casualWeight),
      };
    })
    .sort((a, b) => b.fandomScore - a.fandomScore);
}

/** The sport leading a country, if any sport has fans there. */
export function leadingSport(
  state: Pick<GameState, "sports" | "countries">,
  world: World,
  index: number,
): string | null {
  const best = countryStandings(state, world, index)[0];
  return best && best.fandomScore > 0 ? best.sportId : null;
}

export function standingsSnapshot(
  state: Pick<GameState, "sports" | "countries" | "yearly">,
  world: World,
): StandingsSnapshot {
  const { casualWeight } = world.config.fandomScore;
  const indexes = modeled(state);
  const leaders = new Map<string, number>();
  state.countries.forEach((_, i) => {
    const lead = leadingSport(state, world, i);
    if (lead) leaders.set(lead, (leaders.get(lead) ?? 0) + 1);
  });
  const sports = indexes
    .map((i): SportStanding => {
      let casual = 0;
      let hardcore = 0;
      for (const country of state.countries) {
        casual += country.fans[i]?.casual ?? 0;
        hardcore += country.fans[i]?.hardcore ?? 0;
      }
      const sportId = state.sports[i]?.id ?? "";
      return {
        sportId,
        casual,
        hardcore,
        fandomScore: fandomScore(casual, hardcore, casualWeight),
        numberOne: leaders.get(sportId) ?? 0,
      };
    })
    .sort((a, b) => b.fandomScore - a.fandomScore);
  const stride = state.sports.length * 2;
  const series = state.yearly.map((record) => {
    const scores: Record<string, number> = {};
    for (const i of indexes) {
      let casual = 0;
      let hardcore = 0;
      for (let c = 0; c < state.countries.length; c += 1) {
        casual += record.fans[c * stride + i * 2] ?? 0;
        hardcore += record.fans[c * stride + i * 2 + 1] ?? 0;
      }
      scores[state.sports[i]?.id ?? ""] = fandomScore(casual, hardcore, casualWeight);
    }
    return { year: record.year, scores };
  });
  return { sports, series };
}
