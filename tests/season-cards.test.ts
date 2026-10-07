import { describe, expect, it } from "vitest";
import { eventsFileSchema } from "../src/content";
import {
  activeClubs,
  applyAction,
  checkAction,
  checkInvariants,
  createCampaign,
  deserializeSave,
  eventSnapshots,
  type GameState,
  landmarks,
  newDeals,
  offerEvents,
  PLAYER_INDEX,
  runTurns,
  type SeasonSummary,
  seasonStories,
  serializeSave,
  settleEvents,
  type TableRow,
} from "../src/sim";
import {
  countryIndex,
  crowdless,
  migratedCulture,
  setupFor,
  sweepAnchors,
  venueless,
  withWorld,
  world,
} from "./helpers";

// The flagship season as cards (GDD v1.15).

const row = (clubId: number, points: number, played = 14): TableRow => ({
  clubId,
  played,
  won: 0,
  drawn: 0,
  lost: 0,
  scoreFor: 0,
  scoreAgainst: 0,
  points,
});

/**
 * A recorded season of an eight-club league (14 matches each): runaway needs a gap of at least
 * 0.15 × 14 × 3 = 6.3 points, a close finish 3 or less. Club i starts the season rated 40 + i, so
 * clubs 1 and 2 are the weakest third.
 */
function summary(
  season: number,
  championId: number,
  runnerUpId: number,
  gap: number,
  options: Partial<SeasonSummary> = {},
): SeasonSummary {
  const others = [1, 2, 3, 4, 5, 6, 7, 8].filter((id) => id !== championId && id !== runnerUpId);
  return {
    season,
    quarter: season * 4,
    countryId: "brazil",
    format: "european",
    scoring: "medium",
    championId,
    runnerUpId,
    standings: [
      row(championId, 20 + gap),
      row(runnerUpId, 20),
      ...others.map((id, i) => row(id, 10 - i)),
    ],
    playoffs: [],
    startRatings: [1, 2, 3, 4, 5, 6, 7, 8].map((clubId) => ({ clubId, rating: 40 + clubId })),
    topScorer: null,
    newStarId: null,
    crowd: null,
    recordCrowd: false,
    ...options,
  };
}
const final = (homeId: number, awayId: number, homeScore: number, awayScore: number) => ({
  homeId,
  awayId,
  homeScore,
  awayScore,
  decidedFor: homeScore === awayScore ? homeId : null,
});
const stories = (seasons: SeasonSummary[]) => seasonStories(seasons, seasons.length - 1, world);

describe("season stories", () => {
  it("reads every story from the recorded season, rarest first", () => {
    expect(stories([summary(1, 5, 6, 10)])).toEqual(["runaway", "firstTitle"]);
    expect(stories([summary(1, 5, 6, 5)])).toEqual(["firstTitle"]);
    expect(stories([summary(1, 5, 6, 3)])).toEqual(["firstTitle", "closeFinish"]);
    expect(stories([summary(1, 1, 6, 5)])).toEqual(["underdog", "firstTitle"]);
    // The same two clubs, either way round.
    expect(stories([summary(1, 5, 6, 5), summary(2, 6, 5, 5)])).toEqual([
      "repeatFinal",
      "firstTitle",
    ]);
  });

  it("calls the third straight title a dynasty and the fourth a foregone league", () => {
    const three = [summary(1, 5, 6, 5), summary(2, 5, 7, 5), summary(3, 5, 8, 5)];
    expect(stories(three)).toEqual(["dynasty"]);
    const four = [...three, summary(4, 5, 6, 5)];
    expect(stories(four)).toEqual(["foregone"]);
    expect(stories([...four, summary(5, 5, 7, 10)])).toEqual(["foregone", "runaway"]);
  });

  it("American format: no runaway for a beaten table leader, and a close finish is the final", () => {
    // Club 6 topped the table by 10 but lost the final 1–0 to club 5.
    const upset = summary(1, 5, 6, 0, {
      format: "american",
      standings: [row(6, 30), row(5, 20), ...[1, 2, 3, 4, 7, 8].map((id) => row(id, 5))],
      playoffs: [final(6, 5, 0, 1)],
    });
    expect(stories([upset])).toEqual(["firstTitle", "closeFinish"]);
    // A tight table does not make a close finish when the final was a rout.
    const rout = summary(1, 5, 6, 0, { format: "american", playoffs: [final(5, 6, 4, 0)] });
    expect(stories([rout])).toEqual(["firstTitle"]);
    // Deciders are the narrowest margin of all.
    const deciders = summary(1, 5, 6, 8, { format: "american", playoffs: [final(5, 6, 1, 1)] });
    expect(stories([deciders])).toEqual(["runaway", "firstTitle", "closeFinish"]);
  });

  it("tells no underdog story about seasons recorded before start ratings were kept", () => {
    expect(stories([summary(1, 1, 6, 5, { startRatings: [] })])).toEqual(["firstTitle"]);
  });
});

/** Brazil's campaign with `seasons` recorded and the last one just ended, ready for offerEvents. */
function seasonEnded(seasons: SeasonSummary[], base?: GameState): GameState {
  const state = base ?? createCampaign(world, setupFor(7, "brazil"));
  const last = seasons.at(-1);
  if (!last) throw new Error("No season");
  const quarter = Math.max(state.quarter, last.quarter);
  return {
    ...state,
    quarter,
    flagship: { ...state.flagship, season: last.season + 1, seasons },
    landmarks: [
      ...state.landmarks,
      landmarks.seasonChampion(state.turn, quarter, "brazil", last.season, last.championId),
    ],
    events: { ...state.events, landmarkCursor: state.landmarks.length },
  };
}
const offered = (state: GameState) => state.events.pending.map((event) => event.templateId);
const decisions = (state: GameState) =>
  state.events.pending.filter(
    (e) => world.events.cards.find((c) => c.id === e.templateId)?.kind === "decision",
  );

describe("offering season cards", () => {
  it("offers the champion moment every season and one story card, first among decisions", () => {
    const state = offerEvents(seasonEnded([summary(1, 5, 6, 3)]), world, 1);
    const ids = offered(state);
    expect(ids).toContain("season-champion");
    expect(ids).toContain("season-first-title");
    expect(ids).not.toContain("season-close-finish");
    expect(decisions(state)[0]?.templateId).toBe("season-first-title");
    const champion = state.events.pending.find((e) => e.templateId === "season-champion");
    expect(champion?.facts.season).toMatchObject({ season: 1, championId: 5, runnerUpId: 6 });
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("pays the champion moment by league tier", () => {
    const pp = (tier: "amateur" | "elite") => {
      const base = createCampaign(world, setupFor(7, "brazil"));
      const index = countryIndex(world, "brazil");
      const countries = [...base.countries];
      const country = countries[index];
      if (!country?.league) throw new Error("No league");
      countries[index] = { ...country, league: { ...country.league, tier } };
      const state = offerEvents(
        seasonEnded([summary(1, 5, 6, 5)], { ...base, countries }),
        world,
        1,
      );
      const card = eventSnapshots(state, world).find((e) => e.templateId === "season-champion");
      return card?.effects;
    };
    expect(pp("amateur")).toEqual([{ type: "pp", amount: 4 }]);
    expect(pp("elite")).toEqual([{ type: "pp", amount: 15 }]);
  });

  it("never spends a moment slot on the champion; the story spends a decision slot", () => {
    const tight = withWorld(world, (content) => {
      content.events.settings.maxMoments = 1;
      content.events.settings.maxDecisions = 1;
    });
    const base = createCampaign(tight, setupFor(7, "brazil"));
    const index = countryIndex(tight, "brazil");
    const countries = [...base.countries];
    const country = countries[index];
    if (!country) throw new Error("No country");
    countries[index] = {
      ...country,
      fans: country.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, casual: 50_000 } : f)),
    };
    const state = offerEvents(
      seasonEnded([summary(1, 5, 6, 5)], { ...base, countries, quarter: 8 }),
      tight,
      1,
    );
    // first-following still gets the one moment slot; the opening decision waits.
    expect(offered(state)).toEqual(["season-champion", "season-first-title", "first-following"]);
  });

  it("counts cooldowns in seasons and falls through to the next story while one waits", () => {
    let state = offerEvents(seasonEnded([summary(1, 5, 6, 3)]), world, 1);
    expect(offered(state)).toContain("season-first-title");
    state = settleEvents(state, world);
    // Season 2: club 7's first title is on cooldown, so the close finish is told instead.
    const two = [summary(1, 5, 6, 3), summary(2, 7, 8, 3)];
    state = offerEvents(seasonEnded(two, state), world, 1);
    expect(offered(state)).toContain("season-close-finish");
    expect(offered(state)).not.toContain("season-first-title");
    state = settleEvents(state, world);
    // Season 3: two seasons on, a first title can be told again.
    const three = [...two, summary(3, 3, 8, 5)];
    state = offerEvents(seasonEnded(three, state), world, 1);
    expect(offered(state)).toContain("season-first-title");
  });

  it("tells the rarer stories every season they happen", () => {
    const seasons = [summary(1, 5, 6, 10), summary(2, 5, 6, 10)];
    let state = offerEvents(seasonEnded(seasons.slice(0, 1)), world, 1);
    state = offerEvents(seasonEnded(seasons, settleEvents(state, world)), world, 1);
    expect(offered(state)).toContain("season-runaway");
  });
});

describe("pressure and club strength", () => {
  const runaway = () => offerEvents(seasonEnded([summary(1, 5, 6, 10)]), world, 1);
  const pressureCard = (state: GameState) => {
    const event = state.events.pending.find((e) => e.templateId === "season-runaway");
    if (!event) throw new Error("No runaway card");
    return event;
  };

  it("drains casual fans on arrival, and paying adds the fix without cancelling it", () => {
    const state = runaway();
    const event = pressureCard(state);
    const drain = { eventId: event.id, countryId: "brazil" };
    expect(state.events.modifiers).toContainEqual(
      expect.objectContaining({ ...drain, effect: expect.objectContaining({ factor: 0.8 }) }),
    );
    const before = new Map(activeClubs(state.flagship).map((c) => [c.id, c.rating]));
    const paid = applyAction({ ...state, pp: 100 }, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "revenue-sharing",
    });
    expect(paid.events.modifiers).toContainEqual(expect.objectContaining(drain));
    const step = world.config.flagship.stories.ratingStep;
    for (const club of activeClubs(paid.flagship)) {
      const was = before.get(club.id) ?? 0;
      expect(club.rating).toBeCloseTo(club.id === 5 ? was : Math.min(100, was + step));
    }
    // The season's recorded start ratings never move.
    expect(paid.flagship.startRatings).toEqual(state.flagship.startRatings);
    expect(checkInvariants(paid, world)).toEqual([]);
    // The free hold keeps the drain too.
    const held = settleEvents(state, world);
    expect(held.events.modifiers).toContainEqual(expect.objectContaining(drain));
  });

  it("refuses a club strength choice once the champion has left the league", () => {
    const state = runaway();
    const event = pressureCard(state);
    const gone = {
      ...state,
      pp: 100,
      flagship: {
        ...state.flagship,
        clubs: state.flagship.clubs.map((c) => (c.id === 5 ? { ...c, active: false } : c)),
      },
    };
    const action = {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "revenue-sharing",
    } as const;
    expect(checkAction(gone, world, action)).not.toBeNull();
    expect(checkAction({ ...state, pp: 100 }, world, action)).toBeNull();
  });
});

describe("season card content", () => {
  const cards = () => structuredClone(world.events);
  const card = (content: ReturnType<typeof cards>, id: string) => {
    const found = content.cards.find((c) => c.id === id);
    if (!found) throw new Error(`No ${id}`);
    return found;
  };

  it("rejects club strength on any card that is not a flagship season card", () => {
    const content = cards();
    card(content, "open-doors").choices[0]?.effects.push({
      type: "clubRating",
      target: "champion",
      steps: -1,
    });
    expect(eventsFileSchema.safeParse(content).success).toBe(false);
  });

  it("rejects arrival effects off pressure season cards, turn cooldowns and doubled stories", () => {
    const arrival = cards();
    card(arrival, "season-dynasty").arrivalEffects.push({
      type: "conversion",
      target: "casual",
      factor: 0.8,
      quarters: 4,
    });
    expect(eventsFileSchema.safeParse(arrival).success).toBe(false);
    const turns = cards();
    card(turns, "season-first-title").cooldownTurns = 4;
    expect(eventsFileSchema.safeParse(turns).success).toBe(false);
    const doubled = cards();
    card(doubled, "season-underdog").story = "dynasty";
    expect(eventsFileSchema.safeParse(doubled).success).toBe(false);
    const wrongTrigger = cards();
    card(wrongTrigger, "season-underdog").trigger = "audience";
    expect(eventsFileSchema.safeParse(wrongTrigger).success).toBe(false);
  });
});

describe("season cards in play", () => {
  // Two contrasting anchors from the sweep, one per format.
  const anchors = [
    { anchor: sweepAnchors[4] ?? "brazil", format: "european" as const },
    { anchor: sweepAnchors[6] ?? "iceland", format: "american" as const },
  ];

  it.each(anchors)("tells the $anchor flagship's seasons and keeps the state valid", (setup) => {
    const state = runTurns(
      createCampaign(world, { ...setupFor(3, setup.anchor), seasonFormat: setup.format }),
      world,
      48,
    );
    expect(checkInvariants(state, world)).toEqual([]);
    const told = [...state.events.history, ...state.events.pending];
    // History is capped, so check the newest season: its champion was told.
    const last = state.flagship.seasons.at(-1);
    expect(last).toBeDefined();
    expect(
      told.some(
        (e) => e.templateId === "season-champion" && e.facts.season?.season === last?.season,
      ),
    ).toBe(true);
    for (const event of told.filter((e) => e.facts.season)) {
      expect(event.countryId).toBe(state.flagship.seasons[0]?.countryId);
    }
  });

  it("saves and loads a pending season card byte for byte", () => {
    const state = offerEvents(seasonEnded([summary(1, 5, 6, 10)]), world, 1);
    const text = serializeSave(state);
    expect(serializeSave(deserializeSave(text, world))).toBe(text);
  });

  it("migrates a version 8 save: start ratings now, no season facts, nothing offered", () => {
    const noSeasonCards = withWorld(world, (content) => {
      content.events.cards = content.events.cards.filter(
        (c) => c.trigger !== "seasonEnd" && c.trigger !== "tradition",
      );
    });
    const played = runTurns(createCampaign(world, setupFor(5, "brazil")), noSeasonCards, 14);
    const { seasonOffered: _offered, ...events } = played.events;
    const strip = (records: GameState["events"]["pending"]) =>
      records.map(({ facts: { season: _season, ...facts }, ...record }) => ({ ...record, facts }));
    const {
      startRatings: _ratings,
      scoring: _scoring,
      deals: _deals,
      ...flagship
    } = played.flagship;
    const v8 = {
      ...played,
      events: { ...events, pending: strip(events.pending), history: strip(events.history) },
      flagship: {
        ...flagship,
        seasons: flagship.seasons.map(({ startRatings: _r, scoring: _s, ...season }) => season),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 8, state: v8 }), world);
    // Ratings never moved mid-season before format 9: today's ratings are the start ratings.
    expect(loaded.flagship.startRatings).toEqual(played.flagship.startRatings);
    expect(loaded.flagship.seasons.every((s) => s.startRatings.length === 0)).toBe(true);
    expect(loaded.events.seasonOffered).toEqual({});
    expect(serializeSave(loaded)).toBe(
      serializeSave({
        ...played,
        countries: venueless(played),
        flagship: {
          ...played.flagship,
          scoring: "medium",
          seasons: crowdless(played.flagship.seasons).map((s) => ({
            ...s,
            scoring: "medium",
            startRatings: [],
          })),
          // Deals came with format 20: none signed or offered (GDD v1.28).
          deals: newDeals(played.seed),
        },
        culture: migratedCulture(played),
      }),
    );
  });
});
