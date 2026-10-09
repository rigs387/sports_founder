import { describe, expect, it } from "vitest";
import { createCampaign, type GameState, landmarks, offerEvents } from "../src/sim";
import { setupFor, world } from "./helpers";

// GDD v1.34 topic H: a playtest told "A following of your own" about 45 turns late, at 15-38%,
// and dropped 57 league arrivals, because both waited behind other cards for the moment slots.

const onlyCards = (...ids: string[]) => ({
  ...world.events,
  settings: { ...world.events.settings, baseMoments: 1, momentsPerQuarter: 0, maxMoments: 1 },
  cards: world.events.cards.filter((card) => ids.includes(card.id)),
});

function withFollowers(state: GameState, followers: Record<string, number>): GameState {
  const countries = state.countries.map((country, index) => {
    const id = world.countries[index]?.id ?? "";
    const casual = followers[id];
    if (casual === undefined) return country;
    return {
      ...country,
      fans: country.fans.map((f, i) => (i === 0 ? { ...f, casual, hardcore: 0 } : f)),
    };
  });
  return { ...state, countries };
}

const populationOf = (id: string) => world.countries.find((c) => c.id === id)?.population ?? 0;
const told = (state: GameState, templateId: string) =>
  state.events.pending.filter((e) => e.templateId === templateId).map((e) => e.countryId);

describe("firsts on time (GDD v1.34)", () => {
  const start = { ...createCampaign(world, setupFor(7, "brazil")), turn: 30, quarter: 30 };
  const selected = { ...world, events: onlyCards("first-following", "league-arrival") };

  it("tells every new following the turn it happens, whatever the moment slots", () => {
    const state = withFollowers(start, { china: 5000, india: 5000, "united-states": 5000 });
    const offered = offerEvents(state, selected, 1);
    expect(told(offered, "first-following")).toEqual(
      expect.arrayContaining(["china", "india", "united-states"]),
    );
  });

  it("skips a first that has gone stale, for good", () => {
    const stale = Math.ceil(populationOf("india") * 0.3);
    const state = withFollowers(start, { china: 5000, india: stale });
    const offered = offerEvents(state, selected, 1);
    expect(told(offered, "first-following")).toContain("china");
    expect(told(offered, "first-following")).not.toContain("india");
    expect(offered.events.offered["first-following/india"]).toBe(30);
    // Falling back under the share later does not bring the old news back.
    const later = withFollowers({ ...offered, turn: 31 }, { india: 5000 });
    expect(told(offerEvents(later, selected, 1), "first-following")).not.toContain("india");
  });

  it("announces every league formed in a turn", () => {
    const formed = ["china", "india", "japan"].map((id) =>
      landmarks.leagueFormed(30, 30, id, false),
    );
    const state = withFollowers(
      { ...start, landmarks: [...start.landmarks, ...formed] },
      { china: 900, india: 900, japan: 900 },
    );
    const withLeagues = {
      ...state,
      countries: state.countries.map((country, index) =>
        ["china", "india", "japan"].includes(world.countries[index]?.id ?? "") && !country.league
          ? { ...country, league: start.countries.find((c) => c.league)?.league ?? null }
          : country,
      ),
    };
    expect(told(offerEvents(withLeagues, selected, 1), "league-arrival").sort()).toEqual([
      "china",
      "india",
      "japan",
    ]);
  });
});
