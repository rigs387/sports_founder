import { describe, expect, it } from "vitest";
import {
  createCampaign,
  defaultIdentitySetup,
  familySnapshot,
  feminineName,
  type GameState,
  headName,
  identityProblems,
  landmarks,
  stepDown,
  updateFamily,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// The founding family (GDD v1.40, tech plan 2.30): flavor only. One anchor, direct calls.

const years = world.config.family.generationYears;

/** A Brazil campaign in an offseason `quarter` quarters in. */
function at(quarter: number, offseason = true): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  return { ...state, quarter, flagship: { ...state.flagship, offseason } };
}

describe("the founding family", () => {
  it("is founded with the sport, named from the anchor's pool, and checked at setup", () => {
    const setup = defaultIdentitySetup(world, 5, "brazil");
    expect(setup.founderName.length).toBeGreaterThan(1);
    expect(setup.familyName.length).toBeGreaterThan(1);
    const state = createCampaign(world, setupFor(5, "brazil"));
    expect(state.identity.family.heads).toHaveLength(1);
    expect(state.identity.family.heads[0]).toMatchObject({ tookOver: 0, handedOver: null });
    expect(identityProblems({ ...setup, familyName: "X" }, world, "brazil")).toEqual([
      expect.stringMatching(/^familyName/),
    ]);
  });

  it("gives daughters the feminine family name where the language has one", () => {
    expect(feminineName(world, "russia", "Smirnov")).toBe("Smirnova");
    expect(feminineName(world, "poland", "Kowalski")).toBe("Kowalska");
    expect(feminineName(world, "czechia", "Novák")).toBe("Nováková");
    expect(feminineName(world, "greece", "Papadopoulos")).toBe("Papadopoulou");
    expect(feminineName(world, "brazil", "Silva")).toBe("Silva");
  });

  it("passes the torch once a generation, in the offseason only", () => {
    expect(updateFamily(at(years * 4 - 1), world).identity.family.heads).toHaveLength(1);
    expect(updateFamily(at(years * 4, false), world).identity.family.heads).toHaveLength(1);
    const passed = updateFamily(at(years * 4), world);
    const { heads } = passed.identity.family;
    expect(heads).toHaveLength(2);
    expect(heads[0]?.handedOver).toBe(years * 4);
    expect(heads[1]).toMatchObject({ tookOver: years * 4, handedOver: null });
    expect(heads[1]?.given).not.toBe(heads[0]?.given);
    expect(passed.landmarks.at(-1)).toMatchObject({ kind: "familyHandoff", generation: 1 });
    // The heir keeps the family name.
    expect(headName(world, "brazil", passed.identity.family, 1)).toContain(
      passed.identity.family.name,
    );
    // The same seed draws the same heir.
    expect(updateFamily(at(years * 4), world).identity.family.heads[1]).toEqual(heads[1]);
  });

  it("joins the Family wing on handing over, with the watch read from the landmarks", () => {
    const base = at(8);
    const state = {
      ...base,
      landmarks: [
        ...base.landmarks,
        landmarks.leagueFormed(2, 4, "argentina", false),
        landmarks.rankOneTaken(3, 6),
      ],
    };
    expect(familySnapshot(state, world)[0]?.inducted).toBe(false);
    const [head] = familySnapshot(stepDown(state), world);
    expect(head).toMatchObject({ inducted: true, watch: { leaguesAbroad: 1, rankOneTaken: 1 } });
  });
});
