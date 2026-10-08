import { describe, expect, it } from "vitest";
import {
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  newHallOfFame,
  serializeSave,
} from "../src/sim";
import { migratedHall, setupFor, world } from "./helpers";

// The Hall of Fame (GDD v1.31, tech plan 2.18).

/** Brazil's campaign played until its first flagship season has ended. */
function afterFirstSeason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) state = endTurn(state, world);
  return state;
}

describe("Hall of Fame state (tech plan 2.18 step 1)", () => {
  it("a new campaign starts with an empty Hall counting from its first season", () => {
    const state = createCampaign(world, setupFor(5, "brazil"));
    expect(state.hallOfFame).toEqual(newHallOfFame(1, state.landmarks.length));
    expect(world.config.hallOfFame.moments.length).toBeGreaterThan(0);
  });

  it("a format 22 save migrates to an empty Hall counting from now, with no class facts", () => {
    const played = afterFirstSeason();
    const strip = (list: GameState["events"]["pending"]) =>
      list.map(({ facts: { hall: _h, ...facts }, ...event }) => ({ ...event, facts }));
    const { hallOfFame: _hall, ...rest } = played;
    const v22 = {
      ...rest,
      events: {
        ...played.events,
        pending: strip(played.events.pending),
        history: strip(played.events.history),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 22, state: v22 }), world);
    expect(loaded.hallOfFame).toEqual(
      newHallOfFame(played.flagship.season, played.landmarks.length),
    );
    expect(serializeSave(loaded)).toBe(
      serializeSave({ ...played, hallOfFame: migratedHall(played) }),
    );
  });
});
