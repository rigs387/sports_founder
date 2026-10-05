import { costMultiplier, offseasonOpen, QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { clubGround, ethosFactor, traditionWeights } from "./culture";
import { demoteHardcore } from "./leagues";
import { landmarks } from "./records";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import {
  type CareerLine,
  type Club,
  type CountryState,
  type FlagshipState,
  type GameState,
  type Landmark,
  type LeagueState,
  type LeagueTierId,
  type MatchResult,
  PLAYER_INDEX,
  type Player,
  type PlayerTally,
  type ScoringOption,
  type SeasonFormat,
  type SeasonSummary,
  type SeasonTally,
  type TableRow,
  type TopScorer,
  type World,
} from "./types";

// The flagship league (GDD v1.11 commissioner's seat, v1.13 seat rules, v1.14 flagship season).
// The player runs one league in depth: named clubs based in real places, one season a year ending
// in the configured quarter, a champion, then the offseason (GDD v1.24). Every number is config
// (`flagship`, `offseason`).
//
// Its matches roll on the flagship's own random stream, seeded from the campaign seed, so the
// world's random sequence (fans, spread, rivals) is identical with or without it. In this first
// build the flagship records history and does not yet feed fans or spread back.
//
// A season: every club plays every other club home and away (circle-method rounds, spread evenly
// over the season's quarters). European format: the top of the table is champion. American format:
// the top clubs play single-match knockouts, higher seed at home. Ranking: points, then score
// margin, then score for, then the older club. At the season's end club ratings drift and the
// offseason opens; no matches are played in it. When it closes (the start of the next End Turn) a
// requested seat move happens, the club count follows the league tier and the next season starts.

/** Distinguishes the flagship's random stream from the world's. */
const FLAGSHIP_STREAM = 0x9e37_79b9;

function indexOf(world: World, countryId: string): number {
  return world.countries.findIndex((country) => country.id === countryId);
}

/** Quarters from `quarter` (the next one simulated) through the next season-ending quarter. */
export function quartersUntilSeasonEnd(quarter: number, world: World): number {
  const end = world.config.offseason.seasonEndQuarter - 1;
  return ((end - (quarter % QUARTERS_PER_YEAR) + QUARTERS_PER_YEAR) % QUARTERS_PER_YEAR) + 1;
}

export function clubTarget(tier: LeagueTierId, world: World): number {
  return world.config.flagship.clubs[tier];
}

export function activeClubs(flagship: FlagshipState): Club[] {
  return flagship.clubs
    .filter((club) => club.active && club.countryId === flagship.countryId)
    .sort((a, b) => a.id - b.id);
}

export function totalRounds(clubCount: number): number {
  const even = clubCount + (clubCount % 2);
  return clubCount < 2 ? 0 : 2 * (even - 1);
}

/**
 * The pairs of one round (circle method). Club ids in ascending order; an odd count gets a bye.
 * The second half of the season repeats the first with home and away swapped.
 */
export function roundPairs(ids: readonly number[], round: number): [number, number][] {
  const slots: (number | null)[] = [...ids];
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const half = n - 1;
  const k = round % half;
  const second = round >= half;
  const rest = slots.slice(1);
  const rotated = [
    slots[0] ?? null,
    ...rest.slice(rest.length - k),
    ...rest.slice(0, rest.length - k),
  ];
  const pairs: [number, number][] = [];
  for (let i = 0; i < n / 2; i += 1) {
    const a = rotated[i] ?? null;
    const b = rotated[n - 1 - i] ?? null;
    if (a === null || b === null) continue;
    const aHome = i === 0 ? k % 2 === 0 : i % 2 === k % 2;
    const [home, away] = aHome !== second ? [a, b] : [b, a];
    pairs.push([home, away]);
  }
  return pairs;
}

function emptyRow(clubId: number): TableRow {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    points: 0,
  };
}

/** Table rows ranked best first: points, score margin, score for, then the older club. */
export function rankTable(table: readonly TableRow[]): TableRow[] {
  return [...table].sort(
    (a, b) =>
      b.points - a.points ||
      b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst) ||
      b.scoreFor - a.scoreFor ||
      a.clubId - b.clubId,
  );
}

// ---- Clubs ----------------------------------------------------------------------------------

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** One of the market's real places, weighted by population ^ placeWeightExponent. */
function drawPlace(world: World, rng: Rng, countryId: string): string {
  const places = world.places[countryId];
  if (!places || places.length === 0) throw new Error(`No places for "${countryId}"`);
  const exponent = world.config.flagship.placeWeightExponent;
  const weights = places.map((place) => Math.max(1, place.population) ** exponent);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = nextFloat(rng) * total;
  for (let i = 0; i < places.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return places[i]?.name ?? "";
  }
  return places[places.length - 1]?.name ?? "";
}

/** A new club in a real place of the market, with a nickname no active club there has. */
function newClub(
  world: World,
  rng: Rng,
  flagship: Pick<FlagshipState, "clubs" | "nextClubId" | "season">,
  countryId: string,
  rating: number,
): Club {
  const place = drawPlace(world, rng, countryId);
  const here = flagship.clubs.filter((club) => club.countryId === countryId);
  const taken = new Set(here.filter((club) => club.active).map((club) => club.nickname));
  const everUsedHere = new Set(here.map((club) => club.nickname));
  const all = world.names.clubNicknames;
  const fresh = all.filter((name) => !everUsedHere.has(name));
  const pool = fresh.length > 0 ? fresh : all.filter((name) => !taken.has(name));
  const nickname = pool[Math.floor(nextFloat(rng) * pool.length)] ?? all[0] ?? "";
  return {
    id: flagship.nextClubId,
    countryId,
    place,
    nickname,
    rating: clamp(rating, world.config.flagship.rating.min, world.config.flagship.rating.max),
    active: true,
    firstSeason: flagship.season,
  };
}

function meanRating(clubs: readonly Club[], world: World): number {
  if (clubs.length === 0) return world.config.flagship.rating.start;
  return clubs.reduce((sum, club) => sum + club.rating, 0) / clubs.length;
}

/**
 * Brings the active clubs to the count the league tier calls for: old clubs of this country come
 * back first (oldest first), then generated expansion clubs; a smaller league drops the newest.
 */
function fitClubs(flagship: FlagshipState, world: World, rng: Rng, tier: LeagueTierId) {
  const target = clubTarget(tier, world);
  let next: FlagshipState = { ...flagship, clubs: flagship.clubs.map((club) => ({ ...club })) };
  const here = (club: Club) => club.countryId === next.countryId;
  const active = () => next.clubs.filter((club) => here(club) && club.active);

  for (const club of [...next.clubs]
    .filter((c) => here(c) && !c.active)
    .sort((a, b) => a.id - b.id)) {
    if (active().length >= target) break;
    club.active = true;
  }
  const { rating } = world.config.flagship;
  // A league's founding clubs each roll a rating; later arrivals are expansion clubs.
  const founding = !next.clubs.some(here);
  while (active().length < target) {
    const base = founding
      ? rating.start + rating.startSpread * (2 * nextFloat(rng) - 1)
      : meanRating(active(), world) - rating.expansionPenalty;
    const club = newClub(world, rng, next, next.countryId, base);
    next = { ...next, clubs: [...next.clubs, club], nextClubId: next.nextClubId + 1 };
  }
  const newestFirst = active().sort((a, b) => b.firstSeason - a.firstSeason || b.id - a.id);
  for (const club of newestFirst.slice(0, Math.max(0, newestFirst.length - target))) {
    club.active = false;
  }
  return staffClubs(next, world, rng);
}

// ---- Leading players (GDD v1.16) ------------------------------------------------------------

/** The invented-name pool a market's players are named from. */
function namePool(world: World, countryId: string) {
  const { playerNames } = world.names;
  const sphere = world.countries.find((c) => c.id === countryId)?.languages.primary ?? "";
  const pool = playerNames.pools[playerNames.countries[countryId] ?? sphere];
  if (!pool) throw new Error(`No player name pool for "${countryId}"`);
  return pool;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(nextFloat(rng) * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

/** A name from the market's pool, redrawn (a few times) if someone in the league has it. */
function drawName(world: World, rng: Rng, countryId: string, taken: ReadonlySet<string>): string {
  const pool = namePool(world, countryId);
  let name = "";
  for (let attempt = 0; attempt <= world.config.flagship.players.nameRetries; attempt += 1) {
    const given = pick(rng, pool.given);
    const family = pick(rng, pool.family);
    name = pool.order === "familyFirst" ? `${family} ${given}` : `${given} ${family}`;
    if (given !== family && !taken.has(name)) break;
  }
  return name;
}

/** A player's share of their peak skill at `age` (the career curve). */
export function careerShare(age: number, world: World): number {
  const { career } = world.config.flagship.players;
  if (age < career.peakAge) return Math.max(0, 1 - career.risePerYear * (career.peakAge - age));
  if (age <= career.declineAge) return 1;
  return Math.max(0, 1 - career.declinePerYear * (age - career.declineAge));
}

/**
 * A club's new leading player. A club's first is of an age spread across the founding range; a
 * replacement for a retired player is young, with peak skill leaning toward the club's strength.
 */
function newPlayer(
  world: World,
  rng: Rng,
  flagship: FlagshipState,
  club: Club,
  taken: ReadonlySet<string>,
  replacement: boolean,
): Player {
  const { foundingAge, skill, peakSkill, replacement: young } = world.config.flagship.players;
  const ages = replacement ? young.age : foundingAge;
  const age = ages.min + Math.floor(nextFloat(rng) * (ages.max - ages.min + 1));
  const lean = replacement
    ? young.ratingLean * (club.rating - world.config.flagship.rating.start)
    : 0;
  const peak = clamp(
    peakSkill.mean + peakSkill.spread * (2 * nextFloat(rng) - 1) + lean,
    skill.min,
    skill.max,
  );
  return {
    id: flagship.nextPlayerId,
    name: drawName(world, rng, club.countryId, taken),
    countryId: club.countryId,
    birthplace: drawPlace(world, rng, club.countryId),
    clubId: club.id,
    birthSeason: flagship.season - age,
    peakSkill: peak,
    skill: clamp(peak * careerShare(age, world), skill.min, skill.max),
    starSince: null,
    finalSeason: false,
    retiredSeason: null,
    backing: null,
    career: [],
  };
}

/**
 * Gives every active club without a leading player one (GDD v1.16): founding and expansion clubs,
 * and clubs from saves made before players existed. Dormant clubs keep theirs.
 */
function staffClubs(flagship: FlagshipState, world: World, rng: Rng): FlagshipState {
  let next = flagship;
  const staffed = new Set(next.players.filter(playing).map((player) => player.clubId));
  const hadOne = new Set(next.players.map((player) => player.clubId));
  const taken = new Set(next.players.map((player) => player.name));
  for (const club of activeClubs(next)) {
    if (staffed.has(club.id)) continue;
    const player = newPlayer(world, rng, next, club, taken, hadOne.has(club.id));
    taken.add(player.name);
    next = { ...next, players: [...next.players, player], nextPlayerId: next.nextPlayerId + 1 };
  }
  return next;
}

const EMPTY_TALLY = { matches: 0, scores: 0, playoffScores: 0, finalScores: 0 };

const playing = (player: Player) => player.retiredSeason === null;

/** The club's leading player (not retired), if it has one. */
export function leadingPlayer(flagship: FlagshipState, clubId: number): Player | undefined {
  return flagship.players.find((player) => playing(player) && player.clubId === clubId);
}

/** What a club's star adds to its rating in matches (GDD v1.16); nothing without a star. */
export function starStrength(flagship: FlagshipState, clubId: number, world: World): number {
  const player = leadingPlayer(flagship, clubId);
  if (!player || player.starSince === null) return 0;
  return world.config.flagship.stars.strengthPerSkill * player.skill;
}

/** The stars at the seat's active clubs: the ones holding the league's star places. */
export function seatStars(flagship: FlagshipState): Player[] {
  const active = new Set(activeClubs(flagship).map((club) => club.id));
  return flagship.players.filter(
    (player) => playing(player) && player.starSince !== null && active.has(player.clubId),
  );
}

/**
 * Backed players still playing: each holds a backing slot. A mentored successor may hold one
 * before becoming a star; an honored retiree's fading afterglow holds none.
 */
export function backedStars(flagship: FlagshipState): Player[] {
  return flagship.players.filter((player) => playing(player) && player.backing !== null);
}

/** Backed players playing at the seat's active clubs: the ones whose influence acts and grows. */
function seatBacked(flagship: FlagshipState): Player[] {
  const active = new Set(activeClubs(flagship).map((club) => club.id));
  return backedStars(flagship).filter((player) => active.has(player.clubId));
}

/** The PP price of backing a star now: base × the peak tier's cost multiplier. */
export function backingPrice(state: Pick<GameState, "tierTrack">, world: World): number {
  return world.config.flagship.backing.basePrice * costMultiplier(state, world.config);
}

/** Backing slots at the current PP tier. */
export function backingSlots(state: Pick<GameState, "ppTier">, world: World): number {
  return world.config.ppTiers.find((entry) => entry.tier === state.ppTier)?.backingSlots ?? 0;
}

/**
 * What backed stars do for the sport (GDD v1.16): factors on casual conversion in the flagship
 * country and on media reach out of it, from the backed stars playing at the seat. Off the seat
 * their effects pause.
 */
export function backingEffects(flagship: FlagshipState, world: World) {
  const { casualConversion, mediaReach } = world.config.flagship.backing;
  // Backed players at the seat, plus the fading afterglow of stars retired with honors.
  const afterglow = flagship.players.filter((p) => !playing(p) && p.backing?.honors);
  const influence = [...seatBacked(flagship), ...afterglow].reduce(
    (sum, player) => sum + (player.backing?.influence ?? 0),
    0,
  );
  return {
    countryId: flagship.countryId,
    casualConversion: 1 + casualConversion * influence,
    mediaReach: 1 + mediaReach * influence,
  };
}

/** Why a star cannot be backed now (GDD v1.16), or null if they can. */
export type BackBlocker = "window" | "notStar" | "backed" | "slots" | "pp";
export function backStarBlocker(
  state: GameState,
  world: World,
  playerId: number,
): BackBlocker | null {
  if (!offseasonOpen(state)) return "window";
  const player = state.flagship.players.find((p) => p.id === playerId);
  if (!player || !seatStars(state.flagship).includes(player)) return "notStar";
  if (player.backing !== null) return "backed";
  if (backedStars(state.flagship).length >= backingSlots(state, world)) return "slots";
  if (state.pp < backingPrice(state, world)) return "pp";
  return null;
}

/** Why a backing cannot be dropped now, or null if it can. */
export type DropBlocker = "window" | "notBacked";
export function dropStarBlocker(
  state: GameState,
  _world: World,
  playerId: number,
): DropBlocker | null {
  if (!offseasonOpen(state)) return "window";
  const player = state.flagship.players.find((p) => p.id === playerId);
  if (!player || player.backing === null) return "notBacked";
  return null;
}

/** Why a star cannot be backed now, or null if they can. */
export function backBlocker(state: GameState, world: World, playerId: number): string | null {
  switch (backStarBlocker(state, world, playerId)) {
    case "window":
      return "stars can only be backed in the offseason";
    case "notStar":
      return "only a star playing in the flagship league can be backed";
    case "backed":
      return "that star is already backed";
    case "slots":
      return "every backing slot is taken";
    case "pp": {
      const price = backingPrice(state, world);
      return `not enough PP: costs ${Math.ceil(price)}, you have ${Math.floor(state.pp)}`;
    }
    case null:
      return null;
  }
}

/** Why a backing cannot be dropped now, or null if it can. */
export function dropBlocker(state: GameState, world: World, playerId: number): string | null {
  switch (dropStarBlocker(state, world, playerId)) {
    case "window":
      return "a star can only be dropped in the offseason";
    case "notBacked":
      return "that star is not backed";
    case null:
      return null;
  }
}

/** Backs a star (checked by the caller): the PP price now, influence from 0. */
export function backStar(state: GameState, world: World, playerId: number): GameState {
  const price = backingPrice(state, world);
  const backing = { season: state.flagship.season, influence: 0, honors: false, mentee: null };
  return {
    ...state,
    pp: state.pp - price,
    flagship: {
      ...state.flagship,
      players: state.flagship.players.map((p) => (p.id === playerId ? { ...p, backing } : p)),
    },
  };
}

/**
 * Drops a backing (checked by the caller): its influence is lost. Dropping a star at full
 * influence costs goodwill (GDD v1.16): a share of the player's hardcore fans in the flagship
 * country turn casual now, and the dropped-star pressure card follows.
 */
export function dropStar(state: GameState, world: World, playerId: number): GameState {
  const player = state.flagship.players.find((p) => p.id === playerId);
  const next: GameState = {
    ...state,
    flagship: {
      ...state.flagship,
      players: state.flagship.players.map((p) => (p.id === playerId ? { ...p, backing: null } : p)),
    },
  };
  if ((player?.backing?.influence ?? 0) < 1) return next;
  const index = indexOf(world, state.flagship.countryId);
  const share = world.config.flagship.stars.dropDemotionShare;
  return {
    ...next,
    countries: next.countries.map((country, i) =>
      i === index
        ? {
            ...country,
            fans: country.fans.map((fans, f) =>
              f === PLAYER_INDEX ? demoteHardcore(fans, share) : fans,
            ),
          }
        : country,
    ),
    landmarks: [
      ...next.landmarks,
      // Dropped in the offseason, after the season just finished (GDD v1.24).
      landmarks.starDropped(
        state.turn,
        state.quarter,
        state.flagship.countryId,
        state.flagship.seasons.at(-1)?.season ?? state.flagship.season - 1,
        playerId,
      ),
    ],
  };
}

/** The chance that next season is a player's last, at next season's age. */
export function finalSeasonChance(player: Player, age: number, world: World): number {
  const rule = world.config.flagship.players.finalSeason;
  if (age < rule.fromAge) return 0;
  if (age >= rule.lastAge) return 1;
  const lost = player.peakSkill > 0 ? Math.max(0, 1 - player.skill / player.peakSkill) : 0;
  return clamp(rule.base + rule.perYear * (age - rule.fromAge) + rule.perLostShare * lost, 0, 1);
}

/** A club's scores in a finished season, playoffs included. */
export function clubSeasonScores(summary: SeasonSummary, clubId: number): number {
  const row = summary.standings.find((r) => r.clubId === clubId);
  const playoff = summary.playoffs.reduce(
    (sum, m) => sum + (m.homeId === clubId ? m.homeScore : m.awayId === clubId ? m.awayScore : 0),
    0,
  );
  return (row?.scoreFor ?? 0) + playoff;
}

interface SeasonEnd {
  flagship: FlagshipState;
  newStarId: number | null;
  landmarks: Landmark[];
}

/**
 * The leading players' season end (GDD v1.16), after career lines are written and before ratings
 * drift: the top scorer may become a star, players who played their final season retire, stars
 * may move up, and everyone still playing ages into next season (skill, and perhaps a final
 * season announced). Retired players' clubs are restaffed when clubs are fitted.
 */
function playersSeasonEnd(
  flagship: FlagshipState,
  summary: SeasonSummary,
  tier: LeagueTierId,
  world: World,
  rng: Rng,
  turn: number,
  quarter: number,
): SeasonEnd {
  const { stars, players: rules } = world.config.flagship;
  const { season, countryId } = summary;
  const found: Landmark[] = [];
  let players = flagship.players.map((player) => ({ ...player }));
  const current = () => ({ ...flagship, players });

  // A star is made by a season: the top scorer, with the club share, if a place is open.
  let newStarId: number | null = null;
  const top = summary.topScorer;
  const scorer = top ? players.find((player) => player.id === top.playerId) : undefined;
  if (top && scorer && playing(scorer) && scorer.starSince === null) {
    const clubScores = clubSeasonScores(summary, top.clubId);
    const open = seatStars(current()).length < stars.places[tier];
    if (open && clubScores > 0 && top.scores / clubScores >= stars.share[summary.scoring]) {
      const first = !players.some((player) => player.starSince !== null);
      scorer.starSince = season;
      newStarId = scorer.id;
      if (first) {
        found.push(
          landmarks.starLandmark(
            "firstStar",
            turn,
            quarter,
            countryId,
            season,
            scorer.id,
            top.clubId,
          ),
        );
      }
    }
  }

  // Backed players who played the season at the seat grow in influence.
  const { influenceSeasons } = world.config.flagship.backing;
  for (const backed of seatBacked(current())) {
    // A backing inherited by a mentored successor starts growing from next season.
    if (backed.backing === null || backed.backing.season > season) continue;
    const influence = Math.min(1, backed.backing.influence + 1 / influenceSeasons);
    backed.backing = { ...backed.backing, influence };
  }

  // An honored retiree's afterglow fades a step each season.
  const { afterglowSeasons, mentorShare } = stars;
  for (const player of players) {
    if (playing(player) || !player.backing?.honors) continue;
    const influence = player.backing.influence - 1 / afterglowSeasons;
    player.backing = influence > 1e-9 ? { ...player.backing, influence } : null;
  }

  // Players who played their final season retire. A mentored successor takes the backing with a
  // share of its influence; a star retired with honors keeps a fading afterglow; otherwise the
  // backing ends.
  for (const player of players) {
    if (!playing(player) || !player.finalSeason) continue;
    player.retiredSeason = season;
    player.finalSeason = false;
    const backing = player.backing;
    const mentee = backing?.mentee ? players.find((p) => p.id === backing.mentee) : undefined;
    if (backing && mentee && playing(mentee) && mentee.backing === null) {
      mentee.backing = {
        season: season + 1,
        influence: mentorShare * backing.influence,
        honors: false,
        mentee: null,
      };
    }
    player.backing = backing?.honors ? { ...backing, mentee: null } : null;
    if (player.starSince === null) continue;
    const club = flagship.clubs.find((c) => c.id === player.clubId);
    found.push(
      landmarks.starLandmark(
        "starRetired",
        turn,
        quarter,
        club?.countryId ?? countryId,
        season,
        player.id,
        player.clubId,
      ),
    );
  }

  // Stars may move up to a stronger club without a star; the clubs swap leading players.
  const ratingOf = new Map(flagship.clubs.map((club) => [club.id, club.rating]));
  for (const mover of seatStars(current())) {
    if (mover.finalSeason || nextFloat(rng) >= stars.moveChance) continue;
    const own = ratingOf.get(mover.clubId) ?? 0;
    const targets = activeClubs(flagship)
      .filter((club) => club.rating > own)
      .map((club) => players.find((p) => playing(p) && p.clubId === club.id))
      .filter((other): other is Player => other !== undefined && other.starSince === null);
    if (targets.length === 0) continue;
    const other = pick(rng, targets);
    const from = mover.clubId;
    mover.clubId = other.clubId;
    other.clubId = from;
    found.push(
      landmarks.starMoved(
        turn,
        quarter,
        countryId,
        season,
        mover.id,
        from,
        mover.clubId,
        mover.backing !== null,
      ),
    );
  }

  // Everyone still playing ages into next season.
  players = players.map((player) => {
    if (!playing(player)) return player;
    const age = season + 1 - player.birthSeason;
    const wobble = rules.career.wobble * (2 * nextFloat(rng) - 1);
    const skill = clamp(
      player.peakSkill * careerShare(age, world) + wobble,
      rules.skill.min,
      rules.skill.max,
    );
    const aged = { ...player, skill };
    return { ...aged, finalSeason: nextFloat(rng) < finalSeasonChance(aged, age, world) };
  });
  for (const player of players) {
    if (!playing(player) || !player.finalSeason || player.starSince === null) continue;
    const club = flagship.clubs.find((c) => c.id === player.clubId);
    found.push(
      landmarks.starFinalSeason(
        turn,
        quarter,
        club?.countryId ?? countryId,
        season,
        player.id,
        player.clubId,
        player.backing !== null,
      ),
    );
  }

  // A new all-time top scorer of this league, once it has a history.
  const leaguesSeasons = flagship.seasons.filter((s) => s.countryId === countryId).length + 1;
  if (leaguesSeasons >= stars.recordMinSeasons) {
    const here = new Set(flagship.clubs.filter((c) => c.countryId === countryId).map((c) => c.id));
    const total = (player: Player, upTo: number) =>
      player.career
        .filter((line) => line.season <= upTo && here.has(line.clubId))
        .reduce((sum, line) => sum + line.scores, 0);
    const leader = (upTo: number) =>
      [...players].sort((a, b) => total(b, upTo) - total(a, upTo) || a.id - b.id)[0];
    const before = leader(season - 1);
    const after = leader(season);
    if (
      after &&
      before &&
      after.id !== before.id &&
      total(after, season) > total(before, season - 1)
    ) {
      found.push(
        landmarks.scoringRecord(turn, quarter, countryId, season, after.id, total(after, season)),
      );
    }
  }
  return { flagship: current(), newStarId, landmarks: found };
}

/** The season's top scorer: most scores, then fewer matches, then the lower id. */
function topScorer(flagship: FlagshipState, tallies: readonly PlayerTally[]): TopScorer | null {
  const best = [...tallies].sort(
    (a, b) => b.scores - a.scores || a.matches - b.matches || a.playerId - b.playerId,
  )[0];
  const player = best && flagship.players.find((p) => p.id === best.playerId);
  if (!best || !player || best.scores === 0) return null;
  return { playerId: player.id, clubId: player.clubId, scores: best.scores };
}

/** At a season's end, each tallied player who played gains a permanent career line. */
function closeCareers(flagship: FlagshipState, tallies: readonly PlayerTally[]): FlagshipState {
  const tallied = new Map(tallies.map((tally) => [tally.playerId, tally]));
  return {
    ...flagship,
    players: flagship.players.map((player) => {
      const tally = tallied.get(player.id);
      if (!tally || tally.matches === 0) return player;
      const { playerId: _id, ...counts } = tally;
      const line: CareerLine = { season: flagship.season, clubId: player.clubId, ...counts };
      return { ...player, career: [...player.career, line] };
    }),
  };
}

/** Staffs a flagship read from a save older than players (format 10 → 11 migration). */
export function staffFlagship(flagship: FlagshipState, world: World): FlagshipState {
  const rng = restoreRng(flagship.rng);
  const staffed = staffClubs(flagship, world, rng);
  return { ...staffed, rng: saveRng(rng) };
}

/** The active clubs' ratings now, in club order. */
export function activeRatings(flagship: FlagshipState) {
  return activeClubs(flagship).map((club) => ({ clubId: club.id, rating: club.rating }));
}

/**
 * A fresh table for the active clubs, and the season clock from `quarter`. The season plays the
 * scoring rule `scoring` throughout (GDD v1.16: no season mixes two rules).
 */
/**
 * Starts a season at `quarter`. One started by closing the offseason lasts a full year, so with
 * every turn length dividing a year it ends on a turn boundary (GDD v1.24); any other start (the
 * campaign's first season, a seat sent home, a league re-formed) runs to the configured season end.
 */
function startSeason(
  flagship: FlagshipState,
  world: World,
  quarter: number,
  scoring: ScoringOption,
  fullYear = false,
): FlagshipState {
  return {
    ...flagship,
    offseason: false,
    scoring,
    seasonQuarters: fullYear ? QUARTERS_PER_YEAR : quartersUntilSeasonEnd(quarter, world),
    quartersPlayed: 0,
    round: 0,
    table: activeClubs(flagship).map((club) => emptyRow(club.id)),
    startRatings: activeRatings(flagship),
    lastRound: [],
    tallies: activeClubs(flagship).flatMap((club) => {
      const player = leadingPlayer(flagship, club.id);
      return player ? [{ playerId: player.id, ...EMPTY_TALLY }] : [];
    }),
  };
}

/** The flagship at campaign start: the anchor's league holds the seat (GDD v1.11). */
export function newFlagship(
  world: World,
  seed: number,
  countryId: string,
  tier: LeagueTierId,
  quarter: number,
  scoring: ScoringOption,
): FlagshipState {
  // The seat's country is mixed in, so one seed gives different clubs in different markets.
  const mix = Math.imul(indexOf(world, countryId) + 1, 0x85eb_ca6b);
  const rng = restoreRng(createRngState((seed ^ FLAGSHIP_STREAM ^ mix) >>> 0));
  const empty: FlagshipState = {
    countryId,
    pendingCountryId: null,
    offseason: false,
    rng: [],
    season: 1,
    scoring,
    seasonQuarters: 0,
    quartersPlayed: 0,
    round: 0,
    clubs: [],
    nextClubId: 1,
    players: [],
    nextPlayerId: 1,
    tallies: [],
    table: [],
    startRatings: [],
    lastRound: [],
    seasons: [],
  };
  const fitted = fitClubs(empty, world, rng, tier);
  return { ...startSeason(fitted, world, quarter, scoring), rng: saveRng(rng) };
}

// ---- Matches --------------------------------------------------------------------------------

/** The chance that one of a club's scoring chances scores, under the season's scoring rule. */
export function scoringRate(
  own: number,
  opponent: number,
  home: boolean,
  scoring: ScoringOption,
  world: World,
): number {
  const { match } = world.config.flagship;
  const edge = own - opponent + (home ? match.homeAdvantage / 2 : -match.homeAdvantage / 2);
  const rate = match.baseRate[scoring] + match.ratingEffect[scoring] * edge;
  return clamp(rate, match.minRate, match.maxRate);
}

function rollScore(rng: Rng, rate: number, chances: number): number {
  let score = 0;
  for (let i = 0; i < chances; i += 1) if (nextFloat(rng) < rate) score += 1;
  return score;
}

/**
 * The chance that one of a club's scores is credited to its leading player rather than the squad
 * (GDD v1.16), rising with the player's hidden skill.
 */
export function creditChance(skill: number, world: World): number {
  const { credit } = world.config.flagship.players;
  return clamp(credit.base + credit.perSkill * (skill - credit.pivot), credit.min, credit.max);
}

/** A played match and how many of each side's scores went to its leading player. */
interface PlayedMatch {
  result: MatchResult;
  credited: [home: number, away: number];
}

function playMatch(
  rng: Rng,
  home: Club,
  away: Club,
  scoring: ScoringOption,
  world: World,
  knockout: boolean,
  credit: ReadonlyMap<number, number>,
): PlayedMatch {
  const { match } = world.config.flagship;
  const homeRate = scoringRate(home.rating, away.rating, true, scoring, world);
  const awayRate = scoringRate(away.rating, home.rating, false, scoring, world);
  const homeScore = rollScore(rng, homeRate, match.chances[scoring]);
  const awayScore = rollScore(rng, awayRate, match.chances[scoring]);
  // Deciders settle a drawn playoff but are not scores, so only the match's scores are credited.
  const credited: [number, number] = [
    rollScore(rng, credit.get(home.id) ?? 0, homeScore),
    rollScore(rng, credit.get(away.id) ?? 0, awayScore),
  ];
  let decidedFor: number | null = null;
  if (knockout && homeScore === awayScore) {
    // Deciders: one roll each until exactly one side scores; then the higher seed (home).
    decidedFor = home.id;
    for (let i = 0; i < match.maxDeciders; i += 1) {
      const h = nextFloat(rng) < homeRate;
      const a = nextFloat(rng) < awayRate;
      if (h !== a) {
        decidedFor = h ? home.id : away.id;
        break;
      }
    }
  }
  return {
    result: { homeId: home.id, awayId: away.id, homeScore, awayScore, decidedFor },
    credited,
  };
}

export function matchWinner(result: MatchResult): number | null {
  if (result.homeScore > result.awayScore) return result.homeId;
  if (result.awayScore > result.homeScore) return result.awayId;
  return result.decidedFor;
}

function record(table: TableRow[], result: MatchResult, world: World): TableRow[] {
  const { points } = world.config.flagship;
  return table.map((row) => {
    const isHome = row.clubId === result.homeId;
    if (!isHome && row.clubId !== result.awayId) return row;
    const own = isHome ? result.homeScore : result.awayScore;
    const other = isHome ? result.awayScore : result.homeScore;
    const won = own > other ? 1 : 0;
    const drawn = own === other ? 1 : 0;
    const lost = own < other ? 1 : 0;
    return {
      clubId: row.clubId,
      played: row.played + 1,
      won: row.won + won,
      drawn: row.drawn + drawn,
      lost: row.lost + lost,
      scoreFor: row.scoreFor + own,
      scoreAgainst: row.scoreAgainst + other,
      points: row.points + won * points.win + drawn * points.draw,
    };
  });
}

/** How many clubs make the American playoffs in a league of `clubCount`. */
export function playoffField(clubCount: number, world: World): number {
  let best: { minClubs: number; clubs: number } | null = null;
  for (const entry of world.config.flagship.playoffs) {
    if (entry.minClubs <= clubCount && (best === null || entry.minClubs > best.minClubs)) {
      best = entry;
    }
  }
  return Math.min(clubCount, best?.clubs ?? 2);
}

/** Bracket order for seeds 1..n (n a power of two): 1 v n, then the halves mirrored. */
function bracket(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
  }
  return order;
}

/** The playoff bracket: the largest power of two within the configured field. */
export function bracketSize(clubCount: number, world: World): number {
  let size = 1;
  while (size * 2 <= playoffField(clubCount, world)) size *= 2;
  return size < 2 ? 0 : size;
}

function playPlayoffs(
  rng: Rng,
  ranked: readonly TableRow[],
  clubs: ReadonlyMap<number, Club>,
  scoring: ScoringOption,
  world: World,
  credit: ReadonlyMap<number, number>,
  onPlayed: (played: PlayedMatch, stage: "playoff" | "final") => void,
): { matches: MatchResult[]; champion: number; runnerUp: number } {
  const size = Math.max(1, bracketSize(ranked.length, world));
  const seedOf = new Map(ranked.map((row, i) => [row.clubId, i + 1]));
  let alive = bracket(size).map((seed) => ranked[seed - 1]?.clubId ?? 0);
  const matches: MatchResult[] = [];
  let runnerUp = alive[1] ?? alive[0] ?? 0;
  while (alive.length > 1) {
    const winners: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i] ?? 0;
      const b = alive[i + 1] ?? 0;
      const [homeId, awayId] = (seedOf.get(a) ?? 0) <= (seedOf.get(b) ?? 0) ? [a, b] : [b, a];
      const home = clubs.get(homeId);
      const away = clubs.get(awayId);
      if (!home || !away) throw new Error("Playoff club missing");
      const played = playMatch(rng, home, away, scoring, world, true, credit);
      const { result } = played;
      onPlayed(played, alive.length === 2 ? "final" : "playoff");
      matches.push(result);
      const winner = matchWinner(result) ?? homeId;
      winners.push(winner);
      if (alive.length === 2) runnerUp = winner === homeId ? awayId : homeId;
    }
    alive = winners;
  }
  return { matches, champion: alive[0] ?? 0, runnerUp };
}

// ---- The quarter ----------------------------------------------------------------------------

export interface FlagshipQuarter {
  flagship: FlagshipState;
  countries: CountryState[];
  landmarks: Landmark[];
}

/** Ratings drift at the season's end, pulled toward the league's financial health. */
function driftRatings(flagship: FlagshipState, world: World, rng: Rng, league: LeagueState) {
  const { rating } = world.config.flagship;
  const active = activeClubs(flagship);
  const mean = meanRating(active, world);
  const pull = rating.financePull * (rating.healthTarget[league.health] - mean);
  const drifted = new Map(
    active.map((club) => [
      club.id,
      clamp(
        club.rating +
          rating.drift * (2 * nextFloat(rng) - 1) +
          rating.reversion * (mean - club.rating) +
          pull,
        rating.min,
        rating.max,
      ),
    ]),
  );
  return {
    ...flagship,
    clubs: flagship.clubs.map((club) =>
      drifted.has(club.id) ? { ...club, rating: drifted.get(club.id) ?? club.rating } : club,
    ),
  };
}

/**
 * A season card's clubRating effect (GDD v1.15): the champion's rating, or every other active
 * club's, moves by `steps` rating steps. The ratings recorded at the season's start stay as they were.
 */
export function moveClubRatings(
  flagship: FlagshipState,
  world: World,
  championId: number,
  target: "champion" | "field",
  steps: number,
): FlagshipState {
  const { rating, stories } = world.config.flagship;
  const moves = (club: Club) =>
    target === "champion"
      ? club.id === championId
      : club.active && club.countryId === flagship.countryId && club.id !== championId;
  return {
    ...flagship,
    clubs: flagship.clubs.map((club) =>
      moves(club)
        ? {
            ...club,
            rating: clamp(club.rating + steps * stories.ratingStep, rating.min, rating.max),
          }
        : club,
    ),
  };
}

/** Whether a country's league can take the seat (GDD v1.13): Professional or Elite. */
export function seatEligible(league: LeagueState | null, world: World): boolean {
  return league !== null && world.config.flagship.seatEligibleTiers.includes(league.tier);
}

/**
 * The share of a country's player hardcore fans who turn casual when the seat leaves it (GDD
 * v1.14, v1.22): a config share, larger at the anchor, × (1 + seat weight × the ethos × the
 * tradition weight there), at most all of them.
 */
export function seatLeaveShare(
  state: Pick<GameState, "anchorCountryId" | "culture" | "growthNodes" | "identity">,
  world: World,
  countryId: string,
): number {
  const { seatMove } = world.config.flagship;
  const base =
    countryId === state.anchorCountryId
      ? seatMove.anchorHardcoreDemotionShare
      : seatMove.hardcoreDemotionShare;
  const weight = traditionWeights(state, world)[indexOf(world, countryId)] ?? 0;
  const held = world.config.culture.seatWeight * ethosFactor(world, state.identity, "seat");
  return Math.min(1, base * (1 + held * weight));
}

/** Moves the seat now. `purist` is the share of hardcore fans the country left behind loses. */
function moveSeat(
  flagship: FlagshipState,
  countries: CountryState[],
  world: World,
  to: string,
  purist: number,
): { flagship: FlagshipState; countries: CountryState[] } {
  const from = flagship.countryId;
  let next = countries;
  if (purist > 0) {
    const index = indexOf(world, from);
    const share = purist;
    const country = countries[index];
    if (country) {
      next = [...countries];
      next[index] = {
        ...country,
        fans: country.fans.map((fans, i) =>
          i === PLAYER_INDEX ? demoteHardcore(fans, share) : fans,
        ),
      };
    }
  }
  return {
    flagship: {
      ...flagship,
      countryId: to,
      pendingCountryId: null,
      clubs: flagship.clubs.map((club) =>
        club.countryId === from && club.active ? { ...club, active: false } : club,
      ),
    },
    countries: next,
  };
}

/**
 * One quarter of the flagship, after fans, leagues and rivals moved. `quarter` is the quarter being
 * simulated (state.quarter before it advances). Plays the season's rounds due by the end of it;
 * after the season-ending quarter records the champion, drifts ratings, makes a requested seat move
 * and starts the next season with the club count the league tier calls for. While the seat's
 * country has no league, no rounds are played and the season ends without a champion.
 */
export function stepFlagshipQuarter(
  state: Pick<
    GameState,
    | "turn"
    | "anchorCountryId"
    | "genome"
    | "seasonFormat"
    | "flagship"
    | "culture"
    | "growthNodes"
    | "identity"
  >,
  countries: CountryState[],
  world: World,
  quarter: number,
): FlagshipQuarter {
  // No matches in the offseason (GDD v1.24): the flagship waits for it to close.
  if (state.flagship.offseason) return { flagship: state.flagship, countries, landmarks: [] };
  const rng = restoreRng(state.flagship.rng);
  const found: Landmark[] = [];
  let flagship: FlagshipState = {
    ...state.flagship,
    quartersPlayed: state.flagship.quartersPlayed + 1,
  };
  const nextCountries = countries;
  const league = () => nextCountries[indexOf(world, flagship.countryId)]?.league ?? null;

  const clubs = new Map(activeClubs(flagship).map((club) => [club.id, club]));
  // Matches see each club's rating plus its star's strength; the stored rating never changes.
  const playingAs = new Map(
    [...clubs.values()].map((club) => [
      club.id,
      { ...club, rating: club.rating + starStrength(flagship, club.id, world) },
    ]),
  );
  const ids = flagship.table.map((row) => row.clubId);
  const rounds = totalRounds(ids.length);
  // This season's tallies, updated in place as matches are played (none if not tallied).
  const tallies = flagship.tallies?.map((tally) => ({ ...tally })) ?? null;
  const tallyOf = new Map<number, PlayerTally>();
  const credit = new Map<number, number>();
  for (const club of clubs.values()) {
    const player = leadingPlayer(flagship, club.id);
    if (!player) continue;
    const mentored = flagship.players.some((p) => playing(p) && p.backing?.mentee === player.id);
    const lift = mentored ? world.config.flagship.stars.mentorCreditLift : 0;
    credit.set(club.id, Math.min(1, creditChance(player.skill, world) + lift));
    const tally = tallies?.find((t) => t.playerId === player.id);
    if (tally) tallyOf.set(club.id, tally);
  }
  const count = ({ result, credited }: PlayedMatch, stage: "league" | "playoff" | "final") => {
    const sides = [
      [result.homeId, credited[0]],
      [result.awayId, credited[1]],
    ] as const;
    for (const [clubId, scores] of sides) {
      const tally = tallyOf.get(clubId);
      if (!tally) continue;
      tally.matches += 1;
      tally.scores += scores;
      if (stage !== "league") tally.playoffScores += scores;
      if (stage === "final") tally.finalScores += scores;
    }
  };
  if (league() !== null) {
    const due = Math.floor((rounds * flagship.quartersPlayed) / flagship.seasonQuarters);
    let table = flagship.table;
    let lastRound = flagship.lastRound;
    for (let round = flagship.round; round < due; round += 1) {
      lastRound = roundPairs(ids, round).map(([homeId, awayId]) => {
        const home = playingAs.get(homeId);
        const away = playingAs.get(awayId);
        if (!home || !away) throw new Error("Flagship fixture names a club not in the league");
        const played = playMatch(rng, home, away, flagship.scoring, world, false, credit);
        count(played, "league");
        return played.result;
      });
      for (const result of lastRound) table = record(table, result, world);
    }
    flagship = { ...flagship, table, lastRound, round: Math.max(flagship.round, due), tallies };
  }

  if (flagship.quartersPlayed >= flagship.seasonQuarters) {
    const current = league();
    const newQuarter = quarter + 1;
    if (current !== null && rounds > 0 && flagship.round >= rounds) {
      const ranked = rankTable(flagship.table);
      const format: SeasonFormat = state.seasonFormat;
      const playoffs =
        format === "american"
          ? playPlayoffs(rng, ranked, playingAs, flagship.scoring, world, credit, count)
          : {
              matches: [],
              champion: ranked[0]?.clubId ?? 0,
              runnerUp: ranked[1]?.clubId ?? 0,
            };
      const summary: SeasonSummary = {
        season: flagship.season,
        quarter: newQuarter,
        countryId: flagship.countryId,
        format,
        scoring: flagship.scoring,
        championId: playoffs.champion,
        runnerUpId: playoffs.runnerUp,
        standings: ranked,
        playoffs: playoffs.matches,
        startRatings: flagship.startRatings,
        topScorer: tallies === null ? null : topScorer(flagship, tallies),
        newStarId: null,
      };
      if (tallies !== null) flagship = closeCareers(flagship, tallies);
      const ended = playersSeasonEnd(
        flagship,
        summary,
        current.tier,
        world,
        rng,
        state.turn,
        newQuarter,
      );
      flagship = ended.flagship;
      summary.newStarId = ended.newStarId;
      found.push(...ended.landmarks);
      found.push(
        landmarks.seasonChampion(
          state.turn,
          newQuarter,
          flagship.countryId,
          flagship.season,
          playoffs.champion,
        ),
      );
      flagship = driftRatings(
        { ...flagship, seasons: [...flagship.seasons, summary], season: flagship.season + 1 },
        world,
        rng,
        current,
      );
    }
    // The offseason opens; the next season starts when it closes. Retired players are replaced
    // now, so every club has its leading player through the offseason; the season's tallies are
    // closed into careers.
    flagship = { ...staffClubs(flagship, world, rng), offseason: true, tallies: [] };
  }
  return {
    flagship: { ...flagship, rng: saveRng(rng) },
    countries: nextCountries,
    landmarks: found,
  };
}

/**
 * After the turn's league evaluation: a non-anchor flagship whose league folded sends the seat
 * home to the anchor at once and for free (GDD v1.13). The anchor's old clubs come back and a new
 * season starts. If the anchor has no league either (it folded after the win), the seat waits
 * there until a league forms again.
 */
export function returnSeatIfFolded(state: GameState, world: World): GameState {
  const flagship = state.flagship;
  const seatLeague = state.countries[indexOf(world, flagship.countryId)]?.league ?? null;
  if (seatLeague !== null || flagship.countryId === state.anchorCountryId) {
    return dormantClubs(state, world);
  }
  const rng = restoreRng(flagship.rng);
  const moved = moveSeat(flagship, state.countries, world, state.anchorCountryId, 0);
  let next = moved.flagship;
  const anchorLeague = state.countries[indexOf(world, state.anchorCountryId)]?.league ?? null;
  if (anchorLeague !== null) next = fitClubs(next, world, rng, anchorLeague.tier);
  // In the offseason the season starts when it closes.
  next = next.offseason
    ? { ...next, rng: saveRng(rng) }
    : startSeason({ ...next, rng: saveRng(rng) }, world, state.quarter, state.genome.scoring);
  return {
    ...state,
    flagship: next,
    landmarks: [
      ...state.landmarks,
      landmarks.seatMoved(
        state.turn,
        state.quarter,
        flagship.countryId,
        state.anchorCountryId,
        "returned",
      ),
    ],
  };
}

/**
 * Closes the offseason at the start of End Turn (GDD v1.24): a requested seat move happens (with
 * its purist cost), the club count follows the seat league's tier, and a season of a full year
 * starts. Does nothing outside the offseason.
 */
export function closeOffseason(state: GameState, world: World): GameState {
  if (!state.flagship.offseason) return state;
  const rng = restoreRng(state.flagship.rng);
  let flagship = state.flagship;
  let countries = state.countries;
  const found: Landmark[] = [];
  const pending = flagship.pendingCountryId;
  if (pending !== null) {
    const target = countries[indexOf(world, pending)]?.league ?? null;
    if (seatEligible(target, world)) {
      const from = flagship.countryId;
      const moved = moveSeat(
        flagship,
        countries,
        world,
        pending,
        seatLeaveShare(state, world, from),
      );
      flagship = moved.flagship;
      countries = moved.countries;
      found.push(landmarks.seatMoved(state.turn, state.quarter, from, pending, "moved"));
    } else {
      flagship = { ...flagship, pendingCountryId: null };
    }
  }
  const seatLeague = countries[indexOf(world, flagship.countryId)]?.league ?? null;
  if (seatLeague !== null) flagship = fitClubs(flagship, world, rng, seatLeague.tier);
  flagship = startSeason(flagship, world, state.quarter, state.genome.scoring, true);
  return {
    ...state,
    flagship: { ...flagship, rng: saveRng(rng) },
    countries,
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
  };
}

/**
 * A league that re-forms at the seat (the anchor after a post-win collapse) picks its season back
 * up: if the table is empty, the clubs come back and a fresh season starts.
 */
function dormantClubs(state: GameState, world: World): GameState {
  const flagship = state.flagship;
  const seatLeague = state.countries[indexOf(world, flagship.countryId)]?.league ?? null;
  if (seatLeague === null || flagship.table.length > 0 || flagship.offseason) return state;
  const rng = restoreRng(flagship.rng);
  const fitted = fitClubs(flagship, world, rng, seatLeague.tier);
  return {
    ...state,
    flagship: startSeason(
      { ...fitted, rng: saveRng(rng) },
      world,
      state.quarter,
      state.genome.scoring,
    ),
  };
}

/** Why the seat cannot be moved to a country now, or null if it can (GDD v1.13). */
export type SeatBlocker = "window" | "same" | "league" | "tier";
export function seatBlocker(
  state: GameState,
  world: World,
  countryId: string,
  windowOpen: boolean,
): SeatBlocker | null {
  if (!windowOpen) return "window";
  if (countryId === state.flagship.countryId) return "same";
  const league = state.countries[indexOf(world, countryId)]?.league ?? null;
  if (league === null) return "league";
  if (!seatEligible(league, world)) return "tier";
  return null;
}

/** Every way the flagship state is invalid (see src/sim/invariants.ts). */
export function flagshipProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const flagship = state.flagship;
  const known = (id: string) => world.countries.some((country) => country.id === id);
  if (!known(flagship.countryId)) problems.push(`flagship seat "${flagship.countryId}" is unknown`);
  if (flagship.pendingCountryId !== null) {
    if (!known(flagship.pendingCountryId)) problems.push("flagship seat move target is unknown");
    if (flagship.pendingCountryId === flagship.countryId) {
      problems.push("flagship seat move targets the seat it already holds");
    }
  }
  const ids = new Set<number>();
  for (const club of flagship.clubs) {
    if (ids.has(club.id) || club.id >= flagship.nextClubId) {
      problems.push(`flagship club ${club.id} has a bad id`);
    }
    ids.add(club.id);
    if (!known(club.countryId)) problems.push(`flagship club ${club.id} is in an unknown country`);
    if (club.active && club.countryId !== flagship.countryId) {
      problems.push(`flagship club ${club.id} is active away from the seat`);
    }
    if (!Number.isFinite(club.rating)) problems.push(`flagship club ${club.id} has a bad rating`);
  }
  const active = new Set(activeClubs(flagship).map((club) => club.id));
  const playerIds = new Set<number>();
  const clubsStaffed = new Set<number>();
  const { skill } = world.config.flagship.players;
  for (const player of flagship.players) {
    if (playerIds.has(player.id) || player.id >= flagship.nextPlayerId) {
      problems.push(`flagship player ${player.id} has a bad id`);
    }
    playerIds.add(player.id);
    if (!ids.has(player.clubId)) problems.push(`flagship player ${player.id} has no club`);
    const past = (season: number | null) => season === null || season < flagship.season;
    if (!past(player.starSince) || !past(player.retiredSeason)) {
      problems.push(`flagship player ${player.id} has a season in the future`);
    }
    if (player.backing !== null && player.retiredSeason !== null && !player.backing.honors) {
      problems.push(`retired flagship player ${player.id} is still backed`);
    }
    if (player.retiredSeason !== null) {
      if (player.finalSeason) problems.push(`retired flagship player ${player.id} plays on`);
      continue;
    }
    if (clubsStaffed.has(player.clubId)) {
      problems.push(`flagship club ${player.clubId} has two leading players`);
    }
    clubsStaffed.add(player.clubId);
    if (!world.places[player.countryId]?.some((place) => place.name === player.birthplace)) {
      problems.push(`flagship player ${player.id} was born in an unknown place`);
    }
    const skills = [player.skill, player.peakSkill];
    if (skills.some((value) => !(value >= skill.min && value <= skill.max))) {
      problems.push(`flagship player ${player.id} has a bad skill`);
    }
  }
  for (const clubId of active) {
    if (!clubsStaffed.has(clubId)) problems.push(`flagship club ${clubId} has no leading player`);
  }
  const countsAddUp = (t: SeasonTally) =>
    t.finalScores <= t.playoffScores && t.playoffScores <= t.scores;
  for (const player of flagship.players) {
    let lastLine = 0;
    for (const line of player.career) {
      if (line.season <= lastLine || line.season >= flagship.season || !countsAddUp(line)) {
        problems.push(`flagship player ${player.id} has a bad career line`);
      }
      lastLine = line.season;
    }
  }
  for (const tally of flagship.tallies ?? []) {
    const player = flagship.players.find((p) => p.id === tally.playerId);
    if (
      !player ||
      player.retiredSeason !== null ||
      !active.has(player.clubId) ||
      !countsAddUp(tally)
    ) {
      problems.push(`flagship tally for player ${tally.playerId} is bad`);
    }
  }
  const tableIds = flagship.table.map((row) => row.clubId);
  if (
    flagship.table.length > 0 &&
    (tableIds.length !== active.size || tableIds.some((id) => !active.has(id)))
  ) {
    problems.push("flagship table does not match the active clubs");
  }
  if (!flagship.offseason && flagship.quartersPlayed >= flagship.seasonQuarters) {
    problems.push("flagship season ran past its last quarter");
  }
  if (flagship.round > totalRounds(flagship.table.length)) {
    problems.push("flagship played more rounds than the season has");
  }
  const { points } = world.config.flagship;
  const rowProblems = (row: TableRow) =>
    row.won + row.drawn + row.lost !== row.played ||
    row.won * points.win + row.drawn * points.draw !== row.points;
  if (flagship.table.some(rowProblems)) problems.push("flagship table rows do not add up");
  for (const match of flagship.lastRound) {
    if (!ids.has(match.homeId) || !ids.has(match.awayId)) {
      problems.push("flagship result names an unknown club");
    }
  }
  let lastSeason = 0;
  for (const summary of flagship.seasons) {
    if (summary.season <= lastSeason || summary.season >= flagship.season) {
      problems.push(`flagship season ${summary.season} is out of order`);
    }
    lastSeason = summary.season;
    if (!ids.has(summary.championId) || !ids.has(summary.runnerUpId)) {
      problems.push(`flagship season ${summary.season} names an unknown club`);
    }
    if (summary.quarter > state.quarter) {
      problems.push(`flagship season ${summary.season} ended in the future`);
    }
  }
  return problems;
}

// ---- Snapshot -------------------------------------------------------------------------------

export interface ClubSnapshot {
  id: number;
  countryId: string;
  place: string;
  nickname: string;
  /** The club's ground (GDD v1.22). */
  ground: string;
  active: boolean;
  /** Championships won in every season played. */
  titles: number;
}

/**
 * A star or backed player as the Stars panel shows them (GDD v1.16): recorded facts and the
 * player's backing only. Skill, peak skill and star strength never leave the simulation.
 */
export interface StarSnapshot {
  id: number;
  name: string;
  clubId: number;
  /** Birthplace: a market and one of its real places. */
  countryId: string;
  birthplace: string;
  age: number;
  /** The season they became a star, or null for a backed successor who is not a star yet. */
  starSince: number | null;
  finalSeason: boolean;
  /** This season's tally so far, or null when the season is not tallied. */
  season: SeasonTally | null;
  /** Every finished season added up. */
  career: SeasonTally & { seasons: number };
  /** The player's backing: since when, influence 0–1, and who they mentor. */
  backing: { season: number; influence: number; mentee: number | null } | null;
  /** Why backing or dropping them is not possible now, or null when it is. */
  backBlocker: BackBlocker | null;
  dropBlocker: DropBlocker | null;
}

/** Backing slots, the price and what a drop at full influence costs (GDD v1.16). */
export interface BackingSnapshot {
  /** Slots at the current PP tier; used can exceed them after a demotion. */
  slots: number;
  used: number;
  price: number;
  /** Share of the flagship country's hardcore fans who turn casual on a drop at full influence. */
  dropHardcoreShare: number;
  /** The pressure card's drain on casual conversion there when it arrives, if content has one. */
  dropPressure: { factor: number; quarters: number } | null;
}

/** What the UI shows of the flagship. Club ratings stay hidden. */
export interface FlagshipSnapshot {
  countryId: string;
  pendingCountryId: string | null;
  format: SeasonFormat;
  season: number;
  round: number;
  totalRounds: number;
  /** Whether the seat's country has a league to play in right now. */
  playing: boolean;
  /** Ranked best first. */
  table: TableRow[];
  lastRound: MatchResult[];
  /** Every club the campaign has known, by id. */
  clubs: ClubSnapshot[];
  /** Quarters left in the season, this one included. */
  quartersLeft: number;
  /** American format: how many clubs make the playoffs. 0 in the European format. */
  playoffClubs: number;
  /** Finished seasons, newest first, without their full tables, with the year each ended. */
  recentSeasons: (Omit<SeasonSummary, "standings" | "startRatings"> & { year: number })[];
  /** Countries whose league could take the seat in the offseason (GDD v1.13). */
  seatTargets: string[];
  /** Share of the seat country's hardcore fans who turn casual if the seat moves away. */
  leaveCost: number;
  /** The living traditions held in the seat's country, which a move would leave (GDD v1.22). */
  leaveTraditions: number[];
  /** Every leading player the campaign has known, by id: names only (skill stays hidden). */
  players: { id: number; name: string; clubId: number }[];
  /** The rules star cards quote: honors' fading seasons and the mentor's influence share. */
  starRules: { afterglowSeasons: number; mentorShare: number };
  /** Stars at the seat and every backed player still playing, stars first, newest star first. */
  stars: StarSnapshot[];
  backing: BackingSnapshot;
  /** Each active club's leading player and their scores this season (null when untallied). */
  leaders: { clubId: number; playerId: number; scores: number | null }[];
}

/** How many finished seasons the snapshot carries. */
const RECENT_SEASONS = 10;

export function flagshipSnapshot(state: GameState, world: World): FlagshipSnapshot {
  const flagship = state.flagship;
  const titles = new Map<number, number>();
  for (const summary of flagship.seasons) {
    titles.set(summary.championId, (titles.get(summary.championId) ?? 0) + 1);
  }
  return {
    countryId: flagship.countryId,
    pendingCountryId: flagship.pendingCountryId,
    format: state.seasonFormat,
    season: flagship.season,
    round: flagship.round,
    totalRounds: totalRounds(flagship.table.length),
    playing: (state.countries[indexOf(world, flagship.countryId)]?.league ?? null) !== null,
    table: rankTable(flagship.table),
    lastRound: flagship.lastRound,
    clubs: flagship.clubs.map((club) => ({
      id: club.id,
      countryId: club.countryId,
      place: club.place,
      nickname: club.nickname,
      ground: clubGround(club, state.identity, world),
      active: club.active,
      titles: titles.get(club.id) ?? 0,
    })),
    quartersLeft: flagship.seasonQuarters - flagship.quartersPlayed,
    playoffClubs: state.seasonFormat === "american" ? bracketSize(flagship.table.length, world) : 0,
    recentSeasons: flagship.seasons
      .slice(-RECENT_SEASONS)
      .reverse()
      .map(({ standings: _standings, startRatings: _ratings, ...summary }) => ({
        ...summary,
        year: yearOfQuarter(summary.quarter - 1, world.config),
      })),
    seatTargets: state.countries
      .filter(
        (country) =>
          country.countryId !== flagship.countryId && seatEligible(country.league, world),
      )
      .map((country) => country.countryId),
    leaveCost: seatLeaveShare(state, world, flagship.countryId),
    leaveTraditions: state.culture.traditions
      .filter((t) => t.lost === null && t.followers.includes(flagship.countryId))
      .map((t) => t.id),
    players: flagship.players.map(({ id, name, clubId }) => ({ id, name, clubId })),
    starRules: {
      afterglowSeasons: world.config.flagship.stars.afterglowSeasons,
      mentorShare: world.config.flagship.stars.mentorShare,
    },
    stars: starSnapshots(state, world),
    backing: backingSnapshot(state, world),
    leaders: activeClubs(flagship).flatMap((club) => {
      const player = leadingPlayer(flagship, club.id);
      if (!player) return [];
      const tally = flagship.tallies?.find((entry) => entry.playerId === player.id);
      return [
        {
          clubId: club.id,
          playerId: player.id,
          scores: flagship.tallies === null ? null : (tally?.scores ?? 0),
        },
      ];
    }),
  };
}

function starSnapshots(state: GameState, world: World): StarSnapshot[] {
  const flagship = state.flagship;
  const shown = new Set([...seatStars(flagship), ...backedStars(flagship)]);
  return [...shown]
    .sort(
      (a, b) =>
        (a.starSince ?? Number.POSITIVE_INFINITY) - (b.starSince ?? Number.POSITIVE_INFINITY) ||
        a.id - b.id,
    )
    .map((player): StarSnapshot => {
      const tally = flagship.tallies?.find((entry) => entry.playerId === player.id);
      const career = player.career.reduce(
        (sum, line) => ({
          seasons: sum.seasons + 1,
          matches: sum.matches + line.matches,
          scores: sum.scores + line.scores,
          playoffScores: sum.playoffScores + line.playoffScores,
          finalScores: sum.finalScores + line.finalScores,
        }),
        { seasons: 0, ...EMPTY_TALLY },
      );
      return {
        id: player.id,
        name: player.name,
        clubId: player.clubId,
        countryId: player.countryId,
        birthplace: player.birthplace,
        age: flagship.season - player.birthSeason,
        starSince: player.starSince,
        finalSeason: player.finalSeason,
        season:
          flagship.tallies === null
            ? null
            : tally
              ? {
                  matches: tally.matches,
                  scores: tally.scores,
                  playoffScores: tally.playoffScores,
                  finalScores: tally.finalScores,
                }
              : { ...EMPTY_TALLY },
        career,
        backing: player.backing && {
          season: player.backing.season,
          influence: player.backing.influence,
          mentee: player.backing.mentee,
        },
        backBlocker: backStarBlocker(state, world, player.id),
        dropBlocker: dropStarBlocker(state, world, player.id),
      };
    });
}

function backingSnapshot(state: GameState, world: World): BackingSnapshot {
  const card = world.events.cards.find((candidate) => candidate.star === "dropped");
  const drain = card?.arrivalEffects.find((effect) => effect.type === "conversion");
  return {
    slots: backingSlots(state, world),
    used: backedStars(state.flagship).length,
    price: backingPrice(state, world),
    dropHardcoreShare: world.config.flagship.stars.dropDemotionShare,
    dropPressure:
      drain && drain.type === "conversion"
        ? { factor: drain.factor, quarters: drain.quarters }
        : null,
  };
}
