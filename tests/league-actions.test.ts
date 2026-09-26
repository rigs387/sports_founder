import { describe, expect, it } from "vitest";
import {
  applyAction,
  checkAction,
  createCampaign,
  type GameState,
  LEAGUE_TIERS,
  type LeagueActionKind,
  type LeagueState,
  leagueActions,
  PLAYER_INDEX,
  promotionTerms,
  snapshot,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

const anchor = "austria";
const index = countryIndex(world, anchor);
const initial = createCampaign(world, setupFor(27, anchor));
const make = (league: Partial<LeagueState> = {}, pp = 10000, hardcore = 100000): GameState => ({
  ...initial,
  pp,
  quarter: world.config.seasonalWindow.quarterOfYear - 1,
  countries: initial.countries.map((country, i) =>
    i !== index
      ? country
      : {
          ...country,
          league: country.league ? { ...country.league, cash: 10000, ...league } : null,
          fans: country.fans.map((sport, j) =>
            j === PLAYER_INDEX ? { ...sport, hardcore } : sport,
          ),
        },
  ),
});
const view = (state: GameState) => snapshot(state, world).countries[index]?.league;
const action = (type: LeagueActionKind) => ({ type, countryId: anchor });

describe("league action quotes and eligibility", () => {
  it("matches legal actions across health, tier, season, and budget boundaries", () => {
    for (const tier of LEAGUE_TIERS)
      for (const health of ["healthy", "struggling", "near-collapse"] as const)
        for (const pp of [0, 10000])
          for (const quarter of [0, 2]) {
            const state = { ...make({ tier, health, cash: pp }), quarter };
            const options = view(state)?.actions;
            for (const kind of ["promoteLeague", "stepDownLeague", "bailoutLeague"] as const)
              expect(options?.[kind].blocker === null).toBe(
                checkAction(state, world, action(kind)) === null,
              );
          }
  });

  it("promotion quotes the exact cash deduction, reserve and subsequent running costs", () => {
    const terms = promotionTerms(world, index, "amateur", []);
    if (!terms) throw new Error("Missing promotion terms");
    const state = make({ cash: terms.reserveNeeded }, 0, terms.hardcoreNeeded);
    const offer = view(state)?.actions.promoteLeague;
    expect(offer?.blocker).toBeNull();
    const after = applyAction(state, world, action("promoteLeague"));
    expect(view(after)?.cash).toBeCloseTo(terms.reserveNeeded - (offer?.terms?.cost ?? 0), 8);
    expect(view(after)?.runningCostPerQuarter).toBe(offer?.terms?.runningCostPerQuarter);
    expect(after.pp).toBe(state.pp);
    expect(after.turn).toBe(state.turn);
    expect(
      view(make({ cash: terms.reserveNeeded - 0.01 }, 0, terms.hardcoreNeeded))?.actions
        .promoteLeague.blocker?.kind,
    ).toBe("reserve");
    expect(
      view(make({ cash: terms.reserveNeeded }, 0, terms.hardcoreNeeded - 1))?.actions.promoteLeague
        .blocker?.kind,
    ).toBe("hardcore");
  });

  it("restructuring quotes the actual fan demotion and keeps all money", () => {
    const state = make({ tier: "professional", health: "near-collapse" }, 50, 1234);
    const offer = view(state)?.actions.stepDownLeague;
    expect(offer?.blocker).toBeNull();
    const after = applyAction(state, world, action("stepDownLeague"));
    expect(after.countries[index]?.fans[PLAYER_INDEX]?.hardcore).toBe(
      1234 - (offer?.terms?.hardcoreDemoted ?? 0),
    );
    expect(after.countries[index]?.fans[PLAYER_INDEX]?.casual).toBe(
      (state.countries[index]?.fans[PLAYER_INDEX]?.casual ?? 0) +
        (offer?.terms?.hardcoreDemoted ?? 0),
    );
    expect(view(after)).toMatchObject({
      tier: offer?.terms?.to,
      cash: view(state)?.cash,
      health: "struggling",
      runningCostPerQuarter: offer?.terms?.runningCostPerQuarter,
    });
    expect(after.pp).toBe(state.pp);
    expect(view(after)?.actions.stepDownLeague.blocker?.kind).toBe("notNearCollapse");
  });

  it("bailout quotes match the transfer and cooldown without promising a health recovery", () => {
    const state = {
      ...make({ health: "struggling", cash: 1 }),
      tierTrack: { ...initial.tierTrack, peakTier: 2 },
    };
    const offer = view(state)?.actions.bailoutLeague;
    if (!offer) throw new Error("Missing bailout");
    expect(offer.blocker).toBeNull();
    const after = applyAction(state, world, action("bailoutLeague"));
    expect(after.pp).toBe(state.pp - offer.terms.ppCost);
    expect(view(after)?.cash).toBe(1 + offer.terms.cash);
    expect(view(after)?.health).toBe("struggling");
    expect(view(after)?.actions.bailoutLeague.blocker).toMatchObject({
      kind: "cooldown",
      remainingQuarters: offer.terms.cooldownQuarters,
    });
    expect(() => applyAction(after, world, action("bailoutLeague"))).toThrow("cooldown");
    expect(
      view({ ...after, quarter: after.quarter + offer.terms.cooldownQuarters })?.actions
        .bailoutLeague.blocker,
    ).toBeNull();
  });

  it("quotes no actions for a missing league and disables every action after game over", () => {
    const missing = {
      ...initial,
      countries: initial.countries.map((country, i) =>
        i === index ? { ...country, league: null } : country,
      ),
    };
    expect(leagueActions(missing, world, index)).toBeNull();
    const ended: GameState = {
      ...make({ health: "near-collapse", tier: "semi-pro" }),
      outcome: { kind: "anchorCollapse", countryId: anchor, turn: 1, quarter: 0 },
    };
    for (const offer of Object.values(view(ended)?.actions ?? {}))
      expect(offer.blocker?.kind).toBe("ended");
  });
});
