import { describe, expect, it } from "vitest";
import { GEAR_BRAND_ID } from "../src/content";
import {
  applyAction,
  checkAction,
  checkInvariants,
  createCampaign,
  dealCap,
  deserializeSave,
  endTurn,
  type GameState,
  newDeals,
  offerDeals,
  ordinaryDealValue,
  serializeSave,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Flagship deals, step 2 (GDD v1.28, tech plan 2.15): offers, signing, lapsing and saves.

function step(state: GameState, content: World = world): GameState {
  const next = endTurn(state, content);
  expect(checkInvariants(next, content)).toEqual([]);
  return next;
}

/** Brazil at its first offseason with offers on the table. */
function atOffers(content: World = world, seed = 11): GameState {
  let state = createCampaign(content, setupFor(seed, "brazil"));
  while (state.flagship.deals.offers.length === 0) state = step(state, content);
  return state;
}

const slotKey = (deal: { slot: string; position: number }) => `${deal.slot}:${deal.position}`;
const brazil = countryIndex(world, "brazil");

/** The same state made to offer again from a different random state. */
function reoffer(state: GameState, content: World, rngSeed: number): GameState {
  const fresh = newDeals(rngSeed);
  return offerDeals(
    {
      ...state,
      flagship: {
        ...state.flagship,
        deals: { ...state.flagship.deals, rng: fresh.rng, offers: [], offeredSeason: null },
      },
    },
    content,
  );
}

describe("offers", () => {
  it("are made once an offseason, for every open slot, and lapse when it closes", () => {
    const state = atOffers();
    const { deals, offseason, season } = state.flagship;
    expect(offseason).toBe(true);
    expect(deals.offeredSeason).toBe(season);
    const keys = new Set(deals.offers.map(slotKey));
    // An Amateur league: TV, the main sponsor, and the founding ground's naming rights.
    expect([...keys].sort()).toEqual(
      ["tv:0", "sponsor:0", `namingRights:${state.identity.foundingClubId}`].sort(),
    );
    const { min, max } = world.config.flagship.deals.offersPerSlot;
    for (const key of keys) {
      const count = deals.offers.filter((offer) => slotKey(offer) === key).length;
      expect(count).toBeGreaterThanOrEqual(min);
      expect(count).toBeLessThanOrEqual(max);
    }
    // The gear brand always offers for the main sponsor, demand-free.
    const gear = deals.offers.find((offer) => offer.partnerId === GEAR_BRAND_ID);
    expect(gear).toMatchObject({ slot: "sponsor", position: 0, demand: null });
    // Every offer is within the cap, and no partner offers twice.
    for (const offer of deals.offers)
      expect(offer.annualValue).toBeLessThanOrEqual(dealCap(state, world));
    expect(new Set(deals.offers.map((o) => o.partnerId)).size).toBe(deals.offers.length);
    // Offers never touch the world's or the matches' random streams.
    const again = offerDeals(
      { ...state, flagship: { ...state.flagship, deals: { ...deals, offeredSeason: null } } },
      world,
    );
    expect(again.rng).toEqual(state.rng);
    expect(again.flagship.rng).toEqual(state.flagship.rng);
    // Once an offseason: the same offseason makes none again.
    expect(offerDeals(state, world)).toBe(state);

    const closed = step(state);
    expect(closed.flagship.offseason).toBe(false);
    expect(closed.flagship.deals.offers).toEqual([]);
  });

  it("are signed in the offseason only; the slot's other offers are withdrawn", () => {
    const state = atOffers();
    const tv = state.flagship.deals.offers.find((offer) => offer.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const signed = applyAction(state, world, { type: "signDeal", offerId: tv.id });
    expect(signed.flagship.deals.signed).toEqual([
      {
        ...tv,
        firstSeason: state.flagship.season,
        lastSeason: state.flagship.season + tv.seasons - 1,
        countryId: "brazil",
      },
    ]);
    expect(signed.flagship.deals.offers.some((offer) => offer.slot === "tv")).toBe(false);
    expect(signed.flagship.deals.offers.length).toBeGreaterThan(0);
    expect(checkInvariants(signed, world)).toEqual([]);
    expect(checkAction(signed, world, { type: "signDeal", offerId: tv.id })).toContain(
      "no deal offer",
    );
    const closed = step(signed);
    expect(checkAction(closed, world, { type: "signDeal", offerId: 1 })).toBe(
      "deals are signed only in the offseason",
    );
  });

  it("the partner whose deal ended offers to renew, beside fresh offers", () => {
    const content = withConfig(world, (config) => {
      config.flagship.deals.seasons = { min: 1, max: 1 };
    });
    const state = atOffers(content);
    const main = state.flagship.deals.offers.find(
      (offer) => offer.slot === "sponsor" && offer.partnerId !== GEAR_BRAND_ID,
    );
    if (!main) throw new Error("No main sponsor offer");
    let next = applyAction(state, content, { type: "signDeal", offerId: main.id });
    const season = next.flagship.season;
    while (next.flagship.deals.offeredSeason === season) next = step(next, content);
    const offers = next.flagship.deals.offers.filter((offer) => offer.slot === "sponsor");
    expect(next.flagship.deals.signed).toEqual([]);
    expect(offers.find((offer) => offer.renewal)).toMatchObject({
      partnerId: main.partnerId,
      position: 0,
      demand: null,
    });
    expect(offers.length).toBeGreaterThanOrEqual(2);
  });

  it("make at most one rule demand an offseason, never a slot's only offer, never while one is due", () => {
    const content = withConfig(world, (config) => {
      config.flagship.deals.ruleDemand.chancePerOffseason = 1;
    });
    const state = atOffers(content);
    let seen = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const offered = reoffer(state, content, seed);
      const rules = offered.flagship.deals.offers.filter((o) => o.demand?.kind === "ruleChange");
      expect(rules.length).toBeLessThanOrEqual(1);
      const rule = rules[0];
      if (rule?.demand?.kind !== "ruleChange") continue;
      seen += 1;
      expect(rule.slot).not.toBe("namingRights");
      expect(rule.partnerId).not.toBe(GEAR_BRAND_ID);
      expect(
        offered.flagship.deals.offers.filter((o) => slotKey(o) === slotKey(rule)).length,
      ).toBeGreaterThanOrEqual(2);
      expect(rule.demand.option).not.toBe(offered.genome[rule.demand.axis]);
      expect(rule.demand.dueSeason).toBe(
        state.flagship.season + content.config.flagship.deals.ruleDemand.dueOffseasons,
      );
      expect(checkInvariants(offered, content)).toEqual([]);
    }
    expect(seen).toBeGreaterThan(40);

    // With a signed rule demand still due, no offer demands another.
    const offered = reoffer(state, content, 3);
    const rule = offered.flagship.deals.offers.find((o) => o.demand?.kind === "ruleChange");
    if (!rule) throw new Error("No rule demand offered");
    const signed = applyAction(offered, content, { type: "signDeal", offerId: rule.id });
    for (let seed = 1; seed <= 20; seed += 1) {
      const again = reoffer(signed, content, seed);
      expect(again.flagship.deals.offers.some((o) => o.demand?.kind === "ruleChange")).toBe(false);
    }
  });
});

describe("what shapes offers", () => {
  /** The state with a rival countermove in effect in Brazil. */
  const withCountermove = (state: GameState, kind: "broadcastDeal" | "sponsorLockout") => {
    const countries = [...state.countries];
    const country = countries[brazil];
    if (!country) throw new Error("No Brazil");
    countries[brazil] = {
      ...country,
      countermoves: [
        ...country.countermoves,
        { kind, sportId: "soccer", endQuarter: state.quarter + 8 },
      ],
    };
    return { ...state, countries };
  };

  it("a rival broadcast deal leaves no TV offers; a sponsor lockout shrinks sponsor offers", () => {
    const state = atOffers();
    const blocked = reoffer(withCountermove(state, "broadcastDeal"), world, 5);
    expect(blocked.flagship.deals.offers.some((offer) => offer.slot === "tv")).toBe(false);

    const locked = withCountermove(state, "sponsorLockout");
    const ref = { slot: "sponsor" as const, position: 0 };
    expect(ordinaryDealValue(locked, world, ref)).toBeCloseTo(
      ordinaryDealValue(state, world, ref) * world.config.flagship.deals.sponsorLockout.value,
    );
    const { max } = world.config.flagship.deals.offersPerSlot;
    const { offersCut } = world.config.flagship.deals.sponsorLockout;
    for (let seed = 1; seed <= 10; seed += 1) {
      const offers = reoffer(locked, world, seed).flagship.deals.offers;
      for (const slot of ["sponsor", "namingRights"]) {
        const count = offers.filter((offer) => offer.slot === slot).length;
        expect(count).toBeLessThanOrEqual(Math.max(1, max - offersCut));
      }
    }
  });

  it("the Pay-TV fork makes TV offers bigger, Free-to-Air smaller", () => {
    const state = atOffers();
    const tv = { slot: "tv" as const, position: 0 };
    const plain = ordinaryDealValue(state, world, tv);
    const fork = world.config.flagship.deals.tvFork;
    const owning = (nodeId: string) => ({ ...state, growthNodes: [...state.growthNodes, nodeId] });
    expect(ordinaryDealValue(owning("pay-tv-exclusivity"), world, tv)).toBeCloseTo(
      plain * (fork["pay-tv-exclusivity"]?.value ?? 0),
    );
    expect(ordinaryDealValue(owning("free-to-air"), world, tv)).toBeCloseTo(
      plain * (fork["free-to-air"]?.value ?? 0),
    );
  });
});

describe("saves", () => {
  it("round-trip signed deals and offers byte for byte", () => {
    const state = atOffers();
    const offer = state.flagship.deals.offers[0];
    if (!offer) throw new Error("No offer");
    const signed = applyAction(state, world, { type: "signDeal", offerId: offer.id });
    const text = serializeSave(signed);
    expect(serializeSave(deserializeSave(text, world))).toBe(text);
  });

  it("migrate a version 19 save with no deals; the cut waits for the first offers", () => {
    const state = atOffers();
    const { deals: _deals, ...flagship } = state.flagship;
    const loaded = deserializeSave(
      JSON.stringify({ formatVersion: 19, state: { ...state, flagship } }),
      world,
    );
    expect(loaded.flagship.deals).toEqual(newDeals(state.seed));
    expect(loaded.flagship.deals.offeredSeason).toBeNull();
  });
});
