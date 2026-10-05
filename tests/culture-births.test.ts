import { describe, expect, it } from "vitest";
import {
  createCampaign,
  cultureProblems,
  endTurn,
  type GameState,
  landmarks,
  serializeSave,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason } from "./culture-helpers";
import { setupFor, world } from "./helpers";

// Culture, first build (GDD v1.22): births, renewal, decay and loss.

describe("births", () => {
  it("the trophy is born at the first season's end, open to naming, and renewed after", () => {
    const state = fresh();
    const [a = 0, b = 0] = clubIds(state).filter((id) => id !== state.identity.foundingClubId);
    const first = updateCulture(withSeason(state, a, b), world);
    const [trophy] = ofType(first, "trophy");
    expect(trophy?.clubIds).toEqual([state.identity.foundingClubId]);
    expect(first.culture.naming).toBe(trophy?.id);
    expect(first.landmarks.at(-1)).toMatchObject({ kind: "traditionBorn", type: "trophy" });
    const second = updateCulture(withSeason(first, a, b), world);
    expect(second.culture.naming).toBeNull();
    expect(ofType(second, "trophy")).toHaveLength(1);
    expect(ofType(second, "trophy")[0]?.strength).toBeGreaterThan(trophy?.strength ?? 1);
    expect(cultureProblems(second, world)).toEqual([]);
  });

  it("the club rite is born only from the founding club's first title", () => {
    const state = fresh();
    const founding = state.identity.foundingClubId;
    const other = clubIds(state).find((id) => id !== founding) ?? 0;
    expect(ofType(updateCulture(withSeason(state, other, founding), world), "rite")).toEqual([]);
    const won = updateCulture(withSeason(state, founding, other), world);
    const [rite] = ofType(won, "rite");
    expect(rite?.clubIds).toEqual([founding]);
    expect(world.names.traditions.rites.schoolyard).toContain(rite?.name);
  });

  it("a derby needs the same two clubs on top in 3 of 5 seasons; a stoke counts as one", () => {
    // Beach eases derbies 0.9: still 3 meetings.
    let state = fresh("beach");
    const [, a = 0, b = 0, c = 0] = clubIds(state);
    state = updateCulture(withSeason(state, a, b), world);
    state = updateCulture(withSeason(state, c, a), world);
    state = updateCulture(withSeason(state, b, a), world);
    expect(ofType(state, "derby")).toEqual([]);
    state = updateCulture(withSeason(state, a, b), world);
    const [derby] = ofType(state, "derby");
    expect(derby?.clubIds).toEqual([Math.min(a, b), Math.max(a, b)]);
    expect(derby?.seasons).toHaveLength(3);

    let stoked = fresh("beach");
    stoked = updateCulture(withSeason(stoked, a, b), world);
    stoked = updateCulture(withSeason(stoked, b, a), world);
    stoked = {
      ...stoked,
      culture: { ...stoked.culture, stokes: [{ clubIds: [a, b], season: 2 }] },
    };
    expect(ofType(updateCulture(stoked, world), "derby")).toHaveLength(1);
  });

  it("birthplace eases births: factory derbies need 2 meetings, village-green ones 4", () => {
    for (const [birthplace, needed] of [
      ["factory", 2],
      ["village-green", 4],
    ] as const) {
      let state = fresh(birthplace);
      const [, a = 0, b = 0] = clubIds(state);
      for (let i = 1; i < needed; i += 1) state = updateCulture(withSeason(state, a, b), world);
      expect(ofType(state, "derby")).toEqual([]);
      state = updateCulture(withSeason(state, a, b), world);
      expect(ofType(state, "derby")).toHaveLength(1);
    }
  });

  it("a ground becomes famous after 3 fame facts; the founding ground starts with one", () => {
    let state = fresh();
    const founding = state.identity.foundingClubId;
    const [a = 0, b = 0] = clubIds(state).filter((id) => id !== founding);
    state = updateCulture(withSeason(state, a, b), world);
    // A final hosted (American format) is a fame fact too.
    state = updateCulture(withSeason(state, b, a, { format: "american", host: a }), world);
    expect(ofType(state, "venue")).toEqual([]);
    state = updateCulture(withSeason(state, a, b), world);
    expect(ofType(state, "venue").map((t) => t.clubIds[0])).toEqual([a]);

    let home = fresh();
    home = updateCulture(withSeason(home, founding, a), world);
    home = updateCulture(withSeason(home, founding, a), world);
    expect(ofType(home, "venue").map((t) => t.clubIds[0])).toEqual([founding]);
  });

  it("a star legacy needs a long star career or the scoring record; honors start it stronger", () => {
    const state = fresh();
    const player = state.flagship.players[0];
    const rival = state.flagship.players[1];
    if (!player || !rival) throw new Error("no players");
    const line = (season: number, clubId: number, scores: number) => ({
      season,
      clubId,
      matches: 10,
      scores,
      playoffScores: 0,
      finalScores: 0,
    });
    const retire = (starSince: number, scores: number, honors: boolean) => {
      const players = state.flagship.players.map((p) => {
        if (p.id === rival.id) return { ...p, career: [line(1, p.clubId, 100)] };
        if (p.id !== player.id) return p;
        return {
          ...p,
          starSince,
          retiredSeason: 6,
          backing: honors ? { season: 1, influence: 1, honors: true, mentee: null } : null,
          career: [1, 2, 3, 4, 5, 6].map((season) => line(season, p.clubId, scores)),
        };
      });
      const next: GameState = {
        ...state,
        flagship: { ...state.flagship, season: 7, players },
        landmarks: [
          ...state.landmarks,
          landmarks.starLandmark(
            "starRetired",
            1,
            0,
            state.anchorCountryId,
            6,
            player.id,
            player.clubId,
          ),
        ],
      };
      return ofType(updateCulture(next, world), "legacy");
    };
    expect(retire(5, 5, false)).toEqual([]);
    const [legacy] = retire(3, 5, false);
    expect(legacy?.playerId).toBe(player.id);
    const [honored] = retire(3, 5, true);
    expect(honored?.strength).toBeGreaterThan(legacy?.strength ?? 1);
    // Two star seasons, but the league's all-time top scorer.
    expect(retire(5, 50, false)).toHaveLength(1);
  });

  it("a national name is born at a league's first Professional promotion", () => {
    const state = fresh();
    const country = world.countries.find((c) => c.languages.primary === "spanish");
    if (!country) throw new Error("no Spanish-speaking market");
    const promote = (to: "semi-pro" | "professional") =>
      updateCulture(
        {
          ...state,
          landmarks: [
            ...state.landmarks,
            landmarks.leaguePromoted(
              1,
              0,
              country.id,
              to === "professional" ? "semi-pro" : "amateur",
              to,
            ),
          ],
        },
        world,
      );
    expect(ofType(promote("semi-pro"), "nationalName")).toEqual([]);
    const [name] = ofType(promote("professional"), "nationalName");
    expect(name?.countryId).toBe(country.id);
    expect(world.names.traditions.nationalNames.spanish).toContain(name?.name);
  });
});

describe("decay and loss", () => {
  it("a tradition fades a step each year without a renewing fact, and is lost at zero", () => {
    let state = fresh();
    const [, a = 0, b = 0] = clubIds(state);
    state = updateCulture(withSeason(state, a, b), world);
    const start = ofType(state, "trophy")[0]?.strength ?? 0;
    state = updateCulture({ ...state, quarter: state.quarter + 8 }, world);
    expect(ofType(state, "trophy")[0]?.strength).toBeCloseTo(
      start - 2 * world.config.culture.decayPerYear,
    );
    state = updateCulture({ ...state, quarter: state.quarter + 40 }, world);
    const [trophy] = ofType(state, "trophy");
    expect(trophy?.lost?.reason).toBe("faded");
    expect(state.landmarks.at(-1)).toMatchObject({ kind: "traditionLost", reason: "faded" });
  });

  it("a folded league takes its traditions with it", () => {
    let state = fresh();
    const [, a = 0, b = 0] = clubIds(state);
    state = updateCulture(withSeason(state, a, b), world);
    const folded = updateCulture(
      {
        ...state,
        landmarks: [
          ...state.landmarks,
          landmarks.leagueFolded(1, state.quarter, state.anchorCountryId, "amateur"),
        ],
      },
      world,
    );
    expect(ofType(folded, "trophy")[0]?.lost?.reason).toBe("folded");
  });

  it("plays: a real campaign's first season founds the trophy, deterministically", () => {
    const play = () => {
      let state = createCampaign(world, setupFor(5));
      for (let i = 0; i < 6; i += 1) state = endTurn(state, world);
      return state;
    };
    const state = play();
    expect(ofType(state, "trophy")).toHaveLength(1);
    expect(serializeSave(play())).toBe(serializeSave(state));
  });
});
