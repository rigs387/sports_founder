import { describe, expect, it } from "vitest";
import { IDENTITY_AXES } from "../src/content";
import { builder } from "../src/runner/policy";
import {
  type ActiveCountermove,
  checkInvariants,
  computeExposure,
  createCampaign,
  defenseIntensity,
  type EscalationLevel,
  endTurn,
  escalationIndex,
  type GameState,
  mediaRevenueFactor,
  PLAYER_INDEX,
  revenuePerQuarter,
  ruleToCopy,
  runTurns,
  similarity,
  similarityEffect,
  snapshot,
  sportTotals,
  stepLeagueQuarter,
  stepQuarter,
  stepRivals,
  type World,
} from "../src/sim";
import { countryIndex, presetGenome, setupFor, withConfig, withWorld, world } from "./helpers";

// Rival defense (GDD Rival AI) tested through its consequences: escalation follows the player's
// hardcore gains where a rival is strong, budgets limit what rivals can do, every countermove has
// its effect, rivals defend harder near #1, and no rival is ever eliminated.

const ANCHOR_COUNTRY = "austria";
const RIVAL = "soccer";
const population = (w: World, id: string) => w.countries[countryIndex(w, id)]?.population ?? 0;

/** Player hardcore gain per quarter equal to `annualShare` of a country's population per year. */
const perQuarter = (w: World, countryId: string, annualShare: number) =>
  Math.round((annualShare * population(w, countryId)) / 4);

/**
 * One quarter of the rival AI alone, with the player's hardcore fans in `gains` countries rising by
 * the given amounts during the quarter.
 */
function rivalQuarter(state: GameState, w: World, gains: Record<string, number> = {}): GameState {
  const after = state.countries.map((country) => {
    const gain = gains[country.countryId] ?? 0;
    if (gain === 0) return country;
    return {
      ...country,
      fans: country.fans.map((fans, i) =>
        i === PLAYER_INDEX ? { ...fans, hardcore: fans.hardcore + gain } : fans,
      ),
    };
  });
  const quarter = state.quarter + 1;
  const step = stepRivals(state, after, quarter, w);
  return {
    ...state,
    quarter,
    rivals: step.rivals,
    countries: step.countries,
    landmarks: [...state.landmarks, ...step.landmarks],
  };
}

function frontOf(state: GameState, w: World, countryId: string, sportId = RIVAL) {
  const front = state.countries[countryIndex(w, countryId)]?.defense.find(
    (f) => f.sportId === sportId,
  );
  if (!front) throw new Error(`No ${sportId} front in ${countryId}`);
  return front;
}

const levelOf = (state: GameState, w: World, countryId: string, sportId = RIVAL) =>
  frontOf(state, w, countryId, sportId).level;

function rivalOf(state: GameState, sportId = RIVAL) {
  const rival = state.rivals.find((r) => r.sportId === sportId);
  if (!rival) throw new Error(`No rival ${sportId}`);
  return rival;
}

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

function withLevel(
  state: GameState,
  w: World,
  countryId: string,
  level: EscalationLevel,
  sportId = RIVAL,
) {
  return withCountry(state, w, countryId, (country) => ({
    ...country,
    defense: country.defense.map((front) =>
      front.sportId === sportId ? { ...front, level } : front,
    ),
  }));
}

const withMove = (state: GameState, w: World, countryId: string, move: ActiveCountermove) =>
  withCountry(state, w, countryId, (country) => ({
    ...country,
    countermoves: [...country.countermoves, move],
  }));

describe("rivals hold their ground", () => {
  it("left alone for a century, every rival stays at its real starting level", () => {
    // The player's sport never grows, so nothing pulls on the rivals or provokes a countermove.
    const w = withConfig(world, (config) => {
      config.dynamics.player.casualConversionRate = 0;
      config.dynamics.player.hardcoreConversionRate = 0;
    });
    const start = createCampaign(w, setupFor(1, ANCHOR_COUNTRY));
    let state = start;
    for (let q = 0; q < 400; q += 1) state = stepQuarter(state, w);
    const before = sportTotals(start, w);
    const after = sportTotals(state, w);
    for (const [i, sport] of before.entries()) {
      if (sport.kind !== "rival") continue;
      const now = after[i];
      // Rounding whole fans can land a handful above home; never more than that.
      expect((now?.hardcore ?? 0) / sport.hardcore, sport.sportId).toBeLessThan(1.000001);
      expect((now?.hardcore ?? 0) / sport.hardcore, sport.sportId).toBeGreaterThan(0.99);
      expect((now?.fandomScore ?? 0) / sport.fandomScore, sport.sportId).toBeCloseTo(1, 2);
    }
    // No rival spreads into countries where the real data gives it nobody.
    state.countries.forEach((country, index) => {
      const home = w.countries[index]?.startingRivalFans ?? {};
      for (const fans of country.fans) {
        if (state.sports.find((s) => s.id === fans.sportId)?.kind !== "rival") continue;
        if ((home[fans.sportId]?.casual ?? 0) + (home[fans.sportId]?.hardcore ?? 0) > 0) continue;
        expect(fans.casual + fans.hardcore, `${fans.sportId} in ${country.countryId}`).toBe(0);
      }
    });
  });
});

describe("escalation ladder", () => {
  const start = () => createCampaign(world, setupFor(1, ANCHOR_COUNTRY));
  const strongGains = { [ANCHOR_COUNTRY]: perQuarter(world, ANCHOR_COUNTRY, 0.01) };

  it("climbs one level at a time with the player's hardcore gains where the rival is strong", () => {
    let state = start();
    const seen: EscalationLevel[] = [];
    for (let q = 0; q < 40; q += 1) {
      const before = levelOf(state, world, ANCHOR_COUNTRY);
      state = rivalQuarter(state, world, strongGains);
      const after = levelOf(state, world, ANCHOR_COUNTRY);
      expect(escalationIndex(after) - escalationIndex(before)).toBeGreaterThanOrEqual(0);
      expect(escalationIndex(after) - escalationIndex(before)).toBeLessThanOrEqual(1);
      if (after !== before) seen.push(after);
    }
    expect(seen).toEqual(["watching", "defending", "entrenched"]);
    const recorded = state.landmarks.flatMap((l) =>
      l.kind === "rivalEscalated" && l.sportId === RIVAL && l.countryId === ANCHOR_COUNTRY
        ? [l.to]
        : [],
    );
    expect(recorded).toEqual(seen);
  });

  it("small gains stop at Watching, and no gains never escalate", () => {
    let small = start();
    let none = start();
    for (let q = 0; q < 40; q += 1) {
      small = rivalQuarter(small, world, {
        [ANCHOR_COUNTRY]: perQuarter(world, ANCHOR_COUNTRY, 0.001),
      });
      none = rivalQuarter(none, world);
    }
    expect(levelOf(small, world, ANCHOR_COUNTRY)).toBe("watching");
    expect(levelOf(none, world, ANCHOR_COUNTRY)).toBe("none");
    expect(none.landmarks.filter((l) => l.kind.startsWith("rival"))).toEqual([]);
  });

  it("does not rise where the rival holds little hardcore share, however large the gains", () => {
    const cricketShare =
      (createCampaign(world, setupFor(1, ANCHOR_COUNTRY)).countries[
        countryIndex(world, ANCHOR_COUNTRY)
      ]?.fans[2]?.hardcore ?? 0) / population(world, ANCHOR_COUNTRY);
    expect(cricketShare).toBeLessThan(world.config.rivalAI.meaningfulHardcoreShare);
    let state = start();
    for (let q = 0; q < 40; q += 1) state = rivalQuarter(state, world, strongGains);
    expect(levelOf(state, world, ANCHOR_COUNTRY, "cricket")).toBe("none");

    // The same gains with cricket holding a meaningful share there: it escalates too.
    const cricketStrong = withWorld(world, (content) => {
      const country = content.countries.find((c) => c.id === ANCHOR_COUNTRY);
      if (country) country.startingRivalFans.cricket = { casual: 0.1, hardcore: 0.05 };
    });
    let strong = createCampaign(cricketStrong, setupFor(1, ANCHOR_COUNTRY));
    for (let q = 0; q < 40; q += 1) strong = rivalQuarter(strong, cricketStrong, strongGains);
    expect(levelOf(strong, cricketStrong, ANCHOR_COUNTRY, "cricket")).toBe("entrenched");
  });

  it("de-escalates one level at a time, slowly, after the player pulls back", () => {
    let state = start();
    for (let q = 0; q < 30; q += 1) state = rivalQuarter(state, world, strongGains);
    expect(levelOf(state, world, ANCHOR_COUNTRY)).toBe("entrenched");

    const { deescalationQuarters } = world.config.rivalAI.escalation;
    let lastChange = state.quarter;
    const drops: EscalationLevel[] = [];
    for (let q = 0; q < 120 && levelOf(state, world, ANCHOR_COUNTRY) !== "none"; q += 1) {
      const before = levelOf(state, world, ANCHOR_COUNTRY);
      state = rivalQuarter(state, world);
      const after = levelOf(state, world, ANCHOR_COUNTRY);
      expect(escalationIndex(before) - escalationIndex(after)).toBeGreaterThanOrEqual(0);
      expect(escalationIndex(before) - escalationIndex(after)).toBeLessThanOrEqual(1);
      if (after !== before) {
        expect(state.quarter - lastChange).toBeGreaterThanOrEqual(deescalationQuarters);
        lastChange = state.quarter;
        drops.push(after);
      }
    }
    expect(drops).toEqual(["defending", "watching", "none"]);
    expect(state.landmarks.filter((l) => l.kind === "rivalDeescalated")).toHaveLength(3);
  });

  it("without player pressure, rivals never escalate or spend, and only drift", () => {
    // The player's sport still spreads casual fans, but converts no one to hardcore anywhere.
    const noHardcoreGains = withConfig(world, (config) => {
      config.dynamics.player.hardcoreConversionRate = 0;
    });
    const start = createCampaign(noHardcoreGains, setupFor(3, ANCHOR_COUNTRY));
    const quiet = runTurns(start, noHardcoreGains, 60);
    expect(quiet.quarter).toBeGreaterThanOrEqual(60);
    expect(quiet.landmarks.filter((l) => l.kind.startsWith("rival"))).toEqual([]);
    expect(quiet.rivals.every((rival) => rival.budgetSpent === 0 && rival.budget > 0)).toBe(true);
    expect(quiet.countries.every((c) => c.countermoves.length === 0)).toBe(true);
    // Rival fans still move on their own (the slow drift).
    const index = countryIndex(noHardcoreGains, ANCHOR_COUNTRY);
    expect(quiet.countries[index]?.fans[1]).not.toStrictEqual(start.countries[index]?.fans[1]);
  });
});

describe("defense budget", () => {
  // Income too small to matter and no practical cap, so a test sets the budget it wants; rivals
  // may buy as many countermoves per quarter as the budget allows.
  const fixedBudget = withConfig(world, (config) => {
    config.rivalAI.budget.incomePerFandomScore = 1e-12;
    config.rivalAI.budget.capQuarters = 1e15;
    config.rivalAI.movesPerQuarter = 50;
  });

  function defendingIn(countryIds: string[], budget: number): GameState {
    let state = createCampaign(fixedBudget, setupFor(1, ANCHOR_COUNTRY));
    state = {
      ...state,
      rivals: state.rivals.map((r) => (r.sportId === RIVAL ? { ...r, budget } : r)),
    };
    for (const id of countryIds) state = withLevel(state, fixedBudget, id, "defending");
    return state;
  }

  const movesIn = (state: GameState, countryId: string) =>
    state.countries[countryIndex(fixedBudget, countryId)]?.countermoves.filter(
      (m) => m.sportId === RIVAL,
    ).length ?? 0;

  it("a rival never spends more than its budget, and spending is what the budget lost", () => {
    const budget = 20_000;
    for (const fronts of [[ANCHOR_COUNTRY], [ANCHOR_COUNTRY, "czechia", "italy", "germany"]]) {
      const start = defendingIn(fronts, budget);
      const next = rivalQuarter(start, fixedBudget);
      const rival = rivalOf(next);
      expect(rival.budget).toBeGreaterThanOrEqual(0);
      expect(rival.budgetSpent).toBeGreaterThan(0);
      expect(rival.budgetSpent).toBeLessThanOrEqual(budget);
      expect(rival.budget + rival.budgetSpent).toBeCloseTo(budget, 2);
      expect(checkInvariants(next, fixedBudget)).toEqual([]);
    }
    const broke = rivalQuarter(defendingIn([ANCHOR_COUNTRY], 0), fixedBudget);
    expect(movesIn(broke, ANCHOR_COUNTRY)).toBe(0);
  });

  it("pushing several fronts spreads the same budget thin", () => {
    const budget = 20_000;
    const others = ["czechia", "italy", "germany"];
    const oneFront = rivalQuarter(defendingIn([ANCHOR_COUNTRY], budget), fixedBudget);
    const fourFronts = rivalQuarter(defendingIn([ANCHOR_COUNTRY, ...others], budget), fixedBudget);
    expect(movesIn(oneFront, ANCHOR_COUNTRY)).toBeGreaterThanOrEqual(2);
    expect(movesIn(fourFronts, ANCHOR_COUNTRY)).toBeLessThan(movesIn(oneFront, ANCHOR_COUNTRY));
    const defended = [ANCHOR_COUNTRY, ...others].filter((id) => movesIn(fourFronts, id) > 0);
    expect(defended.length).toBeGreaterThan(0);
    expect(defended.length).toBeLessThan(4);
  });

  it("in a real campaign, spending each quarter never exceeds the budget banked plus income", () => {
    let state = createCampaign(world, setupFor(5, ANCHOR_COUNTRY, presetGenome("long-innings")));
    let quarters = 0;
    let spentAny = false;
    for (let turn = 0; turn < 100 && state.outcome === null; turn += 1) {
      const acted = builder(state, world).state;
      let quarterState = acted;
      // Step the turn quarter by quarter so every rival decision is checked.
      const next = endTurn(acted, world);
      while (quarterState.quarter < next.quarter) {
        const stepped = stepQuarter(quarterState, world);
        const intensity = defenseIntensity(stepped, world);
        const totals = sportTotals(stepped, world);
        stepped.rivals.forEach((rival, r) => {
          const before = quarterState.rivals[r];
          if (!before) throw new Error("rival missing");
          const score = totals.find((t) => t.sportId === rival.sportId)?.fandomScore ?? 0;
          const income = world.config.rivalAI.budget.incomePerFandomScore * score * intensity;
          const spent = rival.budgetSpent - before.budgetSpent;
          expect(spent).toBeLessThanOrEqual(before.budget + income + 1e-6);
          expect(rival.budget).toBeGreaterThanOrEqual(0);
          if (spent > 0) spentAny = true;
        });
        quarterState = stepped;
        quarters += 1;
      }
      state = next;
    }
    expect(quarters).toBeGreaterThan(100);
    expect(spentAny).toBe(true);
  });
});

describe("each countermove has its effect", () => {
  const target = "czechia";
  const blitz: ActiveCountermove = { kind: "mediaBlitz", sportId: RIVAL, endQuarter: 99 };
  const youth: ActiveCountermove = { kind: "youthPrograms", sportId: RIVAL, endQuarter: 99 };

  /** One quarter's change in a sport's fans in the target country. */
  function change(w: World, state: GameState, sportId: string) {
    const index = countryIndex(w, target);
    const next = stepQuarter(state, w);
    const before = state.countries[index]?.fans.find((f) => f.sportId === sportId);
    const after = next.countries[index]?.fans.find((f) => f.sportId === sportId);
    if (!before || !after) throw new Error("fans missing");
    return { casual: after.casual - before.casual, hardcore: after.hardcore - before.hardcore };
  }

  it("a media blitz raises only that rival's casual conversion there, by the configured boost", () => {
    const w = withConfig(world, (config) => {
      config.dynamics.noise = 0;
      config.dynamics.rival.hardcoreConversionRate = 0;
      config.poaching.rate = 0;
      config.turnover.annualRate = 0;
      config.rivalAI.movesPerQuarter = 0;
    });
    // The rival has lost every casual fan there, so it converts with no churn to net against (a
    // rival at its home level converts exactly as many as churn away).
    const base = withCountry(createCampaign(w, setupFor(1, ANCHOR_COUNTRY)), w, target, (c) => ({
      ...c,
      fans: c.fans.map((f) => (f.sportId === RIVAL ? { ...f, casual: 0 } : f)),
    }));
    const blitzed = withMove(base, w, target, blitz);
    const plain = change(w, base, RIVAL).casual;
    const boosted = change(w, blitzed, RIVAL).casual;
    expect(plain).toBeGreaterThan(10_000);
    expect(boosted / plain).toBeCloseTo(
      1 + w.config.rivalAI.countermoves.mediaBlitz.casualConversionBoost,
      3,
    );
    expect(change(w, blitzed, "cricket")).toStrictEqual(change(w, base, "cricket"));
  });

  it("youth programs raise only that rival's hardcore conversion there, by the configured boost", () => {
    const w = withConfig(world, (config) => {
      config.dynamics.noise = 0;
      config.dynamics.rival.casualChurnRate = 0;
      config.poaching.rate = 0;
      config.turnover.annualRate = 0;
      config.rivalAI.movesPerQuarter = 0;
    });
    // The rival has lost half its hardcore fans there to casual: it rebuilds only below its home
    // level.
    const base = withCountry(createCampaign(w, setupFor(1, ANCHOR_COUNTRY)), w, target, (c) => ({
      ...c,
      fans: c.fans.map((f) => {
        if (f.sportId !== RIVAL) return f;
        const lost = Math.floor(f.hardcore / 2);
        return { ...f, casual: f.casual + lost, hardcore: f.hardcore - lost };
      }),
    }));
    const plain = change(w, base, RIVAL).hardcore;
    const boosted = change(w, withMove(base, w, target, youth), RIVAL).hardcore;
    expect(plain).toBeGreaterThan(1_000);
    expect(boosted / plain).toBeCloseTo(
      1 + w.config.rivalAI.countermoves.youthPrograms.hardcoreConversionBoost,
      2,
    );
  });

  it("an exclusive broadcast deal removes the player's media reach exposure into that country", () => {
    // A country with a media reach link, and the player's fans in its source.
    // Not the anchor: it holds a focus slot, whose inbound multiplier complicates the arithmetic.
    const anchorIndex = countryIndex(world, ANCHOR_COUNTRY);
    const targetIndex = world.inbound.findIndex(
      (links, i) => i !== anchorIndex && links.some((l) => l.media > 0),
    );
    const link = world.inbound[targetIndex]?.find((l) => l.media > 0);
    const source = world.countries[link?.source ?? -1]?.id;
    const dealIn = world.countries[targetIndex]?.id;
    if (!source || !dealIn) throw new Error("content has no media reach link");
    const base = withCountry(
      createCampaign(world, setupFor(1, ANCHOR_COUNTRY)),
      world,
      source,
      (c) => ({
        ...c,
        fans: c.fans.map((f, i) =>
          i === PLAYER_INDEX ? { ...f, casual: 5_000_000, hardcore: 500_000 } : f,
        ),
      }),
    );
    const dealt = withMove(base, world, dealIn, {
      kind: "broadcastDeal",
      sportId: RIVAL,
      endQuarter: 99,
    });
    const open = computeExposure(base, world)[targetIndex];
    const blocked = computeExposure(dealt, world)[targetIndex];
    if (!open || !blocked) throw new Error("no exposure");
    expect(open.media).toBeGreaterThan(0);
    expect(blocked.media).toBe(0);
    expect(blocked.proximity).toBe(open.proximity);
    expect(blocked.language).toBe(open.language);
    expect(blocked.organic).toBeCloseTo(open.organic - open.media, 12);
    // Other countries keep their media reach.
    expect(
      computeExposure(dealt, world).map((e, i) => (i === targetIndex ? 0 : e.media)),
    ).toStrictEqual(computeExposure(base, world).map((e, i) => (i === targetIndex ? 0 : e.media)));
  });

  it("a sponsor lockout cuts the player's league media and sponsor revenue there, not gate revenue", () => {
    const index = countryIndex(world, ANCHOR_COUNTRY);
    const state = createCampaign(world, setupFor(1, ANCHOR_COUNTRY));
    const open = withCountry(state, world, ANCHOR_COUNTRY, (c) => ({
      ...c,
      fans: c.fans.map((f, i) =>
        i === PLAYER_INDEX ? { ...f, casual: 2_000_000, hardcore: 50_000 } : f,
      ),
    })).countries[index];
    if (!open?.league) throw new Error("the anchor has no league");
    const locked = {
      ...open,
      countermoves: [{ kind: "sponsorLockout" as const, sportId: RIVAL, endQuarter: 99 }],
    };
    const fans = open.fans[PLAYER_INDEX];
    if (!fans) throw new Error("no fans");
    const openRevenue = revenuePerQuarter(
      world,
      index,
      open.league.tier,
      fans,
      1,
      mediaRevenueFactor(open, world.config, 1),
    );
    const lockedRevenue = revenuePerQuarter(
      world,
      index,
      open.league.tier,
      fans,
      1,
      mediaRevenueFactor(locked, world.config, 1),
    );
    const cut = world.config.rivalAI.countermoves.sponsorLockout.mediaRevenueCut;
    expect(openRevenue.media).toBeGreaterThan(0);
    expect(lockedRevenue.gate).toBe(openRevenue.gate);
    expect(lockedRevenue.media).toBeCloseTo(openRevenue.media * (1 - cut), 9);
    const cashOpen = stepLeagueQuarter(open, index, world, state, 1).country.league?.cash ?? 0;
    const cashLocked = stepLeagueQuarter(locked, index, world, state, 1).country.league?.cash ?? 0;
    expect(cashOpen - cashLocked).toBeCloseTo(openRevenue.media * cut, 9);
  });

  it("rule copying adopts a player rule trait popular there, changing the rival genome and the similarity it produces", () => {
    const copyFirst = withConfig(world, (config) => {
      config.rivalAI.preference = [
        "ruleCopying",
        "youthPrograms",
        "mediaBlitz",
        "sponsorLockout",
        "broadcastDeal",
      ];
    });
    const player = presetGenome("long-innings");
    const index = countryIndex(copyFirst, ANCHOR_COUNTRY);
    let start = createCampaign(copyFirst, setupFor(1, ANCHOR_COUNTRY, player));
    const original = rivalOf(start).genome;
    const copy = ruleToCopy(copyFirst, player, original, index);
    if (!copy) throw new Error("expected a popular rule trait to copy in Austria");
    start = withLevel(start, copyFirst, ANCHOR_COUNTRY, "entrenched");
    start = {
      ...start,
      rivals: start.rivals.map((r) => (r.sportId === RIVAL ? { ...r, budget: 1e9 } : r)),
    };

    const next = rivalQuarter(start, copyFirst);
    const copied = rivalOf(next).genome;
    expect(copied[copy.axis]).toBe(player[copy.axis]);
    expect(copied[copy.axis]).not.toBe(original[copy.axis]);
    for (const axis of IDENTITY_AXES) expect(copied[axis]).toBe(original[axis]);
    expect(next.landmarks.at(-1)).toMatchObject({
      kind: "rivalRuleCopied",
      sportId: RIVAL,
      countryId: ANCHOR_COUNTRY,
      axis: copy.axis,
      to: player[copy.axis],
    });
    expect(rivalOf(next).budgetSpent).toBe(copyFirst.config.rivalAI.countermoves.ruleCopying.cost);

    expect(similarity(player, copied, copyFirst.config)).toBeGreaterThan(
      similarity(player, original, copyFirst.config),
    );
    const country = next.countries[index];
    if (!country) throw new Error("no country");
    const pop = population(copyFirst, ANCHOR_COUNTRY);
    const before = similarityEffect(copyFirst, player, country, next.sports, pop, start.rivals);
    const after = similarityEffect(copyFirst, player, country, next.sports, pop, next.rivals);
    expect(after.hardcoreFactor).toBeLessThan(before.hardcoreFactor);
    expect(after.casualFactor).toBeGreaterThan(before.casualFactor);

    // A cooldown follows: the next quarter copies nothing more.
    const later = rivalQuarter(next, copyFirst);
    expect(rivalOf(later).genome).toStrictEqual(copied);
    expect(checkInvariants(later, copyFirst)).toEqual([]);
  });
});

describe("rivals defend harder near global #1", () => {
  /** The same campaign with the player's hardcore fans filling most of every other country. */
  function nearTop(state: GameState): GameState {
    return {
      ...state,
      countries: state.countries.map((country, i) => {
        if (country.countryId === ANCHOR_COUNTRY) return country;
        const pop = world.countries[i]?.population ?? 0;
        const taken = country.fans.reduce(
          (sum, f, s) => (s === PLAYER_INDEX ? sum : sum + f.hardcore),
          0,
        );
        return {
          ...country,
          fans: country.fans.map((f, s) =>
            s === PLAYER_INDEX ? { ...f, hardcore: Math.floor((pop - taken) * 0.9) } : f,
          ),
        };
      }),
    };
  }

  it("intensity is 1 far from #1 and at its maximum once the player draws level", () => {
    const far = createCampaign(world, setupFor(1, ANCHOR_COUNTRY));
    const near = nearTop(far);
    const best = Math.max(
      ...sportTotals(near, world)
        .filter((t) => t.kind === "rival")
        .map((t) => t.fandomScore),
    );
    expect(sportTotals(near, world)[PLAYER_INDEX]?.fandomScore).toBeGreaterThan(best);
    expect(defenseIntensity(far, world)).toBe(1);
    expect(defenseIntensity(near, world)).toBe(world.config.rivalAI.nearTop.maxIntensity);
  });

  it("with the same local pressure, rivals escalate further and earn more budget near #1", () => {
    const gains = { [ANCHOR_COUNTRY]: perQuarter(world, ANCHOR_COUNTRY, 0.004) };
    let far = createCampaign(world, setupFor(1, ANCHOR_COUNTRY));
    let near = nearTop(far);
    const farFirst = rivalQuarter(far, world, gains);
    const nearFirst = rivalQuarter(near, world, gains);
    expect(rivalOf(nearFirst).budget).toBeCloseTo(
      rivalOf(farFirst).budget * world.config.rivalAI.nearTop.maxIntensity,
      6,
    );
    for (let q = 0; q < 30; q += 1) {
      far = rivalQuarter(far, world, gains);
      near = rivalQuarter(near, world, gains);
    }
    expect(levelOf(far, world, ANCHOR_COUNTRY)).toBe("defending");
    expect(levelOf(near, world, ANCHOR_COUNTRY)).toBe("entrenched");
  });
});

describe("no rival is ever eliminated", () => {
  it.each([
    ["the shipped poaching rate", 1],
    ["ten times the poaching rate", 10],
  ])(
    "under overwhelming player strength with %s, every rival keeps hardcore fans in every country for 300 turns",
    (_label, multiplier) => {
      const extreme = withConfig(world, (config) => {
        config.dynamics.player.casualConversionRate = 5;
        config.dynamics.player.hardcoreConversionRate = 0.3;
        config.exposure.cap = 1;
        config.focus.outreachPeople = 1_000_000;
        config.poaching.rate = Math.min(1, config.poaching.rate * multiplier);
      });
      let state = createCampaign(extreme, setupFor(7, ANCHOR_COUNTRY));
      // A rival is "eliminated" only where it had fans to lose: cricket starts at zero in most of
      // the world, and a sport nobody there follows is not a rival being wiped out.
      const startHardcore = state.countries.map((country) =>
        country.fans.map((fans) => fans.hardcore),
      );
      const worldPopulation = extreme.countries.reduce((sum, c) => sum + c.population, 0);
      const problems: string[] = [];
      let peakPlayerShare = 0;
      let lowestRivalShare = 1;
      for (let turn = 1; turn <= 300 && state.outcome === null; turn += 1) {
        state = endTurn(builder(state, extreme).state, extreme);
        const global = state.rivals.map(() => 0);
        state.countries.forEach((country, i) => {
          const pop = extreme.countries[i]?.population ?? 1;
          peakPlayerShare = Math.max(
            peakPlayerShare,
            (country.fans[PLAYER_INDEX]?.hardcore ?? 0) / pop,
          );
          state.rivals.forEach((rival, r) => {
            const hardcore = country.fans[r + 1]?.hardcore ?? 0;
            global[r] = (global[r] ?? 0) + hardcore;
            if ((startHardcore[i]?.[r + 1] ?? 0) <= 0) return;
            lowestRivalShare = Math.min(lowestRivalShare, hardcore / pop);
            if (hardcore <= 0)
              problems.push(
                `${rival.sportId} eliminated from ${country.countryId} on turn ${turn}`,
              );
          });
        });
        global.forEach((hardcore, r) => {
          if (hardcore / worldPopulation <= 0)
            problems.push(`rival #${r} eliminated worldwide on turn ${turn}`);
        });
      }
      expect(problems).toEqual([]);
      expect(state.outcome).toBeNull();
      expect(state.quarter).toBeGreaterThan(600);
      // The pressure really was overwhelming, and rivals were squeezed toward the floor.
      expect(peakPlayerShare).toBeGreaterThan(0.5);
      expect(lowestRivalShare).toBeGreaterThan(0);
    },
  );
});

describe("visibility", () => {
  it("the snapshot shows escalation levels and countermoves in effect, but never budgets", () => {
    let state = createCampaign(world, setupFor(1, ANCHOR_COUNTRY));
    for (let q = 0; q < 30; q += 1) {
      state = rivalQuarter(state, world, {
        [ANCHOR_COUNTRY]: perQuarter(world, ANCHOR_COUNTRY, 0.01),
      });
    }
    const snap = snapshot(state, world);
    const anchor = snap.countries[countryIndex(world, ANCHOR_COUNTRY)];
    expect(anchor?.rivals.map((r) => r.sportId)).toEqual(world.rivals.map((r) => r.id));
    expect(anchor?.rivals.find((r) => r.sportId === RIVAL)?.level).toBe("entrenched");
    expect(anchor?.rivals.find((r) => r.sportId === RIVAL)?.countermoves.length).toBeGreaterThan(0);
    expect(rivalOf(state).budgetSpent).toBeGreaterThan(0);
    expect(JSON.stringify(snap)).not.toMatch(/budget/i);
  });
});
