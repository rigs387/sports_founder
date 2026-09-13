import { describe, expect, it } from "vitest";
import {
  applyAction,
  CampaignOverError,
  checkAction,
  createCampaign,
  endTurn,
  formationThreshold,
  type GameState,
  HEALTH_LEVELS,
  type LeagueState,
  PLAYER_INDEX,
  runningCostPerQuarter,
  seasonalWindowOpen,
  stepLeagueQuarter,
  stepQuarter,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// League promises tested through their consequences (GDD League tiers, Business Layer, League
// Health Ladder, Loss condition).

const ANCHOR = "valdoria";
const OTHER = "kestmark";

/** A copy of `state` with one country's league and player fans replaced. */
function withCountry(
  state: GameState,
  w: World,
  countryId: string,
  change: { league?: Partial<LeagueState> | null; hardcore?: number; casual?: number },
): GameState {
  const index = countryIndex(w, countryId);
  const countries = state.countries.map((country, i) => {
    if (i !== index) return country;
    const fans = country.fans.map((sport, s) =>
      s === PLAYER_INDEX
        ? {
            ...sport,
            hardcore: change.hardcore ?? sport.hardcore,
            casual: change.casual ?? sport.casual,
          }
        : sport,
    );
    let league = country.league;
    if (change.league === null) league = null;
    else if (change.league) {
      league = {
        tier: "amateur",
        health: "healthy",
        cash: 0,
        lastFlowPerQuarter: null,
        hardcoreAtLastEval: fans[PLAYER_INDEX]?.hardcore ?? 0,
        formedQuarter: 0,
        bailoutReadyQuarter: 0,
        ...country.league,
        ...change.league,
      };
    }
    return { ...country, fans, league };
  });
  return { ...state, countries };
}

function leagueOf(state: GameState, w: World, countryId: string) {
  return state.countries[countryIndex(w, countryId)]?.league ?? null;
}

/** A world where nobody's fans move, so league money is the only thing changing. */
const frozenFans = withConfig(world, (config) => {
  config.dynamics.noise = 0;
  config.dynamics.player = {
    casualConversionRate: 0,
    casualChurnRate: 0,
    casualDecayRate: 0,
    hardcoreConversionRate: 0,
  };
  config.dynamics.rival = {
    casualConversionRate: 0,
    casualChurnRate: 0,
    hardcoreConversionRate: 0,
  };
  for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = 1e15;
});

/** Frozen fans with turn length set for tier 1. */
function frozenWithTurnLength(quarters: number): World {
  return withConfig(frozenFans, (config) => {
    const tier1 = config.ppTiers[0];
    if (tier1) tier1.turnLengthQuarters = quarters;
  });
}

describe("league formation", () => {
  const index = countryIndex(world, OTHER);
  const threshold = formationThreshold(world, index);
  const base = createCampaign(world, setupFor(1, ANCHOR));

  it("does not form one fan short of the threshold, and forms exactly at it", () => {
    const below = withCountry(base, world, OTHER, { hardcore: threshold - 1 });
    const at = withCountry(base, world, OTHER, { hardcore: threshold });
    const country = (s: GameState) => s.countries[index];
    const short = stepLeagueQuarter(country(below) as never, index, world, below, 1);
    const reached = stepLeagueQuarter(country(at) as never, index, world, at, 1);
    expect(short.country.league).toBeNull();
    expect(short.landmark).toBeNull();
    expect(reached.country.league?.tier).toBe("amateur");
    expect(reached.country.league?.cash).toBeCloseTo(
      world.config.leagues.formation.startingCashQuarters *
        runningCostPerQuarter(world, index, "amateur"),
      6,
    );
    expect(reached.landmark).toMatchObject({
      kind: "leagueFormed",
      countryId: OTHER,
      reformed: false,
    });
  });

  it("in a real campaign, every quarter a league exists exactly when it existed or hardcore crossed the threshold", () => {
    let state = createCampaign(world, setupFor(3, ANCHOR));
    let formedSomewhereElse = false;
    for (let q = 0; q < 160 && state.outcome === null; q += 1) {
      const next = stepQuarter(state, world);
      next.countries.forEach((country, i) => {
        const before = state.countries[i];
        const hardcore = country.fans[PLAYER_INDEX]?.hardcore ?? 0;
        const expected =
          before?.league !== null ||
          (hardcore >= formationThreshold(world, i) &&
            next.quarter >= (before?.formationReadyQuarter ?? 0));
        expect(country.league !== null, `${country.countryId} at quarter ${next.quarter}`).toBe(
          expected,
        );
        if (before?.league === null && country.league !== null) formedSomewhereElse = true;
      });
      state = next;
    }
    expect(formedSomewhereElse).toBe(true);
  });

  it("a folded league re-forms only after the cooldown, and records that it re-formed", () => {
    const folded = withCountry({ ...base, quarter: 10 }, world, OTHER, {
      league: null,
      hardcore: threshold * 2,
    });
    const country = {
      ...(folded.countries[index] as NonNullable<GameState["countries"][number]>),
      leaguesFolded: 1,
      formationReadyQuarter: 18,
    };
    expect(stepLeagueQuarter(country, index, world, folded, 17).country.league).toBeNull();
    const reformed = stepLeagueQuarter(country, index, world, folded, 18);
    expect(reformed.country.league).not.toBeNull();
    expect(reformed.landmark).toMatchObject({ kind: "leagueFormed", reformed: true });
  });
});

describe("League Health Ladder", () => {
  /** An anchor league that loses money every quarter: huge amateur costs, a little cash. */
  function sinking(quarters: number) {
    const w = withConfig(frozenWithTurnLength(quarters), (config) => {
      config.leagues.tiers.amateur.runningCost = 1000;
    });
    const start = createCampaign(w, setupFor(1, ANCHOR));
    const cost = runningCostPerQuarter(w, countryIndex(w, ANCHOR), "amateur");
    return { w, state: withCountry(start, w, ANCHOR, { league: { cash: cost * 30 } }) };
  }

  it.each([1, 2, 4])(
    "at %i-quarter turns: moves at most one rung per turn and collapses only after a full turn at Near-Collapse",
    (quarters) => {
      const { w, state } = sinking(quarters);
      const ladder = [...HEALTH_LEVELS];
      let current = state;
      const history: string[] = [leagueOf(current, w, ANCHOR)?.health ?? "gone"];
      for (let turn = 0; turn < 60 && current.outcome === null; turn += 1) {
        const before = leagueOf(current, w, ANCHOR)?.health;
        current = endTurn(current, w);
        const after = leagueOf(current, w, ANCHOR)?.health;
        history.push(after ?? "collapsed");
        if (after !== undefined && before !== undefined) {
          expect(Math.abs(ladder.indexOf(after) - ladder.indexOf(before))).toBeLessThanOrEqual(1);
        }
        if (current.outcome !== null) {
          expect(before, `collapse came from ${before}`).toBe("near-collapse");
          // The turn before the collapse turn ended at Near-Collapse too.
          expect(history[history.length - 2]).toBe("near-collapse");
        }
      }
      expect(current.outcome?.kind).toBe("anchorCollapse");
      expect(history[0]).toBe("healthy");
      expect(history.at(-1)).toBe("collapsed");
      expect(history).toContain("struggling");
      expect(history.indexOf("struggling")).toBeLessThan(history.indexOf("near-collapse"));
    },
  );

  it("each step down the ladder demotes hardcore fans to casual; none become uninterested", () => {
    const { w, state } = sinking(1);
    // Eight quarters of runway: inside the Struggling band, so the first evaluation steps down.
    const cost = runningCostPerQuarter(w, countryIndex(w, ANCHOR), "amateur");
    const withFans = withCountry(state, w, ANCHOR, {
      hardcore: 100_000,
      casual: 50_000,
      league: { cash: cost * 8 },
    });
    const after = endTurn(withFans, w);
    const fans = after.countries[countryIndex(w, ANCHOR)]?.fans[PLAYER_INDEX];
    expect(leagueOf(after, w, ANCHOR)?.health).toBe("struggling");
    expect(fans?.hardcore).toBeLessThan(100_000);
    expect((fans?.hardcore ?? 0) + (fans?.casual ?? 0)).toBe(150_000);
  });

  it("anchor collapse ends the campaign: no more turns or actions", () => {
    const { w, state } = sinking(1);
    let current = state;
    while (current.outcome === null) current = endTurn(current, w);
    expect(current.outcome).toMatchObject({ kind: "anchorCollapse", countryId: ANCHOR });
    expect(current.landmarks.at(-1)).toMatchObject({ kind: "anchorCollapse", countryId: ANCHOR });
    expect(() => endTurn(current, w)).toThrow(CampaignOverError);
    expect(checkAction(current, w, { type: "assignFocus", slot: 0, countryId: OTHER })).toMatch(
      /campaign has ended/,
    );
  });

  it("a non-anchor collapse folds that league, keeps its fans, and the campaign goes on", () => {
    const w = frozenWithTurnLength(1);
    const start = createCampaign(w, setupFor(1, ANCHOR));
    const rich = withCountry(start, w, ANCHOR, { league: { cash: 1e12 } });
    const doomed = withCountry(rich, w, OTHER, {
      hardcore: 20_000,
      casual: 80_000,
      league: { tier: "elite", cash: 0 },
    });
    let current = doomed;
    let turns = 0;
    while (leagueOf(current, w, OTHER) !== null && turns < 20) {
      current = endTurn(current, w);
      turns += 1;
    }
    const country = current.countries[countryIndex(w, OTHER)];
    expect(country?.league).toBeNull();
    expect(country?.leaguesFolded).toBe(1);
    expect(current.outcome).toBeNull();
    expect(current.landmarks.some((l) => l.kind === "leagueFolded" && l.countryId === OTHER)).toBe(
      true,
    );
    const fans = country?.fans[PLAYER_INDEX];
    expect((fans?.hardcore ?? 0) + (fans?.casual ?? 0)).toBe(100_000);
    expect(fans?.hardcore).toBeGreaterThan(0);
    expect(() => endTurn(current, w)).not.toThrow();
  });

  it("a professional league with slipping fans descends faster than an amateur one", () => {
    const slipping = withConfig(frozenWithTurnLength(1), (config) => {
      config.dynamics.player.casualChurnRate = 0.15;
    });
    const index = countryIndex(slipping, ANCHOR);
    const start = createCampaign(slipping, setupFor(1, ANCHOR));
    const cash = 40 * runningCostPerQuarter(slipping, index, "amateur");
    const fans = { hardcore: 4_000, casual: 200_000 };
    const amateur = withCountry(start, slipping, ANCHOR, {
      ...fans,
      league: { tier: "amateur", cash },
    });
    const pro = withCountry(start, slipping, ANCHOR, {
      ...fans,
      league: { tier: "professional", cash },
    });
    expect(runningCostPerQuarter(slipping, index, "professional")).toBeGreaterThan(
      runningCostPerQuarter(slipping, index, "amateur"),
    );

    const rung = (s: GameState) => {
      const league = leagueOf(s, slipping, ANCHOR);
      return league === null ? HEALTH_LEVELS.length : HEALTH_LEVELS.indexOf(league.health);
    };
    let a = amateur;
    let p = pro;
    let proAhead = false;
    for (let turn = 0; turn < 12; turn += 1) {
      if (a.outcome === null) a = endTurn(a, slipping);
      if (p.outcome === null) p = endTurn(p, slipping);
      expect(rung(p), `turn ${turn + 1}`).toBeGreaterThanOrEqual(rung(a));
      if (rung(p) > rung(a)) proAhead = true;
    }
    expect(proAhead).toBe(true);
  });
});

describe("league cash never produces PP", () => {
  it("a quarter with a rich league and a broke league earns identical PP and fans", () => {
    const start = createCampaign(world, setupFor(9, ANCHOR));
    const rich = withCountry(start, world, ANCHOR, { league: { cash: 1e12 } });
    const broke = withCountry(start, world, ANCHOR, { league: { cash: -1e6 } });
    const a = stepQuarter(rich, world);
    const b = stepQuarter(broke, world);
    expect(a.pp).toBe(b.pp);
    expect(a.countries.map((c) => c.fans)).toStrictEqual(b.countries.map((c) => c.fans));
    expect(leagueOf(a, world, ANCHOR)?.cash).not.toBe(leagueOf(b, world, ANCHOR)?.cash);
  });

  it("whole turns with different but healthy cash earn identical PP", () => {
    const start = createCampaign(world, setupFor(9, ANCHOR));
    let a = withCountry(start, world, ANCHOR, { league: { cash: 1e9 } });
    let b = withCountry(start, world, ANCHOR, { league: { cash: 1e12 } });
    for (let i = 0; i < 12; i += 1) {
      a = endTurn(a, world);
      b = endTurn(b, world);
    }
    expect(a.pp).toBe(b.pp);
  });
});

describe("league actions are validated", () => {
  const index = countryIndex(world, ANCHOR);
  const population = world.countries[index]?.population ?? 0;
  const start = createCampaign(world, setupFor(1, ANCHOR));
  const promotion = world.config.leagues.tiers["semi-pro"].promotion;
  const semiCost = runningCostPerQuarter(world, index, "semi-pro");
  const qualified = withCountry(start, world, ANCHOR, {
    hardcore: Math.ceil((promotion?.hardcoreShare ?? 0) * population) + 10,
    league: { cash: (promotion?.reserveQuarters ?? 0) * semiCost + 1 },
  });
  const inWindow = (s: GameState): GameState => {
    let q = s.quarter;
    while (!seasonalWindowOpen({ quarter: q, ppTier: s.ppTier }, world.config)) q += 1;
    return { ...s, quarter: q };
  };
  const outOfWindow = (s: GameState): GameState => {
    let q = s.quarter;
    while (seasonalWindowOpen({ quarter: q, ppTier: s.ppTier }, world.config)) q += 1;
    return { ...s, quarter: q };
  };
  const promote = { type: "promoteLeague" as const, countryId: ANCHOR };

  it("promotion is legal for a qualifying league in the window, and pays its cost", () => {
    const state = inWindow(qualified);
    expect(checkAction(state, world, promote)).toBeNull();
    const promoted = applyAction(state, world, promote);
    expect(leagueOf(promoted, world, ANCHOR)?.tier).toBe("semi-pro");
    expect(leagueOf(promoted, world, ANCHOR)?.cash).toBeCloseTo(
      (leagueOf(state, world, ANCHOR)?.cash ?? 0) - (promotion?.costQuarters ?? 0) * semiCost,
      6,
    );
    expect(promoted.landmarks.at(-1)).toMatchObject({
      kind: "leaguePromoted",
      from: "amateur",
      to: "semi-pro",
    });
  });

  it("promotion outside the seasonal window is rejected", () => {
    expect(checkAction(outOfWindow(qualified), world, promote)).toMatch(/seasonal window/);
  });

  it("promotion below the hardcore or cash thresholds is rejected", () => {
    const fewFans = withCountry(inWindow(qualified), world, ANCHOR, { hardcore: 10 });
    expect(checkAction(fewFans, world, promote)).toMatch(/not enough hardcore fans/);
    const noCash = withCountry(inWindow(qualified), world, ANCHOR, { league: { cash: 1 } });
    expect(checkAction(noCash, world, promote)).toMatch(/not enough cash reserve/);
  });

  it("step-down is rejected above Near-Collapse and for an amateur league", () => {
    const step = { type: "stepDownLeague" as const, countryId: ANCHOR };
    const struggling = withCountry(start, world, ANCHOR, {
      league: { tier: "semi-pro", health: "struggling" },
    });
    expect(checkAction(struggling, world, step)).toMatch(/only step down at near-collapse/);
    const amateur = withCountry(start, world, ANCHOR, { league: { health: "near-collapse" } });
    expect(checkAction(amateur, world, step)).toMatch(/amateur league cannot step down/);
    const legal = withCountry(start, world, ANCHOR, {
      hardcore: 1000,
      league: { tier: "professional", health: "near-collapse" },
    });
    const after = applyAction(legal, world, step);
    expect(leagueOf(after, world, ANCHOR)).toMatchObject({
      tier: "semi-pro",
      health: "struggling",
    });
    expect(after.countries[index]?.fans[PLAYER_INDEX]?.hardcore).toBeLessThan(1000);
  });

  it("bailouts are rejected for healthy leagues, without PP, and during the cooldown", () => {
    const bailout = { type: "bailoutLeague" as const, countryId: ANCHOR };
    expect(checkAction(start, world, bailout)).toMatch(/only for leagues in trouble/);
    const trouble = withCountry({ ...start, pp: 10_000 }, world, ANCHOR, {
      league: { health: "struggling", cash: 1 },
    });
    expect(checkAction({ ...trouble, pp: 0 }, world, bailout)).toMatch(/not enough PP/);
    const bailed = applyAction(trouble, world, bailout);
    expect(bailed.pp).toBeLessThan(trouble.pp);
    expect(leagueOf(bailed, world, ANCHOR)?.cash).toBeGreaterThan(1);
    expect(checkAction(bailed, world, bailout)).toMatch(/cooldown/);
    const later = {
      ...bailed,
      quarter: bailed.quarter + world.config.leagues.bailout.cooldownQuarters,
    };
    expect(checkAction(later, world, bailout)).toBeNull();
  });

  it("league actions on a country without a league are rejected", () => {
    expect(checkAction(start, world, { type: "bailoutLeague", countryId: OTHER })).toMatch(
      /has no league/,
    );
  });
});

describe("seasonal windows", () => {
  const openTurns = (turnLength: number) => {
    const w = withConfig(world, (config) => {
      const tier1 = config.ppTiers[0];
      if (tier1) tier1.turnLengthQuarters = turnLength;
    });
    let open = 0;
    for (let turn = 0; turn < 8; turn += 1) {
      if (seasonalWindowOpen({ quarter: turn * turnLength, ppTier: 1 }, w.config)) open += 1;
    }
    return open;
  };

  it("falls on one quarter-length turn in four, one half-year turn in two, and every year turn", () => {
    expect(openTurns(1)).toBe(2);
    expect(openTurns(2)).toBe(4);
    expect(openTurns(4)).toBe(8);
  });
});
