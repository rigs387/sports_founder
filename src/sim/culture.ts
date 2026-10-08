import { LEAGUE_TIERS, RULE_AXES, TRADITION_TYPES, type TraditionType } from "../content";
import { yearOfQuarter } from "./calendar";
import { chooseClass, classLandmark, shrineWeights } from "./hall-of-fame";
import { tidyName } from "./identity";
import { demoteHardcore } from "./leagues";
import { landmarks } from "./records";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import { seasonStories } from "./season-stories";
import {
  type AxisId,
  type Club,
  type CultureState,
  type GameState,
  type Genome,
  type Inductee,
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
// without them. Six types from the first build (derby, club rite, star legacy, national name,
// famous venue and the trophy) and chants (GDD v1.31), the only type that spreads with its fans.
// They make the player's hardcore fans stickier (generational turnover, rival poaching and
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
  /**
   * The bonus above 1 sets the yearly chance to gain a follower along proximity or language
   * links; 1 means no reach that way.
   */
  reach: { proximity: number; language: number };
  /** Multiplies the strength an offending amendment or seat move takes. */
  protection: number;
  /** Multiplies a tradition's weight in its countries (stickiness and betrayal alike). */
  hold: number;
}

const NO_CULTURE: CultureFactors = {
  strength: 1,
  reach: { proximity: 1, language: 1 },
  protection: 1,
  hold: 1,
};

/** The owned Culture nodes' factors on a tradition type (global: Culture effects take no conditions). */
export function cultureFactors(
  world: World,
  owned: readonly string[],
  type: TraditionType,
): CultureFactors {
  if (owned.length === 0) return NO_CULTURE;
  const totals = { strength: 0, proximity: 0, language: 0, protection: 0, hold: 0 };
  for (const nodeId of owned) {
    const node = world.growthTree.nodes.find((n) => n.id === nodeId);
    for (const effect of node?.effects ?? []) {
      if (effect.traditionType !== undefined && effect.traditionType !== type) continue;
      if (effect.type === "traditionStrength") totals.strength += effect.amount;
      else if (effect.type === "traditionReach") {
        if (effect.channel !== "language") totals.proximity += effect.amount;
        if (effect.channel !== "proximity") totals.language += effect.amount;
      } else if (effect.type === "traditionProtection") totals.protection += effect.amount;
      else if (effect.type === "traditionHold") totals.hold += effect.amount;
    }
  }
  const floor = world.growthTree.limits.minFactor;
  return {
    strength: Math.max(floor, 1 + totals.strength),
    reach: {
      proximity: Math.max(1, 1 + totals.proximity),
      language: Math.max(1, 1 + totals.language),
    },
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

/** The ground a record crowd is credited to (GDD v1.30): the final's host, else the champion's. */
function recordGround(summary: SeasonSummary): number | null {
  if (!summary.recordCrowd) return null;
  return finalHost(summary) ?? summary.championId;
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
  /** Hall of Fame inductees this update adds (GDD v1.31). */
  readonly inducted: Inductee[] = [];

  readonly rng: Rng;

  constructor(
    readonly state: GameState,
    readonly world: World,
  ) {
    this.rng = restoreRng(state.culture.rng);
    this.traditions = state.culture.traditions.map((t) => ({ ...t, followers: [...t.followers] }));
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

    // Famous grounds: titles won, finals hosted and record crowds (one more fact each).
    const host = finalHost(summary);
    const clubsHere = summary.standings.map((row) => row.clubId);
    for (const clubId of clubsHere) {
      const fact =
        summary.championId === clubId || host === clubId || recordGround(summary) === clubId;
      const venue = this.livingOf("venue", (t) => t.clubIds[0] === clubId);
      if (venue) {
        if (fact) this.renew(venue, year);
        continue;
      }
      if (!fact) continue;
      const since = this.lostSince("venue", (t) => t.clubIds[0] === clubId);
      const factSeasons = leagueSeasons
        .filter(
          (s) =>
            s.season >= since &&
            (s.championId === clubId || finalHost(s) === clubId || recordGround(s) === clubId),
        )
        .map((s) => s.season);
      const records = leagueSeasons.filter(
        (s) => s.season >= since && recordGround(s) === clubId,
      ).length;
      const facts =
        factSeasons.length +
        records +
        (clubId === foundingClubId ? this.config.venue.foundingFacts : 0);
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

    this.chant(summary, year);
  }

  /**
   * Chants (GDD v1.31): the champion's terrace song is born from an underdog title or a first
   * title won in a close finish (the season-story rules) once the league has played
   * `chant.historySeasons` seasons, one living chant a club; the first chant
   * ever is the anthem and starts stronger. Every title of the club renews its chant.
   */
  chant(summary: SeasonSummary, year: number): void {
    const { state, world } = this;
    const clubId = summary.championId;
    const existing = this.livingOf("chant", (t) => t.clubIds[0] === clubId);
    if (existing) {
      this.renew(existing, year);
      return;
    }
    const seasons = state.flagship.seasons;
    const index = seasons.findIndex((s) => s.season === summary.season);
    if (index < 0) return;
    const stories = seasonStories(seasons, index, world);
    // In a young league every title is a first: a first title counts once the league has history.
    const history = seasons.filter(
      (s) => s.countryId === summary.countryId && s.season < summary.season,
    ).length;
    const dramatic =
      stories.includes("underdog") ||
      (stories.includes("firstTitle") &&
        stories.includes("closeFinish") &&
        history >= this.config.chant.historySeasons);
    if (!dramatic) return;
    const anthem = !this.traditions.some((t) => t.type === "chant");
    this.born(
      "chant",
      summary.countryId,
      {
        clubIds: [clubId],
        name: poolName(world.names.traditions.chants, `${state.seed}|chant|${clubId}`),
        seasons: [summary.season],
      },
      year,
      anthem ? this.config.chant.anthemBonus : 0,
    );
  }

  /**
   * A Hall of Fame class at a season's end (GDD v1.31), after the season's traditions: inducts the
   * class, renews the inductees' living star legacies and records the class landmark.
   */
  hallClass(summary: SeasonSummary, championIndex: number, quarter: number): void {
    const { state, world } = this;
    const hall = {
      ...state.hallOfFame,
      inductees: [...state.hallOfFame.inductees, ...this.inducted],
      nextId: state.hallOfFame.nextId + this.inducted.length,
    };
    const inductees = chooseClass(
      { ...state, hallOfFame: hall },
      world,
      summary,
      championIndex,
      state.turn,
      quarter,
    );
    const year = seasonYear(summary, world);
    for (const inductee of inductees) {
      const legacy = this.livingOf("legacy", (t) => t.playerId === inductee.playerId);
      if (inductee.playerId !== null && legacy) this.renew(legacy, year);
    }
    this.inducted.push(...inductees);
    this.found.push(...classLandmark(state, inductees));
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
      if (tradition.renewedYear < year) {
        const { strength } = cultureFactors(world, state.growthNodes, tradition.type);
        tradition.strength = Math.max(0, tradition.strength - this.config.decayPerYear / strength);
        if (tradition.strength <= 1e-9) {
          this.lose(tradition, "faded");
          continue;
        }
      }
      if (tradition.type === "chant") this.quieten(tradition);
      this.reachOut(tradition);
    }
  }

  /**
   * A chant goes quiet abroad (GDD v1.31): a follower where the player's hardcore share has fallen
   * below the reach floor is dropped; the fans who sang it are gone.
   */
  quieten(tradition: Tradition): void {
    const { state, world } = this;
    const floor = this.config.reach.minHardcoreShare;
    tradition.followers = tradition.followers.filter((id, f) => {
      if (f === 0) return true;
      const index = world.countries.findIndex((c) => c.id === id);
      const hardcore = state.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
      return hardcore >= floor * (world.countries[index]?.population ?? 0);
    });
  }

  /**
   * Reach: a tradition at full strength at home may gain one follower a year, a country linked
   * to a follower by a channel the Culture nodes reach along, where the player has enough hardcore
   * fans. National names never spread. Chants (GDD v1.31) reach without nodes, from a lower
   * strength, along any proximity or language link, up to a cap of followers; the nodes add.
   */
  reachOut(tradition: Tradition): void {
    const { state, world } = this;
    const { reach, chant: chants } = this.config;
    const chant = tradition.type === "chant";
    const minStrength = chant ? chants.reachMinStrength : reach.minStrength;
    if (tradition.type === "nationalName" || tradition.strength < minStrength) return;
    if (chant && tradition.followers.length >= chants.maxFollowers) return;
    const bonus = cultureFactors(world, state.growthNodes, tradition.type).reach;
    // Chants spread with their fans without nodes (GDD v1.31); the rest only through nodes.
    if (!chant && bonus.proximity <= 1 && bonus.language <= 1) return;
    const roll = nextFloat(this.rng);
    const pick = nextFloat(this.rng);
    const followers = new Set(
      tradition.followers.map((id) => world.countries.findIndex((c) => c.id === id)),
    );
    const candidates: { index: number; chance: number }[] = [];
    world.countries.forEach((country, index) => {
      if (followers.has(index)) return;
      const hardcore = state.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
      if (hardcore < reach.minHardcoreShare * country.population) return;
      let best = 0;
      let linked = false;
      for (const link of world.inbound[index] ?? []) {
        if (!followers.has(link.source)) continue;
        if (link.proximity > 0) best = Math.max(best, bonus.proximity - 1);
        if (link.language > 0) best = Math.max(best, bonus.language - 1);
        if (link.proximity > 0 || link.language > 0) linked = true;
      }
      const chance = reach.chancePerReach * best + (chant && linked ? chants.reachChance : 0);
      if (chance > 0) candidates.push({ index, chance });
    });
    if (candidates.length === 0) return;
    const chance = Math.min(1, Math.max(...candidates.map((c) => c.chance)));
    if (roll >= chance) return;
    const chosen = candidates[Math.floor(pick * candidates.length)];
    const country = chosen && world.countries[chosen.index];
    if (!country) return;
    tradition.followers.push(country.id);
    // A chant's first follower abroad is news, once (GDD v1.31).
    const told = (l: Landmark) => l.kind === "chantSpread" && l.traditionId === tradition.id;
    if (chant && !state.landmarks.some(told) && !this.found.some(told))
      this.found.push(landmarks.chantSpread(state.turn, state.quarter, country.id, tradition.id));
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
  recent.forEach((landmark, offset) => {
    switch (landmark.kind) {
      case "seasonChampion": {
        const summary = state.flagship.seasons.find((s) => s.season === landmark.season);
        if (summary && summary.season >= state.culture.startSeason) update.season(summary);
        if (summary && summary.season >= state.hallOfFame.startSeason)
          update.hallClass(summary, state.culture.landmarkCursor + offset, landmark.quarter);
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
  });
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
      rng: saveRng(update.rng),
      landmarkCursor: landmarksNow.length,
      year: Math.max(state.culture.year, lastYear),
      traditions: update.traditions,
      nextId: update.nextId,
      naming: update.naming,
    },
    hallOfFame:
      update.inducted.length === 0
        ? state.hallOfFame
        : {
            ...state.hallOfFame,
            inductees: [...state.hallOfFame.inductees, ...update.inducted],
            nextId: state.hallOfFame.nextId + update.inducted.length,
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
 * fans hold (abroad at reach.followerShare), × the Culture nodes' hold on its type, plus the Hall
 * of Fame's shrine weight, capped.
 */
export function traditionWeights(
  state: Pick<GameState, "culture" | "growthNodes" | "hallOfFame">,
  world: World,
): number[] {
  const { weightCap } = world.config.culture;
  // Hall of Fame inductees add shrine weight at home, inside the cap (GDD v1.31).
  const shrine = shrineWeights(state, world);
  return heldStrength(state.culture.traditions, state, world).map((weight, i) =>
    Math.min(weightCap, weight + (shrine[i] ?? 0)),
  );
}

/** How much of the player's hardcore loss to aging, poaching and reclaim remains at a weight. */
export function traditionShelter(weight: number, world: World) {
  const { weightCap, turnoverCut, poachCut } = world.config.culture;
  const level = Math.min(1, weight / weightCap);
  return { turnover: 1 - turnoverCut * level, poaching: 1 - poachCut * level };
}

/** The strength of the living famous venues at home in each country (content order). */
export function venueStrengths(
  state: Pick<GameState, "culture" | "flagship">,
  world: World,
): number[] {
  const strengths = world.countries.map(() => 0);
  const named = namedGrounds(state.flagship);
  const { pilgrimageCut } = world.config.flagship.deals.namingRights;
  for (const t of state.culture.traditions) {
    if (t.type !== "venue" || !living(t)) continue;
    const i = world.countries.findIndex((country) => country.id === t.countryId);
    // A sponsor's name on the ground cuts its pilgrimage while the deal pays (GDD v1.28).
    const cut = t.clubIds.some((id) => named.has(id)) ? 1 - pilgrimageCut : 1;
    if (i >= 0) strengths[i] = (strengths[i] ?? 0) + t.strength * cut;
  }
  return strengths;
}

/** The grounds (by club id) carrying a sponsor's name: paying naming-rights deals (GDD v1.28). */
export function namedGrounds(flagship: GameState["flagship"]): Set<number> {
  return new Set(
    flagship.deals.signed
      .filter(
        (deal) =>
          deal.slot === "namingRights" &&
          deal.firstSeason <= flagship.season &&
          deal.lastSeason >= flagship.season,
      )
      .map((deal) => deal.position),
  );
}

/**
 * Naming rights betray (GDD v1.28): signing them on a famous ground offends its venue tradition,
 * and on the founding ground the club rite. Each wears by traditionWear, and hardcoreDemotionShare
 * × their held strength in the seat country × the ethos's rename factor of hardcore fans there
 * turn casual, as a trophy rename does.
 */
export function betrayGround(state: GameState, world: World, clubId: number): GameState {
  const seat = world.countries.findIndex((country) => country.id === state.flagship.countryId);
  const betrayed = state.culture.traditions.filter(
    (t) =>
      living(t) &&
      t.countryId === state.flagship.countryId &&
      ((t.type === "venue" && t.clubIds.includes(clubId)) ||
        (t.type === "rite" &&
          clubId === state.identity.foundingClubId &&
          t.clubIds.includes(clubId))),
  );
  return betrayGrounds(state, world, seat, betrayed, world.config.flagship.deals.namingRights);
}

/**
 * Modernizing the grounds (GDD v1.30): opening a venue level at or past `modernize.fromLevel`
 * betrays every famous venue in the country, as naming rights do, and every chant there (GDD
 * v1.31: seated stands kill the singing end).
 */
export function modernizeGrounds(state: GameState, world: World, index: number): GameState {
  const countryId = world.countries[index]?.id;
  const betrayed = state.culture.traditions.filter(
    (t) => living(t) && (t.type === "venue" || t.type === "chant") && t.countryId === countryId,
  );
  return betrayGrounds(state, world, index, betrayed, world.config.leagues.venue.modernize);
}

/**
 * Grounds betrayed in a country: each tradition wears by traditionWear, and hardcoreDemotionShare
 * × their held strength there × the ethos's rename factor of hardcore fans there turn casual.
 */
function betrayGrounds(
  state: GameState,
  world: World,
  index: number,
  betrayed: Tradition[],
  settings: { hardcoreDemotionShare: number; traditionWear: number },
): GameState {
  if (betrayed.length === 0 || index < 0) return state;
  const held = heldStrength(betrayed, state, world)[index] ?? 0;
  const share = Math.min(
    1,
    settings.hardcoreDemotionShare * held * ethosFactor(world, state.identity, "rename"),
  );
  const countries = [...state.countries];
  const country = countries[index];
  if (country && share > 0) {
    countries[index] = {
      ...country,
      fans: country.fans.map((fans, f) =>
        f === PLAYER_INDEX ? demoteHardcore(fans, share) : fans,
      ),
    };
  }
  return wearTraditions(
    { ...state, countries },
    world,
    betrayed.map((t) => t.id),
    () => settings.traditionWear,
  );
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

// ---- Snapshot (GDD v1.22: what the player sees) -----------------------------------------------

/** A tradition as the UI shows it: recorded facts and a strength bar. Effects stay in the sim. */
export interface TraditionSnapshot {
  id: number;
  type: TraditionType;
  countryId: string;
  clubIds: number[];
  playerId: number | null;
  name: string | null;
  /** The flagship seasons whose facts made it. */
  seasons: number[];
  bornYear: number;
  strength: number;
  followers: string[];
  lost: { year: number; reason: TraditionLossReason } | null;
  /** The rules it was born under: amending away from one offends it. */
  rules: { axis: AxisId; option: string }[];
}

export interface CultureSnapshot {
  traditions: TraditionSnapshot[];
  /** The newborn trophy the player may name for free now, or null. */
  naming: number | null;
  /** Renaming the seat's trophy: its id, why it cannot be renamed now, and the purists it costs. */
  rename: {
    trophyId: number;
    blocker: Exclude<RenameTrophyBlocker, "name" | "same"> | null;
    hardcore: number;
  } | null;
  nameLimits: { min: number; max: number };
  /** The derby rule the cards quote: meetings needed within how many seasons. */
  derby: { meetings: number; seasons: number };
  /** Rivals' traditions (flavor from content): shown, with no effect. */
  rivals: { sportId: string; id: string; type: TraditionType; countryId: string; name: string }[];
}

export function cultureSnapshot(
  state: GameState,
  world: World,
  windowOpen: boolean,
): CultureSnapshot {
  const year = (quarter: number) => yearOfQuarter(quarter, world.config);
  const trophy = seatTrophy(state);
  const renameBlocker = trophy ? renameTrophyBlocker(state, world, "Valid Name", windowOpen) : null;
  const renameCost = trophy
    ? renameShares(state, world, trophy).reduce(
        (sum, share, i) =>
          sum + Math.floor((state.countries[i]?.fans[PLAYER_INDEX]?.hardcore ?? 0) * share),
        0,
      )
    : 0;
  const { identity, culture } = world.config;
  return {
    traditions: state.culture.traditions.map((t) => ({
      id: t.id,
      type: t.type,
      countryId: t.countryId,
      clubIds: t.clubIds,
      playerId: t.playerId,
      name: t.name,
      seasons: t.seasons,
      bornYear: year(t.bornQuarter),
      strength: t.strength,
      followers: t.followers,
      lost: t.lost ? { year: year(t.lost.quarter), reason: t.lost.reason } : null,
      rules: RULE_AXES.flatMap((axis) => {
        const option = t.rules[axis];
        return option === undefined ? [] : [{ axis, option }];
      }),
    })),
    naming: state.culture.naming,
    rename: trophy
      ? {
          trophyId: trophy.id,
          blocker: renameBlocker === "name" || renameBlocker === "same" ? null : renameBlocker,
          hardcore: renameCost,
        }
      : null,
    nameLimits: { min: identity.nameMinLength, max: identity.trophyNameMaxLength },
    derby: { meetings: culture.derby.meetings, seasons: culture.derby.seasons },
    rivals: Object.entries(world.names.traditions.rivals).flatMap(([sportId, list]) =>
      list.map((t) => ({ sportId, ...t })),
    ),
  };
}
