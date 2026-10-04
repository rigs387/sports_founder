import { describe, expect, it } from "vitest";
import { builder } from "../src/runner/policy";
import {
  applyAction,
  backingEffects,
  backingPrice,
  checkAction,
  checkInvariants,
  computeExposure,
  createCampaign,
  deserializeSave,
  type GameState,
  PLAYER_INDEX,
  seasonalWindowOpen,
  seatStars,
  serializeSave,
  stepQuarter,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Backing stars (GDD v1.16, tech plan 2.6 step 5).

/** Every score to the leading player, so season 1 makes a star; no star moves. */
const content: World = withConfig(world, (config) => {
  config.flagship.players.credit = { base: 1, perSkill: 0, pivot: 50, min: 1, max: 1 };
  config.flagship.stars.moveChance = 0;
});

function step(state: GameState): GameState {
  const next = stepQuarter(state, content);
  expect(checkInvariants(next, content)).toEqual([]);
  return next;
}

/** Brazil after its first season, in the next seasonal window, with a star and PP to spend. */
function withStar(): GameState {
  let state = createCampaign(content, setupFor(11, "brazil"));
  while (state.flagship.seasons.length < 1) state = step(state);
  while (!seasonalWindowOpen(state, content.config)) state = step(state);
  return { ...state, pp: 10_000 };
}

function starOf(state: GameState) {
  const star = seatStars(state.flagship)[0];
  if (!star) throw new Error("No star");
  return star;
}

const back = (state: GameState, playerId: number) =>
  applyAction(state, content, { type: "backStar", playerId });

describe("backing a star", () => {
  it("costs the price once, in the window, for a star, one per slot", () => {
    const state = withStar();
    const star = starOf(state);
    const notStar = state.flagship.players.find((p) => p.starSince === null);
    expect(checkAction(state, content, { type: "backStar", playerId: notStar?.id ?? 0 })).toMatch(
      /only a star/,
    );
    expect(
      checkAction({ ...state, pp: 0 }, content, { type: "backStar", playerId: star.id }),
    ).toMatch(/not enough PP/);
    const backed = back(state, star.id);
    expect(backed.pp).toBeCloseTo(state.pp - backingPrice(state, content));
    expect(starOf(backed).backing).toEqual({ season: state.flagship.season, influence: 0 });
    expect(checkAction(backed, content, { type: "backStar", playerId: star.id })).toMatch(
      /already backed/,
    );
    let outside = backed;
    while (seasonalWindowOpen(outside, content.config)) outside = step(outside);
    expect(checkAction(outside, content, { type: "dropStar", playerId: star.id })).toMatch(
      /seasonal window/,
    );
  });

  it("allows one backed star at PP tier 1", () => {
    const state = withStar();
    const star = starOf(state);
    // A second star at another seat club, made by hand.
    const second = state.flagship.players.find(
      (p) => p.starSince === null && p.clubId !== star.clubId,
    );
    if (!second) throw new Error("No second player");
    const twoStars = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map((p) =>
          p.id === second.id ? { ...p, starSince: 1 } : p,
        ),
      },
    };
    expect(content.config.ppTiers[0]?.backingSlots).toBe(1);
    const backed = back(twoStars, star.id);
    expect(checkAction(backed, content, { type: "backStar", playerId: second.id })).toMatch(
      /every backing slot is taken/,
    );
  });

  it("grows influence each season at the seat, and dropping loses it", () => {
    let state = back(withStar(), starOf(withStar()).id);
    const seasons = content.config.flagship.backing.influenceSeasons;
    const start = state.flagship.seasons.length;
    while (state.flagship.seasons.length < start + seasons + 1) state = step(state);
    const star = state.flagship.players.find((p) => p.id === starOf(withStar()).id);
    if (star?.retiredSeason === null) {
      expect(star.backing?.influence).toBe(1);
      while (!seasonalWindowOpen(state, content.config)) state = step(state);
      const dropped = applyAction(state, content, { type: "dropStar", playerId: star.id });
      expect(dropped.flagship.players.find((p) => p.id === star.id)?.backing).toBeNull();
    } else {
      // A star who retired took the backing with them.
      expect(star?.backing).toBeNull();
    }
  });
});

describe("what a backed star does", () => {
  /** The state with the star backed at full influence. */
  function atFull(state: GameState): GameState {
    const star = starOf(state);
    const players = state.flagship.players.map((p) =>
      p.id === star.id ? { ...p, backing: { season: 1, influence: 1 } } : p,
    );
    return { ...state, flagship: { ...state.flagship, players } };
  }

  it("lifts casual conversion in the flagship country and media reach out of it", () => {
    const plain = withStar();
    const full = atFull(plain);
    const { casualConversion, mediaReach } = content.config.flagship.backing;
    expect(backingEffects(plain.flagship, content)).toMatchObject({
      casualConversion: 1,
      mediaReach: 1,
    });
    expect(backingEffects(full.flagship, content)).toMatchObject({
      countryId: "brazil",
      casualConversion: 1 + casualConversion,
      mediaReach: 1 + mediaReach,
    });
    const brazil = countryIndex(content, "brazil");
    const casual = (state: GameState) =>
      stepQuarter(state, content).countries[brazil]?.fans[PLAYER_INDEX]?.casual ?? 0;
    expect(casual(full)).toBeGreaterThan(casual(plain));
    const media = (state: GameState) =>
      computeExposure(state, content).reduce((sum, e) => sum + e.media, 0);
    expect(media(full)).toBeGreaterThan(media(plain));
  });

  it("pauses off the seat", () => {
    const full = atFull(withStar());
    const away = { ...full, flagship: { ...full.flagship, countryId: "argentina" } };
    expect(backingEffects(away.flagship, content)).toMatchObject({
      casualConversion: 1,
      mediaReach: 1,
    });
  });
});

describe("bots and saves", () => {
  it("bots back the star with the most career scores", () => {
    const state = withStar();
    const played = builder(state, content);
    expect(played.actions).toContainEqual({ type: "backStar", playerId: starOf(state).id });
  });

  it("migrates a version 13 save: nobody is backed", () => {
    const state = withStar();
    const v13 = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map(({ backing: _b, ...p }) => p),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 13, state: v13 }), content);
    expect(serializeSave(loaded)).toBe(serializeSave(state));
  });
});
