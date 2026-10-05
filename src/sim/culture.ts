import { LEAGUE_TIERS, RULE_AXES, TRADITION_TYPES, type TraditionType } from "../content";
import { yearOfQuarter } from "./calendar";
import { tidyName } from "./identity";
import { demoteHardcore } from "./leagues";
import { landmarks } from "./records";
import { createRngState } from "./rng";
import {
  type AxisId,
  type Club,
  type CultureState,
  type GameState,
  type Genome,
  type Landmark,
  type LeagueTierId,
  PLAYER_INDEX,
  type Player,
  type SeasonSummary,
  type SportIdentity,
  type Tradition,
  type TraditionLossReason,
  type World,
} from "./types";

// Culture, first build (GDD v1.22). Culture is never bought: traditions are born only from
// recorded facts, held by the player's fans in follower countries, renewed by new facts and faded
// without them. Six types: derby, club rite, star legacy, national name, famous venue and the
// trophy. They make the player's hardcore fans stickier (generational turnover, rival poaching and
// reclaim) and make them resist betrayal: amendments that move away from the rules a tradition was
// born under, moving the commissioner's seat away from them, and renaming the trophy. Founding
// character biases births (birthplace) and betrayals (ethos). Every number is config (`culture`).
//
// Culture reads facts after they are recorded (landmarks and season summaries) once per turn, and
// rolls reach on its own random stream, so the world's random sequence never depends on it.

/** Distinguishes culture's random stream from the world's, the flagship's and identity's. */
const CULTURE_STREAM = 0x2545_f491;

/** Culture at a campaign's start, or when an older save first gains it. */
export function newCulture(
  seed: number,
  startSeason: number,
  landmarkCursor: number,
  quarter: number,
  world: World,
): CultureState {
  return {
    startSeason,
    landmarkCursor,
    // The year under way is the first whose end culture will run.
    year: yearOfQuarter(quarter, world.config) - 1,
    rng: createRngState((seed ^ CULTURE_STREAM) >>> 0),
    traditions: [],
    nextId: 1,
    stokes: [],
    naming: null,
  };
}

/** A small stable hash of a string (FNV-1a), for names that must not consume a random stream. */
function hash(text: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193) >>> 0;
  }
  return h;
}

/**
 * A club's ground (GDD v1.22): the founding club's is named at setup; every other club's is its
 * town and a ground word, fixed by the club itself so it never consumes a random stream.
 */
export function clubGround(
  club: Club,
  identity: Pick<SportIdentity, "foundingClubId" | "groundName">,
  world: World,
): string {
  if (club.id === identity.foundingClubId) return identity.groundName;
  const words = world.names.groundWords;
  const word = words[hash(`${club.countryId}|${club.place}|${club.id}`) % words.length] ?? "";
  return `${club.place} ${word}`;
}

/** The rule traits of a genome, as a tradition remembers them. */
export function ruleTraits(genome: Genome): Partial<Record<AxisId, string>> {
  return Object.fromEntries(RULE_AXES.map((axis) => [axis, genome[axis]]));
}

export const living = (tradition: Tradition) => tradition.lost === null;

// ---- Culture nodes (GDD v1.22: nurture, never create) -----------------------------------------

/** The Culture category's factors on one tradition type. */
export interface CultureFactors {
  /** Multiplies renewals and divides yearly decay. */
  strength: number;
  /** The bonus above 1 sets the yearly chance to gain a follower; 1 means no reach. */
  reach: number;
  /** Multiplies the strength an offending amendment or seat move takes. */
  protection: number;
  /** Multiplies a tradition's weight in its countries (stickiness and betrayal alike). */
  hold: number;
}

const NO_CULTURE: CultureFactors = { strength: 1, reach: 1, protection: 1, hold: 1 };

/** The owned Culture nodes' factors on a tradition type (global: Culture effects take no conditions). */
export function cultureFactors(
  world: World,
  owned: readonly string[],
  type: TraditionType,
): CultureFactors {
  if (owned.length === 0) return NO_CULTURE;
  const totals = { strength: 0, reach: 0, protection: 0, hold: 0 };
  for (const nodeId of owned) {
    const node = world.growthTree.nodes.find((n) => n.id === nodeId);
    for (const effect of node?.effects ?? []) {
      if (effect.traditionType !== undefined && effect.traditionType !== type) continue;
      if (effect.type === "traditionStrength") totals.strength += effect.amount;
      else if (effect.type === "traditionReach") totals.reach += effect.amount;
      else if (effect.type === "traditionProtection") totals.protection += effect.amount;
      else if (effect.type === "traditionHold") totals.hold += effect.amount;
    }
  }
  const floor = world.growthTree.limits.minFactor;
  return {
    strength: Math.max(floor, 1 + totals.strength),
    reach: Math.max(1, 1 + totals.reach),
    protection: Math.max(floor, 1 - totals.protection),
    hold: Math.max(floor, 1 + totals.hold),
  };
}

// ---- Founding character -----------------------------------------------------------------------

/** How easily the sport's birthplace lets a type be born (content; 1 when unknown). */
export function birthEase(
  world: World,
  identity: Pick<SportIdentity, "birthplace">,
  type: TraditionType,
) {
  return world.identity.culture.birthplaces[identity.birthplace]?.[type] ?? 1;
}

/** A birth threshold after the birthplace's ease: base ÷ ease, rounded, at least 1. */
export function birthThreshold(
  world: World,
  identity: Pick<SportIdentity, "birthplace">,
  type: TraditionType,
  base: number,
): number {
  return Math.max(1, Math.round(base / birthEase(world, identity, type)));
}

/** The ethos's multiplier on one betrayal (content; 1 when unknown). */
export function ethosFactor(
  world: World,
  identity: Pick<SportIdentity, "ethos">,
  betrayal: "rules" | "seat" | "rename",
): number {
  return world.identity.culture.ethos[identity.ethos]?.[betrayal] ?? 1;
}

// ---- Births, renewal, decay and loss ----------------------------------------------------------

const seasonYear = (summary: SeasonSummary, world: World) =>
  yearOfQuarter(Math.max(0, summary.quarter - 1), world.config);

const samePair = (a: readonly number[], b: readonly number[]) =>
  a.length === 2 &&
  b.length === 2 &&
  Math.min(...a) === Math.min(...b) &&
  Math.max(...a) === Math.max(...b);

/** The club whose ground hosted a season's final (American format), or null. */
function finalHost(summary: SeasonSummary): number | null {
  return summary.format === "american" ? (summary.playoffs.at(-1)?.homeId ?? null) : null;
}

/** A name from a pool, picked by a stable key (never a random stream). */
function poolName(pool: readonly string[] | undefined, key: string): string | null {
  if (!pool || pool.length === 0) return null;
  return pool[hash(key) % pool.length] ?? null;
}

/**
 * Culture's working copy for one turn's update: traditions change in place, landmarks collect,
 * and births take the next ids.
 */
class CultureUpdate {
  readonly traditions: Tradition[];
  readonly found: Landmark[] = [];
  nextId: number;
  naming: number | null = null;

  constructor(
    readonly state: GameState,
    readonly world: World,
  ) {
    this.traditions = state.culture.traditions.map((t) => ({ ...t }));
    this.nextId = state.culture.nextId;
  }

  get config() {
    return this.world.config.culture;
  }

  livingOf(type: TraditionType, match: (t: Tradition) => boolean): Tradition | undefined {
    return this.traditions.find((t) => t.type === type && living(t) && match(t));
  }

  /** The last flagship season a tradition of this type and key was lost in, if ever. */
  lostSince(type: TraditionType, match: (t: Tradition) => boolean): number {
    const seasons = this.state.flagship.seasons;
    let since = this.state.culture.startSeason;
    for (const t of this.traditions) {
      if (t.type !== type || living(t) || !match(t) || !t.lost) continue;
      const lostQuarter = t.lost.quarter;
      const after = seasons.find((s) => s.quarter > lostQuarter);
      since = Math.max(since, after?.season ?? this.state.flagship.season);
    }
    return since;
  }

  born(
    type: TraditionType,
    countryId: string,
    parts: {
      clubIds?: number[];
      playerId?: number | null;
      name?: string | null;
      seasons?: number[];
    },
    year: number,
    bonus = 0,
  ): Tradition {
    const { state, world } = this;
    const strength = Math.min(
      1,
      this.config.startStrength * birthEase(world, state.identity, type) + bonus,
    );
    // Key order follows the save schema, so saves re-serialize byte-identically.
    const tradition: Tradition = {
      id: this.nextId,
      type,
      countryId,
      clubIds: parts.clubIds ?? [],
      playerId: parts.playerId ?? null,
      name: parts.name ?? null,
      seasons: parts.seasons ?? [],
      rules: ruleTraits(state.genome),
      bornTurn: state.turn,
      bornQuarter: state.quarter,
      strength,
      renewedYear: year,
      followers: [countryId],
      lost: null,
    };
    this.nextId += 1;
    this.traditions.push(tradition);
    this.found.push(
      landmarks.traditionBorn(state.turn, state.quarter, countryId, tradition.id, type),
    );
    return tradition;
  }

  renew(tradition: Tradition, year: number): void {
    const { strength } = cultureFactors(this.world, this.state.growthNodes, tradition.type);
    tradition.strength = Math.min(1, tradition.strength + this.config.renewal * strength);
    tradition.renewedYear = Math.max(tradition.renewedYear, year);
  }

  lose(tradition: Tradition, reason: TraditionLossReason): void {
    if (!living(tradition)) return;
    const { state } = this;
    tradition.strength = 0;
    tradition.lost = { turn: state.turn, quarter: state.quarter, reason };
    this.found.push(
      landmarks.traditionLost(
        state.turn,
        state.quarter,
        tradition.countryId,
        tradition.id,
        tradition.type,
        reason,
      ),
    );
  }

  /** A finished flagship season: the trophy, the rite, the derby, famous grounds, star legacies. */
  season(summary: SeasonSummary): void {
    const { state, world } = this;
    const year = seasonYear(summary, world);
    const countryId = summary.countryId;
    const { foundingClubId } = state.identity;
    const leagueSeasons = state.flagship.seasons.filter(
      (s) => s.countryId === countryId && s.season <= summary.season,
    );

    // The trophy: born at a league's first season end; renewed by every season played for it.
    const trophy = this.livingOf("trophy", (t) => t.countryId === countryId);
    if (trophy) this.renew(trophy, year);
    else {
      const named = state.flagship.clubs.some(
        (c) => c.id === foundingClubId && c.countryId === countryId,
      )
        ? foundingClubId
        : (summary.standings.map((row) => row.clubId).sort((a, b) => a - b)[0] ??
          summary.championId);
      const born = this.born(
        "trophy",
        countryId,
        { clubIds: [named], seasons: [summary.season] },
        year,
      );
      this.naming = born.id;
    }

    // The club rite: the founding club's first title, renewed by every title after.
    if (summary.championId === foundingClubId) {
      // Born once: a lost rite is gone for good (its first title cannot come again).
      const rite = this.livingOf("rite", () => true);
      if (rite) this.renew(rite, year);
      else if (!this.traditions.some((t) => t.type === "rite"))
        this.born(
          "rite",
          countryId,
          {
            clubIds: [foundingClubId],
            name: poolName(
              world.names.traditions.rites[state.identity.birthplace],
              `${state.seed}|rite`,
            ),
            seasons: [summary.season],
          },
          year,
        );
    }

    // The derby: the same two clubs first and second (or in the final).
    this.derby([summary.championId, summary.runnerUpId], countryId, summary.season, year);

    // Famous grounds: titles won and finals hosted.
    const host = finalHost(summary);
    const clubsHere = summary.standings.map((row) => row.clubId);
    for (const clubId of clubsHere) {
      const fact = summary.championId === clubId || host === clubId;
      const venue = this.livingOf("venue", (t) => t.clubIds[0] === clubId);
      if (venue) {
        if (fact) this.renew(venue, year);
        continue;
      }
      if (!fact) continue;
      const since = this.lostSince("venue", (t) => t.clubIds[0] === clubId);
      const factSeasons = leagueSeasons
        .filter((s) => s.season >= since && (s.championId === clubId || finalHost(s) === clubId))
        .map((s) => s.season);
      const facts =
        factSeasons.length + (clubId === foundingClubId ? this.config.venue.foundingFacts : 0);
      const threshold = birthThreshold(world, state.identity, "venue", this.config.venue.fameFacts);
      if (facts >= threshold)
        this.born("venue", countryId, { clubIds: [clubId], seasons: factSeasons }, year);
    }

    // Star legacies are renewed when a star of their club breaks out.
    if (summary.newStarId !== null) {
      const star = state.flagship.players.find((p) => p.id === summary.newStarId);
      for (const legacy of this.traditions)
        if (legacy.type === "legacy" && living(legacy) && legacy.clubIds[0] === star?.clubId)
          this.renew(legacy, year);
    }
  }

  /** Whether a pair of clubs has met often enough lately (with stokes) to found a derby. */
  derby(pair: number[], countryId: string, season: number, year: number, renewing = true): void {
    const { state, world } = this;
    if (pair[0] === pair[1]) return;
    const existing = this.livingOf("derby", (t) => samePair(t.clubIds, pair));
    const { meetings, seasons: span } = this.config.derby;
    const since = Math.max(
      this.lostSince("derby", (t) => samePair(t.clubIds, pair)),
      season - span + 1,
    );
    const met = state.flagship.seasons
      .filter(
        (s) =>
          s.countryId === countryId &&
          s.season >= since &&
          s.season <= season &&
          samePair([s.championId, s.runnerUpId], pair),
      )
      .map((s) => s.season);
    if (existing) {
      if (renewing && met.includes(season)) this.renew(existing, year);
      return;
    }
    const stoked = state.culture.stokes.filter(
      (stoke) => samePair(stoke.clubIds, pair) && stoke.season >= since && stoke.season <= season,
    ).length;
    if (met.length + stoked >= birthThreshold(world, state.identity, "derby", meetings)) {
      const clubIds = [Math.min(...pair), Math.max(...pair)];
      this.born("derby", countryId, { clubIds, seasons: met }, year);
    }
  }

  /** A star retired: a long star career or the league's scoring record founds a legacy. */
  retired(landmark: Extract<Landmark, { kind: "firstStar" | "starRetired" }>): void {
    const { state, world } = this;
    const player = state.flagship.players.find((p) => p.id === landmark.playerId);
    if (!player || player.starSince === null) return;
    if (this.traditions.some((t) => t.type === "legacy" && t.playerId === player.id)) return;
    const starSeasons = landmark.season - player.starSince + 1;
    const here = new Set(
      state.flagship.clubs.filter((c) => c.countryId === landmark.countryId).map((c) => c.id),
    );
    const total = (p: Player) =>
      p.career.filter((line) => here.has(line.clubId)).reduce((sum, line) => sum + line.scores, 0);
    const best = Math.max(0, ...state.flagship.players.map(total));
    const record = total(player) > 0 && total(player) >= best;
    const needed = birthThreshold(world, state.identity, "legacy", this.config.legacy.starSeasons);
    if (starSeasons < needed && !record) return;
    const since = player.starSince;
    const seasons = player.career
      .filter((line) => line.season >= since && line.season <= landmark.season)
      .map((line) => line.season);
    const honors = player.backing?.honors ? this.config.honorsBonus : 0;
    this.born(
      "legacy",
      landmark.countryId,
      { clubIds: [landmark.clubId], playerId: player.id, seasons },
      yearOfQuarter(Math.max(0, landmark.quarter - 1), world.config),
      honors,
    );
  }

  /** A league promoted: its first time at Professional founds the national name. */
  promoted(landmark: Extract<Landmark, { kind: "leaguePromoted" | "leagueSteppedDown" }>): void {
    const { world } = this;
    const year = yearOfQuarter(Math.max(0, landmark.quarter - 1), world.config);
    const existing = this.livingOf("nationalName", (t) => t.countryId === landmark.countryId);
    if (existing) {
      this.renew(existing, year);
      return;
    }
    if (!professional(landmark.to)) return;
    if (
      this.traditions.some((t) => t.type === "nationalName" && t.countryId === landmark.countryId)
    )
      return;
    const country = world.countries.find((c) => c.id === landmark.countryId);
    const pools = world.names.traditions.nationalNames;
    const pool = pools[country?.languages.primary ?? ""] ?? pools.default;
    this.born(
      "nationalName",
      landmark.countryId,
      { name: poolName(pool, `${this.state.seed}|${landmark.countryId}`) },
      year,
    );
  }

  /** A league folded: every tradition at home there is lost with it. */
  folded(countryId: string): void {
    for (const tradition of this.traditions)
      if (living(tradition) && tradition.countryId === countryId) this.lose(tradition, "folded");
  }

  /** A year ended: national names renew while their league stays Professional; others decay. */
  yearEnded(year: number): void {
    const { state, world } = this;
    for (const tradition of this.traditions) {
      if (!living(tradition)) continue;
      if (tradition.type === "nationalName") {
        const index = world.countries.findIndex((c) => c.id === tradition.countryId);
        const league = state.countries[index]?.league;
        if (league && professional(league.tier)) {
          this.renew(tradition, year);
          continue;
        }
      }
      if (tradition.renewedYear >= year) continue;
      const { strength } = cultureFactors(world, state.growthNodes, tradition.type);
      tradition.strength = Math.max(0, tradition.strength - this.config.decayPerYear / strength);
      if (tradition.strength <= 1e-9) this.lose(tradition, "faded");
    }
  }
}

function professional(tier: LeagueTierId): boolean {
  return LEAGUE_TIERS.indexOf(tier) >= LEAGUE_TIERS.indexOf("professional");
}

/**
 * Culture's turn (GDD v1.22), after the turn's quarters and league evaluation: reads every fact
 * recorded since the last update in order (season ends, star retirements, promotions, folds), then
 * runs the end of each in-game year that finished (decay). The free trophy naming offered last
 * turn closes. Records a landmark for every tradition born or lost.
 */
export function updateCulture(state: GameState, world: World): GameState {
  const update = new CultureUpdate(state, world);
  const recent = state.landmarks.slice(state.culture.landmarkCursor);
  for (const landmark of recent) {
    switch (landmark.kind) {
      case "seasonChampion": {
        const summary = state.flagship.seasons.find((s) => s.season === landmark.season);
        if (summary && summary.season >= state.culture.startSeason) update.season(summary);
        break;
      }
      case "starRetired":
        update.retired(landmark);
        break;
      case "leaguePromoted":
        update.promoted(landmark);
        break;
      case "leagueFolded":
      case "anchorCollapse":
      case "birthplaceOutlived":
        update.folded(landmark.countryId);
        break;
      default:
        break;
    }
  }
  // Stokes answered since the season ended can complete a derby.
  const latest = state.flagship.seasons.at(-1);
  if (latest)
    for (const stoke of state.culture.stokes)
      if (stoke.season === latest.season)
        update.derby(
          stoke.clubIds,
          latest.countryId,
          latest.season,
          seasonYear(latest, world),
          false,
        );

  const lastYear = yearOfQuarter(state.quarter, world.config) - 1;
  for (let year = state.culture.year + 1; year <= lastYear; year += 1) update.yearEnded(year);

  const landmarksNow = [...state.landmarks, ...update.found];
  return {
    ...state,
    landmarks: landmarksNow,
    culture: {
      ...state.culture,
      landmarkCursor: landmarksNow.length,
      year: Math.max(state.culture.year, lastYear),
      traditions: update.traditions,
      nextId: update.nextId,
      naming: update.naming,
    },
  };
}

/** Every way the culture state is invalid (see src/sim/invariants.ts). */
export function cultureProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const { culture } = state;
  const known = new Set(world.countries.map((country) => country.id));
  if (culture.landmarkCursor > state.landmarks.length)
    problems.push("culture: landmark cursor is in the future");
  if (culture.startSeason < 1 || culture.startSeason > state.flagship.season)
    problems.push("culture: start season is invalid");
  const ids = new Set<number>();
  for (const tradition of culture.traditions) {
    const at = `culture: tradition ${tradition.id}`;
    if (ids.has(tradition.id) || tradition.id >= culture.nextId)
      problems.push(`${at} has a bad id`);
    ids.add(tradition.id);
    if (!TRADITION_TYPES.includes(tradition.type)) problems.push(`${at} has an unknown type`);
    if (!(tradition.strength >= 0 && tradition.strength <= 1))
      problems.push(`${at} strength ${tradition.strength} is outside 0–1`);
    if (tradition.followers[0] !== tradition.countryId)
      problems.push(`${at} does not list its home first`);
    if (new Set(tradition.followers).size !== tradition.followers.length)
      problems.push(`${at} lists a follower twice`);
    for (const countryId of tradition.followers)
      if (!known.has(countryId)) problems.push(`${at} names unknown country "${countryId}"`);
    for (const clubId of tradition.clubIds)
      if (clubId >= state.flagship.nextClubId) problems.push(`${at} names an unknown club`);
    if (tradition.playerId !== null && tradition.playerId >= state.flagship.nextPlayerId)
      problems.push(`${at} names an unknown player`);
    if (tradition.bornTurn > state.turn || tradition.bornQuarter > state.quarter)
      problems.push(`${at} is born in the future`);
    if (tradition.lost === null && tradition.strength <= 0)
      problems.push(`${at} has no strength but is not lost`);
  }
  if (culture.naming !== null) {
    const trophy = culture.traditions.find((t) => t.id === culture.naming);
    if (trophy?.type !== "trophy" || trophy.lost !== null)
      problems.push("culture: the trophy to name is not a living trophy");
  }
  for (const stoke of culture.stokes)
    if (stoke.clubIds.length !== 2 || stoke.clubIds.some((id) => id >= state.flagship.nextClubId))
      problems.push("culture: a derby stoke names unknown clubs");
  return problems;
}

// ---- Effects (GDD v1.22: traditions help and constrain) --------------------------------------

/**
 * Each country's tradition weight (content order): the strength of every living tradition its
 * fans hold (abroad at reach.followerShare), × the Culture nodes' hold on its type, capped.
 */
export function traditionWeights(
  state: Pick<GameState, "culture" | "growthNodes">,
  world: World,
): number[] {
  const { weightCap } = world.config.culture;
  return heldStrength(state.culture.traditions, state, world).map((weight) =>
    Math.min(weightCap, weight),
  );
}

/** How much of the player's hardcore loss to aging, poaching and reclaim remains at a weight. */
export function traditionShelter(weight: number, world: World) {
  const { weightCap, turnoverCut, poachCut } = world.config.culture;
  const level = Math.min(1, weight / weightCap);
  return { turnover: 1 - turnoverCut * level, poaching: 1 - poachCut * level };
}

/** The strength of the living famous venues at home in a country. */
export function venueStrength(state: Pick<GameState, "culture">, countryId: string): number {
  return state.culture.traditions
    .filter((t) => t.type === "venue" && living(t) && t.countryId === countryId)
    .reduce((sum, t) => sum + t.strength, 0);
}

/**
 * The strength each country's fans hold of these traditions (content order, uncapped): home at
 * full strength, abroad at reach.followerShare, × the Culture nodes' hold on each type.
 */
export function heldStrength(
  traditions: readonly Tradition[],
  state: Pick<GameState, "growthNodes">,
  world: World,
): number[] {
  const held = world.countries.map(() => 0);
  const index = new Map(world.countries.map((country, i) => [country.id, i]));
  for (const tradition of traditions) {
    if (!living(tradition)) continue;
    const { hold } = cultureFactors(world, state.growthNodes, tradition.type);
    tradition.followers.forEach((countryId, f) => {
      const i = index.get(countryId);
      if (i === undefined) return;
      const share = f === 0 ? 1 : world.config.culture.reach.followerShare;
      held[i] = (held[i] ?? 0) + tradition.strength * share * hold;
    });
  }
  return held;
}

/**
 * Wears traditions down by betrayal (GDD v1.22): each loses `damage(tradition)` × the Culture
 * nodes' protection on its type; one worn to nothing is broken, with a landmark.
 */
export function wearTraditions(
  state: GameState,
  world: World,
  ids: readonly number[],
  damage: (tradition: Tradition) => number,
): GameState {
  if (ids.length === 0) return state;
  const found: Landmark[] = [];
  const traditions = state.culture.traditions.map((tradition) => {
    if (!ids.includes(tradition.id) || !living(tradition)) return tradition;
    const { protection } = cultureFactors(world, state.growthNodes, tradition.type);
    const strength = Math.max(0, tradition.strength - damage(tradition) * protection);
    if (strength > 1e-9) return { ...tradition, strength };
    found.push(
      landmarks.traditionLost(
        state.turn,
        state.quarter,
        tradition.countryId,
        tradition.id,
        tradition.type,
        "broken",
      ),
    );
    return {
      ...tradition,
      strength: 0,
      lost: { turn: state.turn, quarter: state.quarter, reason: "broken" as const },
    };
  });
  return {
    ...state,
    culture: { ...state.culture, traditions },
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
  };
}

// ---- The trophy's name (GDD v1.22) ------------------------------------------------------------

/** The living trophy of the league at the seat, if it has one. */
export function seatTrophy(state: Pick<GameState, "culture" | "flagship">): Tradition | undefined {
  return state.culture.traditions.find(
    (t) => t.type === "trophy" && living(t) && t.countryId === state.flagship.countryId,
  );
}

function nameProblem(world: World, name: string): boolean {
  const tidy = tidyName(name);
  const { nameMinLength, trophyNameMaxLength } = world.config.identity;
  return tidy.length < nameMinLength || tidy.length > trophyNameMaxLength;
}

/** Why the trophy cannot be named for free now ("none": no naming open; "name": bad name). */
export type NameTrophyBlocker = "none" | "name";
export function nameTrophyBlocker(
  state: Pick<GameState, "culture">,
  world: World,
  name: string,
): NameTrophyBlocker | null {
  if (state.culture.naming === null) return "none";
  return nameProblem(world, name) ? "name" : null;
}

/** Names the newborn trophy, free, while its champion card is open (checked by the caller). */
export function nameTrophy(state: GameState, name: string): GameState {
  const traditions = state.culture.traditions.map((t) =>
    t.id === state.culture.naming ? { ...t, name: tidyName(name) } : t,
  );
  return { ...state, culture: { ...state.culture, traditions } };
}

/**
 * The share of each country's player hardcore fans who turn casual if the trophy is renamed
 * (content order): renameShare × its strength × the ethos × the Culture hold, abroad at the
 * follower share.
 */
export function renameShares(state: GameState, world: World, trophy: Tradition): number[] {
  const factor = world.config.culture.renameShare * ethosFactor(world, state.identity, "rename");
  return heldStrength([trophy], state, world).map((held) => Math.min(1, factor * held));
}

/** Why the trophy cannot be renamed now, or null when it can. */
export type RenameTrophyBlocker = "window" | "trophy" | "name" | "same" | "naming";
export function renameTrophyBlocker(
  state: GameState,
  world: World,
  name: string,
  windowOpen: boolean,
): RenameTrophyBlocker | null {
  const trophy = seatTrophy(state);
  if (!trophy) return "trophy";
  if (state.culture.naming === trophy.id) return "naming";
  if (!windowOpen) return "window";
  if (nameProblem(world, name)) return "name";
  if (trophy.name !== null && tidyName(name) === trophy.name) return "same";
  return null;
}

/**
 * Renames the seat's trophy (checked by the caller): the old trophy tradition ends (renamed, a
 * landmark), its followers' purists turn casual, and the new name is born as a fresh trophy.
 */
export function renameTrophy(state: GameState, world: World, name: string): GameState {
  const trophy = seatTrophy(state);
  if (!trophy) throw new Error("No trophy to rename");
  const shares = renameShares(state, world, trophy);
  const countries = state.countries.map((country, i) => {
    const share = shares[i] ?? 0;
    if (share <= 0) return country;
    return {
      ...country,
      fans: country.fans.map((fans, f) =>
        f === PLAYER_INDEX ? demoteHardcore(fans, share) : fans,
      ),
    };
  });
  const year = yearOfQuarter(state.quarter, world.config);
  const fresh: Tradition = {
    ...trophy,
    id: state.culture.nextId,
    name: tidyName(name),
    seasons: [],
    rules: ruleTraits(state.genome),
    bornTurn: state.turn,
    bornQuarter: state.quarter,
    strength: Math.min(
      1,
      world.config.culture.startStrength * birthEase(world, state.identity, "trophy"),
    ),
    renewedYear: year,
    followers: [trophy.countryId],
    lost: null,
  };
  const traditions = [
    ...state.culture.traditions.map((t) =>
      t.id === trophy.id
        ? {
            ...t,
            strength: 0,
            lost: { turn: state.turn, quarter: state.quarter, reason: "renamed" as const },
          }
        : t,
    ),
    fresh,
  ];
  return {
    ...state,
    countries,
    culture: { ...state.culture, traditions, nextId: fresh.id + 1 },
    landmarks: [
      ...state.landmarks,
      landmarks.traditionLost(
        state.turn,
        state.quarter,
        trophy.countryId,
        trophy.id,
        "trophy",
        "renamed",
      ),
      landmarks.traditionBorn(state.turn, state.quarter, fresh.countryId, fresh.id, "trophy"),
    ],
  };
}
