import { describe, expect, it } from "vitest";
import {
  applyAction,
  bulkPromotable,
  checkAction,
  closeOffseason,
  createCampaign,
  type GameState,
  type LeagueTierId,
  leagueActions,
  PLAYER_INDEX,
  snapshot,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// Market size ceilings (GDD v1.35, topic 1): a league's tier is capped by its country's
// population, except the league holding the seat, which steps down to its ceiling when it leaves.

const maxTier = (id: string) => world.derived[countryIndex(world, id)]?.maxTier;

/** Healthy leagues at a tier with plenty of hardcore fans in these countries, in the offseason. */
function withLeagues(
  base: GameState,
  leagues: Record<string, LeagueTierId>,
  hardcore = 2e6,
): GameState {
  const template = base.countries[countryIndex(world, base.anchorCountryId)]?.league;
  if (!template) throw new Error("No founding league");
  return {
    ...base,
    flagship: { ...base.flagship, offseason: true },
    countries: base.countries.map((country) => {
      const tier = leagues[country.countryId];
      return tier
        ? {
            ...country,
            league: { ...template, tier, health: "healthy", cash: 1e6 },
            fans: country.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, hardcore } : f)),
          }
        : country;
    }),
  };
}

describe("market size ceilings", () => {
  const austria = createCampaign(world, setupFor(31, "austria"));

  it("caps each market by population", () => {
    expect(maxTier("gibraltar")).toBe("amateur");
    expect(maxTier("iceland")).toBe("semi-pro");
    expect(maxTier("croatia")).toBe("professional");
    expect(maxTier("germany")).toBe("elite");
  });

  it("blocks promotion past the ceiling, keeps capped leagues out of bulk promotion and shows each one's flow", () => {
    const state = withLeagues(austria, {
      liechtenstein: "amateur",
      iceland: "semi-pro",
      hungary: "amateur",
    });
    const blocker = (id: string) =>
      leagueActions(state, world, countryIndex(world, id))?.promoteLeague.blocker;
    expect(blocker("liechtenstein")).toEqual({
      kind: "marketTooSmall",
      to: "semi-pro",
      maxTier: "amateur",
    });
    expect(blocker("iceland")?.kind).toBe("marketTooSmall");
    expect(checkAction(state, world, { type: "promoteLeague", countryId: "iceland" })).toMatch(
      /too small/,
    );
    expect(bulkPromotable(state, world, "semi-pro")).toEqual(["hungary"]);
    expect(bulkPromotable(state, world, "professional")).toEqual([]);
    const terms = leagueActions(state, world, countryIndex(world, "hungary"))?.promoteLeague.terms;
    expect(terms?.flowPerQuarter).toBeCloseTo(
      (terms?.revenuePerQuarter ?? 0) - (terms?.runningCostPerQuarter ?? 0),
    );
    // The ceiling shows all year, not only in the offseason.
    const closed = { ...state, flagship: { ...state.flagship, offseason: false } };
    expect(
      leagueActions(closed, world, countryIndex(world, "liechtenstein"))?.promoteLeague.blocker
        ?.kind,
    ).toBe("marketTooSmall");
    expect(snapshot(state, world).countries[countryIndex(world, "iceland")]?.maxTier).toBe(
      "semi-pro",
    );
  });

  const gibraltar = createCampaign(world, setupFor(32, "gibraltar"));

  it("lets the seat's league grow past its ceiling", () => {
    const state = withLeagues(gibraltar, { gibraltar: "amateur" }, 30_000);
    const index = countryIndex(world, "gibraltar");
    expect(leagueActions(state, world, index)?.promoteLeague.blocker).toBeNull();
    const promoted = applyAction(state, world, { type: "promoteLeague", countryId: "gibraltar" });
    expect(promoted.countries[index]?.league?.tier).toBe("semi-pro");
  });

  it("steps the old seat's league down to its ceiling when the seat leaves", () => {
    const state = withLeagues(gibraltar, { gibraltar: "elite", austria: "professional" }, 30_000);
    const moving = { ...state, flagship: { ...state.flagship, pendingCountryId: "austria" } };
    const index = countryIndex(world, "gibraltar");
    const next = closeOffseason(moving, world);
    expect(next.flagship.countryId).toBe("austria");
    expect(next.countries[index]?.league?.tier).toBe("amateur");
    const kept = (1 - world.config.leagues.stepDown.hardcoreDemotionShare) ** 3;
    const before = moving.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    const after = next.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    // The seat move's own purist cost comes first; the step-down keeps (1 − share)³ of the rest.
    expect(after).toBeLessThanOrEqual(Math.ceil(before * kept));
    expect(next.landmarks.at(-1)).toMatchObject({
      kind: "leagueSteppedDown",
      countryId: "gibraltar",
      from: "elite",
      to: "amateur",
    });
  });
});
