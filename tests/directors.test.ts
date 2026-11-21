import { describe, expect, it } from "vitest";
import {
  applyAction,
  createCampaign,
  directorFactors,
  directorIn,
  endTurn,
  type GameState,
  leagueCosts,
  leagueIncomePerQuarter,
  newLeague,
  syncDirectors,
  type World,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// League directors (GDD v1.40, tech plan 2.26 step 1): one anchor, a few direct calls, one turn.

const index = world.countries.findIndex((c) => c.id === "argentina");

/** A Brazil campaign with an Amateur league in Argentina and Argentina in the first focus slot. */
function withArgentina(): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const countries = state.countries.map((country, i) =>
    i === index
      ? {
          ...country,
          league: { ...newLeague(world, index, 0, 500, []), cash: 1e9 },
          fans: country.fans.map((fans, f) =>
            f === 0 ? { ...fans, casual: 20_000, hardcore: 2_000 } : fans,
          ),
        }
      : country,
  );
  return { ...state, countries, focus: ["argentina", ...state.focus.slice(1)] };
}

/** The world with every director given one trait (and a certain scandal, for scandal-prone). */
function onlyTrait(trait: string): World {
  const traits = world.config.directors.traits;
  const only = traits[trait];
  if (!only) throw new Error(`No trait ${trait}`);
  return {
    ...world,
    config: {
      ...world.config,
      directors: {
        ...world.config.directors,
        traits: { [trait]: only },
        scandal: { ...world.config.directors.scandal, chancePerYear: 1 },
      },
    },
  };
}

describe("league directors", () => {
  it("serve while focus holds, never at the seat, and their terms are kept", () => {
    const state = syncDirectors(withArgentina(), world);
    const director = directorIn(state, "argentina");
    expect(director?.tierOnArrival).toBe("amateur");
    // The anchor holds the seat and a focus slot: no director there.
    expect(directorIn(state, "brazil")).toBeUndefined();
    // Focus leaves: the term ends with no severance.
    const left = syncDirectors({ ...state, focus: state.focus.map(() => null) }, world);
    expect(left.directors.serving).toHaveLength(0);
    expect(left.directors.past).toMatchObject([{ id: director?.id, reason: "focus" }]);
    expect(left.countries[index]?.league?.cash).toBe(state.countries[index]?.league?.cash);
  });

  it("a trait bends its own league's income and costs, and the salary is a cost line", () => {
    const base = withArgentina();
    const showman = onlyTrait("showman");
    const state = syncDirectors(base, showman);
    const traits = showman.config.directors.traits.showman;
    expect(directorFactors(state, showman, "argentina").income).toBe(traits?.income);
    expect(leagueIncomePerQuarter(state, showman, index)).toBeCloseTo(
      leagueIncomePerQuarter(base, showman, index) * (traits?.income ?? 0),
    );
    const before = leagueCosts(base, showman, index);
    const after = leagueCosts(state, showman, index);
    expect(after.director).toBeGreaterThan(0);
    expect(after.operations).toBeCloseTo(before.operations * (traits?.runningCost ?? 0));
    expect(after.total).toBeCloseTo(after.operations + after.upkeep + after.director);
  });

  it("is replaced only in the offseason, for severance, once", () => {
    const state = syncDirectors(withArgentina(), world);
    const replace = { type: "replaceDirector", countryId: "argentina", candidate: 0 } as const;
    expect(() => applyAction(state, world, replace)).toThrow(/offseason/);
    const open = syncDirectors(
      { ...state, flagship: { ...state.flagship, offseason: true } },
      world,
    );
    const options = open.directors.candidates[0]?.options ?? [];
    expect(options).toHaveLength(world.config.directors.candidates);
    const replaced = applyAction(open, world, replace);
    const now = directorIn(replaced, "argentina");
    expect(now?.name).toBe(options[0]?.name);
    expect(replaced.directors.past.at(-1)?.reason).toBe("replaced");
    expect(replaced.countries[index]?.league?.cash).toBeLessThan(
      open.countries[index]?.league?.cash ?? 0,
    );
    // The league's candidates are spent until the next offseason.
    expect(() => applyAction(replaced, world, replace)).toThrow(/candidate/);
  });

  it("a scandal-prone director's scandal costs hardcore fans and is told by name", () => {
    const scandalous = onlyTrait("scandal-prone");
    const state = syncDirectors(withArgentina(), scandalous);
    const next = endTurn(state, scandalous);
    const scandal = next.landmarks.find((l) => l.kind === "directorScandal");
    expect(scandal).toMatchObject({ countryId: "argentina" });
    if (scandal?.kind !== "directorScandal") throw new Error("No scandal");
    expect(scandal.demoted).toBeGreaterThan(0);
    const card = next.events.pending.find((e) => e.templateId === "director-scandal");
    expect(card?.facts.director?.name).toBe(directorIn(state, "argentina")?.name);
  });
});
