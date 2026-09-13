import { describe, expect, it } from "vitest";
import type { NodeEffect } from "../src/content";
import {
  type ActiveCountermove,
  applyAction,
  checkAction,
  checkInvariants,
  computeExposure,
  createCampaign,
  endTurn,
  focusCost,
  formationThreshold,
  type GameState,
  growthFactors,
  IllegalActionError,
  mediaRevenueFactor,
  nodeCost,
  PLAYER_INDEX,
  quarterPpIncome,
  runningCostPerQuarter,
  snapshot,
  stepQuarter,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, withWorld, world } from "./helpers";

// PP growth tree (GDD PP Growth Tree) tested through consequences: each effect type changes the
// quantity it names by the configured amount with everything else equal, conditions apply only
// where the attribute matches, and the buying rules (prerequisites, tier unlocks, forks, no
// refunds, cost multiplier) hold.

const TEST_NODE = "test-node";
const ANCHOR = "valdoria";
const RIVAL = "fieldball";

/** The shipped world with a one-node tree carrying exactly these effects. */
function treeWorld(effects: NodeEffect[], base: World = world): World {
  return withWorld(base, (content) => {
    content.growthTree = {
      categories: { grassroots: { unlockTier: 1 } },
      limits: { minFactor: 0.25 },
      forks: [],
      nodes: [{ id: TEST_NODE, category: "grassroots", cost: 10, requires: [], effects }],
    };
  });
}

const owning = (state: GameState): GameState => ({ ...state, growthNodes: [TEST_NODE] });

function withCountry(
  state: GameState,
  w: World,
  countryId: string,
  change: (country: GameState["countries"][number]) => GameState["countries"][number],
): GameState {
  const index = countryIndex(w, countryId);
  return {
    ...state,
    countries: state.countries.map((country, i) => (i === index ? change(country) : country)),
  };
}

function withPlayerFans(
  state: GameState,
  w: World,
  countryId: string,
  casual: number,
  hardcore: number,
): GameState {
  return withCountry(state, w, countryId, (country) => ({
    ...country,
    fans: country.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, casual, hardcore } : f)),
  }));
}

/** No noise and no rival, poaching, turnover or countermove activity; player flows as chosen. */
function quiet(w: World, keep: "casual" | "churn" | "hardcore" | "none"): World {
  return withConfig(w, (config) => {
    config.dynamics.noise = 0;
    config.dynamics.rival = {
      casualConversionRate: 0,
      casualChurnRate: 0,
      hardcoreConversionRate: 0,
    };
    const player = config.dynamics.player;
    if (keep !== "casual") player.casualConversionRate = 0;
    if (keep !== "churn") {
      player.casualChurnRate = 0;
      player.casualDecayRate = 0;
    }
    if (keep !== "hardcore") player.hardcoreConversionRate = 0;
    config.poaching.rate = 0;
    config.turnover.annualRate = 0;
    config.rivalAI.movesPerQuarter = 0;
  });
}

/** One quarter's change in a sport's fans in a country. */
function change(w: World, state: GameState, countryId: string, sportIndex = PLAYER_INDEX) {
  const index = countryIndex(w, countryId);
  const next = stepQuarter(state, w);
  const before = state.countries[index]?.fans[sportIndex];
  const after = next.countries[index]?.fans[sportIndex];
  if (!before || !after) throw new Error("fans missing");
  return { casual: after.casual - before.casual, hardcore: after.hardcore - before.hardcore };
}

describe("each growth node effect changes what it names by the configured amount", () => {
  it("spread channel: a proximity node raises inbound proximity exposure and nothing else", () => {
    const w = treeWorld([{ type: "spreadChannel", channel: "proximity", amount: 0.2 }]);
    const state = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, ANCHOR, 2e6, 2e5);
    const target = countryIndex(w, "kestmark");
    const plain = computeExposure(state, w)[target];
    const boosted = computeExposure(owning(state), w)[target];
    if (!plain || !boosted) throw new Error("no exposure");
    expect(plain.proximity).toBeGreaterThan(0);
    expect(boosted.proximity / plain.proximity).toBeCloseTo(1.2, 12);
    expect(boosted.language).toBe(plain.language);
    expect(boosted.media).toBe(plain.media);
    expect(boosted.local).toBe(plain.local);
  });

  it("spread channel: language and media nodes act on their own channel only", () => {
    const w = treeWorld([
      { type: "spreadChannel", channel: "language", amount: 0.3 },
      { type: "spreadChannel", channel: "media", amount: 0.5 },
    ]);
    const source = w.inbound.flatMap((links, target) =>
      links.filter((l) => l.media > 0 && l.language > 0).map((l) => ({ ...l, target })),
    )[0];
    if (!source) throw new Error("content has no link with both language and media reach");
    const sourceId = w.countries[source.source]?.id ?? "";
    const state = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, sourceId, 3e6, 3e5);
    const plain = computeExposure(state, w)[source.target];
    const boosted = computeExposure(owning(state), w)[source.target];
    if (!plain || !boosted) throw new Error("no exposure");
    expect(boosted.language / plain.language).toBeCloseTo(1.3, 12);
    expect(boosted.media / plain.media).toBeCloseTo(1.5, 12);
    expect(boosted.proximity).toBe(plain.proximity);
  });

  it("casual conversion: the player's uninterested → casual flow grows by the amount", () => {
    const w = quiet(treeWorld([{ type: "casualConversion", amount: 0.2 }]), "casual");
    const base = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, ANCHOR, 200_000, 20_000);
    const plain = change(w, base, ANCHOR);
    const boosted = change(w, owning(base), ANCHOR);
    expect(plain.casual).toBeGreaterThan(10_000);
    expect(boosted.casual / plain.casual).toBeCloseTo(1.2, 3);
    expect(boosted.hardcore).toBe(plain.hardcore);
  });

  it("hardcore conversion: the casual → hardcore flow grows by the amount", () => {
    const w = quiet(treeWorld([{ type: "hardcoreConversion", amount: 0.15 }]), "hardcore");
    const base = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, ANCHOR, 2e6, 20_000);
    const plain = change(w, base, ANCHOR);
    const boosted = change(w, owning(base), ANCHOR);
    expect(plain.hardcore).toBeGreaterThan(10_000);
    expect(boosted.hardcore / plain.hardcore).toBeCloseTo(1.15, 3);
  });

  it("churn reduction: casual churn and decay shrink by the amount; a negative amount raises them", () => {
    const cut = quiet(treeWorld([{ type: "churnReduction", amount: 0.25 }]), "churn");
    const base = withPlayerFans(createCampaign(cut, setupFor(1, ANCHOR)), cut, ANCHOR, 2e6, 1000);
    const plain = change(cut, base, ANCHOR).casual;
    expect(plain).toBeLessThan(-10_000);
    expect(change(cut, owning(base), ANCHOR).casual / plain).toBeCloseTo(0.75, 3);

    const raised = quiet(treeWorld([{ type: "churnReduction", amount: -0.1 }]), "churn");
    expect(change(raised, owning(base), ANCHOR).casual / plain).toBeCloseTo(1.1, 3);
  });

  it("formation threshold: the hardcore fans a league needs shrink by the amount", () => {
    const w = treeWorld([{ type: "formationThresholdReduction", amount: 0.3 }]);
    const index = countryIndex(w, "caldera");
    const plain = formationThreshold(w, index, []);
    expect(plain).toBeGreaterThan(10_000);
    expect(formationThreshold(w, index, [TEST_NODE])).toBe(Math.ceil(plain * 0.7));
  });

  it("formation threshold: a league forms earlier with the node, with everything else equal", () => {
    const w = quiet(treeWorld([{ type: "formationThresholdReduction", amount: 0.5 }]), "none");
    const index = countryIndex(w, "kestmark");
    const between = Math.ceil(formationThreshold(w, index, []) * 0.75);
    const state = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, "kestmark", 0, between);
    expect(stepQuarter(state, w).countries[index]?.league).toBeNull();
    expect(stepQuarter(owning(state), w).countries[index]?.league?.tier).toBe("amateur");
  });

  it("cold-launch cost: the premium above the exposed cost shrinks; an exposed push is unchanged", () => {
    const w = treeWorld([{ type: "coldLaunchCostReduction", amount: 0.5 }]);
    const state = createCampaign(w, setupFor(1, ANCHOR));
    const { coldLaunchCost, exposedCost } = w.config.focus;
    // Far-off Tavu Motu has only a trickle of exposure: its push is all but a cold launch.
    const plain = focusCost(state, w, "tavu-motu");
    expect(plain).toBeGreaterThan(coldLaunchCost * 0.99);
    expect(focusCost(owning(state), w, "tavu-motu")).toBeCloseTo(
      exposedCost + (plain - exposedCost) * 0.5,
      9,
    );
    // A country whose own fans fully expose it costs the exposed price: no premium to cut.
    const exposed = withPlayerFans(state, w, ANCHOR, 2e6, 2e5);
    expect(focusCost(exposed, w, ANCHOR)).toBe(exposedCost);
    expect(focusCost(owning(exposed), w, ANCHOR)).toBe(exposedCost);
  });

  it("PP income: income grows by the amount; a conditioned node is weighted by where the fans are", () => {
    const flat = treeWorld([{ type: "ppIncome", amount: 0.08 }]);
    const state = withPlayerFans(
      createCampaign(flat, setupFor(1, ANCHOR)),
      flat,
      "kambeza",
      1e6,
      1e5,
    );
    const plain = quarterPpIncome(state.countries, growthFactors(flat, []), flat.config);
    const boosted = quarterPpIncome(state.countries, growthFactors(flat, [TEST_NODE]), flat.config);
    expect(plain).toBeGreaterThan(0);
    expect(boosted / plain).toBeCloseTo(1.08, 12);

    // 0.05 + 0.1 × (2 × wealth − 1) is zero below wealth 0.25: the rich anchor's fans count, poor
    // Kambeza's do not.
    const rich = treeWorld([{ type: "ppIncome", amount: 0.05, conditions: { wealth: 0.1 } }]);
    const factors = growthFactors(rich, [TEST_NODE]);
    const casualWeight = rich.config.fandomScore.casualWeight;
    let score = 0;
    let weighted = 0;
    state.countries.forEach((country, i) => {
      const fans = country.fans[PLAYER_INDEX];
      const here = (fans?.hardcore ?? 0) + (fans?.casual ?? 0) * casualWeight;
      score += here;
      weighted += here * (factors[i]?.ppIncome ?? 1);
    });
    expect(quarterPpIncome(state.countries, factors, rich.config) / plain).toBeCloseTo(
      weighted / score,
      12,
    );
    expect(factors[countryIndex(rich, "kambeza")]?.ppIncome).toBe(1);
  });

  it("running cost: every tier's running cost shrinks by the amount, down to the floor", () => {
    const w = treeWorld([{ type: "runningCostReduction", amount: 0.2 }]);
    const index = countryIndex(w, ANCHOR);
    for (const tier of ["amateur", "semi-pro", "professional", "elite"] as const) {
      const plain = runningCostPerQuarter(w, index, tier, []);
      expect(runningCostPerQuarter(w, index, tier, [TEST_NODE]) / plain).toBeCloseTo(0.8, 12);
    }
    const stacked = treeWorld([
      { type: "runningCostReduction", amount: 0.9 },
      { type: "runningCostReduction", amount: 0.9 },
    ]);
    expect(
      runningCostPerQuarter(stacked, index, "elite", [TEST_NODE]) /
        runningCostPerQuarter(stacked, index, "elite", []),
    ).toBeCloseTo(stacked.growthTree.limits.minFactor, 12);
  });

  it("countermove resistance: a rival's media blitz boost there shrinks by the amount", () => {
    const w = withConfig(treeWorld([{ type: "countermoveResistance", amount: 0.4 }]), (config) => {
      config.dynamics.noise = 0;
      config.dynamics.rival.casualChurnRate = 0;
      config.dynamics.rival.hardcoreConversionRate = 0;
      config.poaching.rate = 0;
      config.turnover.annualRate = 0;
      config.rivalAI.movesPerQuarter = 0;
    });
    const rivalIndex = 1;
    const base = createCampaign(w, setupFor(1, ANCHOR));
    const blitz: ActiveCountermove = { kind: "mediaBlitz", sportId: RIVAL, endQuarter: 99 };
    const blitzed = withCountry(base, w, ANCHOR, (c) => ({ ...c, countermoves: [blitz] }));
    const plain = change(w, base, ANCHOR, rivalIndex).casual;
    const boost = w.config.rivalAI.countermoves.mediaBlitz.casualConversionBoost;
    expect(plain).toBeGreaterThan(10_000);
    expect(change(w, blitzed, ANCHOR, rivalIndex).casual / plain).toBeCloseTo(1 + boost, 3);
    expect(change(w, owning(blitzed), ANCHOR, rivalIndex).casual / plain).toBeCloseTo(
      1 + boost * 0.6,
      3,
    );
    // Without a countermove the node changes nothing for the rival.
    expect(change(w, owning(base), ANCHOR, rivalIndex)).toStrictEqual(
      change(w, base, ANCHOR, rivalIndex),
    );
  });

  it("countermove resistance: a sponsor lockout cuts less, and a broadcast deal leaves part of media reach open", () => {
    const w = treeWorld([{ type: "countermoveResistance", amount: 0.4 }]);
    const effect = growthFactors(w, [TEST_NODE])[0]?.countermoveEffect ?? 1;
    expect(effect).toBeCloseTo(0.6, 12);
    const lockout: ActiveCountermove = { kind: "sponsorLockout", sportId: RIVAL, endQuarter: 99 };
    const cut = w.config.rivalAI.countermoves.sponsorLockout.mediaRevenueCut;
    expect(mediaRevenueFactor({ countermoves: [lockout] }, w.config, effect)).toBeCloseTo(
      1 - cut * 0.6,
      12,
    );

    const targetIndex = w.inbound.findIndex((links) => links.some((l) => l.media > 0));
    const link = w.inbound[targetIndex]?.find((l) => l.media > 0);
    const source = w.countries[link?.source ?? -1]?.id;
    const dealIn = w.countries[targetIndex]?.id;
    if (!source || !dealIn) throw new Error("content has no media reach link");
    const base = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, source, 5e6, 5e5);
    const deal: ActiveCountermove = { kind: "broadcastDeal", sportId: RIVAL, endQuarter: 99 };
    const dealt = withCountry(base, w, dealIn, (c) => ({ ...c, countermoves: [deal] }));
    const open = computeExposure(base, w)[targetIndex]?.media ?? 0;
    expect(open).toBeGreaterThan(0);
    expect(computeExposure(dealt, w)[targetIndex]?.media).toBe(0);
    expect(computeExposure(owning(dealt), w)[targetIndex]?.media).toBeCloseTo(open * 0.4, 12);
  });
});

describe("conditions apply only where the country attribute matches", () => {
  it("a climate condition: the node acts in cold countries and nowhere else", () => {
    const w = treeWorld([
      {
        type: "spreadChannel",
        channel: "proximity",
        amount: 0.1,
        conditions: { climate: { temperate: -0.1, tropical: -0.1, arid: -0.1 } },
      },
    ]);
    const factors = growthFactors(w, [TEST_NODE]);
    w.countries.forEach((country, i) => {
      expect(factors[i]?.proximity, country.id).toBeCloseTo(
        country.climate === "cold" ? 1.1 : 1,
        12,
      );
    });
    // Measured on exposure: cold Kestmark gains, temperate Arvenne does not (both border the anchor).
    const state = withPlayerFans(createCampaign(w, setupFor(1, ANCHOR)), w, ANCHOR, 2e6, 2e5);
    for (const [id, expected] of [
      ["kestmark", 1.1],
      ["arvenne", 1],
    ] as const) {
      const i = countryIndex(w, id);
      const plain = computeExposure(state, w)[i]?.proximity ?? 0;
      expect(plain).toBeGreaterThan(0);
      expect((computeExposure(owning(state), w)[i]?.proximity ?? 0) / plain).toBeCloseTo(
        expected,
        12,
      );
    }
  });

  it("a numeric condition scales with the attribute, and never flips the effect's sign", () => {
    const w = treeWorld([
      { type: "runningCostReduction", amount: 0.1, conditions: { wealth: 0.1 } },
      { type: "casualConversion", amount: -0.1, conditions: { wealth: -0.3 } },
    ]);
    const factors = growthFactors(w, [TEST_NODE]);
    w.derived.forEach((attributes, i) => {
      const id = w.countries[i]?.id;
      // 0.1 + 0.1 × (2 × wealth − 1) = 0.2 × wealth
      expect(factors[i]?.runningCost, id).toBeCloseTo(1 - 0.2 * attributes.wealth, 12);
      // −0.1 − 0.3 × (2 × wealth − 1) = 0.2 − 0.6 × wealth, which may not turn into a bonus
      expect(factors[i]?.casualConversion, id).toBeCloseTo(
        1 + Math.min(0, 0.2 - 0.6 * attributes.wealth),
        12,
      );
    });
    const poor = w.derived.findIndex((a) => a.wealth < 1 / 3);
    const rich = w.derived.findIndex((a) => a.wealth > 0.6);
    expect(factors[poor]?.casualConversion).toBe(1);
    expect(factors[rich]?.casualConversion).toBeLessThan(1);
  });
});

describe("buying growth nodes", () => {
  const baseCost = (id: string) =>
    world.growthTree.nodes.find((node) => node.id === id)?.cost ?? Number.NaN;
  const start = createCampaign(world, setupFor(1));
  const rich: GameState = { ...start, pp: 100_000 };
  const buy = (state: GameState, nodeId: string) =>
    applyAction(state, world, { type: "buyNode", nodeId });
  const reason = (state: GameState, nodeId: string) =>
    checkAction(state, world, { type: "buyNode", nodeId });
  const atTier = (state: GameState, tier: number, peak = tier): GameState => ({
    ...state,
    ppTier: tier,
    tierTrack: { ...state.tierTrack, peakTier: peak },
  });

  it("a purchase deducts base cost × the multiplier, records a landmark, and stays valid", () => {
    const bought = buy(rich, "backyard-clinics");
    expect(bought.growthNodes).toStrictEqual(["backyard-clinics"]);
    expect(bought.pp).toBe(100_000 - baseCost("backyard-clinics"));
    expect(bought.landmarks.at(-1)).toStrictEqual({
      kind: "nodeBought",
      turn: 1,
      quarter: 0,
      nodeId: "backyard-clinics",
      cost: baseCost("backyard-clinics"),
    });
    expect(checkInvariants(bought, world)).toEqual([]);
  });

  it("prerequisites are enforced, naming every missing node", () => {
    expect(reason(rich, "word-of-mouth")).toBe('"word-of-mouth" needs "backyard-clinics" first');
    const clinics = buy(rich, "backyard-clinics");
    expect(reason(clinics, "community-ownership")).toBe(
      '"community-ownership" needs "fan-meetups" and "volunteer-organisers" first',
    );
    expect(reason(clinics, "word-of-mouth")).toBeNull();
    expect(() => buy(rich, "word-of-mouth")).toThrow(IllegalActionError);
  });

  it("Grassroots is open at tier 1; Media unlocks at tier 2", () => {
    expect(reason(rich, "backyard-clinics")).toBeNull();
    expect(reason(rich, "local-radio")).toBe("media nodes unlock at PP tier 2 (you are at tier 1)");
    expect(reason(atTier(rich, 2), "local-radio")).toBeNull();
  });

  it("a fork locks out the other side for good", () => {
    const street = buy(buy(rich, "backyard-clinics"), "street-courts");
    expect(reason(street, "club-grounds")).toBe(
      '"club-grounds" is locked out: "street-courts" was chosen in the where-to-play fork',
    );
    // Still locked many turns later.
    const later = endTurn(endTurn(street, world), world);
    expect(reason({ ...later, pp: 100_000 }, "club-grounds")).toMatch(/locked out/);
  });

  it("no refunds: an owned node cannot be bought again, and no action sells one", () => {
    const owned = buy(rich, "backyard-clinics");
    expect(reason(owned, "backyard-clinics")).toMatch(/already owned/);
    expect(
      checkAction(owned, world, { type: "sellNode", nodeId: "backyard-clinics" } as never),
    ).toMatch(/unknown action type/);
    expect(endTurn(owned, world).growthNodes).toStrictEqual(["backyard-clinics"]);
  });

  it("rejects an unknown node and a node the player cannot afford", () => {
    expect(reason(rich, "hall-of-fame")).toBe('unknown growth node "hall-of-fame"');
    const price = baseCost("backyard-clinics");
    expect(reason({ ...start, pp: price - 1 }, "backyard-clinics")).toBe(
      `not enough PP: costs ${price.toFixed(1)}, you have ${(price - 1).toFixed(1)}`,
    );
  });

  it("cost scales with the peak tier's multiplier, which stays after a demotion", () => {
    const multiplier = (tier: number) =>
      world.config.ppTiers.find((t) => t.tier === tier)?.costMultiplier ?? Number.NaN;
    expect(nodeCost(atTier(rich, 3), world, "local-radio")).toBe(
      baseCost("local-radio") * multiplier(3),
    );
    const demoted = atTier(rich, 2, 3);
    expect(nodeCost(demoted, world, "local-radio")).toBe(baseCost("local-radio") * multiplier(3));
    expect(multiplier(3)).toBeGreaterThan(multiplier(2));
  });

  it("buying before an announced tier-up is cheaper than after it", () => {
    const announced: GameState = {
      ...rich,
      tierTrack: { ...rich.tierTrack, pendingTierUp: { tier: 2, turnsLeft: 1 } },
    };
    const before = nodeCost(announced, world, "backyard-clinics");
    const next = endTurn(announced, world);
    expect(next.ppTier).toBe(2);
    const after = nodeCost(next, world, "backyard-clinics");
    expect(after).toBeGreaterThan(before);
    expect(after / before).toBe(
      (world.config.ppTiers[1]?.costMultiplier ?? 0) /
        (world.config.ppTiers[0]?.costMultiplier ?? 1),
    );
  });

  it("a demoted sport keeps its Media nodes but cannot buy more until it is back at tier 2", () => {
    const tier2 = buy(buy(atTier(rich, 2), "backyard-clinics"), "local-radio");
    const demoted = atTier(tier2, 1, 2);
    expect(demoted.growthNodes).toContain("local-radio");
    expect(reason(demoted, "newspaper-columns")).toMatch(/unlock at PP tier 2/);
    expect(reason(demoted, "word-of-mouth")).toBeNull();
  });

  it("the snapshot shows owned, available and locked nodes with prices and reasons", () => {
    const state = buy(buy(rich, "backyard-clinics"), "street-courts");
    const nodes = snapshot(state, world).growthNodes;
    const byId = (id: string) => nodes.find((node) => node.nodeId === id);
    expect(nodes.map((n) => n.nodeId)).toStrictEqual(world.growthTree.nodes.map((n) => n.id));
    expect(byId("street-courts")).toMatchObject({ status: "owned", lock: null });
    expect(byId("word-of-mouth")).toMatchObject({
      status: "available",
      cost: baseCost("word-of-mouth"),
      affordable: true,
      lock: null,
    });
    expect(byId("club-grounds")).toMatchObject({
      status: "locked",
      lock: { kind: "fork", forkId: "where-to-play", takenBy: "street-courts" },
      forkSiblings: ["street-courts"],
    });
    expect(byId("local-radio")).toMatchObject({
      status: "locked",
      cost: baseCost("local-radio"),
      lock: { kind: "tier", unlockTier: 2 },
    });
    expect(byId("fan-meetups")).toMatchObject({
      status: "locked",
      lock: { kind: "prerequisites", missing: ["word-of-mouth"] },
    });
    expect(
      snapshot({ ...state, pp: 1 }, world).growthNodes.find((n) => n.nodeId === "word-of-mouth"),
    ).toMatchObject({ status: "available", affordable: false });
  });
});
