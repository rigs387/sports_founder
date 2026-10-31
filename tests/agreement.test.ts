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
