import { describe, expect, it } from "vitest";
import {
  birthPP,
  curseWeights,
  eventSnapshots,
  type GameState,
  landmarks,
  offerEvents,
  PLAYER_INDEX,
  traditionShelter,
  traditionWeights,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason } from "./culture-helpers";
import { countryIndex, withConfig, world } from "./helpers";

// Third playtest follow-ups (GDD v1.35, topic 2): eras, the Invincibles, curses and redemption,
// signature moves, matchday food, and national names told by market size.

/** Plays these seasons (champion, runner-up) through culture's turn, one after another. */
function seasons(start: GameState, results: [number, number][], w = world): GameState {
  let state = start;
  for (const [champion, runnerUp] of results)
    state = updateCulture(withSeason(state, champion, runnerUp), w);
  return state;
}

describe("eras and the Invincibles", () => {
  it("names an era at three straight titles, grows it with the run, and makes it a headline", () => {
    const start = fresh();
    const [, a = 0, b = 0, c = 0] = clubIds(start);
    const two = seasons(start, [
      [a, b],
      [a, c],
    ]);
    expect(ofType(two, "era")).toEqual([]);
    const three = seasons(two, [[a, b]]);
    const [era] = ofType(three, "era");
    expect(era?.clubIds).toEqual([a]);
    expect(era?.seasons).toHaveLength(3);
    const four = seasons(three, [[a, c]]);
    expect(ofType(four, "era")).toHaveLength(1);
    expect(ofType(four, "era")[0]?.seasons).toHaveLength(4);
    const offered = offerEvents(three, world, 4);
    const told = eventSnapshots(offered, world).find(
      (e) => e.facts.tradition?.type === "era" && e.templateId === "tradition-born",
    );
    expect(told?.weight).toBe("headline");
  });

  it("remembers an unbeaten champion as the Invincibles", () => {
    const start = fresh();
    const [, a = 0, b = 0] = clubIds(start);
    expect(ofType(seasons(start, [[a, b]]), "invincibles")).toEqual([]);
    const unbeaten = updateCulture(withSeason(start, a, b, { unbeaten: true }), world);
    expect(ofType(unbeaten, "invincibles")[0]?.clubIds).toEqual([a]);
  });
});

describe("curses", () => {
  it("falls on a club that keeps finishing second, weighs against its fans, and lifts into a redemption", () => {
    const start = fresh();
    const [, a = 0, b = 0, c = 0] = clubIds(start);
    // b finishes second lostFinals times behind a and c by turns, never winning.
    const results: [number, number][] = Array.from(
      { length: world.config.culture.curse.lostFinals },
      (_, i) => [i % 2 === 0 ? a : c, b],
    );
    const cursed = seasons(start, results);
    const [curse] = ofType(cursed, "curse");
    expect(curse?.clubIds).toEqual([b]);
    const home = countryIndex(world, cursed.anchorCountryId);
    // No shelter from a curse, only heavier aging.
    const without = {
      ...cursed,
      culture: {
        ...cursed.culture,
        traditions: cursed.culture.traditions.filter((t) => t.type !== "curse"),
      },
    };
    expect(traditionWeights(cursed, world)[home]).toBeCloseTo(
      traditionWeights(without, world)[home] ?? 0,
    );
    const held = curseWeights(cursed, world)[home] ?? 0;
    expect(held).toBeGreaterThan(0);
    expect(traditionShelter(0, world, held).turnover).toBeGreaterThan(1);
    const offered = eventSnapshots(offerEvents(cursed, world, 4), world);
    expect(offered.find((e) => e.templateId === "curse-born")?.weight).toBe("big");

    const lifted = seasons(cursed, [[b, a]]);
    expect(ofType(lifted, "curse")[0]?.lost?.reason).toBe("lifted");
    const [redemption] = ofType(lifted, "redemption");
    expect(redemption?.clubIds).toEqual([b]);
    expect(redemption?.strength).toBeGreaterThan(world.config.culture.startStrength);
    // The redemption pays by how long the curse lasted (GDD v1.36).
    const lasted = (redemption?.seasons.at(-1) ?? 0) - (redemption?.seasons[0] ?? 0);
    expect(lasted).toBeGreaterThan(0);
    const { curse: rules, birthPP: base } = world.config.culture;
    const redeemed = offerEvents(lifted, world, 4).events.pending.find(
      (e) => e.facts.tradition?.type === "redemption",
    );
    expect(redeemed && birthPP(lifted, world, redeemed)).toBe(
      Math.min(rules.redemptionMaxPP, base.redemption + rules.redemptionPerSeason * lasted),
    );
    const told = eventSnapshots(offerEvents(lifted, world, 4), world);
    expect(
      told.some((e) => e.templateId === "tradition-lost" && e.facts.tradition?.type === "curse"),
    ).toBe(false);
    expect(told.find((e) => e.facts.tradition?.type === "redemption")?.weight).toBe("headline");
  });

  it("falls on a former champion after a drought", () => {
    const short = withConfig(world, (config) => {
      config.culture.curse.droughtSeasons = 2;
    });
    const start = fresh();
    const [, a = 0, b = 0, c = 0, d = 0] = clubIds(start);
    const state = seasons(
      start,
      [
        [a, b],
        [c, d],
        [c, d],
      ],
      short,
    );
    expect(ofType(state, "curse").map((t) => t.clubIds[0])).toEqual([a]);
  });
});

describe("signature moves and matchday food", () => {
  it("names a move in a star's long star career, and at once for the scoring record", () => {
    const start = fresh();
    const [, a = 0, b = 0] = clubIds(start);
    const season = start.flagship.season;
    const line = (clubId: number) => ({
      season,
      clubId,
      matches: 10,
      scores: 30,
      playoffScores: 0,
      finalScores: 0,
    });
    const [star, scorer] = start.flagship.players;
    if (!star || !scorer) throw new Error("no players");
    const state: GameState = {
      ...start,
      flagship: {
        ...start.flagship,
        players: start.flagship.players.map((p) =>
          p.id === star.id
            ? {
                ...p,
                starSince: season - world.config.culture.signatureMove.starSeasons + 1,
                career: [line(p.clubId)],
              }
            : p.id === scorer.id
              ? { ...p, career: [line(p.clubId)] }
              : p,
        ),
      },
    };
    const moved = updateCulture(withSeason(state, a, b), world);
    const [move] = ofType(moved, "signatureMove");
    expect(move?.playerId).toBe(star.id);
    expect(world.names.traditions.moves).toContain(move?.name);
    expect(move?.strength).toBeGreaterThan(world.config.culture.startStrength);
    const record = updateCulture(
      {
        ...moved,
        landmarks: [
          ...moved.landmarks,
          landmarks.scoringRecord(1, moved.quarter, moved.anchorCountryId, season, scorer.id, 99),
        ],
      },
      world,
    );
    expect(ofType(record, "signatureMove").map((t) => t.playerId)).toEqual([star.id, scorer.id]);
  });

  it("serves matchday food from the first season on, never fading and weighing nothing", () => {
    const start = fresh();
    const [, a = 0, b = 0] = clubIds(start);
    const first = seasons(start, [[a, b]]);
    const [food] = ofType(first, "matchdayFood");
    expect(food?.clubIds).toEqual([start.identity.foundingClubId]);
    expect(world.names.traditions.foods.schoolyard).toContain(food?.name);
    const later = updateCulture({ ...first, quarter: first.quarter + 80 }, world);
    expect(ofType(later, "matchdayFood")[0]).toMatchObject({
      lost: null,
      strength: food?.strength,
    });
    expect(ofType(later, "trophy")[0]?.lost?.reason).toBe("faded");
    const home = countryIndex(world, first.anchorCountryId);
    const bare = {
      ...first,
      culture: {
        ...first.culture,
        traditions: first.culture.traditions.filter((t) => t.type !== "matchdayFood"),
      },
    };
    expect(traditionWeights(first, world)[home]).toBeCloseTo(
      traditionWeights(bare, world)[home] ?? 0,
    );
  });
});

describe("national names by market size", () => {
  it("is minor news without a moment slot in a small market and big news in a large one", () => {
    const start = fresh();
    const lead = new Set(["uruguay", "china"]);
    const anchorLeague =
      start.countries.find((c) => c.countryId === start.anchorCountryId)?.league ?? null;
    const leading: GameState = {
      ...start,
      quarter: start.quarter + 4,
      countries: start.countries.map((country) =>
        lead.has(country.countryId)
          ? {
              ...country,
              // A national name needs a league there.
              league: country.league ?? anchorLeague,
              fans: country.fans.map((f, i) =>
                i === PLAYER_INDEX ? { ...f, casual: 1e10, hardcore: 1e10 } : f,
              ),
            }
          : country,
      ),
    };
    const offered = eventSnapshots(offerEvents(updateCulture(leading, world), world, 4), world);
    const told = (id: string) =>
      offered.find((e) => e.countryId === id && e.facts.tradition?.type === "nationalName");
    expect(told("uruguay")).toMatchObject({ templateId: "national-name-born", weight: "minor" });
    expect(told("china")).toMatchObject({ templateId: "tradition-born", weight: "big" });
  });
});
