import { describe, expect, it } from "vitest";
import {
  applyAction,
  bestAbroad,
  broadcastEffects,
  checkInvariants,
  createCampaign,
  endTurn,
  type GameState,
  joinFlagship,
  type LeagueTierId,
  newLeague,
  offerEvents,
  openings,
  pullTalent,
  signingOffer,
  updateStandouts,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Talent pull, the broadcast follow and the signing card (GDD v1.37, tech plan 2.23 step 2).

function withLeagues(state: GameState, tiers: Record<string, LeagueTierId>): GameState {
  return {
    ...state,
    countries: state.countries.map((country, index) => {
      const tier = tiers[country.countryId];
      if (tier === undefined) return country;
      const league = country.league ?? newLeague(world, index, state.quarter, 0, []);
      return { ...country, league: { ...league, tier } };
    }),
  };
}

/**
 * A campaign in its first offseason with an Elite seat, standouts abroad, and one club whose
 * leading player has just retired and been replaced by an untried rookie.
 */
function offseasonWithOpening() {
  let state = createCampaign(world, setupFor(7, "brazil"));
  while (!state.flagship.offseason) state = endTurn(state, world);
  state = updateStandouts(
    withLeagues(state, { brazil: "elite", japan: "professional", germany: "elite" }),
    world,
  );
  const { flagship } = state;
  const club = [...flagship.clubs].sort((a, b) => b.rating - a.rating)[0];
  const leader = flagship.players.find((player) => player.clubId === club?.id);
  if (!club || !leader) throw new Error("no club to open");
  const rookie = {
    ...leader,
    id: flagship.nextPlayerId,
    name: "Untried Rookie",
    skill: 20,
    peakSkill: 40,
    birthSeason: flagship.season - 18,
    starSince: null,
    backing: null,
    career: [],
  };
  const opened: GameState = {
    ...state,
    pp: 1e9,
    flagship: {
      ...flagship,
      nextPlayerId: flagship.nextPlayerId + 1,
      players: [
        ...flagship.players.map((player) =>
          player.id === leader.id
            ? {
                ...player,
                retiredSeason: flagship.season - 1,
                finalSeason: false,
                starSince: null,
                backing: null,
              }
            : player,
        ),
        rookie,
      ],
    },
  };
  return { state: opened, club, rookie };
}

describe("talent pull", () => {
  const { state, club, rookie } = offseasonWithOpening();
  const best = bestAbroad(state, rookie.skill);
  if (!best) throw new Error("no standout abroad");

  it("sees the club whose leader retired as an opening, and the best standout abroad", () => {
    expect(checkInvariants(state, world)).toEqual([]);
    expect(openings(state).map((opening) => opening.club.id)).toEqual([club.id]);
    const top = Math.max(...state.standouts.players.map((player) => player.skill));
    expect(best.skill).toBe(top);
    expect(signingOffer(state, world)?.standout.id).toBe(best.id);
    // No offseason, no opening; a seat below Professional draws no one.
    expect(openings({ ...state, flagship: { ...state.flagship, offseason: false } })).toEqual([]);
    expect(signingOffer(withLeagues(state, { brazil: "semi-pro" }), world)).toBeNull();
  });

  it("puts the standout in the rookie's place, keeps their birthplace and refills the home league", () => {
    const joined = joinFlagship(state, world, best.id, club.id, false);
    const leader = joined.flagship.players.find(
      (player) => player.clubId === club.id && player.retiredSeason === null,
    );
    expect(leader).toMatchObject({
      id: best.id,
      name: best.name,
      countryId: best.countryId,
      birthplace: best.birthplace,
      skill: best.skill,
      career: [],
    });
    expect(joined.flagship.players.some((player) => player.id === rookie.id)).toBe(false);
    expect(joined.standouts.players.some((player) => player.id === best.id)).toBe(false);
    const home = (s: GameState) =>
      s.standouts.players.filter((player) => player.countryId === best.countryId);
    expect(home(joined)).toHaveLength(home(state).length);
    const { age } = world.config.flagship.players.replacement;
    const young = home(joined).find((player) => player.id >= state.flagship.nextPlayerId);
    expect(joined.flagship.season - (young?.birthSeason ?? 0)).toBeLessThanOrEqual(age.max);
    expect(joined.landmarks.at(-1)).toMatchObject({
      kind: "talentJoined",
      countryId: best.countryId,
      playerId: best.id,
      clubId: club.id,
      signed: false,
    });
    expect(joined.rng).toEqual(state.rng);
    expect(joined.flagship.rng).toEqual(state.flagship.rng);
    expect(openings(joined)).toEqual([]);
    expect(checkInvariants(joined, world)).toEqual([]);
  });

  it("is followed at home through the broadcast, more for a star", () => {
    const home = countryIndex(world, best.countryId);
    const { link, starFactor } = world.config.standouts.follow;
    const before = broadcastEffects(state, world).reach.get(home) ?? 0;
    const joined = joinFlagship(state, world, best.id, club.id, false);
    expect(broadcastEffects(joined, world).reach.get(home)).toBeCloseTo(Math.min(1, before + link));
    const star: GameState = {
      ...joined,
      flagship: {
        ...joined.flagship,
        players: joined.flagship.players.map((player) =>
          player.id === best.id ? { ...player, starSince: joined.flagship.season - 1 } : player,
        ),
      },
    };
    expect(broadcastEffects(star, world).reach.get(home)).toBeCloseTo(
      Math.min(1, before + link * starFactor),
    );
  });

  it("pulls on its own when the offseason closes, by chance, and never to a seat about to move", () => {
    const certain = withConfig(world, (config) => {
      config.standouts.talentPull.chance = 1;
    });
    const never = withConfig(world, (config) => {
      config.standouts.talentPull.chance = 0;
    });
    const pulled = pullTalent(state, certain);
    expect(pulled.landmarks.at(-1)).toMatchObject({ kind: "talentJoined", playerId: best.id });
    expect(pullTalent(state, never).flagship.players).toEqual(state.flagship.players);
    const moving = { ...state, flagship: { ...state.flagship, pendingCountryId: "germany" } };
    expect(pullTalent(moving, certain)).toBe(moving);
    // The whole turn plays on with the newcomer leading the club.
    const next = endTurn(state, certain);
    const leader = next.flagship.players.find(
      (player) => player.clubId === club.id && player.retiredSeason === null,
    );
    expect(leader?.id).toBe(best.id);
    expect(checkInvariants(next, certain)).toEqual([]);
  });

  it("offers the signing card after a season, signs for PP and waits out its cooldown", () => {
    const cursor = state.landmarks.findLastIndex((l) => l.kind === "seasonChampion");
    const rewound: GameState = {
      ...state,
      events: { ...state.events, pending: [], landmarkCursor: cursor },
    };
    const offered = offerEvents(rewound, world, 1);
    const card = offered.events.pending.find((event) => event.templateId === "star-signing");
    expect(card?.countryId).toBe(best.countryId);
    expect(card?.facts.star).toMatchObject({ playerId: best.id, clubId: club.id });
    if (!card) throw new Error("no signing card");
    const season = state.flagship.season - 1;
    expect(offered.events.seasonOffered["star-signing"]).toBe(season);

    const signed = applyAction(offered, world, {
      type: "chooseEvent",
      eventId: card.id,
      choiceId: "sign",
    });
    expect(signed.pp).toBeLessThan(offered.pp);
    expect(signed.landmarks.at(-1)).toMatchObject({ kind: "talentJoined", signed: true });
    const leader = signed.flagship.players.find(
      (player) => player.clubId === club.id && player.retiredSeason === null,
    );
    expect(leader?.id).toBe(best.id);
    // The player's own signing is no news; the free default would have changed nothing.
    const after = offerEvents(signed, world, 1);
    expect(after.events.pending.some((event) => event.templateId === "talent-arrived")).toBe(false);
    const passed = applyAction(offered, world, {
      type: "chooseEvent",
      eventId: card.id,
      choiceId: "not-now",
    });
    expect(passed.flagship.players).toEqual(offered.flagship.players);
    expect(passed.pp).toBe(offered.pp);
    // Within the cooldown the card is not offered again.
    const again = offerEvents(
      { ...offered, events: { ...offered.events, pending: [], landmarkCursor: cursor } },
      world,
      1,
    );
    expect(again.events.pending.some((event) => event.templateId === "star-signing")).toBe(false);
  });

  it("tells a standout's own arrival as news from their home country", () => {
    const joined = joinFlagship(state, world, best.id, club.id, false);
    const told = offerEvents(joined, world, 1);
    const news = told.events.pending.find((event) => event.templateId === "talent-arrived");
    expect(news?.countryId).toBe(best.countryId);
    expect(news?.facts.star).toMatchObject({ playerId: best.id, clubId: club.id });
  });
});
