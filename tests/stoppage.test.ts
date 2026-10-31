import { describe, expect, it } from "vitest";
import {
  type AgreementTerms,
  applyAction,
  broadcastEffects,
  checkInvariants,
  clauseMet,
  closeOffseason,
  createCampaign,
  type Deal,
  endTurn,
  type GameState,
  leagueCosts,
  leagueIncomePerQuarter,
  PLAYER_INDEX,
  seasonStopped,
  snapshot,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// The stoppage (GDD v1.39 decision 6, tech plan 2.25 step 4): a refused offer loses the season.

const brazil = countryIndex(world, "brazil");
const rules = world.config.flagship.agreement;

/** Brazil's campaign at its first offseason, the seat's league Professional. */
function firstOffseason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (!state.flagship.offseason) state = endTurn(state, world);
  const countries = [...state.countries];
  const country = countries[brazil];
  if (!country?.league) throw new Error("no league");
  const fans = country.fans.map((sport, s) =>
    s === PLAYER_INDEX ? { ...sport, casual: 5_000_000, hardcore: 500_000 } : sport,
  );
  // A cushion: Professional costs on early income would fold the league either way.
  countries[brazil] = {
    ...country,
    fans,
    league: { ...country.league, tier: "professional", cash: 1_000_000 },
  };
  return { ...state, countries };
}

/** Certain refusal under the default tuning. */
const stingy: AgreementTerms = {
  share: rules.shares[0],
  term: rules.terms[rules.terms.length - 1] ?? 7,
  cap: true,
  minWage: "low",
};

/** A signed deal paying for `season` with a fans clause that is met on any count. */
const deal = (id: number, slot: Deal["slot"], season: number): Deal => ({
  id,
  slot,
  position: 0,
  partnerId: `partner-${id}`,
  annualValue: 4_000,
  seasons: 3,
  demand: { kind: "fans" },
  renewal: false,
  firstSeason: season,
  lastSeason: season + 2,
  countryId: "brazil",
  clauseMet: 0,
  clauseMisses: 0,
  fansMark: 0,
});

const hardcore = (state: GameState) => state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;

describe("a season lost to a stoppage", () => {
  const offseason = firstOffseason();
  const lost = offseason.flagship.season;
  const refused = applyAction(offseason, world, {
    type: "proposeAgreement",
    terms: stingy,
  });
  const signed = applyAction(offseason, world, {
    type: "proposeAgreement",
    terms: { ...rules.default, share: rules.shares[1] },
  });

  it("begins when the offseason closes: purists at the seat turn casual, with a landmark", () => {
    expect(refused.agreement.stoppageSeason).toBe(lost);
    const stopped = closeOffseason(refused, world);
    const played = closeOffseason(signed, world);
    expect(seasonStopped(stopped)).toBe(true);
    expect(seasonStopped(played)).toBe(false);
    expect(hardcore(stopped) / hardcore(played)).toBeCloseTo(
      1 - rules.stoppage.hardcoreDemotionShare,
      2,
    );
    expect(stopped.landmarks.at(-1)).toMatchObject({ kind: "seasonLost", season: lost });
  });

  it("earns only sponsors at the seat, pays nobody, and the broadcast is dark", () => {
    const withDeals = (state: GameState): GameState => ({
      ...state,
      flagship: {
        ...state.flagship,
        deals: { ...state.flagship.deals, signed: [deal(1, "tv", lost), deal(2, "sponsor", lost)] },
      },
    });
    const stopped = withDeals(closeOffseason(refused, world));
    const played = withDeals(closeOffseason(signed, world));
    expect(leagueIncomePerQuarter(stopped, world, brazil)).toBeCloseTo(1_000);
    expect(leagueIncomePerQuarter(played, world, brazil)).toBeGreaterThan(2_000);
    const costs = leagueCosts(stopped, world, brazil);
    expect(costs.payroll + costs.wages).toBe(0);
    expect(broadcastEffects(stopped, world).boost).toBe(0);
  });

  it("is told by a headline card naming the season and the union's term", () => {
    const next = endTurn(refused, world);
    const card = next.events.pending.find((event) => event.templateId === "season-lost");
    expect(card?.facts.stoppage).toEqual({ season: lost, term: rules.terms[0] });
    expect(snapshot(next, world).flagship.stoppage).toBe(true);
  });

  it("ends a year on with no champion, its number spent, the players a year older", () => {
    let state = endTurn(refused, world);
    const before = state.flagship;
    while (!state.flagship.offseason) state = endTurn(state, world);
    expect(state.flagship.seasons).toHaveLength(before.seasons.length);
    expect(state.flagship.season).toBe(lost + 1);
    expect(state.flagship.round).toBe(0);
    expect(state.landmarks.some((l) => l.kind === "seasonChampion" && l.season === lost)).toBe(
      false,
    );
    const skills = (players: typeof before.players) =>
      players.filter((p) => p.retiredSeason === null).map((p) => p.skill);
    expect(skills(state.flagship.players)).not.toEqual(skills(before.players));
    const view = snapshot(state, world);
    expect(view.flagship.lostSeasons.map((s) => s.season)).toEqual([lost]);
    expect(view.hallOfFame.records.lost.map((s) => s.season)).toEqual([lost]);
    expect(checkInvariants(state, world)).toEqual([]);
    // Its clauses count as missed, even one met on any count.
    const fans = deal(3, "sponsor", lost);
    expect(clauseMet(state, world, fans, 1)).toBe(false);
    expect(
      clauseMet(
        { ...state, agreement: { ...state.agreement, stoppageSeason: null } },
        world,
        fans,
        1,
      ),
    ).toBe(true);
  });
});
