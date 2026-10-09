import { describe, expect, it } from "vitest";
import {
  applyAction,
  bulkPromotable,
  checkAction,
  createCampaign,
  type GameState,
  PLAYER_INDEX,
  snapshot,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// Bulk promotion (GDD v1.34, topic G): every eligible league but the flagship, into one tier.

const seat = "austria";
const start = createCampaign(world, setupFor(27, seat));

/** Amateur leagues with plenty of hardcore fans in these countries, in the offseason. */
function withLeagues(ids: string[], offseason = true): GameState {
  const league = start.countries[countryIndex(world, seat)]?.league;
  if (!league) throw new Error("No founding league");
  return {
    ...start,
    flagship: { ...start.flagship, offseason },
    countries: start.countries.map((country) =>
      ids.includes(country.countryId)
        ? {
            ...country,
            league: { ...league, tier: "amateur", health: "healthy", cash: 1 },
            fans: country.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, hardcore: 2e6 } : f)),
          }
        : country,
    ),
  };
}

describe("bulk promotion", () => {
  const ids = [seat, "germany", "italy", "hungary"];

  it("promotes every eligible league into the tier, each funded as on its own, never the flagship", () => {
    const state = withLeagues(ids);
    const eligible = bulkPromotable(state, world, "semi-pro");
    expect(eligible.sort()).toEqual(["germany", "hungary", "italy"]);
    expect(snapshot(state, world).bulkPromotions).toEqual([
      { to: "semi-pro", countryIds: bulkPromotable(state, world, "semi-pro") },
    ]);
    const one = applyAction(state, world, { type: "promoteLeague", countryId: "italy" });
    const all = applyAction(state, world, { type: "promoteLeagues", to: "semi-pro" });
    for (const id of eligible) {
      const league = all.countries[countryIndex(world, id)]?.league;
      expect(league?.tier).toBe("semi-pro");
    }
    expect(all.countries[countryIndex(world, seat)]?.league?.tier).toBe("amateur");
    expect(all.countries[countryIndex(world, "italy")]?.league).toEqual(
      one.countries[countryIndex(world, "italy")]?.league,
    );
    expect(all.landmarks.filter((l) => l.kind === "leaguePromoted")).toHaveLength(3);
  });

  it("is refused outside the offseason and when nothing can step up", () => {
    const closed = withLeagues(ids, false);
    expect(checkAction(closed, world, { type: "promoteLeagues", to: "semi-pro" })).toMatch(
      /offseason/,
    );
    expect(snapshot(closed, world).bulkPromotions).toEqual([]);
    expect(checkAction(withLeagues(ids), world, { type: "promoteLeagues", to: "elite" })).toMatch(
      /no league can be promoted to elite/,
    );
  });
});
