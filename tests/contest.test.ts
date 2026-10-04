import { describe, expect, it } from "vitest";
import en from "../src/renderer/src/i18n/locales/en.json";
import {
  checkInvariants,
  createCampaign,
  type GameState,
  offerEvents,
  PLAYER_INDEX,
  reclaimAllowed,
  sportTotals,
  stepQuarter,
  tournamentEditionAt,
  tournamentsStarting,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Rivals win ground back near #1 (GDD v1.17, tech plan 2.7): reclaim and world championships.

const soccer = world.config.rivalAI.tournaments.find((t) => t.sportId === "soccer");
const cricket = world.config.rivalAI.tournaments.find((t) => t.sportId === "cricket");

describe("world championships", () => {
  it("run on each rival's real cycle: soccer from mid-2026, cricket from late 2027", () => {
    if (!soccer || !cricket) throw new Error("Both rivals need a world championship");
    const config = world.config;
    // Quarter q is in year 2026 + ⌊q ÷ 4⌋; soccer starts in the second quarter of 2026.
    expect(tournamentEditionAt(soccer, 0, config)).toBeNull();
    expect(tournamentEditionAt(soccer, 1, config)).toBe(1);
    expect(tournamentEditionAt(soccer, 4, config)).toBe(1);
    expect(tournamentEditionAt(soccer, 5, config)).toBeNull();
    expect(tournamentEditionAt(soccer, 17, config)).toBe(17);
    expect(tournamentEditionAt(cricket, 7, config)).toBe(7);
    expect(tournamentEditionAt(cricket, 10, config)).toBe(7);
    expect(tournamentEditionAt(cricket, 11, config)).toBeNull();
    const starts = Array.from({ length: 40 }, (_, q) => q).filter((q) =>
      tournamentsStarting(q, config).some((t) => t.sportId === "soccer"),
    );
    expect(starts).toEqual([1, 17, 33]);
    expect(world.names.tournaments.soccer).toMatch(/world championship/);
  });

  it("lift a rival above home everywhere, then the ground ages away", () => {
    // The player's sport never grows: only the championship moves the rivals.
    const w = withConfig(world, (config) => {
      config.dynamics.player.casualConversionRate = 0;
      config.dynamics.player.hardcoreConversionRate = 0;
    });
    let state = createCampaign(w, setupFor(1, "brazil"));
    const home = sportTotals(state, w).find((s) => s.sportId === "soccer")?.fandomScore ?? 0;
    const soccerAt = (s: GameState) =>
      (sportTotals(s, w).find((sport) => sport.sportId === "soccer")?.fandomScore ?? 0) / home;
    const trace: number[] = [];
    for (let q = 0; q < 18; q += 1) {
      state = stepQuarter(state, w);
      trace.push(soccerAt(state));
    }
    expect(checkInvariants(state, w)).toEqual([]);
    const peak = Math.max(...trace.slice(0, 6));
    // About a 1% lift of soccer's world Fandom Score at the peak.
    expect(peak).toBeGreaterThan(1.005);
    // Just before the next edition the surge has mostly aged away.
    expect(trace[15] ?? 0).toBeLessThan(peak);
    expect(
      state.landmarks.filter((l) => l.kind === "rivalTournament").map((l) => l.sportId),
    ).toEqual(["soccer", "cricket", "soccer"]);
  });

  it("are told once, in the player's biggest market", () => {
    let state = createCampaign(world, setupFor(1, "brazil"));
    // Soccer's first championship starts in the campaign's second quarter.
    state = stepQuarter(stepQuarter(state, world), world);
    const only: World = {
      ...world,
      events: {
        ...world.events,
        cards: world.events.cards.filter((c) => c.id === "rival-championship"),
      },
    };
    const offered = offerEvents(state, only, 1).events.pending;
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ countryId: "brazil", facts: { rivalId: "soccer" } });
    expect(en.events.cards["rival-championship"].body).toContain("{{tournament}}");
  });
});

describe("reclaim", () => {
  const argentina = countryIndex(world, "argentina");

  /** Argentina with player hardcore fans and a soccer reclaim running. */
  function reclaiming(w: World): GameState {
    const state = createCampaign(w, setupFor(2, "argentina"));
    return {
      ...state,
      countries: state.countries.map((country, i) =>
        i === argentina
          ? {
              ...country,
              fans: country.fans.map((fans, f) =>
                f === PLAYER_INDEX ? { ...fans, casual: 2_000_000, hardcore: 1_000_000 } : fans,
              ),
              countermoves: [{ kind: "reclaim", sportId: "soccer", endQuarter: 100 }],
            }
          : country,
      ),
    };
  }

  it("is allowed only near #1, where the rival was the incumbent", () => {
    const state = reclaiming(world);
    const country = {
      ...state.countries[argentina],
      countermoves: [],
    } as GameState["countries"][number];
    const min = world.config.rivalAI.countermoves.reclaim.minNearTopProgress;
    expect(reclaimAllowed(country, "soccer", world, argentina, min)).toBe(true);
    expect(reclaimAllowed(country, "soccer", world, argentina, min / 2)).toBe(false);
    expect(reclaimAllowed(state.countries[argentina] as never, "soccer", world, argentina, 1)).toBe(
      false,
    );
    // Cricket was never the incumbent in Argentina.
    expect(reclaimAllowed(country, "cricket", world, argentina, 1)).toBe(false);
  });

  it("turns the player's hardcore fans into the rival's, who stay casual about the player's sport", () => {
    // No other flows, so only reclaim moves anyone.
    const still = withConfig(world, (config) => {
      config.dynamics.player = {
        casualConversionRate: 0,
        casualChurnRate: 0,
        casualDecayRate: 0,
        hardcoreConversionRate: 0,
      };
      config.dynamics.rival = { casualChurnRate: 0, hardcoreConversionRate: 0 };
      config.turnover.annualRate = 0;
      config.poaching.rate = 0;
      config.rivalAI.tournaments = [];
    });
    const before = reclaiming(still);
    const after = stepQuarter(before, still);
    expect(checkInvariants(after, still)).toEqual([]);
    const fans = (s: GameState, sport: number) => s.countries[argentina]?.fans[sport];
    const soccerIndex = before.sports.findIndex((s) => s.id === "soccer");
    const lost =
      (fans(before, PLAYER_INDEX)?.hardcore ?? 0) - (fans(after, PLAYER_INDEX)?.hardcore ?? 0);
    const floor = Math.ceil(
      still.config.turnover.floorShare * (still.countries[argentina]?.population ?? 0),
    );
    expect(lost).toBe(
      Math.round((1_000_000 - floor) * still.config.rivalAI.countermoves.reclaim.sharePerQuarter),
    );
    expect(fans(after, PLAYER_INDEX)?.casual).toBe(
      (fans(before, PLAYER_INDEX)?.casual ?? 0) + lost,
    );
    expect(
      (fans(after, soccerIndex)?.hardcore ?? 0) - (fans(before, soccerIndex)?.hardcore ?? 0),
    ).toBe(lost);
  });

  it("is told as a pressure moment where it happens", () => {
    const state = reclaiming(world);
    const told = {
      ...state,
      quarter: 4,
      landmarks: [
        ...state.landmarks,
        {
          kind: "rivalCountermove" as const,
          turn: 1,
          quarter: 1,
          countryId: "argentina",
          sportId: "soccer",
          move: "reclaim" as const,
          endQuarter: 13,
        },
      ],
    };
    const only: World = {
      ...world,
      events: {
        ...world.events,
        cards: world.events.cards.filter((c) => c.id === "rival-reclaim"),
      },
    };
    const offered = offerEvents(told, only, 1).events.pending;
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ countryId: "argentina", facts: { rivalId: "soccer" } });
  });
});
