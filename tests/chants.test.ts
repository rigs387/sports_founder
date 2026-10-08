import { describe, expect, it } from "vitest";
import {
  birthEase,
  type GameState,
  modernizeGrounds,
  PLAYER_INDEX,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason, withTradition } from "./culture-helpers";
import { countryIndex, withConfig, world } from "./helpers";

// Chants and anthems (GDD v1.31, tech plan 2.18 step 3).

/** The last recorded season rewritten: a clear title (no close finish) or an underdog one. */
function lastSeason(state: GameState, kind: "clear" | "underdog"): GameState {
  const seasons = [...state.flagship.seasons];
  const last = seasons.pop();
  if (!last) throw new Error("No season");
  const standings = last.standings.map((row, i) => ({ ...row, points: i === 0 ? 30 : 0 }));
  const startRatings =
    kind === "underdog"
      ? last.standings.map((row) => ({
          clubId: row.clubId,
          rating: row.clubId === last.championId ? 1 : 50,
        }))
      : last.startRatings;
  return {
    ...state,
    flagship: { ...state.flagship, seasons: [...seasons, { ...last, standings, startRatings }] },
  };
}

/** The rules with no league history needed for a first title's chant. */
const anyAge = withConfig(world, (c) => {
  c.culture.chant.historySeasons = 0;
});

/** A season with this champion, optionally rewritten, then culture's turn. */
function play(state: GameState, a: number, b: number, kind?: "clear" | "underdog", w = anyAge) {
  const recorded = withSeason(state, a, b);
  return updateCulture(kind ? lastSeason(recorded, kind) : recorded, w);
}

/** Every country's player hardcore fans at 1% of its people. */
function hardcoreEverywhere(state: GameState): GameState {
  return {
    ...state,
    countries: state.countries.map((country, i) => ({
      ...country,
      fans: country.fans.map((fans, f) =>
        f === PLAYER_INDEX
          ? { ...fans, hardcore: Math.round((world.countries[i]?.population ?? 0) * 0.01) }
          : fans,
      ),
    })),
  };
}

/** Culture's turn after `years` more in-game years. */
function yearsLater(state: GameState, years: number): GameState {
  return updateCulture({ ...state, quarter: state.quarter + 4 * years }, world);
}

describe("chants", () => {
  it("are born from a first title in a close finish or an underdog title; the first is the anthem", () => {
    const state = fresh();
    const [a = 0, b = 0, c = 0, d = 0] = clubIds(state).filter(
      (id) => id !== state.identity.foundingClubId,
    );
    const { startStrength, chant } = world.config.culture;
    const ease = birthEase(world, state.identity, "chant");

    // In a young league a first title, even in a close finish, founds no chant.
    expect(ofType(play(state, b, a, undefined, world), "chant")).toEqual([]);

    // A first title won clear of the field is no chant.
    let next = play(state, a, b, "clear");
    expect(ofType(next, "chant")).toEqual([]);
    // A first title in a close finish is: the anthem, stronger.
    next = play(next, b, a);
    const [anthem] = ofType(next, "chant");
    expect(anthem).toMatchObject({ clubIds: [b], countryId: state.flagship.countryId });
    expect(anthem?.strength).toBeCloseTo(startStrength * ease + chant.anthemBonus);
    expect(world.names.traditions.chants).toContain(anthem?.name);
    // An underdog title is, even when it is not the club's first.
    next = play(next, a, c, "underdog");
    const second = ofType(next, "chant").find((t) => t.clubIds[0] === a);
    expect(second?.strength).toBeCloseTo(startStrength * ease);
    // A title renews the club's chant; the club never holds two.
    next = play(next, b, d, "underdog");
    const renewed = ofType(next, "chant").filter((t) => t.clubIds[0] === b);
    expect(renewed).toHaveLength(1);
    expect(renewed[0]?.strength).toBeGreaterThan(anthem?.strength ?? 1);
  });

  it("spread with their fans without Culture nodes, up to the cap, with news only the first time", () => {
    const base = hardcoreEverywhere(fresh());
    const home = base.flagship.countryId;
    const state = withTradition(withTradition(base, "chant", home), "derby", home);
    const later = yearsLater(state, 40);
    const [chant] = ofType(later, "chant");
    const [derby] = ofType(later, "derby");
    expect(chant?.followers[0]).toBe(home);
    expect(chant?.followers).toHaveLength(world.config.culture.chant.maxFollowers);
    // Other traditions still spread only through nodes.
    expect(derby?.followers).toEqual([home]);
    const news = later.landmarks.filter((l) => l.kind === "chantSpread");
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ traditionId: chant?.id, countryId: chant?.followers[1] });
  });

  it("go quiet abroad where the player's hardcore fans have gone", () => {
    const base = fresh();
    const home = base.flagship.countryId;
    const abroad = world.countries.find((c) => c.id !== home)?.id ?? "";
    const state = withTradition(base, "chant", home, { followers: [home, abroad], strength: 0.3 });
    const [chant] = ofType(yearsLater(state, 1), "chant");
    expect(chant?.followers).toEqual([home]);
  });

  it("are betrayed by modernizing the grounds", () => {
    const base = fresh();
    const home = base.flagship.countryId;
    const state = withTradition(base, "chant", home);
    const modern = modernizeGrounds(state, world, countryIndex(world, home));
    const [chant] = ofType(modern, "chant");
    expect(chant?.strength).toBeCloseTo(1 - world.config.leagues.venue.modernize.traditionWear);
  });
});
