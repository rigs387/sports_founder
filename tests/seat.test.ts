import { describe, expect, it } from "vitest";
import {
  applyAction,
  checkAction,
  closeOffseason,
  createCampaign,
  eventSnapshots,
  type GameState,
  type LeagueTierId,
  leagueActions,
  newLeague,
  offerOrphanedSeat,
  settleEvents,
  settleOrphanedSeat,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Seat follow-ups (GDD v1.40, tech plan 2.27): the birthplace outlived sends the seat abroad,
// free; a seat league abroad stepped down below Professional loses the seat. One anchor, direct
// calls.

const at = (id: string) => world.countries.findIndex((c) => c.id === id);

/** A Brazil campaign with leagues abroad: tier, health and hardcore fans by country. */
function withLeagues(
  leagues: Record<string, { tier: LeagueTierId; hardcore: number; health?: "near-collapse" }>,
): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const countries = state.countries.map((country, i) => {
    const wanted = leagues[country.countryId];
    if (!wanted) return country;
    return {
      ...country,
      league: {
        ...newLeague(world, i, 0, wanted.hardcore, []),
        tier: wanted.tier,
        health: wanted.health ?? ("healthy" as const),
      },
      fans: country.fans.map((fans, f) =>
        f === 0 ? { ...fans, casual: wanted.hardcore * 4, hardcore: wanted.hardcore } : fans,
      ),
    };
  });
  return { ...state, countries };
}

/** After the win, with the anchor's league folded and the seat dark at home. */
function orphaned(): GameState {
  const state = withLeagues({
    argentina: { tier: "professional", hardcore: 5_000 },
    chile: { tier: "elite", hardcore: 9_000 },
    peru: { tier: "semi-pro", hardcore: 20_000 },
  });
  return {
    ...state,
    win: { ...state.win, won: { turn: 1, quarter: 0 } },
    countries: state.countries.map((c, i) => (i === at("brazil") ? { ...c, league: null } : c)),
  };
}

const hardcoreIn = (state: GameState, id: string) => state.countries[at(id)]?.fans[0]?.hardcore;

describe("the birthplace outlived", () => {
  it("offers the eligible leagues, most hardcore first, and moves at once, free", () => {
    const offered = offerOrphanedSeat(orphaned(), world);
    expect(offered.flagship.orphan?.candidates).toEqual(["chile", "argentina"]);
    const card = eventSnapshots(offered, world).find((e) => e.templateId === "seat-orphaned");
    expect(card?.choices.map((c) => c.countryId)).toEqual(["chile", "argentina"]);
    // Offered once per orphaning.
    expect(offerOrphanedSeat(offered, world).events.pending).toHaveLength(
      offered.events.pending.length,
    );
    if (!card) throw new Error("no card");
    const moved = applyAction(offered, world, {
      type: "chooseEvent",
      eventId: card.id,
      choiceId: "second",
    });
    expect(moved.flagship.countryId).toBe("argentina");
    expect(moved.flagship.orphan).toBeNull();
    expect(moved.landmarks.at(-1)).toMatchObject({ kind: "seatMoved", reason: "orphaned" });
    expect(hardcoreIn(moved, "argentina")).toBe(hardcoreIn(offered, "argentina"));
  });

  it("left alone, End Turn's default sends it to the most hardcore fans", () => {
    const offered = offerOrphanedSeat(orphaned(), world);
    const settled = settleOrphanedSeat(settleEvents(offered, world), world);
    expect(settled.flagship.countryId).toBe("chile");
  });

  it("waits dark with no eligible league, and stays home if a league re-forms there", () => {
    const none = orphaned();
    const bare = {
      ...none,
      countries: none.countries.map((c) =>
        c.league && c.league.tier !== "semi-pro" ? { ...c, league: null } : c,
      ),
    };
    expect(offerOrphanedSeat(bare, world).flagship.orphan).toBeNull();
    const offered = offerOrphanedSeat(orphaned(), world);
    const reformed = {
      ...offered,
      countries: offered.countries.map((c, i) =>
        i === at("brazil") ? { ...c, league: newLeague(world, i, 0, 100, []) } : c,
      ),
    };
    const settled = settleOrphanedSeat(settleEvents(reformed, world), world);
    expect(settled.flagship.countryId).toBe("brazil");
    expect(settled.flagship.orphan).toBeNull();
  });
});

describe("a seat league stepped down below Professional", () => {
  it("loses the seat: home when the offseason closes, with the purist cost of leaving", () => {
    const base = withLeagues({
      argentina: { tier: "professional", hardcore: 50_000, health: "near-collapse" },
    });
    const state = {
      ...base,
      flagship: { ...base.flagship, countryId: "argentina", offseason: true },
    };
    expect(
      leagueActions(state, world, at("argentina"))?.stepDownLeague.terms?.seatLoss,
    ).toMatchObject({ home: "brazil" });
    const stepped = applyAction(state, world, { type: "stepDownLeague", countryId: "argentina" });
    expect(stepped.flagship.pendingCountryId).toBe("brazil");
    // Keeping the seat there is refused.
    expect(checkAction(stepped, world, { type: "moveSeat", countryId: "argentina" })).toMatch(
      /below Professional/,
    );
    const closed = closeOffseason(stepped, world);
    expect(closed.flagship.countryId).toBe("brazil");
    expect(closed.landmarks.some((l) => l.kind === "seatMoved" && l.reason === "lost")).toBe(true);
    expect(hardcoreIn(closed, "argentina")).toBeLessThan(hardcoreIn(stepped, "argentina") ?? 0);
  });

  it("the anchor is exempt: it keeps the seat at any tier", () => {
    const base = withLeagues({ brazil: { tier: "semi-pro", hardcore: 50_000 } });
    const closed = closeOffseason(
      { ...base, flagship: { ...base.flagship, offseason: true } },
      world,
    );
    expect(closed.flagship.countryId).toBe("brazil");
  });
});
