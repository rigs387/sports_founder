import { describe, expect, it } from "vitest";
import {
  applyAction,
  backlashShares,
  checkAction,
  checkInvariants,
  createCampaign,
  cultureProblems,
  type GameState,
  offendedTraditions,
  offseasonOpen,
  PLAYER_INDEX,
  seatLeaveShare,
  stepQuarter,
  updateCulture,
  type World,
} from "../src/sim";
import { clubIds, ofType, withSeason, withTradition } from "./culture-helpers";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Culture, first build (GDD v1.22): betrayal — amendments, the seat move and the trophy's name.

const content: World = withConfig(world, (config) => {
  config.start.startingPP = 100_000;
});
const ANCHOR = "brazil";

/** Brazil in the offseason after two years, with fans to lose, under this ethos. */
function inWindow(ethos = "family-game"): GameState {
  let state = createCampaign(content, setupFor(5, ANCHOR));
  while (state.quarter < 8 || !offseasonOpen(state)) state = stepQuarter(state, content);
  return { ...state, identity: { ...state.identity, ethos } };
}

/** The same state with contact amended away from (or back toward) "none". */
const withContact = (state: GameState, contact: "none" | "incidental" | "full") => ({
  ...state,
  genome: { ...state.genome, contact },
});

describe("amendments", () => {
  it("offend traditions born under the rule they move away from, never a move back toward it", () => {
    const state = withTradition(withContact(inWindow(), "incidental"), "derby", ANCHOR, {
      rules: { contact: "none" },
    });
    expect(offendedTraditions(state, content, "contact", "full")).toHaveLength(1);
    expect(offendedTraditions(state, content, "contact", "none")).toHaveLength(0);
    expect(offendedTraditions(state, content, "scoring", "high")).toHaveLength(0);
  });

  it("raise backlash where offended traditions are held, by the ethos", () => {
    const anchor = countryIndex(content, ANCHOR);
    const share = (ethos: string, held: boolean) => {
      const base = withContact(inWindow(ethos), "none");
      const state = held
        ? withTradition(base, "venue", ANCHOR, { rules: { contact: "none" } })
        : base;
      return backlashShares(state, content, "contact", "incidental")[anchor] ?? 0;
    };
    const plain = share("family-game", false);
    expect(plain).toBeGreaterThan(0);
    const gentleman = share("gentlemans-game", true) / plain;
    const rebel = share("rebel-game", true) / plain;
    const { backlashWeight } = content.config.culture;
    const ethos = content.identity.culture.ethos;
    expect(gentleman).toBeCloseTo(1 + backlashWeight * (ethos["gentlemans-game"]?.rules ?? 0), 5);
    expect(rebel).toBeLessThan(gentleman);
  });

  it("wear an offended tradition down by the jump, and break it at zero", () => {
    const state = withTradition(withContact(inWindow(), "none"), "derby", ANCHOR, {
      strength: 0.6,
      rules: { contact: "none" },
    });
    const once = applyAction(state, content, {
      type: "amendRule",
      axis: "contact",
      option: "incidental",
    });
    const damage = content.config.culture.amendmentDamage;
    expect(ofType(once, "derby")[0]?.strength).toBeCloseTo(0.6 - damage);
    const twice = applyAction(state, content, {
      type: "amendRule",
      axis: "contact",
      option: "full",
    });
    expect(ofType(twice, "derby")[0]?.strength).toBeCloseTo(0.6 - 2 * damage);
    const weak = withTradition(withContact(inWindow(), "none"), "derby", ANCHOR, {
      strength: 0.3,
      rules: { contact: "none" },
    });
    const broken = applyAction(weak, content, {
      type: "amendRule",
      axis: "contact",
      option: "full",
    });
    expect(ofType(broken, "derby")[0]?.lost?.reason).toBe("broken");
    expect(broken.landmarks.at(-1)).toMatchObject({ kind: "traditionLost", reason: "broken" });
    expect(broken.landmarks.at(-2)).toMatchObject({ kind: "ruleAmended" });
    expect(checkInvariants(broken, content)).toEqual([]);
  });
});

describe("the seat move", () => {
  it("costs more purists where traditions are held, by the ethos", () => {
    const base = inWindow("working-class-game");
    const plain = seatLeaveShare(base, content, ANCHOR);
    expect(plain).toBe(content.config.flagship.seatMove.anchorHardcoreDemotionShare);
    const held = withTradition(base, "trophy", ANCHOR);
    const { seatWeight } = content.config.culture;
    const seat = content.identity.culture.ethos["working-class-game"]?.seat ?? 0;
    expect(seatLeaveShare(held, content, ANCHOR)).toBeCloseTo(plain * (1 + seatWeight * seat));
  });
});

describe("the trophy's name", () => {
  /** The anchor's first season ended: the trophy is born and open to naming. */
  function withTrophy(): GameState {
    const state = inWindow();
    const [a = 0, b = 0] = clubIds(state);
    return updateCulture(withSeason(state, a, b), content);
  }

  it("is given free while the first champion card is open, then only by renaming", () => {
    const state = withTrophy();
    expect(checkAction(state, content, { type: "renameTrophy", name: "Founders Cup" })).toMatch(
      /named for free/,
    );
    expect(checkAction(state, content, { type: "nameTrophy", name: "x" })).toMatch(/too short/);
    const named = applyAction(state, content, { type: "nameTrophy", name: "  Founders   Cup " });
    expect(ofType(named, "trophy")[0]?.name).toBe("Founders Cup");
    const closed = updateCulture(named, content);
    expect(checkAction(closed, content, { type: "nameTrophy", name: "Other Cup" })).toMatch(
      /no newborn trophy/,
    );
  });

  it("renaming ends the old trophy, turns its followers' purists casual, and starts afresh", () => {
    const state = updateCulture(
      applyAction(withTrophy(), content, { type: "nameTrophy", name: "Founders Cup" }),
      content,
    );
    if (!offseasonOpen(state)) throw new Error("not in the window");
    expect(checkAction(state, content, { type: "renameTrophy", name: "Founders Cup" })).toMatch(
      /already has that name/,
    );
    const anchor = countryIndex(content, ANCHOR);
    const renamed = applyAction(state, content, { type: "renameTrophy", name: "Star Shield" });
    const [old, fresh] = ofType(renamed, "trophy");
    expect(old?.lost?.reason).toBe("renamed");
    expect(fresh?.name).toBe("Star Shield");
    const before = state.countries[anchor]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    expect(renamed.countries[anchor]?.fans[PLAYER_INDEX]?.hardcore).toBeLessThan(before);
    expect(renamed.landmarks.slice(-2).map((l) => l.kind)).toEqual([
      "traditionLost",
      "traditionBorn",
    ]);
    // withSeason skips the clock ahead, so only culture's own invariants are checked here.
    expect(cultureProblems(renamed, content)).toEqual([]);
  });
});
