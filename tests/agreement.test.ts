import { describe, expect, it } from "vitest";
import {
  type AgreementTerms,
  applyAction,
  checkAction,
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  leagueCosts,
  leagueIncomePerQuarter,
  newAgreement,
  PLAYER_INDEX,
  pullChance,
  serializeSave,
  snapshot,
  talksOpen,
  unionAsk,
  unionRead,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// The players' agreement and the talks (GDD v1.39, tech plan 2.25 step 2).

const brazil = countryIndex(world, "brazil");
const rules = world.config.flagship.agreement;

/** Brazil's campaign at its first offseason, the seat's league at `tier`. */
function firstOffseason(tier: "semi-pro" | "professional" = "professional"): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (!state.flagship.offseason) state = endTurn(state, world);
  const countries = [...state.countries];
  const country = countries[brazil];
  if (!country?.league) throw new Error("no league");
  const fans = country.fans.map((sport, s) =>
    s === PLAYER_INDEX ? { ...sport, casual: 5_000_000, hardcore: 500_000 } : sport,
  );
  countries[brazil] = { ...country, fans, league: { ...country.league, tier } };
  return { ...state, countries };
}

/** The offer the union counts as worth least: certain refusal under the default tuning. */
const stingy: AgreementTerms = {
  share: rules.shares[0],
  term: rules.terms[rules.terms.length - 1] ?? 7,
  cap: true,
  minWage: "low",
};

const propose = (state: GameState, terms: AgreementTerms) =>
  applyAction(state, world, { type: "proposeAgreement", terms });

describe("when talks are open", () => {
  it("there is no union below Professional, and talks open in the first Professional offseason", () => {
    const semi = firstOffseason("semi-pro");
    expect(talksOpen(semi, world)).toBe(false);
    expect(checkAction(semi, world, { type: "proposeAgreement", terms: rules.default })).toMatch(
      /no union/,
    );
    const pro = firstOffseason();
    expect(talksOpen(pro, world)).toBe(true);
    expect(snapshot(pro, world).agreement.offers.length).toBeGreaterThan(0);
  });

  it("an agreement closes the talks until the seasons it covers have been played", () => {
    const signed = propose(firstOffseason(), unionAsk(firstOffseason(), world));
    const current = signed.agreement.current;
    expect(current?.fromSeason).toBe(signed.flagship.season);
    expect(current?.throughSeason).toBe(signed.flagship.season + (current?.term ?? 0) - 1);
    expect(talksOpen(signed, world)).toBe(false);
    expect(checkAction(signed, world, { type: "proposeAgreement", terms: rules.default })).toMatch(
      /still covers/,
    );
    // The offseason after its last season opens them again.
    const expired = {
      ...signed,
      agreement: {
        ...signed.agreement,
        current: current && { ...current, throughSeason: signed.flagship.season - 1 },
      },
    };
    expect(talksOpen(expired, world)).toBe(true);
  });
});

describe("the union's read", () => {
  it("signs its ask for certain, and giving more never raises the risk", () => {
    const state = firstOffseason();
    const ask = unionAsk(state, world);
    expect(ask.share).toBeGreaterThanOrEqual(rules.shares[0]);
    expect(ask.share).toBeLessThanOrEqual(rules.shares[1]);
    expect(unionRead(state, world, ask)).toEqual({ chance: 0, read: "sign" });
    let previous = 1;
    for (let share = rules.shares[0]; share <= rules.shares[1]; share += 1) {
      const { chance } = unionRead(state, world, { ...ask, share });
      expect(chance).toBeLessThanOrEqual(previous);
      previous = chance;
    }
    expect(unionRead(state, world, stingy).read).toBe("refuse");
    // A cap counts against the offer; a longer term costs.
    expect(unionRead(state, world, { ...ask, share: ask.share - 1 }).chance).toBeLessThan(
      unionRead(state, world, { ...ask, share: ask.share - 1, cap: true }).chance,
    );
  });
});

describe("confirming an offer", () => {
  it("a signed offer runs from next season and sets the seat's payroll", () => {
    const state = firstOffseason();
    const offer = { ...unionAsk(state, world), share: rules.shares[1], minWage: "high" as const };
    const signed = propose(state, offer);
    expect(checkInvariants(signed, world)).toEqual([]);
    expect(signed.agreement.current).toMatchObject(offer);
    expect(signed.agreement.stoppageSeason).toBeNull();
    expect(signed.landmarks.at(-1)).toMatchObject({
      kind: "agreementSigned",
      proposed: true,
      stoppage: false,
      terms: offer,
    });
    const income = leagueIncomePerQuarter(signed, world, brazil);
    expect(leagueCosts(signed, world, brazil).payroll).toBeCloseTo(
      ((offer.share + rules.minWages.high) / 100) * income,
      9,
    );
  });

  it("a refused offer is a stoppage: the season is lost and the ask signed on the shortest term", () => {
    const state = firstOffseason();
    const stopped = propose(state, stingy);
    expect(stopped.agreement.stoppageSeason).toBe(state.flagship.season);
    expect(stopped.agreement.current).toMatchObject({
      ...unionAsk(state, world),
      term: rules.terms[0],
    });
    expect(stopped.landmarks.at(-1)).toMatchObject({ kind: "agreementSigned", stoppage: true });
  });

  it("End Turn with talks open takes the union's ask without a roll", () => {
    const state = firstOffseason();
    const ask = unionAsk(state, world);
    const next = endTurn(state, world);
    expect(next.agreement.rng).toEqual(state.agreement.rng);
    expect(next.agreement.current).toMatchObject(ask);
    expect(
      next.landmarks.find((l) => l.kind === "agreementSigned" && !l.proposed && !l.stoppage),
    ).toBeDefined();
  });
});

// What the levers do (GDD v1.39 decision 4, tech plan 2.25 step 3).

/** `state` with `terms` in force from the season under way. */
function withTerms(state: GameState, terms: AgreementTerms): GameState {
  const fromSeason = state.flagship.season;
  return {
    ...state,
    agreement: {
      ...state.agreement,
      current: { ...terms, fromSeason, throughSeason: fromSeason + terms.term - 1 },
    },
  };
}

/** The spread of the seat's active club ratings (largest − smallest). */
const ratingSpread = (state: GameState) => {
  const ratings = state.flagship.clubs.filter((club) => club.active).map((club) => club.rating);
  return Math.max(...ratings) - Math.min(...ratings);
};

describe("what the levers do", () => {
  it("a salary cap keeps the clubs closer at the season's end and limits a veteran star's wage", () => {
    const state = firstOffseason();
    const open = withTerms(state, rules.default);
    const capped = withTerms(state, { ...rules.default, cap: true });
    // A season played from the founding, the same draws either way.
    const seasonEnd = (terms: AgreementTerms) => {
      let next = withTerms(createCampaign(world, setupFor(5, "brazil")), terms);
      while (!next.flagship.offseason) next = endTurn(next, world);
      return next;
    };
    expect(ratingSpread(seasonEnd({ ...rules.default, cap: true }))).toBeLessThan(
      ratingSpread(seasonEnd(rules.default)),
    );

    // The only star at the seat, of many seasons: the cap holds the wage at the limit.
    const active = new Set(state.flagship.clubs.filter((c) => c.active).map((c) => c.id));
    const leader = state.flagship.players.find(
      (p) => p.retiredSeason === null && active.has(p.clubId) && p.backing === null,
    );
    if (!leader) throw new Error("no leading player");
    const veteran = (from: GameState): GameState => ({
      ...from,
      flagship: {
        ...from.flagship,
        players: from.flagship.players.map((p) =>
          p.id === leader.id
            ? { ...p, starSince: from.flagship.season - 10 }
            : { ...p, starSince: null },
        ),
      },
    });
    const free = leagueCosts(veteran(open), world, brazil).wages;
    const limited = leagueCosts(veteran(capped), world, brazil).wages;
    expect(limited).toBeLessThan(free);
    expect(free / limited).toBeCloseTo(
      (1 + world.config.flagship.payroll.perSeason * 9) / rules.cap.starWageLimit,
      9,
    );
  });

  it("the growth tree's salary cap leaves the negotiated share alone from Professional up", () => {
    const state = withTerms(firstOffseason(), rules.default);
    const noded = { ...state, growthNodes: [...state.growthNodes, "salary-cap"] };
    expect(leagueCosts(noded, world, brazil).payroll).toBeCloseTo(
      leagueCosts(state, world, brazil).payroll,
      9,
    );
  });

  it("the minimum wage moves talent pull, and the union counts its points at a weight", () => {
    const state = firstOffseason();
    const chance = (minWage: AgreementTerms["minWage"]) =>
      pullChance(withTerms(state, { ...rules.default, minWage }), world);
    expect(chance("standard")).toBe(world.config.standouts.talentPull.chance);
    expect(chance("low")).toBeLessThan(chance("standard"));
    expect(chance("high")).toBeGreaterThan(chance("standard"));
    // A high floor buys the union less than it costs: a share point lower nets the same read.
    const base = { ...unionAsk(state, world), share: 50 };
    const traded = {
      ...base,
      share: 50 - rules.union.minWageWeight * rules.minWages.high,
      minWage: "high" as const,
    };
    expect(unionRead(state, world, traded)).toEqual(unionRead(state, world, base));
  });
});

describe("saves", () => {
  it("round-trips, and a format 32 save migrates with no union on record", () => {
    const signed = propose(firstOffseason(), unionAsk(firstOffseason(), world));
    expect(serializeSave(deserializeSave(serializeSave(signed), world))).toBe(
      serializeSave(signed),
    );
    const { agreement: _a, ...v32 } = createCampaign(world, setupFor(5, "brazil"));
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 32, state: v32 }), world);
    expect(loaded.agreement).toEqual(newAgreement(5));
  });
});
