import { describe, expect, it } from "vitest";
import {
  amendRule,
  anchorBacklashFactor,
  anchorSeatLeaveShare,
  checkInvariants,
  createCampaign,
  deserializeSave,
  draggedSeverity,
  type GameState,
  newLeague,
  PLAYER_INDEX,
  resentmentSnapshot,
  serializeSave,
  stepQuarter,
  stepResentment,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// Anchor resentment (GDD v1.40, tech plan 2.32): one anchor (Brazil), direct calls and a handful
// of quarters.

const config = world.config.anchorResentment;
const brazil = countryIndex(world, "brazil");
const argentina = countryIndex(world, "argentina");

/** Brazil with its starting focus slot moved off the anchor, and hardcore fans to lose. */
function base(): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  return {
    ...state,
    focus: state.focus.map(() => null),
    genome: { ...state.genome, scoring: "medium" },
    countries: state.countries.map((c, i) =>
      i === brazil
        ? {
            ...c,
            fans: c.fans.map((f, j) => (j === PLAYER_INDEX ? { ...f, hardcore: 40_000 } : f)),
          }
        : c,
    ),
  };
}

/** Brazil with a league in Argentina too, so resentment can grow. */
function withAbroad(state = base()): GameState {
  return {
    ...state,
    countries: state.countries.map((c, i) =>
      i === argentina ? { ...c, league: newLeague(world, i, 0, 500, []) } : c,
    ),
  };
}

const at = (state: GameState, value: number, tendedQuarter = state.quarter): GameState => ({
  ...state,
  resentment: { value, tendedQuarter },
});
const focusHome = (state: GameState): GameState => ({
  ...state,
  focus: state.focus.map((id, slot) => (slot === 0 ? "brazil" : id)),
});
const seatAbroad = (state: GameState): GameState => ({
  ...state,
  flagship: { ...state.flagship, countryId: "argentina" },
});
/** Steps resentment alone `quarters` times from `state`. */
function played(state: GameState, quarters: number): GameState {
  let current = state;
  for (let k = 0; k < quarters; k += 1) {
    const quarter = current.quarter + 1;
    current = { ...current, quarter, resentment: stepResentment(current, world, quarter) };
  }
  return current;
}

describe("anchor resentment", () => {
  it("never grows before the sport has a league abroad, and the neglect clock waits", () => {
    const quiet = played(base(), config.graceQuarters + 10);
    expect(quiet.resentment.value).toBe(0);
    expect(quiet.resentment.tendedQuarter).toBe(quiet.quarter);
  });

  it("grows with neglect after the grace period, and with the seat abroad", () => {
    const start = withAbroad();
    const inGrace = played(start, config.graceQuarters);
    expect(inGrace.resentment.value).toBe(0);
    expect(resentmentSnapshot(inGrace, world).graceLeft).toBe(1);
    const neglected = played(inGrace, 4);
    expect(neglected.resentment.value).toBeCloseTo(4 * config.neglectPerQuarter);
    expect(resentmentSnapshot(neglected, world).neglectQuarters).toBe(config.graceQuarters + 4);
    const away = played(seatAbroad(start), 2);
    expect(away.resentment.value).toBeCloseTo(2 * config.seatAwayPerQuarter);
  });

  it("eases with a focus slot home, faster with the seat home too", () => {
    const home = played(focusHome(at(withAbroad(), 0.5)), 2);
    expect(home.resentment.value).toBeCloseTo(0.5 - 2 * config.homeDecayPerQuarter);
    expect(home.resentment.tendedQuarter).toBe(home.quarter);
    const away = played(seatAbroad(focusHome(at(withAbroad(), 0.5))), 2);
    expect(away.resentment.value).toBeCloseTo(
      0.5 + 2 * (config.seatAwayPerQuarter - config.focusDecayPerQuarter),
    );
    expect(resentmentSnapshot(home, world)).toMatchObject({ focused: true, seatHome: true });
  });

  it("rises with casual-friendly amendments and falls with purist ones", () => {
    const start = withAbroad();
    // Medium to high is a step toward casual fans; high to low two steps away.
    const casual = amendRule(start, world, "scoring", "high", true);
    expect(casual.resentment.value).toBeCloseTo(config.amendmentStep);
    const purist = amendRule(at(casual, 0.5), world, "scoring", "low", true);
    expect(purist.resentment.value).toBeCloseTo(0.5 - 2 * config.amendmentStep);
    // Not before a league abroad; a trait it does not watch never moves it.
    expect(amendRule(base(), world, "scoring", "high", true).resentment.value).toBe(0);
    const contact = start.genome.contact === "none" ? "full" : "none";
    expect(amendRule(start, world, "contact", contact, true).resentment.value).toBe(0);
    expect(resentmentSnapshot(casual, world).casualAmendments).toBe(1);
  });

  it("turns the anchor's hardcore fans casual each quarter", () => {
    const fans = (state: GameState) => state.countries[brazil]?.fans[PLAYER_INDEX];
    const calm = stepQuarter(at(withAbroad(), 0), world);
    const angry = stepQuarter(at(withAbroad(), 1), world);
    const lost = (fans(calm)?.hardcore ?? 0) - (fans(angry)?.hardcore ?? 0);
    const before = fans(withAbroad())?.hardcore ?? 0;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(Math.ceil(before * config.hardcoreDemotionPerQuarter) + 1);
    expect(checkInvariants(angry, world)).toEqual([]);
  });

  it("drags the anchor league's health target, and can fold it", () => {
    const [first, second] = config.healthDrag;
    expect(draggedSeverity(0, 0, world)).toBe(0);
    expect(draggedSeverity(0, first?.from ?? 1, world)).toBe(first?.severity);
    expect(draggedSeverity(1, second?.from ?? 1, world)).toBe(2);
    expect(draggedSeverity(0, config.collapseFrom, world)).toBe(3);
    expect(draggedSeverity(3, 0, world)).toBe(3);
  });

  it("scales the anchor's backlash and seat-leaving share in place of the stand-ins", () => {
    expect(anchorBacklashFactor(0, world)).toBe(config.backlashFactor.min);
    expect(anchorBacklashFactor(1, world)).toBe(config.backlashFactor.max);
    expect(anchorSeatLeaveShare(0, world)).toBe(config.seatLeaveShare.min);
    expect(anchorSeatLeaveShare(1, world)).toBe(config.seatLeaveShare.max);
  });

  it("survives a save, and an older save loads with none", () => {
    const state = at(withAbroad(), 0.42, 0);
    expect(deserializeSave(serializeSave(state), world).resentment).toEqual(state.resentment);
    const raw = JSON.parse(serializeSave(state));
    delete raw.state.resentment;
    expect(deserializeSave(JSON.stringify(raw), world).resentment).toEqual({
      value: 0,
      tendedQuarter: 0,
    });
  });
});
