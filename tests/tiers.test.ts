import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyDefaultSlotDrops,
  breadthProgress,
  checkAction,
  checkInvariants,
  createCampaign,
  endTurn,
  type GameState,
  PLAYER_INDEX,
  updateTierTrack,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// PP tier track promises (GDD Global PP Tier Track): tier-ups need the breadth condition, are
// telegraphed and then unavoidable; demotion needs a wide gap, sustained, outside the cooldown.

const ANCHOR = "valdoria";

function withAnchor(state: GameState, w: World, change: { hardcore?: number; tier?: string }) {
  const index = countryIndex(w, ANCHOR);
  return {
    ...state,
    countries: state.countries.map((country, i) => {
      if (i !== index) return country;
      return {
        ...country,
        fans: country.fans.map((sport, s) =>
          s === PLAYER_INDEX && change.hardcore !== undefined
            ? { ...sport, hardcore: change.hardcore }
            : sport,
        ),
        league:
          country.league && change.tier
            ? { ...country.league, tier: change.tier as never }
            : country.league,
      };
    }),
  };
}

/** Score thresholds out of the way so only breadth decides. */
const breadthOnly = withConfig(world, (config) => {
  for (const tier of config.ppTiers) tier.fandomScoreRequired = 0;
});

describe("tier-ups", () => {
  it("need the breadth condition, not the Fandom Score alone", () => {
    const state = createCampaign(breadthOnly, setupFor(1, ANCHOR));
    // Score threshold met (0), anchor league still Amateur: tier 2 needs Semi-Pro.
    expect(
      breadthProgress(state, breadthOnly, { type: "anchorLeagueTier", leagueTier: "semi-pro" }),
    ).toBe(0.5);
    const checked = updateTierTrack(state, breadthOnly);
    expect(checked.ppTier).toBe(1);
    expect(checked.tierTrack.pendingTierUp).toBeNull();
  });

  it("and the score: breadth alone is not enough either", () => {
    const scoreNeeded = withConfig(breadthOnly, (config) => {
      const tier2 = config.ppTiers[1];
      if (tier2) tier2.fandomScoreRequired = 1e12;
    });
    const state = withAnchor(createCampaign(scoreNeeded, setupFor(1, ANCHOR)), scoreNeeded, {
      tier: "semi-pro",
    });
    expect(updateTierTrack(state, scoreNeeded).tierTrack.pendingTierUp).toBeNull();
  });

  it("are announced telegraphTurns ahead, then happen even if the condition is lost", () => {
    const telegraph = breadthOnly.config.tierTrack.telegraphTurns;
    expect(telegraph).toBeGreaterThan(0);
    let state = withAnchor(createCampaign(breadthOnly, setupFor(1, ANCHOR)), breadthOnly, {
      tier: "semi-pro",
    });
    state = updateTierTrack(state, breadthOnly);
    expect(state.tierTrack.pendingTierUp).toEqual({ tier: 2, turnsLeft: telegraph });
    expect(state.ppTier).toBe(1);
    // The player drops the anchor back to Amateur to dodge it: the tier-up still comes.
    state = withAnchor(state, breadthOnly, { tier: "amateur" });
    for (let i = 0; i < telegraph; i += 1) {
      expect(state.ppTier).toBe(1);
      state = updateTierTrack({ ...state, turn: state.turn + 1 }, breadthOnly);
    }
    expect(state.ppTier).toBe(2);
    expect(state.tierTrack.pendingTierUp).toBeNull();
    expect(state.focus.length).toBe(breadthOnly.config.ppTiers[1]?.focusSlots);
    expect(state.landmarks.at(-1)).toMatchObject({ kind: "ppTierUp", from: 1, to: 2 });
    expect(checkInvariants(state, breadthOnly)).toEqual([]);
  });

  it("happen through endTurn in a real campaign once the anchor league goes Semi-Pro", () => {
    let state = withAnchor(createCampaign(breadthOnly, setupFor(2, ANCHOR)), breadthOnly, {
      tier: "semi-pro",
    });
    const turnsNeeded = breadthOnly.config.tierTrack.telegraphTurns + 1;
    for (let i = 0; i < turnsNeeded && state.outcome === null; i += 1) {
      state = endTurn(state, breadthOnly);
    }
    expect(state.ppTier).toBe(2);
  });
});

describe("demotion", () => {
  const settings = world.config.tierTrack;
  const index = countryIndex(world, ANCHOR);
  const population = world.countries[index]?.population ?? 1;
  const tier3 = world.config.ppTiers[2];
  const requiredShare = tier3?.breadth.type === "anchorHardcoreShare" ? tier3.breadth.share : 0;

  /** A tier-3 campaign whose score is comfortably above tier 3 and below tier 4. */
  function atTier3(hardcoreShare: number, lastChangeTurn: number | null): GameState {
    const base = createCampaign(world, setupFor(1, ANCHOR));
    const slots = world.config.ppTiers[2]?.focusSlots ?? 3;
    const state: GameState = {
      ...base,
      turn: 100,
      ppTier: 3,
      tierTrack: { ...base.tierTrack, peakTier: 3, lastChangeTurn },
      focus: [ANCHOR, "kestmark", "arvenne"].slice(0, slots),
    };
    // Enough casual fans elsewhere to keep the score above tier 3's threshold.
    const scoreFill = (tier3?.fandomScoreRequired ?? 0) * 2;
    return {
      ...withAnchor(state, world, { hardcore: Math.floor(hardcoreShare * population) }),
      countries: withAnchor(state, world, {
        hardcore: Math.floor(hardcoreShare * population),
      }).countries.map((country) =>
        country.countryId === "caldera"
          ? {
              ...country,
              fans: country.fans.map((sport, s) =>
                s === PLAYER_INDEX ? { ...sport, hardcore: Math.floor(scoreFill) } : sport,
              ),
            }
          : country,
      ),
    };
  }

  const turnOnce = (state: GameState) => updateTierTrack({ ...state, turn: state.turn + 1 }, world);

  it("does not threaten a tier whose breadth has only slipped a little", () => {
    let state = atTier3(requiredShare * (settings.demotionLine + 0.1), null);
    for (let i = 0; i < settings.demotionTurns * 2; i += 1) state = turnOnce(state);
    expect(state.ppTier).toBe(3);
    expect(state.tierTrack.turnsBelowLine).toBe(0);
  });

  it("needs the wide gap for demotionTurns consecutive turns, with a countdown", () => {
    let state = atTier3(requiredShare * (settings.demotionLine - 0.1), null);
    for (let i = 1; i < settings.demotionTurns; i += 1) {
      state = turnOnce(state);
      expect(state.ppTier).toBe(3);
      expect(state.tierTrack.turnsBelowLine).toBe(i);
    }
    state = turnOnce(state);
    expect(state.ppTier).toBe(2);
    expect(state.landmarks.at(-1)).toMatchObject({ kind: "ppTierDown", from: 3, to: 2 });
    // Costs stay at the peak tier; a slot is owed.
    expect(state.tierTrack.peakTier).toBe(3);
    expect(state.tierTrack.slotsToDrop).toBe(1);
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("a recovery turn resets the countdown", () => {
    let state = atTier3(requiredShare * (settings.demotionLine - 0.1), null);
    for (let i = 1; i < settings.demotionTurns; i += 1) state = turnOnce(state);
    state = withAnchor(state, world, { hardcore: Math.floor(requiredShare * population) });
    state = turnOnce(state);
    expect(state.tierTrack.turnsBelowLine).toBe(0);
    expect(state.ppTier).toBe(3);
  });

  it("respects the cooldown after a tier change", () => {
    let state = atTier3(requiredShare * 0.1, 100);
    for (let i = 1; i < settings.cooldownTurns; i += 1) {
      state = turnOnce(state);
      expect(state.tierTrack.turnsBelowLine, `turn ${i}`).toBe(0);
    }
    for (let i = 0; i < settings.demotionTurns + 1; i += 1) state = turnOnce(state);
    expect(state.ppTier).toBe(2);
  });

  it("the player chooses which slot to drop; otherwise the highest-numbered slot goes", () => {
    let state = atTier3(requiredShare * 0.1, null);
    for (let i = 0; i < settings.demotionTurns; i += 1) state = turnOnce(state);
    expect(state.tierTrack.slotsToDrop).toBe(1);

    const chosen = applyAction(state, world, { type: "dropFocusSlot", slot: 0 });
    expect(chosen.focus).toEqual(state.focus.slice(1));
    expect(chosen.tierTrack.slotsToDrop).toBe(0);
    expect(checkAction(chosen, world, { type: "dropFocusSlot", slot: 0 })).toMatch(/no focus slot/);

    const defaulted = applyDefaultSlotDrops(state);
    expect(defaulted.focus).toEqual(state.focus.slice(0, -1));
    expect(checkInvariants(defaulted, world)).toEqual([]);
  });
});
