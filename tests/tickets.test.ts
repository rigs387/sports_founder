import { describe, expect, it } from "vitest";
import {
  applyAction,
  checkAction,
  closeOffseason,
  createCampaign,
  type GameState,
  leagueIncomePerQuarter,
  raiseShare,
  ticketStance,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Flagship ticket pricing (GDD v1.40, tech plan 2.29): one anchor, direct calls.

const seat = world.countries.findIndex((c) => c.id === "brazil");

/** A Brazil campaign in the offseason, its hardcore fans set. */
function offseason(): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  return {
    ...state,
    flagship: { ...state.flagship, offseason: true },
    countries: state.countries.map((c, i) =>
      i === seat
        ? { ...c, fans: c.fans.map((f, j) => (j === 0 ? { ...f, hardcore: 40_000 } : f)) }
        : c,
    ),
  };
}

const at = (state: GameState, stance: "cheap" | "standard" | "premium"): GameState => ({
  ...state,
  flagship: { ...state.flagship, tickets: { countryId: "brazil", stance, pending: null } },
});
const hardcore = (state: GameState) => state.countries[seat]?.fans[0]?.hardcore ?? 0;

describe("ticket pricing", () => {
  it("bends the seat's gate: cheap pays less, premium more", () => {
    const base = offseason();
    const income = (stance: "cheap" | "standard" | "premium") =>
      leagueIncomePerQuarter(at(base, stance), world, seat);
    expect(income("cheap")).toBeLessThan(income("standard"));
    expect(income("premium")).toBeGreaterThan(income("standard"));
  });

  it("is set in the offseason and takes effect when it closes; a raise costs hardcore fans", () => {
    const base = offseason();
    expect(
      checkAction({ ...base, flagship: { ...base.flagship, offseason: false } }, world, {
        type: "setTickets",
        stance: "premium",
      }),
    ).toMatch(/offseason/);
    const asked = applyAction(base, world, { type: "setTickets", stance: "premium" });
    expect(asked.flagship.tickets.pending).toBe("premium");
    expect(ticketStance(asked)).toBe("standard");
    const share = raiseShare(asked, world, "standard", "premium");
    expect(share).toBeGreaterThanOrEqual(world.config.flagship.tickets.raiseDemotion);
    const closed = closeOffseason(asked, world);
    expect(ticketStance(closed)).toBe("premium");
    expect(hardcore(closed)).toBeLessThan(hardcore(base));
    expect(closed.landmarks.at(-1)).toMatchObject({
      kind: "ticketsSet",
      from: "standard",
      to: "premium",
    });
  });

  it("lowering is free, and a seat that moved plays at standard", () => {
    const base = at(offseason(), "premium");
    const cut = closeOffseason(
      applyAction(base, world, { type: "setTickets", stance: "cheap" }),
      world,
    );
    expect(ticketStance(cut)).toBe("cheap");
    expect(cut.landmarks.at(-1)).toMatchObject({ kind: "ticketsSet", demoted: 0 });
    const moved = { ...base, flagship: { ...base.flagship, countryId: "argentina" } };
    expect(ticketStance(moved)).toBe("standard");
  });
});
