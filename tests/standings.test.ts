import { describe, expect, it } from "vitest";
import { createCampaign, endTurn, type GameState, PLAYER_INDEX, snapshot } from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// Standings (GDD v1.35, topic 6): the player's sport against the rival sports.

describe("standings", () => {
  it("rank the modeled sports by world Fandom Score, count where each leads, and chart each year", () => {
    let state = createCampaign(world, setupFor(4, "brazil"));
    while (state.yearly.length < 2) state = endTurn(state, world);
    const view = snapshot(state, world);
    const ids = view.standings.sports.map((s) => s.sportId);
    expect([...ids].sort()).toEqual(["cricket", "player", "soccer"]);
    const scores = view.standings.sports.map((s) => s.fandomScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const leads = view.standings.sports.reduce((sum, s) => sum + s.numberOne, 0);
    expect(leads).toBe(view.countries.filter((c) => c.leaderSportId !== null).length);
    expect(view.standings.series.map((p) => p.year)).toEqual(state.yearly.map((y) => y.year));
    const player = view.sports.find((s) => s.sportId === "player");
    expect(view.standings.sports.find((s) => s.sportId === "player")?.fandomScore).toBeCloseTo(
      player?.fandomScore ?? 0,
    );
  });

  it("show every sport's fans and the player's rank in each country", () => {
    const base = createCampaign(world, setupFor(4, "brazil"));
    const i = countryIndex(world, "japan");
    const leading: GameState = {
      ...base,
      countries: base.countries.map((country, c) =>
        c === i
          ? {
              ...country,
              fans: country.fans.map((f, s) =>
                s === PLAYER_INDEX ? { ...f, casual: 1e9, hardcore: 1e9 } : f,
              ),
            }
          : country,
      ),
    };
    const japan = snapshot(leading, world).countries[i];
    expect(japan?.localRank).toBe(1);
    expect(japan?.leaderSportId).toBe("player");
    expect(japan?.sports.map((s) => s.sportId)[0]).toBe("player");
    expect(japan?.sports).toHaveLength(3);
  });
});
