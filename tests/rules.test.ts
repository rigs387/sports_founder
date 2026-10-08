import { describe, expect, it } from "vitest";
import {
  amendBlocker,
  amendmentJump,
  amendmentPrice,
  applyAction,
  backlashShares,
  backlashTotal,
  checkAction,
  checkInvariants,
  closeOffseason,
  costMultiplier,
  createCampaign,
  deserializeSave,
  type GameState,
  offseasonOpen,
  PLAYER_INDEX,
  serializeSave,
  snapshot,
  stepQuarter,
  type World,
} from "../src/sim";
import {
  crowdless,
  migratedCulture,
  migratedHall,
  setupFor,
  venueless,
  withConfig,
  world,
} from "./helpers";

// Rules evolution, first build (GDD v1.20, tech plan 2.9).

const content: World = withConfig(world, (config) => {
  config.start.startingPP = 100_000;
});

/** Brazil in the offseason after `years` years, with fans to lose. */
function inWindow(years: number): GameState {
  let state = createCampaign(content, setupFor(5, "brazil"));
  while (state.quarter < years * 4 || !offseasonOpen(state)) state = stepQuarter(state, content);
  return state;
}

/** Plays on `years` more years from `state` and stops in the next offseason. */
function inWindowFrom(start: GameState, years: number): GameState {
  let state = start;
  const until = start.quarter + years * 4;
  while (state.quarter < until || !offseasonOpen(state)) state = stepQuarter(state, content);
  return state;
}

const amend = (state: GameState, axis: "contact" | "structure" | "scoring", option: string) =>
  applyAction(state, content, { type: "amendRule", axis, option });

describe("an amendment's size and price", () => {
  it("counts steps between options, and a fixed jump for play structure", () => {
    expect(amendmentJump("contact", "none", "incidental", content)).toBe(1);
    expect(amendmentJump("contact", "none", "full", content)).toBe(2);
    expect(amendmentJump("structure", "continuous", "stop-start", content)).toBe(2);
    expect(amendmentJump("scoring", "low", "low", content)).toBe(0);
  });

  it("costs the base price × the peak tier's multiplier × the jump", () => {
    const state = inWindow(2);
    const price = amendmentPrice(state, content, 2);
    expect(price).toBe(
      content.config.rulesEvolution.basePrice * costMultiplier(state, content.config) * 2,
    );
  });
});

describe("when a rule can be amended", () => {
  it("only in the window, once a year, a rule trait, a new option, with the PP", () => {
    const state = inWindow(3);
    const other = state.genome.contact === "none" ? "full" : "none";
    expect(amendBlocker(state, content, "contact", other)).toBeNull();
    expect(amendBlocker(state, content, "surface", "ice")).toBe("identity");
    expect(amendBlocker(state, content, "contact", state.genome.contact)).toBe("same");
    expect(amendBlocker({ ...state, pp: 0 }, content, "contact", other)).toBe("pp");
    const amended = amend(state, "contact", other);
    const scoring = amended.genome.scoring === "low" ? "high" : "low";
    expect(amendBlocker(amended, content, "scoring", scoring)).toBe("thisYear");
    expect(
      checkAction(amended, content, { type: "amendRule", axis: "scoring", option: scoring }),
    ).toMatch(/already been amended this year/);
    let closed = amended;
    closed = closeOffseason(closed, content);
    expect(amendBlocker(closed, content, "scoring", scoring)).toBe("window");
    expect(
      checkAction(state, content, { type: "amendRule", axis: "contact", option: "slam" }),
    ).toMatch(/not an option/);
  });
});

describe("amending", () => {
  it("changes the genome, charges the price, records the amendment and its landmark", () => {
    const state = inWindow(10);
    const other = state.genome.contact === "none" ? "full" : "none";
    const jump = amendmentJump("contact", state.genome.contact, other, content);
    const preview = backlashTotal(state, content, "contact", other);
    const after = amend(state, "contact", other);
    expect(checkInvariants(after, content)).toEqual([]);
    expect(after.genome.contact).toBe(other);
    expect(after.pp).toBeCloseTo(state.pp - amendmentPrice(state, content, jump));
    expect(after.rules.amendments).toEqual([
      expect.objectContaining({
        axis: "contact",
        from: state.genome.contact,
        to: other,
        jump,
        demoted: preview,
      }),
    ]);
    expect(after.landmarks.at(-1)).toMatchObject({
      kind: "ruleAmended",
      axis: "contact",
      demoted: preview,
    });
    // Purists turn casual: hardcore falls by the preview, and nobody leaves the sport.
    const total = (s: GameState, key: "casual" | "hardcore") =>
      s.countries.reduce((sum, c) => sum + (c.fans[PLAYER_INDEX]?.[key] ?? 0), 0);
    expect(total(state, "hardcore") - total(after, "hardcore")).toBe(preview);
    expect(total(after, "casual") + total(after, "hardcore")).toBe(
      total(state, "casual") + total(state, "hardcore"),
    );
  });

  it("costs almost nothing in fans for a new rule and more as it ages, heavier in the anchor", () => {
    const young = inWindow(0);
    const old = inWindow(30);
    const option = old.genome.contact === "none" ? "full" : "none";
    const youngShares = backlashShares(young, content, "contact", option);
    const oldShares = backlashShares(old, content, "contact", option);
    // A rule a few months old draws a small fraction of a 30-year-old rule's backlash.
    expect(Math.max(...youngShares)).toBeLessThan(Math.max(...oldShares) / 20);
    const anchor = old.countries.findIndex((c) => c.countryId === "brazil");
    expect(oldShares[anchor] ?? 0).toBeGreaterThan(youngShares[anchor] ?? 0);
    const { backlash } = content.config.rulesEvolution;
    expect(Math.max(...oldShares)).toBeLessThanOrEqual(backlash.maxShare);
    // The anchor's share carries the anchor factor over its fit-adjusted base.
    const base = oldShares.filter((_, i) => i !== anchor);
    expect(oldShares[anchor] ?? 0).toBeGreaterThanOrEqual(
      Math.min(...base) * backlash.anchorFactor - 1e-12,
    );
  });

  it("remembers the founding rule: moving back costs less than moving further away", () => {
    // Medium team size can step to small or large; after one step, back is home and on is away.
    let state = inWindow(20);
    state = { ...state, genome: { ...state.genome, teamSize: "medium" } };
    state = applyAction(state, content, { type: "amendRule", axis: "teamSize", option: "small" });
    const later = inWindowFrom(state, 20);
    const home = backlashTotal(later, content, "teamSize", "medium");
    const away = backlashTotal(later, content, "teamSize", "large");
    // Large is two steps from small (twice the jump) and two from the founding rule; medium is home.
    expect(home).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(home * 4);
  });

  it("reaches the flagship at its next season, not mid-season", () => {
    let state = inWindow(4);
    const option = state.genome.scoring === "high" ? "low" : "high";
    const season = state.flagship.season;
    const before = state.flagship.scoring;
    state = applyAction(state, content, { type: "amendRule", axis: "scoring", option });
    expect(state.flagship.scoring).toBe(before);
    while (state.flagship.season === season) state = stepQuarter(state, content);
    expect(state.flagship.scoring).toBe(option);
  });
});

describe("the review and saves", () => {
  it("previews every other option of every rule trait with hints for the anchor and top markets", () => {
    const view = snapshot(inWindow(6), content).rules;
    expect(view.traits.map((t) => t.axis)).toEqual([
      "contact",
      "teamSize",
      "matchLength",
      "scoring",
      "complexity",
      "structure",
    ]);
    expect(view.previewMarkets[0]).toBe("brazil");
    expect(view.previewMarkets.length).toBeLessThanOrEqual(
      content.config.rulesEvolution.previewMarkets + 1,
    );
    for (const trait of view.traits) {
      expect(trait.options.some((o) => o.option === trait.option)).toBe(false);
      for (const option of trait.options)
        expect(option.hints).toHaveLength(view.previewMarkets.length);
    }
  });

  it("round-trips amendments and migrates a version 16 save with none", () => {
    const state = inWindow(5);
    const amended = amend(
      state,
      "structure",
      state.genome.structure === "innings" ? "continuous" : "innings",
    );
    expect(deserializeSave(serializeSave(amended), content)).toEqual(amended);
    const { rules: _r, ...v16 } = state;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 16, state: v16 }), content);
    expect(serializeSave(loaded)).toBe(
      serializeSave({
        ...state,
        countries: venueless(state),
        flagship: { ...state.flagship, seasons: crowdless(state.flagship.seasons) },
        culture: migratedCulture(state),
        hallOfFame: migratedHall(state),
      }),
    );
  });

  it("rejects a save whose genome disagrees with its last amendment", () => {
    const state = inWindow(5);
    const option = state.genome.contact === "none" ? "full" : "none";
    const amended = amend(state, "contact", option);
    const tampered = { ...amended, genome: { ...amended.genome, contact: state.genome.contact } };
    expect(() => deserializeSave(serializeSave(tampered), content)).toThrow(/last amended/);
  });
});
