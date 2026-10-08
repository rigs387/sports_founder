import { describe, expect, it } from "vitest";
import {
  activeClubs,
  applyAction,
  checkAction,
  checkInvariants,
  closeOffseason,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  landmarks,
  leagueCosts,
  leagueIncomePerQuarter,
  offerVenueCards,
  PLAYER_INDEX,
  runningCostPerQuarter,
  seatedCrowd,
  serializeSave,
  starWage,
  updateCulture,
  venueBlocker,
  venueCapacity,
  venueConversion,
  venueTerms,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason, withTradition } from "./culture-helpers";
import {
  countryIndex,
  crowdless,
  migratedHall,
  setupFor,
  venueless,
  withConfig,
  world,
} from "./helpers";

// Venues and payroll (GDD v1.30, tech plan 2.17).

const brazil = countryIndex(world, "brazil");

/** Brazil's campaign played until its first flagship season has ended. */
function afterFirstSeason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) {
    state = endTurn(state, world);
    expect(checkInvariants(state, world)).toEqual([]);
  }
  return state;
}

describe("venue state (tech plan 2.17 step 1)", () => {
  it("capacity rises with the level as a share of the population", () => {
    const population = world.countries[brazil]?.population ?? 0;
    const shares = world.config.leagues.venue.capacityShare;
    const capacities = [1, 2, 3, 4, 5].map((level) => venueCapacity(world, brazil, level));
    expect(capacities[0]).toBe(Math.floor((shares[0] ?? 0) * population));
    for (let i = 1; i < capacities.length; i += 1)
      expect(capacities[i]).toBeGreaterThan(capacities[i - 1] ?? 0);
    expect(seatedCrowd(world, brazil, 1, 10)).toBe(10);
    expect(seatedCrowd(world, brazil, 1, Number.MAX_SAFE_INTEGER)).toBe(capacities[0]);
  });

  it("a league starts at level 1; a season records its seated crowd", () => {
    const state = afterFirstSeason();
    const league = state.countries[brazil]?.league;
    expect(league?.venue).toEqual({
      level: 1,
      building: null,
      record: state.flagship.seasons[0]?.crowd,
    });
    const summary = state.flagship.seasons[0];
    expect(summary?.crowd).toBeGreaterThan(0);
    const hardcore = state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    expect(summary?.crowd).toBeLessThanOrEqual(Math.max(hardcore, venueCapacity(world, brazil, 1)));
  });

  it("a format 21 save migrates to level 1 venues and crowdless seasons", () => {
    const played = afterFirstSeason();
    const v21 = {
      ...played,
      countries: played.countries.map((c) => {
        if (!c.league) return c;
        const { venue: _v, ...league } = c.league;
        return { ...c, league };
      }),
      flagship: {
        ...played.flagship,
        seasons: played.flagship.seasons.map(({ crowd: _c, recordCrowd: _r, ...season }) => season),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 21, state: v21 }), world);
    expect(serializeSave(loaded)).toBe(
      serializeSave({
        ...played,
        countries: venueless(played),
        flagship: {
          ...played.flagship,
          seasons: crowdless(played.flagship.seasons),
        },
        hallOfFame: migratedHall(played),
      }),
    );
  });
});

/** The state with Brazil's player hardcore fans set to `hardcore`. */
function withHardcore(state: GameState, index: number, hardcore: number): GameState {
  return {
    ...state,
    countries: state.countries.map((c, i) =>
      i === index
        ? { ...c, fans: c.fans.map((f, s) => (s === PLAYER_INDEX ? { ...f, hardcore } : f)) }
        : c,
    ),
  };
}

/** The state with Brazil's league venue at `level`. */
function atLevel(state: GameState, index: number, level: number): GameState {
  return {
    ...state,
    countries: state.countries.map((c, i) =>
      i === index && c.league
        ? { ...c, league: { ...c.league, venue: { ...c.league.venue, level } } }
        : c,
    ),
  };
}

/** The state with the leading player of the seat's first active club a star since `since`. */
function withStar(state: GameState, since: number, influence = 0): GameState {
  const clubId = activeClubs(state.flagship)[0]?.id;
  return {
    ...state,
    flagship: {
      ...state.flagship,
      players: state.flagship.players.map((p) =>
        p.clubId === clubId && p.retiredSeason === null
          ? {
              ...p,
              starSince: since,
              backing:
                influence > 0 ? { season: since, influence, honors: false, mentee: null } : null,
            }
          : p,
      ),
    },
  };
}

describe("money (tech plan 2.17 step 2)", () => {
  it("the seat's gate is paid only on hardcore fans its venue seats; elsewhere it is uncapped", () => {
    const state = afterFirstSeason();
    const capacity = venueCapacity(world, brazil, 1);
    const atCapacity = leagueIncomePerQuarter(withHardcore(state, brazil, capacity), world, brazil);
    const overflowing = leagueIncomePerQuarter(
      withHardcore(state, brazil, capacity * 3),
      world,
      brazil,
    );
    expect(overflowing).toBeCloseTo(atCapacity, 6);
    const bigger = atLevel(withHardcore(state, brazil, capacity * 3), brazil, 2);
    expect(leagueIncomePerQuarter(bigger, world, brazil)).toBeGreaterThan(atCapacity);
    // Away from the seat nothing is capped.
    const away = { ...state, flagship: { ...state.flagship, countryId: "argentina" } };
    expect(
      leagueIncomePerQuarter(withHardcore(away, brazil, capacity * 3), world, brazil),
    ).toBeGreaterThan(leagueIncomePerQuarter(withHardcore(away, brazil, capacity), world, brazil));
  });

  it("without stars the seat's costs total today's running cost, split into operations and payroll", () => {
    const state = afterFirstSeason();
    const noStars = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map((p) => ({ ...p, starSince: null })),
      },
    };
    const tier = noStars.countries[brazil]?.league?.tier ?? "amateur";
    const running = runningCostPerQuarter(world, brazil, tier, noStars.growthNodes);
    const costs = leagueCosts(noStars, world, brazil);
    expect(costs.total).toBeCloseTo(running, 9);
    expect(costs.wages).toBe(0);
    expect(costs.payroll).toBeCloseTo(world.config.flagship.payroll.baselineShare * running, 9);
    // Upkeep for every level above 1, wherever the league is, each priced by the tier it serves
    // (level 2 Professional, level 3 Elite) while the league is smaller.
    const upkeep = leagueCosts(atLevel(noStars, brazil, 3), world, brazil).upkeep;
    const at = (t: "professional" | "elite") =>
      runningCostPerQuarter(world, brazil, t, noStars.growthNodes);
    expect(tier).toBe("amateur");
    expect(upkeep).toBeCloseTo(
      world.config.leagues.venue.upkeepShare * (at("professional") + at("elite")),
      9,
    );
  });

  it("a star's wage rises with seasons as a star and influence, and ends when they leave the seat", () => {
    const state = afterFirstSeason();
    const season = state.flagship.season;
    const { wageShare, perSeason, perInfluence } = world.config.flagship.payroll;
    const tier = state.countries[brazil]?.league?.tier ?? "amateur";
    const running = runningCostPerQuarter(world, brazil, tier, state.growthNodes);
    const star = (s: GameState) => s.flagship.players.find((p) => p.starSince !== null);
    const fresh = withStar(state, season - 1);
    const veteran = withStar(state, season - 4, 0.5);
    const freshStar = star(fresh);
    const veteranStar = star(veteran);
    if (!freshStar || !veteranStar) throw new Error("No star");
    expect(starWage(freshStar, fresh.flagship, running, world)).toBeCloseTo(wageShare * running, 9);
    expect(starWage(veteranStar, veteran.flagship, running, world)).toBeCloseTo(
      wageShare * running * (1 + 3 * perSeason) * (1 + 0.5 * perInfluence),
      9,
    );
    const base = leagueCosts(
      {
        ...state,
        flagship: {
          ...state.flagship,
          players: state.flagship.players.map((p) => ({ ...p, starSince: null })),
        },
      },
      world,
      brazil,
    ).total;
    expect(leagueCosts(fresh, world, brazil).total).toBeGreaterThan(base);
    // A star who moved to a dormant club draws no wage at the seat.
    const moved = {
      ...fresh,
      flagship: {
        ...fresh.flagship,
        players: fresh.flagship.players.map((p) =>
          p.id === freshStar.id ? { ...p, clubId: -1 } : p,
        ),
      },
    };
    expect(leagueCosts(moved, world, brazil).wages).toBe(0);
  });
});

/** The state with Brazil's league cash set to `cash`. */
function withCash(state: GameState, cash: number): GameState {
  return {
    ...state,
    countries: state.countries.map((c, i) =>
      i === brazil && c.league ? { ...c, league: { ...c.league, cash } } : c,
    ),
  };
}

const venueOf = (state: GameState) => state.countries[brazil]?.league?.venue;

describe("building, fans and culture (tech plan 2.17 step 3)", () => {
  it("builds the next level in the offseason for its price, one level at a time", () => {
    const state = afterFirstSeason();
    expect(state.flagship.offseason).toBe(true);
    const terms = venueTerms(state, world);
    if (!terms) throw new Error("No venue terms");
    // Level 2 serves Professional: priced at its running cost, not the Amateur league's.
    expect(state.countries[brazil]?.league?.tier).toBe("amateur");
    const running = runningCostPerQuarter(world, brazil, "professional", state.growthNodes);
    expect(terms).toMatchObject({ level: 2, seasons: world.config.leagues.venue.buildSeasons[0] });
    expect(terms.price).toBeCloseTo(
      (world.config.leagues.venue.priceQuarters[0] ?? 0) * running,
      9,
    );

    expect(venueBlocker(withCash(state, terms.price - 1), world)).toBe("cash");
    const rich = withCash(state, terms.price + 10);
    const built = applyAction(rich, world, { type: "buildVenue" });
    expect(built.countries[brazil]?.league?.cash).toBeCloseTo(10, 9);
    expect(venueOf(built)).toEqual({
      level: 1,
      building: { level: 2, opensSeason: terms.opensSeason },
      record: venueOf(rich)?.record ?? null,
    });
    expect(checkAction(built, world, { type: "buildVenue" })).toMatch(/already being built/);
    const closed = closeOffseason(rich, world);
    expect(venueBlocker(closed, world)).toBe("window");
  });

  it("a level opens when the offseason before its season closes", () => {
    const state = afterFirstSeason();
    const terms = venueTerms(state, world);
    if (!terms) throw new Error("No venue terms");
    let next = applyAction(withCash(state, terms.price + 1e6), world, { type: "buildVenue" });
    while (next.flagship.season < terms.opensSeason) {
      next = endTurn(next, world);
      expect(venueOf(next)?.level).toBe(1);
    }
    while (next.flagship.offseason || venueOf(next)?.level === 1) next = endTurn(next, world);
    expect(venueOf(next)).toMatchObject({ level: 2, building: null });
    expect(next.landmarks.find((l) => l.kind === "venueOpened")).toMatchObject({
      countryId: "brazil",
      level: 2,
      modernized: false,
    });
    expect(checkInvariants(next, world)).toEqual([]);
  });

  it("the conversion boost grows with the level and fades while fans overflow", () => {
    const state = afterFirstSeason();
    const capacity = venueCapacity(world, brazil, 2);
    const boost = world.config.leagues.venue.conversionBoost;
    const seated = atLevel(withHardcore(state, brazil, capacity), brazil, 2);
    expect(venueConversion(seated, world, brazil)).toBeCloseTo(1 + 2 * boost, 9);
    const overflowing = atLevel(withHardcore(state, brazil, capacity * 4), brazil, 2);
    expect(venueConversion(overflowing, world, brazil)).toBeCloseTo(1 + (2 * boost) / 4, 9);
    const away = { ...seated, flagship: { ...seated.flagship, countryId: "argentina" } };
    expect(venueConversion(away, world, brazil)).toBe(1);
  });

  it("opening a level at the modernization level betrays the famous grounds", () => {
    const base = afterFirstSeason();
    const from = world.config.leagues.venue.modernize.fromLevel;
    const famous = withTradition(atLevel(base, brazil, from - 1), "venue", "brazil", {
      clubIds: [clubIds(base)[0] ?? 0],
    });
    const content = withConfig(world, (config) => {
      config.leagues.venue.buildSeasons = [1, 1, 1, 1];
    });
    const terms = venueTerms(famous, content);
    if (!terms) throw new Error("No venue terms");
    expect(terms.modernizes).toBe(true);
    let next = applyAction(withCash(famous, terms.price + 1e6), content, {
      type: "buildVenue",
    });
    const hardcore = (s: GameState) => s.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    while (venueOf(next)?.level !== from) next = endTurn(next, content);
    expect(next.landmarks.find((l) => l.kind === "venueOpened")).toMatchObject({
      level: from,
      modernized: true,
    });
    const tradition = ofType(next, "venue").find((t) => t.id === ofType(famous, "venue")[0]?.id);
    expect(tradition?.strength ?? 0).toBeLessThan(1);
    expect(hardcore(next)).toBeGreaterThan(0);
  });

  it("a record crowd is one more fame fact for the champion's ground", () => {
    let state = fresh();
    const founding = state.identity.foundingClubId;
    const [a = 0, b = 0] = clubIds(state).filter((id) => id !== founding);
    state = updateCulture(withSeason(state, a, b, { recordCrowd: true }), world);
    expect(ofType(state, "venue")).toEqual([]);
    state = updateCulture(withSeason(state, a, b), world);
    expect(ofType(state, "venue").map((t) => t.clubIds[0])).toEqual([a]);
  });

  it("the first season's crowd sets the league's record without being a record crowd", () => {
    const state = afterFirstSeason();
    const first = state.flagship.seasons[0];
    expect(first?.recordCrowd).toBe(false);
    expect(venueOf(state)?.record).toBe(first?.crowd);
  });

  it("at the seat, promotion needs the venue level for the new tier", () => {
    const state = afterFirstSeason();
    const needed = world.config.leagues.venue.promotionLevel["semi-pro"];
    const content = withConfig(world, (config) => {
      config.leagues.venue.promotionLevel["semi-pro"] = 2;
    });
    const ready = withCash(withHardcore(state, brazil, 10_000_000), 1e9);
    expect(needed).toBe(1);
    expect(checkAction(ready, world, { type: "promoteLeague", countryId: "brazil" })).toBeNull();
    expect(checkAction(ready, content, { type: "promoteLeague", countryId: "brazil" })).toMatch(
      /venue level 2/,
    );
    expect(
      checkAction(atLevel(ready, brazil, 2), content, {
        type: "promoteLeague",
        countryId: "brazil",
      }),
    ).toBeNull();
  });
});

describe("venue news (tech plan 2.17 step 4)", () => {
  it("tells a level opening, a modernizing one and a record crowd from their landmarks", () => {
    const state = afterFirstSeason();
    const recent = [
      landmarks.venueOpened(state.turn, state.quarter, "brazil", 2, false),
      landmarks.venueOpened(state.turn, state.quarter, "brazil", 4, true),
      landmarks.recordCrowd(state.turn, state.quarter, "brazil", 3, 5000, 7, 2),
    ];
    const offered = offerVenueCards(state, world, recent, state.events);
    const told = offered.pending.slice(state.events.pending.length);
    expect(told.map((e) => e.templateId)).toEqual([
      "venue-opened",
      "venue-modernized",
      "venue-record",
    ]);
    expect(told.map((e) => e.facts.venue)).toEqual([
      { level: 2, crowd: null, clubId: null },
      { level: 4, crowd: null, clubId: null },
      { level: 2, crowd: 5000, clubId: 7 },
    ]);
    const weights = world.events.cards
      .filter((c) => c.trigger === "venue")
      .map((c) => [c.venue, c.weight]);
    expect(weights).toEqual([
      ["opened", "minor"],
      ["modernized", "big"],
      ["record", "minor"],
    ]);
  });
});
