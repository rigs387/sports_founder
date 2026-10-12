import { describe, expect, it } from "vitest";
import { updateCulture } from "../src/sim";
import { clubIds, fresh, ofType, withSeason, withTradition } from "./culture-helpers";
import { world } from "./helpers";

// Keeping traditions alive (GDD v1.36): echoes of a club's title and a heritage floor.

const keeping = world.config.culture.keeping;

describe("echoes", () => {
  it("a title by the tradition's club renews it at the echo weight, other clubs' titles do not", () => {
    const start = fresh();
    const [, a = 0, b = 0] = clubIds(start);
    const old = { clubIds: [a], strength: 0.4, renewedYear: -1, seasons: [] };
    const base = withTradition(start, "era", start.anchorCountryId, old);
    const won = updateCulture(withSeason(base, a, b), world);
    expect(ofType(won, "era")[0]?.strength).toBeCloseTo(
      0.4 + world.config.culture.renewal * keeping.echo.weight,
    );
    const other = updateCulture(withSeason(base, b, a), world);
    expect(ofType(other, "era")[0]?.strength).toBeLessThan(0.4);
  });

  it("a signature move lives on while any star plays at its club", () => {
    const start = fresh();
    const [, a = 0, b = 0] = clubIds(start);
    const base = withTradition(start, "signatureMove", start.anchorCountryId, {
      clubIds: [a],
      strength: 0.4,
      renewedYear: -1,
    });
    const season = base.flagship.season;
    const players = base.flagship.players.map((p) =>
      p.clubId === a
        ? {
            ...p,
            starSince: season,
            career: [
              ...p.career,
              {
                season,
                clubId: a,
                scores: 0,
                matches: 0,
                units: 0,
              } as unknown as (typeof p.career)[number],
            ],
          }
        : p,
    );
    const staffed = { ...base, flagship: { ...base.flagship, players } };
    const kept = updateCulture(withSeason(staffed, b, clubIds(start)[3] ?? 0), world);
    expect(ofType(kept, "signatureMove")[0]?.strength).toBeGreaterThan(0.4);
  });
});

describe("heritage", () => {
  const age = (years: number) => ({
    clubIds: [] as number[],
    strength: 0.3,
    renewedYear: 0,
    bornQuarter: -4 * years,
  });

  it("a tradition that has stood for years fades to the floor and stays, a young one is lost", () => {
    const start = fresh();
    const years = keeping.heritage.years;
    const old = withTradition(start, "era", start.anchorCountryId, age(years + 5));
    const young = withTradition(start, "era", start.anchorCountryId, age(2));
    const later = (state: typeof start) =>
      updateCulture({ ...state, quarter: state.quarter + 4 * 20 }, world);
    const kept = ofType(later(old), "era")[0];
    expect(kept?.lost).toBeNull();
    expect(kept?.strength).toBeCloseTo(keeping.heritage.floor);
    expect(ofType(later(young), "era")[0]?.lost?.reason).toBe("faded");
  });

  it("national names, curses and food still fade away", () => {
    const start = fresh();
    const old = withTradition(start, "nationalName", start.anchorCountryId, age(30));
    const gone = updateCulture({ ...old, quarter: old.quarter + 4 * 20 }, world);
    expect(ofType(gone, "nationalName")[0]?.lost?.reason).toBe("faded");
  });
});
