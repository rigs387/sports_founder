import { describe, expect, it } from "vitest";
import {
  applyAction,
  createCampaign,
  endTurn,
  type GameState,
  offerRelocation,
  ownersLoss,
  relocationAsk,
  type SeasonSummary,
  settleEvents,
  settleRelocation,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Club relocation (GDD v1.41, tech plan 2.33): one anchor, one played season copied into a run
// of bad ones, direct calls.

const config = world.config.flagship.relocation;

/** A Brazil campaign in the offseason after `bad` seasons with its smallest-town club last. */
function failing(bad = config.badSeasons): { state: GameState; clubId: number } {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) state = endTurn(state, world);
  const places = world.places.brazil ?? [];
  const size = (name: string) => places.find((p) => p.name === name)?.population ?? 0;
  const clubs = state.flagship.clubs.filter((c) => c.active);
  const small = [...clubs].sort((a, b) => size(a.place) - size(b.place))[0];
  const played = state.flagship.seasons[0];
  if (!small || !played) throw new Error("no season");
  const standings = [
    ...played.standings.filter((r) => r.clubId !== small.id),
    ...played.standings.filter((r) => r.clubId === small.id),
  ];
  const seasons: SeasonSummary[] = Array.from({ length: bad }, (_, i) => ({
    ...played,
    season: i + 1,
    standings,
  }));
  return {
    state: {
      ...state,
      flagship: { ...state.flagship, offseason: true, season: bad + 1, seasons },
    },
    clubId: small.id,
  };
}

const card = (state: GameState) =>
  state.events.pending.find((e) => e.templateId === "club-relocation");
const cash = (state: GameState) =>
  state.countries.find((c) => c.countryId === "brazil")?.league?.cash ?? 0;

describe("club relocation", () => {
  it("asks only after enough bad seasons, for a bigger town with no club", () => {
    expect(relocationAsk(failing(config.badSeasons - 1).state, world)).toBeNull();
    const { state, clubId } = failing();
    const ask = relocationAsk(state, world);
    expect(ask?.clubId).toBe(clubId);
    const towns = state.flagship.clubs.map((c) => c.place);
    expect(towns).not.toContain(ask?.to);
    const offered = offerRelocation(state, world);
    expect(card(offered)?.facts.relocation).toMatchObject({ clubId, to: ask?.to });
    // One ask an offseason.
    expect(offerRelocation(offered, world).events.pending).toHaveLength(
      offered.events.pending.length,
    );
  });

  it("moving keeps the club, lifts it, and costs hardcore fans at the seat", () => {
    const { state, clubId } = failing();
    const offered = offerRelocation(state, world);
    const asked = card(offered);
    if (!asked?.facts.relocation) throw new Error("no card");
    const before = offered.flagship.clubs.find((c) => c.id === clubId);
    const moved = applyAction(offered, world, {
      type: "chooseEvent",
      eventId: asked.id,
      choiceId: "move",
    });
    const after = moved.flagship.clubs.find((c) => c.id === clubId);
    expect(after).toMatchObject({ place: asked.facts.relocation.to, nickname: before?.nickname });
    expect(after?.rating).toBeGreaterThan(before?.rating ?? 0);
    expect(moved.landmarks.at(-1)).toMatchObject({ kind: "clubMoved", clubId });
    const hardcore = (s: GameState) =>
      s.countries.find((c) => c.countryId === "brazil")?.fans[0]?.hardcore ?? 0;
    expect(hardcore(moved)).toBeLessThan(hardcore(offered));
    // Moving costs the owners nothing.
    expect(cash(settleRelocation(moved, world))).toBe(cash(moved));
  });

  it("staying, the default, costs the owners' losses; the ask returns after another bad season", () => {
    const { state } = failing();
    const offered = offerRelocation(state, world);
    const loss = ownersLoss(offered, world);
    expect(loss).toBeGreaterThan(0);
    const stayed = settleRelocation(settleEvents(offered, world), world);
    expect(cash(stayed)).toBeCloseTo(cash(offered) - loss);
    expect(relocationAsk(stayed, world)).toBeNull();
    const last = stayed.flagship.seasons.at(-1);
    if (!last) throw new Error("no season");
    const again = {
      ...stayed,
      flagship: {
        ...stayed.flagship,
        seasons: [...stayed.flagship.seasons, { ...last, season: last.season + 1 }],
      },
    };
    expect(relocationAsk(again, world)).not.toBeNull();
  });
});
