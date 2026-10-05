import { describe, expect, it } from "vitest";
import {
  createCampaign,
  cultureFactors,
  eventEffects,
  type GameState,
  PLAYER_INDEX,
  stepQuarter,
  traditionShelter,
  traditionWeights,
  type World,
} from "../src/sim";
import { withTradition } from "./culture-helpers";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Culture, first build (GDD v1.22): what traditions do.

const ANCHOR = "england";

/** Only one hardcore loss moves fans: turnover or poaching; no conversion, noise or rivals moving. */
function only(base: World, loss: "turnover" | "poaching"): World {
  return withConfig(base, (config) => {
    if (loss === "poaching") config.turnover.annualRate = 0;
    else config.poaching.rate = 0;
    config.turnover.rivalReplacement = 0;
    config.dynamics.noise = 0;
    config.dynamics.player = {
      casualConversionRate: 0,
      casualChurnRate: 0,
      casualDecayRate: 0,
      hardcoreConversionRate: 0,
    };
    config.dynamics.rival = { casualChurnRate: 0, hardcoreConversionRate: 0 };
    config.rivalAI.movesPerQuarter = 0;
    for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = 1e15;
  });
}

function start(w: World): GameState {
  const state = createCampaign(w, setupFor(1, ANCHOR));
  const index = countryIndex(w, ANCHOR);
  return {
    ...state,
    countries: state.countries.map((country, i) =>
      i !== index
        ? country
        : {
            ...country,
            fans: country.fans.map((f, s) =>
              s === PLAYER_INDEX ? { ...f, casual: 1_000_000, hardcore: 2_000_000 } : f,
            ),
          },
    ),
  };
}

/** Player hardcore fans lost in the anchor over a year. */
function yearLoss(state: GameState, w: World): number {
  const index = countryIndex(w, ANCHOR);
  let current = state;
  for (let q = 0; q < 4; q += 1) current = stepQuarter(current, w);
  const before = state.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
  return before - (current.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0);
}

describe("weight", () => {
  it("sums the strength held in a country, abroad at the follower share, capped", () => {
    const base = createCampaign(world, setupFor(1, ANCHOR));
    const one = withTradition(base, "derby", ANCHOR, {
      strength: 0.6,
      followers: [ANCHOR, "wales"],
    });
    const weights = traditionWeights(one, world);
    expect(weights[countryIndex(world, ANCHOR)]).toBeCloseTo(0.6);
    expect(weights[countryIndex(world, "wales")]).toBeCloseTo(
      0.6 * world.config.culture.reach.followerShare,
    );
    let many = base;
    for (let i = 0; i < 5; i += 1) many = withTradition(many, "venue", ANCHOR);
    expect(traditionWeights(many, world)[countryIndex(world, ANCHOR)]).toBe(
      world.config.culture.weightCap,
    );
    const lost = withTradition(base, "rite", ANCHOR, {
      strength: 0,
      lost: { turn: 1, quarter: 0, reason: "faded" },
    });
    expect(traditionWeights(lost, world)[countryIndex(world, ANCHOR)]).toBe(0);
  });
});

describe("stickiness", () => {
  it("at full weight cuts the player's generational turnover by turnoverCut", () => {
    const w = only(world, "turnover");
    const plain = start(w);
    const held = withTradition(withTradition(plain, "venue", ANCHOR), "derby", ANCHOR);
    const ratio = yearLoss(held, w) / yearLoss(plain, w);
    expect(ratio).toBeCloseTo(1 - w.config.culture.turnoverCut, 1);
    expect(traditionShelter(w.config.culture.weightCap, w).turnover).toBeCloseTo(
      1 - w.config.culture.turnoverCut,
    );
  });

  it("at full weight cuts rival poaching of the player's hardcore fans by poachCut", () => {
    const w = only(world, "poaching");
    const plain = start(w);
    const held = withTradition(withTradition(plain, "venue", ANCHOR), "derby", ANCHOR);
    const without = yearLoss(plain, w);
    expect(without).toBeGreaterThan(1000);
    expect(yearLoss(held, w) / without).toBeCloseTo(1 - w.config.culture.poachCut, 1);
  });
});

describe("famous venues", () => {
  it("draw pilgrims: more casual fans convert in the venue's country", () => {
    const w = withConfig(world, (config) => {
      config.dynamics.noise = 0;
    });
    const plain = createCampaign(w, setupFor(1, ANCHOR));
    const venue = withTradition(plain, "venue", ANCHOR);
    const index = countryIndex(w, ANCHOR);
    const casual = (s: GameState) =>
      stepQuarter(s, w).countries[index]?.fans[PLAYER_INDEX]?.casual ?? 0;
    expect(casual(venue)).toBeGreaterThan(casual(plain));
  });

  it("raise the champion moment's PP in their league's country", () => {
    const plain = createCampaign(world, setupFor(1, ANCHOR));
    const card = world.events.cards.find((c) => c.story === "champion");
    if (!card) throw new Error("no champion card");
    const event = {
      countryId: ANCHOR,
      facts: {
        casual: 0,
        hardcore: 0,
        leagueTier: "amateur" as const,
        health: null,
        rivalId: null,
        season: null,
        star: null,
        tradition: null,
      },
    };
    const pp = (s: GameState) => {
      const [first] = eventEffects(s, world, card, event, null);
      return first?.type === "pp" ? first.amount : 0;
    };
    const base = world.config.flagship.stories.championPP.amateur;
    expect(pp(plain)).toBe(base);
    expect(pp(withTradition(plain, "venue", ANCHOR))).toBeCloseTo(
      base * (1 + world.config.culture.championBonus),
    );
  });
});

describe("the Culture category", () => {
  it("nurtures by type: strength, protection and hold, and the fork's downside", () => {
    const none = cultureFactors(world, [], "derby");
    expect(none).toEqual({
      strength: 1,
      reach: { proximity: 1, language: 1 },
      protection: 1,
      hold: 1,
    });
    const derby = cultureFactors(world, ["derby-days"], "derby");
    expect(derby.strength).toBeCloseTo(1.6);
    expect(derby.hold).toBeCloseTo(1.2);
    expect(cultureFactors(world, ["derby-days"], "venue")).toEqual(none);
    const living = cultureFactors(world, ["supporters-trusts", "living-game"], "rite");
    expect(living.protection).toBeCloseTo(1 - 0.4 + 0.3);
    expect(living.reach).toEqual({ proximity: 1.5, language: 1.5 });
  });

  it("hold raises a tradition's weight: stickier fans, and harder betrayals", () => {
    const base = createCampaign(world, setupFor(1, ANCHOR));
    const held = withTradition(base, "derby", ANCHOR, { strength: 0.5 });
    const index = countryIndex(world, ANCHOR);
    expect(traditionWeights(held, world)[index]).toBeCloseTo(0.5);
    expect(traditionWeights({ ...held, growthNodes: ["derby-days"] }, world)[index]).toBeCloseTo(
      0.6,
    );
  });
});
