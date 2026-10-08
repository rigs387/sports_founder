import { describe, expect, it } from "vitest";
import { GEAR_BRAND_ID } from "../src/content";
import { playCampaign } from "../src/runner/campaign";
import { builder } from "../src/runner/policy";
import {
  applyAction,
  breakDeals,
  broadcastEffects,
  checkAction,
  checkInvariants,
  createCampaign,
  type Deal,
  type DealDemandTerms,
  dealCap,
  dealIncomePerQuarter,
  dealSlateShare,
  dealsSnapshot,
  deserializeSave,
  endTurn,
  eventSnapshots,
  type GameState,
  judgeClauses,
  LEAGUE_TIERS,
  type LeagueState,
  leagueIncomePerQuarter,
  newDeals,
  offerDeals,
  ordinaryDealValue,
  PLAYER_INDEX,
  revenuePerQuarter,
  runTurns,
  serializeSave,
  stepQuarter,
  takesNoSlot,
  venueStrengths,
  type World,
} from "../src/sim";
import { withTradition } from "./culture-helpers";
import { baseGenome, countryIndex, setupFor, world as shipped, withConfig } from "./helpers";

// These tests read the deal mechanics, not the size of a market: offers of any value are made.
// The minimum offer (GDD v1.32) has its own test with the shipped config.
const world = withConfig(shipped, (c) => {
  c.flagship.deals.minOfferValue = 0;
});

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
    // The cap bounds an offer's ordinary value; its spread and premium apply after. No partner
    // offers twice.
    const { spread } = world.config.flagship.deals.value;
    const premiums = Object.values(world.config.flagship.deals.demands).map((d) => d.premium);
    for (const offer of deals.offers) {
      const ordinary = Math.min(dealCap(state, world), ordinaryDealValue(state, world, offer));
      expect(offer.annualValue).toBeLessThanOrEqual(
        ordinary * (1 + spread) * (1 + Math.max(...premiums)) + 1e-9,
      );
    }
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
        // A fresh clause record, judged against the seat country's fans at signing (GDD v1.29).
        clauseMet: 0,
        clauseMisses: 0,
        fansMark:
          (state.countries[brazil]?.fans[PLAYER_INDEX]?.casual ?? 0) +
          (state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0),
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
      // The deal still runs at its deadline: no premium for a demand that cannot break.
      expect(rule.seasons).toBeGreaterThanOrEqual(
        content.config.flagship.deals.ruleDemand.dueOffseasons + 1,
      );
      expect(rule.demand.dueSeason).toBe(
        state.flagship.season + content.config.flagship.deals.ruleDemand.dueOffseasons,
      );
      expect(checkInvariants(offered, content)).toEqual([]);
    }
    // With the chance at 1, most offseasons have an eligible offer (at least 3 seasons long).
    expect(seen).toBeGreaterThan(30);

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

describe("the cap", () => {
  it("bounds the ordinary value; capped offers still differ, the gear brand smaller", () => {
    const tight = withConfig(world, (config) => {
      config.flagship.deals.capByPpTier = config.flagship.deals.capByPpTier.map(() => 1e-7);
    });
    const state = atOffers(tight);
    const cap = dealCap(state, tight);
    const main = state.flagship.deals.offers.filter(
      (o) => o.slot === "sponsor" && o.position === 0,
    );
    const gear = main.find((o) => o.partnerId === GEAR_BRAND_ID);
    const other = main.find((o) => o.partnerId !== GEAR_BRAND_ID && o.demand === null);
    // The cap binds here: the ordinary value is above it.
    expect(ordinaryDealValue(state, tight, { slot: "sponsor", position: 0 })).toBeGreaterThan(cap);
    expect(gear?.annualValue).toBeCloseTo(
      cap * tight.config.flagship.deals.gearBrand.valueShare,
      12,
    );
    expect(other?.annualValue ?? 0).toBeGreaterThan(gear?.annualValue ?? 0);
    expect(new Set(state.flagship.deals.offers.map((o) => o.annualValue)).size).toBeGreaterThan(1);
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

describe("revenue (step 3)", () => {
  const media = (state: GameState) => {
    const country = state.countries[brazil];
    const league = country?.league;
    const fans = country?.fans[PLAYER_INDEX];
    if (!league || !fans) throw new Error("No Brazil league");
    return revenuePerQuarter(world, brazil, league.tier, fans, state.ppTier);
  };

  it("the flagship keeps all its media line until offers are made, then the baseline share", () => {
    const start = createCampaign(world, setupFor(11, "brazil"));
    expect(leagueIncomePerQuarter(start, world, brazil)).toBeCloseTo(media(start).total, 9);
    const state = atOffers();
    const { gate, media: line } = media(state);
    const { baselineShare } = world.config.flagship.deals;
    expect(leagueIncomePerQuarter(state, world, brazil)).toBeCloseTo(
      gate + line * baselineShare,
      9,
    );
    // Every other league keeps its combined line.
    const other = state.countries.findIndex((c, i) => i !== brazil && c.league !== null);
    if (other >= 0) {
      const country = state.countries[other];
      const fans = country?.fans[PLAYER_INDEX];
      if (!country?.league || !fans) throw new Error("No other league");
      expect(leagueIncomePerQuarter(state, world, other)).toBeCloseTo(
        revenuePerQuarter(world, other, country.league.tier, fans, state.ppTier).total,
        9,
      );
    }
  });

  it("signed deals pay a quarter of their value through their seasons, then stop", () => {
    const state = atOffers();
    const tv = state.flagship.deals.offers.find((offer) => offer.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const signed = applyAction(state, world, { type: "signDeal", offerId: tv.id });
    expect(dealIncomePerQuarter(signed.flagship)).toBeCloseTo(tv.annualValue / 4, 9);
    const last = signed.flagship.season + tv.seasons - 1;
    const at = (season: number) => ({ ...signed.flagship, season });
    expect(dealIncomePerQuarter(at(last))).toBeCloseTo(tv.annualValue / 4, 9);
    expect(dealIncomePerQuarter(at(last + 1))).toBe(0);
    expect(dealIncomePerQuarter(at(signed.flagship.season - 1))).toBe(0);

    // The league's cash moves by income less running cost.
    const before = signed.countries[brazil]?.league?.cash ?? 0;
    const unsigned = state.countries[brazil]?.league?.cash ?? 0;
    const cashAfter = (s: GameState) => stepQuarter(s, world).countries[brazil]?.league?.cash ?? 0;
    expect(cashAfter(signed) - before - (cashAfter(state) - unsigned)).toBeCloseTo(
      tv.annualValue / 4,
      6,
    );
  });

  it("a sponsor lockout cuts the media line, never a signed deal", () => {
    const state = atOffers();
    const tv = state.flagship.deals.offers.find((offer) => offer.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const signed = applyAction(state, world, { type: "signDeal", offerId: tv.id });
    const countries = [...signed.countries];
    const country = countries[brazil];
    if (!country) throw new Error("No Brazil");
    countries[brazil] = {
      ...country,
      countermoves: [{ kind: "sponsorLockout", sportId: "soccer", endQuarter: signed.quarter + 8 }],
    };
    const locked = { ...signed, countries };
    const { mediaRevenueCut } = world.config.rivalAI.countermoves.sponsorLockout;
    const { baselineShare } = world.config.flagship.deals;
    const line = media(signed).media;
    expect(
      leagueIncomePerQuarter(signed, world, brazil) - leagueIncomePerQuarter(locked, world, brazil),
    ).toBeCloseTo(line * baselineShare * mediaRevenueCut, 6);
  });

  it("a paying exclusive TV deal cuts the broadcast's lift", () => {
    const state = atOffers();
    const tv = state.flagship.deals.offers.find((offer) => offer.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const exclusive = {
      ...state,
      flagship: {
        ...state.flagship,
        deals: {
          ...state.flagship.deals,
          offers: [{ ...tv, demand: { kind: "exclusivity" as const } }],
        },
      },
    };
    const signed = applyAction(exclusive, world, { type: "signDeal", offerId: tv.id });
    const { exclusivityLiftCut } = world.config.flagship.deals;
    expect(broadcastEffects(signed, world).boost).toBeCloseTo(
      broadcastEffects(state, world).boost * (1 - exclusivityLiftCut),
      9,
    );
  });

  it("a full slate of ordinary offers is 100–120% of the media line it replaces, at every tier", () => {
    const [low, high] = world.config.balanceTargets.dealSlateShare;
    for (const anchor of ["brazil", "sweden"]) {
      const state = runTurns(createCampaign(world, setupFor(1, anchor)), world, 40);
      const seat = countryIndex(world, anchor);
      for (const tier of LEAGUE_TIERS) {
        const countries = [...state.countries];
        const country = countries[seat];
        if (!country?.league) throw new Error(`No ${anchor} league`);
        countries[seat] = { ...country, league: { ...country.league, tier } };
        const share = dealSlateShare({ ...state, countries }, world) ?? 0;
        expect(share, `${anchor} ${tier}`).toBeGreaterThanOrEqual(low);
        expect(share, `${anchor} ${tier}`).toBeLessThanOrEqual(high);
      }
    }
  });
});

describe("demands and breaches (step 4)", () => {
  /** The state with one offer turned into a `demand` and signed. */
  function signedWith(state: GameState, demand: DealDemandTerms | null, slot = "tv") {
    const offer = state.flagship.deals.offers.find((o) => o.slot === slot);
    if (!offer) throw new Error(`No ${slot} offer`);
    const deals = {
      ...state.flagship.deals,
      offers: state.flagship.deals.offers.map((o) => (o.id === offer.id ? { ...o, demand } : o)),
    };
    const withOffer = { ...state, flagship: { ...state.flagship, deals } };
    return { state: applyAction(withOffer, world, { type: "signDeal", offerId: offer.id }), offer };
  }
  const setLeague = (state: GameState, change: (league: LeagueState) => LeagueState | null) => {
    const countries = [...state.countries];
    const country = countries[brazil];
    if (!country?.league) throw new Error("No Brazil league");
    countries[brazil] = { ...country, league: change(country.league) };
    return { ...state, countries };
  };
  const cashOf = (state: GameState) => state.countries[brazil]?.league?.cash ?? 0;

  it("a step-down below a tier floor breaks the deal: value lost, a penalty, the partner shuns", () => {
    const pro = setLeague(atOffers(), (l) => ({
      ...l,
      tier: "professional",
      health: "near-collapse",
    }));
    const { state, offer } = signedWith(pro, { kind: "tierFloor", tier: "professional" });
    const cash = cashOf(state);
    const after = applyAction(state, world, { type: "stepDownLeague", countryId: "brazil" });
    const { penaltySeasons, shunSeasons } = world.config.flagship.deals.breach;
    expect(after.flagship.deals.signed).toEqual([]);
    expect(cashOf(after)).toBeCloseTo(cash - penaltySeasons * offer.annualValue, 6);
    expect(after.flagship.deals.shunned).toContainEqual({
      partnerId: offer.partnerId,
      untilSeason: state.flagship.season + shunSeasons,
    });
    expect(after.landmarks.at(-1)).toMatchObject({
      kind: "dealBroken",
      partnerId: offer.partnerId,
      demand: "tierFloor",
      penalty: penaltySeasons * offer.annualValue,
    });
    expect(checkInvariants(after, world)).toEqual([]);
    // A shunned partner makes no offers until its shunning ends.
    for (let seed = 1; seed <= 10; seed += 1) {
      const offers = reoffer(after, world, seed).flagship.deals.offers;
      expect(offers.some((o) => o.partnerId === offer.partnerId)).toBe(false);
    }
  });

  it("forced breaches count: a folded league breaks a tier floor, a seat moved away a seat lock", () => {
    const base = atOffers();
    const floor = signedWith(base, { kind: "tierFloor", tier: "amateur" }).state;
    expect(breakDeals(floor, world).flagship.deals.signed).toHaveLength(1);
    const folded = breakDeals(
      setLeague(floor, () => null),
      world,
    );
    expect(folded.flagship.deals.signed).toEqual([]);
    // With no league to charge, the breach costs nothing in cash.
    expect(folded.landmarks.at(-1)).toMatchObject({ kind: "dealBroken", penalty: 0 });

    const lock = signedWith(base, { kind: "seatLock", countryId: "brazil" }).state;
    const moved = { ...lock, flagship: { ...lock.flagship, countryId: "argentina" } };
    expect(breakDeals(moved, world).flagship.deals.signed).toEqual([]);
    // Exclusivity never breaks.
    const exclusive = signedWith(base, { kind: "exclusivity" }).state;
    expect(
      breakDeals(
        setLeague(exclusive, () => null),
        world,
      ).flagship.deals.signed,
    ).toHaveLength(1);
  });

  it("a rule demand breaks when its deadline offseason closes unamended, and holds if amended", () => {
    const content = withConfig(world, (config) => {
      config.flagship.deals.seasons = { min: 5, max: 5 };
    });
    let base = createCampaign(content, setupFor(11, "brazil"));
    while (base.flagship.deals.offers.length === 0) base = step(base, content);
    base = { ...base, pp: 1_000_000 };
    const tv = base.flagship.deals.offers.find((o) => o.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const option = base.genome.matchLength === "short" ? "standard" : "short";
    const due = base.flagship.season + content.config.flagship.deals.ruleDemand.dueOffseasons;
    const deals = {
      ...base.flagship.deals,
      offers: base.flagship.deals.offers.map((o) =>
        o.id === tv.id
          ? {
              ...o,
              demand: {
                kind: "ruleChange" as const,
                axis: "matchLength" as const,
                option,
                dueSeason: due,
              },
            }
          : o,
      ),
    };
    const state = applyAction({ ...base, flagship: { ...base.flagship, deals } }, content, {
      type: "signDeal",
      offerId: tv.id,
    });
    /** Plays until the offseason of `season` is open. */
    const toOffseason = (from: GameState, season: number) => {
      let next = from;
      while (!(next.flagship.offseason && next.flagship.season === season)) {
        next = step(next, content);
      }
      return next;
    };
    const brokenAt = (s: GameState) =>
      s.landmarks.some((l) => l.kind === "dealBroken" && l.dealId === tv.id);
    const atDeadline = toOffseason(state, due);
    expect(atDeadline.flagship.deals.signed.some((d) => d.id === tv.id)).toBe(true);
    const missed = step(atDeadline, content);
    expect(brokenAt(missed)).toBe(true);
    expect(missed.flagship.deals.signed.some((d) => d.id === tv.id)).toBe(false);

    // Amended in the first offseason after signing: the deal holds through the deadline.
    const first = toOffseason(state, state.flagship.season + 1);
    const amended = applyAction(first, content, { type: "amendRule", axis: "matchLength", option });
    const kept = step(toOffseason(amended, due), content);
    expect(brokenAt(kept)).toBe(false);
    expect(kept.flagship.deals.signed.some((d) => d.id === tv.id)).toBe(true);
  });

  it("naming rights on a famous ground betray it; on the founding ground they offend the rite", () => {
    const base = atOffers();
    const settings = world.config.flagship.deals.namingRights;
    const hardcore = (s: GameState) => s.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    const club = base.flagship.clubs.find(
      (c) => c.active && c.countryId === "brazil" && c.id !== base.identity.foundingClubId,
    );
    if (!club) throw new Error("No second club");
    const famous = reoffer(
      withTradition(base, "venue", "brazil", { clubIds: [club.id] }),
      world,
      2,
    );
    const venue = famous.culture.traditions.at(-1);
    const offer = famous.flagship.deals.offers.find(
      (o) => o.slot === "namingRights" && o.position === club.id,
    );
    if (!venue || !offer) throw new Error("No naming offer for the famous ground");
    const signed = applyAction(famous, world, { type: "signDeal", offerId: offer.id });
    expect(signed.culture.traditions.find((t) => t.id === venue.id)?.strength).toBeCloseTo(
      1 - settings.traditionWear,
      9,
    );
    expect(hardcore(signed)).toBeLessThan(hardcore(famous));
    // The ground's pilgrimage is cut while the name stands.
    expect(venueStrengths(signed, world)[brazil]).toBeCloseTo(
      (1 - settings.traditionWear) * (1 - settings.pilgrimageCut),
      9,
    );

    const founding = base.identity.foundingClubId;
    const withRite = reoffer(
      withTradition(base, "rite", "brazil", { clubIds: [founding] }),
      world,
      2,
    );
    const rite = withRite.culture.traditions.at(-1);
    const naming = withRite.flagship.deals.offers.find(
      (o) => o.slot === "namingRights" && o.position === founding,
    );
    if (!rite || !naming) throw new Error("No naming offer for the founding ground");
    const offended = applyAction(withRite, world, { type: "signDeal", offerId: naming.id });
    expect(offended.culture.traditions.find((t) => t.id === rite.id)?.strength).toBeCloseTo(
      1 - settings.traditionWear,
      9,
    );
    expect(hardcore(offended)).toBeLessThan(hardcore(withRite));
    // Without a tradition to betray, naming the founding ground costs no fans.
    const plain = base.flagship.deals.offers.find((o) => o.slot === "namingRights");
    if (!plain) throw new Error("No naming offer");
    const quiet = applyAction(base, world, { type: "signDeal", offerId: plain.id });
    expect(hardcore(quiet)).toBe(hardcore(base));
  });

  it("a broken deal's landmark round-trips through a save", () => {
    const base = atOffers();
    const lock = signedWith(base, { kind: "seatLock", countryId: "brazil" }).state;
    const broken = breakDeals(
      { ...lock, flagship: { ...lock.flagship, countryId: "chile" } },
      world,
    );
    const back = { ...broken, flagship: { ...broken.flagship, countryId: "brazil" } };
    const text = serializeSave(back);
    expect(serializeSave(deserializeSave(text, world))).toBe(text);
  });
});

describe("news and the snapshot (step 5)", () => {
  const seasonsOne = withConfig(world, (config) => {
    config.flagship.deals.seasons = { min: 1, max: 1 };
  });

  it("a broken deal is big business news the next turn, telling its cost; it takes no slot", () => {
    const base = atOffers();
    const tv = base.flagship.deals.offers.find((o) => o.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const deals = {
      ...base.flagship.deals,
      offers: base.flagship.deals.offers.map((o) =>
        o.id === tv.id
          ? { ...o, demand: { kind: "tierFloor" as const, tier: "amateur" as const } }
          : o,
      ),
    };
    const signed = applyAction({ ...base, flagship: { ...base.flagship, deals } }, world, {
      type: "signDeal",
      offerId: tv.id,
    });
    // The league folds: a forced breach of the tier floor, recorded as a landmark. The next turn
    // (league restored, so the turn plays on) tells it.
    const folded = signed.countries.map((c, i) => (i === brazil ? { ...c, league: null } : c));
    const broken = breakDeals({ ...signed, countries: folded }, world);
    const next = endTurn({ ...broken, countries: signed.countries }, world);
    const card = eventSnapshots(next, world).find((e) => e.templateId === "deal-broken");
    expect(card).toMatchObject({
      kind: "moment",
      weight: "big",
      family: "business",
      facts: { deal: { dealId: tv.id, partnerId: tv.partnerId, slot: "tv", demand: "tierFloor" } },
    });
    const template = world.events.cards.find((c) => c.id === "deal-broken");
    expect(takesNoSlot(template)).toBe(true);
  });

  it("a deal that ran its term is a minor toast, and its partner's renewal is marked", () => {
    const state = atOffers(seasonsOne);
    const tv = state.flagship.deals.offers.find((o) => o.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    let next = applyAction(state, seasonsOne, { type: "signDeal", offerId: tv.id });
    const season = next.flagship.season;
    while (next.flagship.deals.offeredSeason === season) next = step(next, seasonsOne);
    expect(next.landmarks.some((l) => l.kind === "dealEnded" && l.dealId === tv.id)).toBe(true);
    const card = eventSnapshots(next, seasonsOne).find((e) => e.templateId === "deal-ended");
    expect(card).toMatchObject({ weight: "minor", family: "business" });
    const snapshotDeals = dealsSnapshot(next, seasonsOne);
    expect(snapshotDeals.offers.find((o) => o.renewal)).toMatchObject({
      partnerId: tv.partnerId,
      slot: "tv",
    });
    expect(snapshotDeals.slots.find((s) => s.slot === "tv")?.dealId).toBeNull();
  });

  it("the snapshot flags a rule demand due this offseason", () => {
    const content = withConfig(world, (config) => {
      config.flagship.deals.seasons = { min: 5, max: 5 };
    });
    let base = createCampaign(content, setupFor(11, "brazil"));
    while (base.flagship.deals.offers.length === 0) base = step(base, content);
    const tv = base.flagship.deals.offers.find((o) => o.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const option = base.genome.matchLength === "short" ? "standard" : "short";
    const due = base.flagship.season + content.config.flagship.deals.ruleDemand.dueOffseasons;
    const deals = {
      ...base.flagship.deals,
      offers: base.flagship.deals.offers.map((o) =>
        o.id === tv.id
          ? {
              ...o,
              demand: {
                kind: "ruleChange" as const,
                axis: "matchLength" as const,
                option,
                dueSeason: due,
              },
            }
          : o,
      ),
    };
    let next = applyAction({ ...base, flagship: { ...base.flagship, deals } }, content, {
      type: "signDeal",
      offerId: tv.id,
    });
    const flag = (s: GameState) => dealsSnapshot(s, content).signed.find((d) => d.id === tv.id);
    expect(flag(next)).toMatchObject({ paying: true, ruleOpen: true, ruleDueNow: false });
    while (!(next.flagship.offseason && next.flagship.season === due)) next = step(next, content);
    expect(flag(next)).toMatchObject({ ruleOpen: true, ruleDueNow: true });
  });

  it("a version 19 save's events tell no deal", () => {
    const state = atOffers();
    const { deals: _deals, ...flagship } = state.flagship;
    const strip = (list: GameState["events"]["pending"]) =>
      list.map(({ facts: { deal: _deal, ...facts }, ...event }) => ({ ...event, facts }));
    const v19 = {
      ...state,
      flagship,
      events: {
        ...state.events,
        pending: strip(state.events.pending),
        history: strip(state.events.history),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 19, state: v19 }), world);
    const all = [...loaded.events.pending, ...loaded.events.history];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((event) => event.facts.deal === null)).toBe(true);
  });
});

describe("bots (step 6)", () => {
  it("sign the highest-value offer in every slot, demands included", () => {
    const state = atOffers();
    const played = builder(state, world);
    const signed = played.actions.flatMap((a) => (a.type === "signDeal" ? [a.offerId] : []));
    const slots = new Set(state.flagship.deals.offers.map(slotKey));
    expect(signed).toHaveLength(slots.size);
    for (const key of slots) {
      const best = state.flagship.deals.offers
        .filter((o) => slotKey(o) === key)
        .sort((a, b) => b.annualValue - a.annualValue || a.id - b.id)[0];
      expect(signed).toContain(best?.id);
    }
    expect(played.state.flagship.deals.offers).toEqual([]);
  });
});

describe("clauses (GDD v1.29, tech plan 2.16 step 1)", () => {
  it("TV offers draw balance, sponsors a star, any slot fans; every slot keeps a plain offer", () => {
    const forced = withConfig(world, (config) => {
      const { demands } = config.flagship.deals;
      demands.tierFloor.chance = 0;
      demands.seatLock.chance = 0;
      demands.exclusivity.chance = 0;
      demands.balance.chance = 1;
      demands.star.chance = 1;
      demands.fans.chance = 1;
      config.flagship.deals.ruleDemand.chancePerOffseason = 0;
    });
    const state = atOffers(forced);
    const longest = forced.config.flagship.deals.clauses.walkAfterMisses + 1;
    const seen = new Map<string, Set<string | undefined>>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const offers = reoffer(state, forced, seed).flagship.deals.offers;
      for (const offer of offers) {
        if (!offer.demand) continue;
        seen.set(offer.slot, (seen.get(offer.slot) ?? new Set()).add(offer.demand.kind));
        // A clause only on a deal long enough for a walk to cost something.
        expect(offer.seasons).toBeGreaterThanOrEqual(longest);
      }
      for (const key of new Set(offers.map(slotKey))) {
        expect(
          offers.some((o) => slotKey(o) === key && o.demand === null),
          key,
        ).toBe(true);
      }
    }
    expect(seen.get("tv")).toEqual(new Set(["balance"]));
    expect(seen.get("sponsor")).toEqual(new Set(["star"]));
    expect(seen.get("namingRights")).toEqual(new Set(["fans"]));
  });

  it("clauses never break a deal; a format 20 save's deals start with no clause record", () => {
    const base = atOffers();
    const tv = base.flagship.deals.offers.find((o) => o.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const deals = {
      ...base.flagship.deals,
      offers: base.flagship.deals.offers.map((o) =>
        o.id === tv.id ? { ...o, demand: { kind: "balance" as const } } : o,
      ),
    };
    const signed = applyAction({ ...base, flagship: { ...base.flagship, deals } }, world, {
      type: "signDeal",
      offerId: tv.id,
    });
    const folded = signed.countries.map((c, i) => (i === brazil ? { ...c, league: null } : c));
    expect(breakDeals({ ...signed, countries: folded }, world).flagship.deals.signed).toHaveLength(
      1,
    );

    const v20 = {
      ...signed,
      flagship: {
        ...signed.flagship,
        deals: {
          ...signed.flagship.deals,
          signed: signed.flagship.deals.signed.map(
            ({ clauseMet: _m, clauseMisses: _x, fansMark: _f, ...deal }) => deal,
          ),
        },
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 20, state: v20 }), world);
    const fans = signed.countries[brazil]?.fans[PLAYER_INDEX];
    expect(loaded.flagship.deals.signed[0]).toMatchObject({
      clauseMet: 0,
      clauseMisses: 0,
      fansMark: (fans?.casual ?? 0) + (fans?.hardcore ?? 0),
    });
  });
});

describe("judging clauses (tech plan 2.16 step 2)", () => {
  /** An open offseason not yet offered, holding one signed deal with `demand` paid last season. */
  function judging(content: World, demand: DealDemandTerms, extra: Partial<Deal> = {}) {
    const state = atOffers(content);
    const tv = state.flagship.deals.offers.find((o) => o.slot === "tv");
    if (!tv) throw new Error("No TV offer");
    const season = state.flagship.season;
    const deal: Deal = {
      ...tv,
      demand,
      firstSeason: season - 1,
      lastSeason: season + 2,
      countryId: "brazil",
      clauseMet: 0,
      clauseMisses: 0,
      fansMark: 0,
      ...extra,
    };
    return {
      ...state,
      flagship: {
        ...state.flagship,
        deals: { ...state.flagship.deals, signed: [deal], offers: [], offeredSeason: null },
      },
    };
  }
  const cash = (s: GameState) => s.countries[brazil]?.league?.cash ?? 0;
  const only = (s: GameState) => s.flagship.deals.signed[0];
  const { bonusShare, renewalEdgePerMet } = world.config.flagship.deals.clauses;
  const fansNow = (s: GameState) =>
    (s.countries[brazil]?.fans[PLAYER_INDEX]?.casual ?? 0) +
    (s.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0);

  it("met: a bonus of the annual value, one more season met, misses cleared", () => {
    const state = judging(world, { kind: "fans" }, { clauseMisses: 1 });
    const judged = judgeClauses(state, world);
    const deal = only(state);
    expect(cash(judged) - cash(state)).toBeCloseTo(bonusShare * (deal?.annualValue ?? 0), 9);
    expect(only(judged)).toMatchObject({ clauseMet: 1, clauseMisses: 0, fansMark: fansNow(state) });
    // Once an offseason: judged again after its offers, nothing changes.
    expect(judgeClauses(offerDeals(judged, world), world).flagship.deals.signed).toEqual(
      offerDeals(judged, world).flagship.deals.signed,
    );
  });

  it("missed twice in a row: the partner walks, without penalty or shunning", () => {
    const state = judging(world, { kind: "fans" }, { fansMark: Number.MAX_SAFE_INTEGER });
    const once = judgeClauses(state, world);
    expect(only(once)).toMatchObject({ clauseMisses: 1, fansMark: fansNow(state) });
    expect(cash(once)).toBe(cash(state));
    const again = judgeClauses(
      {
        ...once,
        flagship: {
          ...once.flagship,
          deals: {
            ...once.flagship.deals,
            signed: once.flagship.deals.signed.map((d) => ({
              ...d,
              fansMark: Number.MAX_SAFE_INTEGER,
            })),
          },
        },
      },
      world,
    );
    expect(again.flagship.deals.signed).toEqual([]);
    expect(again.flagship.deals.shunned).toEqual(state.flagship.deals.shunned);
    expect(cash(again)).toBe(cash(state));
    expect(again.landmarks.at(-1)).toMatchObject({ kind: "dealWalked", clause: "fans" });
    expect(checkInvariants(again, world)).toEqual([]);
  });

  it("balance is missed after a runaway or foregone season; a star is met while one plays", () => {
    const runaways = withConfig(world, (config) => {
      config.flagship.stories.runawayShare = 0;
    });
    expect(only(judgeClauses(judging(runaways, { kind: "balance" }), runaways))?.clauseMisses).toBe(
      1,
    );
    const calm = withConfig(world, (config) => {
      config.flagship.stories.runawayShare = 1_000;
      config.flagship.stories.foregoneTitles = 1_000;
      config.flagship.stories.dynastyTitles = 999;
    });
    expect(only(judgeClauses(judging(calm, { kind: "balance" }), calm))?.clauseMet).toBe(1);

    const state = judging(world, { kind: "star" });
    const noStars = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map((p) => ({ ...p, starSince: null })),
      },
    };
    expect(only(judgeClauses(noStars, world))?.clauseMisses).toBe(1);
    const seatClub = state.flagship.clubs.find((c) => c.active && c.countryId === "brazil");
    const withStar = {
      ...noStars,
      flagship: {
        ...noStars.flagship,
        players: noStars.flagship.players.map((p) =>
          p.clubId === seatClub?.id && p.retiredSeason === null ? { ...p, starSince: 1 } : p,
        ),
      },
    };
    expect(only(judgeClauses(withStar, world))?.clauseMet).toBe(1);
  });

  it("the fans clause forgives a wobble within its tolerance, not a real drop", () => {
    const { fansTolerance } = world.config.flagship.deals.clauses;
    const now = fansNow(judging(world, { kind: "fans" }));
    // Fans now sit just inside, then just outside, the tolerance below the mark.
    const inside = now / (1 - fansTolerance * 0.9);
    const outside = now / (1 - fansTolerance * 1.1);
    const at = (mark: number) =>
      only(judgeClauses(judging(world, { kind: "fans" }, { fansMark: mark }), world));
    expect(at(inside)).toMatchObject({ clauseMet: 1, clauseMisses: 0 });
    expect(at(outside)).toMatchObject({ clauseMet: 0, clauseMisses: 1 });
  });

  it("a walk is big business news the next turn, told by its clause", () => {
    const missed = { kind: "fans" as const };
    const state = judging(world, missed, {
      clauseMisses: world.config.flagship.deals.clauses.walkAfterMisses - 1,
      fansMark: Number.MAX_SAFE_INTEGER,
    });
    const walked = judgeClauses(state, world);
    expect(walked.flagship.deals.signed).toEqual([]);
    const next = endTurn(offerDeals(walked, world), world);
    const card = eventSnapshots(next, world).find((e) => e.templateId === "deal-walked");
    expect(card).toMatchObject({
      weight: "big",
      family: "business",
      facts: { deal: { demand: "fans", penalty: 0 } },
    });
  });

  it("a deal judged in its final season renews with an edge grown by every season met", () => {
    const state = judging(
      world,
      { kind: "fans" },
      { clauseMet: 2, lastSeason: atOffers().flagship.season - 1 },
    );
    const offered = offerDeals(judgeClauses(state, world), world);
    const renewal = offered.flagship.deals.offers.find((o) => o.renewal && o.slot === "tv");
    const ref = { slot: "tv" as const, position: 0 };
    const ordinary = Math.min(dealCap(offered, world), ordinaryDealValue(offered, world, ref));
    const edge = world.config.flagship.deals.renewalEdge + renewalEdgePerMet * 3;
    expect(renewal?.annualValue).toBeCloseTo(ordinary * (1 + edge), 6);
  });
});

describe("the runner's clause report (tech plan 2.16 step 4)", () => {
  it("counts every judgement, the final season's included, and every walk", () => {
    const { result } = playCampaign(world, {
      seed: 1,
      anchorCountryId: "brazil",
      genome: baseGenome,
      genomeLabel: "base",
      bot: "builder",
      turns: 60,
    });
    const entries = Object.values(result.deals.clauses);
    expect(entries.reduce((sum, n) => sum + n.met + n.missed, 0)).toBeGreaterThan(0);
    for (const n of entries) expect(n.walked).toBeLessThanOrEqual(n.missed);
    // No clause judged more seasons than clause deals were signed for at most five each.
    const signed = ["balance", "star", "fans"].reduce(
      (sum, kind) => sum + (result.deals.demandsSigned[kind] ?? 0),
      0,
    );
    const judged = entries.reduce((sum, n) => sum + n.met + n.missed, 0);
    expect(judged).toBeLessThanOrEqual(signed * world.config.flagship.deals.seasons.max);
  });
});

describe("the minimum offer (GDD v1.32)", () => {
  it("makes no offer worth less than the minimum a season; a slot without one stays empty", () => {
    const loose = atOffers(world);
    const values = loose.flagship.deals.offers.map((o) => o.annualValue);
    const min = Math.min(...values);
    // Set the bar between the smallest and largest plain offers: the smallest are dropped.
    const strict = withConfig(world, (c) => {
      c.flagship.deals.minOfferValue = min * 1.5;
    });
    const state = reoffer(loose, strict, 5);
    const ordinary = state.flagship.deals.offers;
    expect(ordinary.length).toBeLessThan(loose.flagship.deals.offers.length);
    for (const offer of ordinary) {
      const premium = offer.demand
        ? strict.config.flagship.deals.demands[offer.demand.kind].premium
        : 0;
      expect(offer.annualValue / (1 + premium)).toBeGreaterThanOrEqual(min * 1.5 - 1e-9);
    }
    // Every slot with offers still has one without a demand.
    const slots = new Set(ordinary.map((o) => `${o.slot}:${o.position}`));
    for (const slot of slots)
      expect(ordinary.some((o) => `${o.slot}:${o.position}` === slot && o.demand === null)).toBe(
        true,
      );
    expect(shipped.config.flagship.deals.minOfferValue).toBeGreaterThan(0);
  });
});
