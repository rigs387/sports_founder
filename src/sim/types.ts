import type {
  AxisId,
  DealClause,
  DealDemand,
  DealSlot,
  EscalationLevel,
  Genome,
  HallFirst,
  HallWing,
  HealthLevel,
  LeagueTierId,
  TimedCountermoveKind,
  TraditionType,
} from "../content";
import type { EventState } from "./events-state";

export type {
  AxisId,
  BreadthCondition,
  Climate,
  Config,
  Continent,
  CountermoveKind,
  Country,
  CountryDerived,
  DealClause,
  DealDemand,
  DealSlot,
  EscalationLevel,
  Genome,
  GrowthCategory,
  HealthLevel,
  LeagueTierId,
  Names,
  PpTier,
  RivalSport,
  SpreadLink,
  TimedCountermoveKind,
  TraditionType,
  World,
} from "../content";
export {
  COUNTERMOVES,
  ESCALATION_LEVELS,
  HEALTH_LEVELS,
  LEAGUE_TIERS,
  OTHER_SPORT_ID,
  PLAYER_SPORT_ID,
} from "../content";

/** "other" is the passive bucket of every unmodeled sport's hardcore fans (GDD Rival AI). */
export type SportKind = "player" | "rival" | "other";

export interface SportState {
  id: string;
  kind: SportKind;
}

/**
 * One sport's fans in one country (GDD Fan Model). Every person is in exactly one bucket per
 * sport: uninterested = population - casual - hardcore, derived rather than stored so it can
 * never disagree. Casual is non-exclusive across sports; hardcore is exclusive, so the sum of
 * hardcore across all sports in a country never exceeds its population.
 */
export interface SportFans {
  sportId: string;
  casual: number;
  hardcore: number;
}

/** A country's single top league (GDD League tiers). Abstract: numbers only, no players. */
export interface LeagueState {
  tier: LeagueTierId;
  health: HealthLevel;
  /** League cash. May go below zero, which is what collapse means. */
  cash: number;
  /** Operating cash flow per quarter over the last evaluated turn; null before the first. */
  lastFlowPerQuarter: number | null;
  /** Player hardcore fans in the country at the last health evaluation (before demotions). */
  hardcoreAtLastEval: number;
  formedQuarter: number;
  /** Earliest quarter a PP bailout is legal again. */
  bailoutReadyQuarter: number;
  /** The league's venue (GDD v1.30). Only the flagship's league builds; others stay at level 1. */
  venue: VenueState;
}

/** A league's venue capacity level (GDD v1.30): no individual stadiums. */
export interface VenueState {
  /** 1–5. Capacity caps the flagship's gate. */
  level: number;
  /** A level under construction, opening when the offseason before `opensSeason` closes. */
  building: { level: number; opensSeason: number } | null;
  /** The best season crowd at this league's flagship seasons; null before the first. */
  record: number | null;
}

/** One rival's defense posture in one country (GDD Rival AI escalation ladder). */
export interface RivalFront {
  sportId: string;
  level: EscalationLevel;
  /**
   * The player's hardcore gains here as a share of the population per year, smoothed; near #1, at
   * least a share of the player's hardcore share here (rivals defending their position).
   */
  pressure: number;
  /** Quarters at the current level. */
  quartersAtLevel: number;
  /** Consecutive quarters calm enough to count toward de-escalation. */
  calmQuarters: number;
}

/** A rival countermove with a lasting effect in one country. */
export interface ActiveCountermove {
  kind: TimedCountermoveKind;
  sportId: string;
  /** The last quarter the effect applies to. */
  endQuarter: number;
}

/** A rival sport's campaign state (GDD Rival AI). */
export interface RivalState {
  sportId: string;
  /** Starts from content; rule copying changes its rule traits. Identity traits never change. */
  genome: Genome;
  /** Unspent defense budget. Hidden from the player (GDD: budgets are hidden). */
  budget: number;
  /** Budget spent so far, for balance reports. */
  budgetSpent: number;
  /** Earliest quarter the rival may copy another rule. */
  ruleCopyReadyQuarter: number;
}

export interface CountryState {
  countryId: string;
  /** Same order as GameState.sports. */
  fans: SportFans[];
  league: LeagueState | null;
  /** How many leagues have folded here. */
  leaguesFolded: number;
  /** Earliest quarter a league may form (after a fold). */
  formationReadyQuarter: number;
  /** Each rival's escalation here, same order as GameState.rivals. */
  defense: RivalFront[];
  /** Rival countermoves in effect here. */
  countermoves: ActiveCountermove[];
}

export interface PendingTierUp {
  tier: number;
  /** Turns until the tier-up happens. */
  turnsLeft: number;
}

export interface TierTrack {
  /** Highest PP tier ever reached. */
  peakTier: number;
  /** Turn of the last tier change, or null if none yet. */
  lastChangeTurn: number | null;
  /** An announced tier-up. It happens when turnsLeft runs out, whatever the player does. */
  pendingTierUp: PendingTierUp | null;
  /** Consecutive turns at risk of demotion. */
  turnsBelowLine: number;
  /** Focus slots the player must drop after a demotion. */
  slotsToDrop: number;
}

/**
 * Progress toward the win (GDD Win condition, Post-win play). Deliberately separate from
 * GameState.outcome: an outcome ends the campaign, and winning never does.
 */
export interface WinTrack {
  /** The last turn ended with the player's sport #1 by global Fandom Score, at any PP tier. */
  atTop: boolean;
  /** Consecutive turns ended at #1 and at the win's required PP tier or above: the win hold. */
  turnsHeld: number;
  /** When the win landed, or null before it. Never cleared: losing #1 later does not undo it. */
  won: { turn: number; quarter: number } | null;
}

/** How the flagship crowns its champion, chosen at creation (GDD v1.14). */
export type SeasonFormat = "european" | "american";
export const SEASON_FORMATS: readonly SeasonFormat[] = ["european", "american"];

/** A flagship club. Clubs are never deleted, so history can always name them. */
export interface Club {
  /** Unique within the campaign. */
  id: number;
  /** The country whose flagship league the club plays in. */
  countryId: string;
  place: string;
  nickname: string;
  rating: number;
  /** Whether the club plays in its country's flagship league now. */
  active: boolean;
  /** The season the club first played. */
  firstSeason: number;
}

/**
 * A club's leading player (GDD v1.16): the one named person per club who stands in for the squad.
 * Born in a real place of the club's market. Skill is hidden from the player.
 */
export interface Player {
  /** Unique within the campaign. */
  id: number;
  name: string;
  /** Where the player was born: a market and one of its real places (places.yaml). */
  countryId: string;
  birthplace: string;
  clubId: number;
  /** The flagship season the player was born in: their age in season s is s − birthSeason. */
  birthSeason: number;
  peakSkill: number;
  skill: number;
  /** The season the player became a star, or null. A star stays a star until retirement. */
  starSince: number | null;
  /** Whether the season being played (or the next, at a season's end) is their last. */
  finalSeason: boolean;
  /** The last season the player played, once retired; null while playing. */
  retiredSeason: number | null;
  /**
   * The player's backing (GDD v1.16): the season it began and influence, 0–1. A star retired with
   * honors keeps a fading backing (the afterglow); `mentee` is the successor a backed star in their
   * final season is mentoring.
   */
  backing: { season: number; influence: number; honors: boolean; mentee: number | null } | null;
  /** One permanent line per finished flagship season the player played in, oldest first. */
  career: CareerLine[];
}

/**
 * A leading player's tally for one season (GDD v1.16). Every match counts, playoffs included;
 * playoff scores are part of scores and final scores part of playoff scores.
 */
export interface SeasonTally {
  matches: number;
  scores: number;
  playoffScores: number;
  finalScores: number;
}

/** A leading player's season in progress. */
export interface PlayerTally extends SeasonTally {
  playerId: number;
}

/** A finished season of a leading player's career. */
export interface CareerLine extends SeasonTally {
  season: number;
  clubId: number;
}

/** The leading player with the most scores in a season (fewer matches, then lower id, on ties). */
export interface TopScorer {
  playerId: number;
  clubId: number;
  scores: number;
}

/** One club's line in a season table. */
export interface TableRow {
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
}

export interface MatchResult {
  homeId: number;
  awayId: number;
  homeScore: number;
  awayScore: number;
  /** A drawn playoff settled by deciders: the club that went through. */
  decidedFor: number | null;
}

/** A club's rating at a moment in time. */
export interface ClubRating {
  clubId: number;
  rating: number;
}

/** A finished flagship season (GDD History & Records: per-league season summaries). */
export interface SeasonSummary {
  season: number;
  /** The quarter the season ended. */
  quarter: number;
  countryId: string;
  format: SeasonFormat;
  /** The scoring rule the season was played under (medium for seasons before format 10). */
  scoring: ScoringOption;
  championId: number;
  runnerUpId: number;
  /** Final regular-season table, best first. */
  standings: TableRow[];
  /** American format: every playoff match in order, the final last. Empty for European. */
  playoffs: MatchResult[];
  /**
   * Every club's rating when the season began, by club id (underdog stories, GDD v1.15). Empty
   * for seasons that ended before save format 9.
   */
  startRatings: ClubRating[];
  /** Null when nobody scored or the season was not tallied (before save format 12). */
  topScorer: TopScorer | null;
  /** The player the season made a star, if any (null before save format 13). */
  newStarId: number | null;
  /** Hardcore fans seated at the season's end (GDD v1.30); null before save format 22. */
  crowd: number | null;
  /** Whether the crowd set the league's attendance record: a fame fact for a ground. */
  recordCrowd: boolean;
  /** The seat's venue level at the season's end (GDD v1.34), for its crowd a game; absent before. */
  venueLevel?: number | null;
  /** The season's Player of the Season (GDD v1.33); null before save format 24 or untallied. */
  playerOfSeason: number | null;
}

/**
 * The flagship league the player runs as commissioner (GDD v1.11, v1.13, v1.14). Its matches roll
 * on their own random stream (`rng`), so the world's sequence never depends on them.
 */
/** The genome's scoring frequency, which sets the flagship's match rule (GDD v1.16). */
export type ScoringOption = Genome["scoring"];

export interface FlagshipState {
  /** The country holding the seat. Seasons pause while it has no league. */
  countryId: string;
  /** A seat move requested in the offseason; it happens when the offseason closes. */
  pendingCountryId: string | null;
  /**
   * The offseason (GDD v1.24): open from the season's end until the next turn ends. No matches are
   * played; closing it applies a seat move, fits the clubs and starts the next season.
   */
  offseason: boolean;
  rng: number[];
  /** The season being played (1 for the first). */
  season: number;
  /** The scoring rule the current season plays, fixed when it starts. */
  scoring: ScoringOption;
  /** Quarters this season lasts, and how many have been played. */
  seasonQuarters: number;
  quartersPlayed: number;
  /** Rounds played this season. */
  round: number;
  clubs: Club[];
  nextClubId: number;
  /** Every club's leading player, active or dormant, in id order. */
  players: Player[];
  nextPlayerId: number;
  /**
   * The active clubs' leading players' tallies this season, in club order. Null for a season
   * already under way when an older save was made: it is never tallied.
   */
  tallies: PlayerTally[] | null;
  /** The current season's table, in club order (not ranked). */
  table: TableRow[];
  /** The active clubs' ratings when the current season began, in club order. */
  startRatings: ClubRating[];
  /** The most recent round's results (disposable: replaced every round). */
  lastRound: MatchResult[];
  seasons: SeasonSummary[];
  /** Sponsor and TV deals (GDD v1.28). */
  deals: DealsState;
}

/** What a deal demands (GDD v1.28). Demands never block: doing the thing breaks the deal. */
export type DealDemandTerms =
  /** The flagship league stays at this tier or above. */
  | { kind: "tierFloor"; tier: LeagueTierId }
  /** The seat stays in this country. */
  | { kind: "seatLock"; countryId: string }
  /** Pay-TV exclusivity: the broadcast's lift is cut while it runs. */
  | { kind: "exclusivity" }
  /** One step of a rule trait, amended by the close of the offseason before `dueSeason`. */
  | { kind: "ruleChange"; axis: AxisId; option: string; dueSeason: number }
  /** Clauses (GDD v1.29), judged at each season's end: no runaway or foregone season (TV). */
  | { kind: "balance" }
  /** A star playing at the seat (sponsors). */
  | { kind: "star" }
  /** The seat country's fans no fewer than at the last judgement (any partner). */
  | { kind: "fans" };

export interface DealTerms {
  slot: DealSlot;
  /** The sponsor slot (0 is the main sponsor), the named ground's club id, or 0 for TV. */
  position: number;
  /** A partner id from names.yaml, or GEAR_BRAND_ID for the homegrown gear brand. */
  partnerId: string;
  /** Cash a season, locked for the term. */
  annualValue: number;
  seasons: number;
  demand: DealDemandTerms | null;
  /** Offered by the partner whose deal in this slot just ended. */
  renewal: boolean;
}

export interface DealOffer extends DealTerms {
  id: number;
}

export interface Deal extends DealTerms {
  id: number;
  /** The first and last flagship seasons it pays for. */
  firstSeason: number;
  lastSeason: number;
  /** The seat's country when it was signed. */
  countryId: string;
  /** Its clause's record (GDD v1.29): seasons met, misses in a row. */
  clauseMet: number;
  clauseMisses: number;
  /** The seat country's player fans at the last judgement (at signing before the first). */
  fansMark: number;
}

/**
 * The flagship's deals (GDD v1.28). Offers are made once an offseason, on the deals' own random
 * stream, and lapse when it closes.
 */
export interface DealsState {
  rng: number[];
  signed: Deal[];
  offers: DealOffer[];
  /** Partners who will not deal until after `untilSeason` (a breach). */
  shunned: { partnerId: string; untilSeason: number }[];
  nextId: number;
  /**
   * The flagship season whose offseason last made offers, or null before the first. The media
   * baseline cut applies once offers have been made.
   */
  offeredSeason: number | null;
}

/** A permanent history fact (GDD History & Records). Plain data: no text. */
export type Landmark =
  | { kind: "leagueFormed"; turn: number; quarter: number; countryId: string; reformed: boolean }
  | {
      kind: "leaguePromoted" | "leagueSteppedDown";
      turn: number;
      quarter: number;
      countryId: string;
      from: LeagueTierId;
      to: LeagueTierId;
    }
  | {
      /** birthplaceOutlived: the anchor's league collapsed after the win (GDD Post-win play). */
      kind: "leagueFolded" | "anchorCollapse" | "birthplaceOutlived";
      turn: number;
      quarter: number;
      countryId: string;
      leagueTier: LeagueTierId;
    }
  | { kind: "ppTierUp" | "ppTierDown"; turn: number; quarter: number; from: number; to: number }
  | { kind: "nodeBought"; turn: number; quarter: number; nodeId: string; cost: number }
  /** The player's sport became #1 by global Fandom Score; the win hold starts (or #1 is regained). */
  | { kind: "rankOneTaken"; turn: number; quarter: number }
  /** The player's sport fell from #1; `sportId` is the rival now first. */
  | { kind: "rankOneLost"; turn: number; quarter: number; sportId: string }
  /** The win: #1 at the required tier held for `heldTurns` consecutive turns. Recorded once. */
  | { kind: "won"; turn: number; quarter: number; heldTurns: number }
  | {
      kind: "rivalEscalated" | "rivalDeescalated";
      turn: number;
      quarter: number;
      countryId: string;
      sportId: string;
      from: EscalationLevel;
      to: EscalationLevel;
    }
  /** A rival's world championship began (GDD v1.17): it lifts the rival everywhere for a while. */
  | { kind: "rivalTournament"; turn: number; quarter: number; sportId: string; year: number }
  /** The player amended a rule (GDD v1.20); `demoted` hardcore fans turned casual in protest. */
  | {
      kind: "ruleAmended";
      turn: number;
      quarter: number;
      axis: AxisId;
      from: string;
      to: string;
      demoted: number;
    }
  | {
      kind: "rivalCountermove";
      turn: number;
      quarter: number;
      countryId: string;
      sportId: string;
      move: TimedCountermoveKind;
      endQuarter: number;
    }
  /** A flagship season ended with this champion (GDD v1.14). */
  | {
      kind: "seasonChampion";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      clubId: number;
    }
  /** A flagship star was made, retired, or moved clubs (GDD v1.16). */
  | {
      kind: "firstStar" | "starRetired";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      playerId: number;
      clubId: number;
    }
  | {
      kind: "starMoved";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      playerId: number;
      from: number;
      to: number;
      /** A backed star's move waits on the keep-or-let-move card. */
      backed: boolean;
    }
  | {
      kind: "starFinalSeason";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      playerId: number;
      clubId: number;
      backed: boolean;
    }
  /** A player became the league's all-time top scorer. */
  | {
      kind: "scoringRecord";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      playerId: number;
      scores: number;
    }
  /** The player dropped a backed star at full influence. */
  | {
      kind: "starDropped";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      playerId: number;
    }
  /**
   * A flagship deal's demand was broken (GDD v1.28): the deal ended, its remaining value lost, a
   * cash penalty paid by the league that signed it, and the partner shuns the sport.
   */
  | {
      kind: "dealBroken";
      turn: number;
      quarter: number;
      countryId: string;
      dealId: number;
      partnerId: string;
      slot: DealSlot;
      demand: DealDemand;
      penalty: number;
    }
  /**
   * A partner walked after its clause was missed too many seasons in a row (GDD v1.29): the rest
   * of the deal is lost, with no penalty and no shunning.
   */
  | {
      kind: "dealWalked";
      turn: number;
      quarter: number;
      countryId: string;
      dealId: number;
      partnerId: string;
      slot: DealSlot;
      clause: DealClause;
    }
  /** A flagship deal ran its term (GDD v1.28); its slot is open in the offseason. */
  | {
      kind: "dealEnded";
      turn: number;
      quarter: number;
      countryId: string;
      dealId: number;
      partnerId: string;
      slot: DealSlot;
    }
  /** The commissioner's seat moved: by the player, or home after a flagship folded. */
  | {
      kind: "seatMoved";
      turn: number;
      quarter: number;
      from: string;
      countryId: string;
      reason: "moved" | "returned";
    }
  /** A venue level opened (GDD v1.30); at the modernization level it betrayed famous grounds. */
  | {
      kind: "venueOpened";
      turn: number;
      quarter: number;
      countryId: string;
      level: number;
      modernized: boolean;
    }
  /** A flagship season's crowd set the league's attendance record (GDD v1.30). */
  | {
      kind: "recordCrowd";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      crowd: number;
      /** The ground credited: the final's host, else the champion's. */
      clubId: number;
      level: number;
    }
  /** A tradition was born from recorded facts (GDD v1.22). */
  | {
      kind: "traditionBorn";
      turn: number;
      quarter: number;
      countryId: string;
      traditionId: number;
      type: TraditionType;
    }
  /** A tradition was lost: faded, its league folded, broken by an amendment, or renamed. */
  | {
      kind: "traditionLost";
      turn: number;
      quarter: number;
      countryId: string;
      traditionId: number;
      type: TraditionType;
      reason: TraditionLossReason;
    }
  /** A chant gained its first follower abroad (GDD v1.31): the country now singing it. */
  | {
      kind: "chantSpread";
      turn: number;
      quarter: number;
      countryId: string;
      traditionId: number;
    }
  /** A Hall of Fame class was inducted at a flagship season's end (GDD v1.31). */
  | {
      kind: "hallOfFameClass";
      turn: number;
      quarter: number;
      countryId: string;
      season: number;
      inductees: number;
    }
  | {
      kind: "rivalRuleCopied";
      turn: number;
      quarter: number;
      countryId: string;
      sportId: string;
      axis: AxisId;
      from: string;
      to: string;
    };

export interface YearlySnapshot {
  year: number;
  /** Per country (content order), per sport (state order): casual, then hardcore. */
  fans: number[];
}

/**
 * How a campaign ended. Only an anchor collapse before the win ends one; winning is not an ending
 * (see WinTrack).
 */
export interface GameOutcome {
  kind: "anchorCollapse";
  turn: number;
  quarter: number;
  countryId: string;
}

/** The complete, serializable state of a campaign. Plain data only. */
// ---- Sport identity (GDD v1.18; src/sim/identity.ts) ----------------------------------------

/** The sport's terms: what a score, a match and a season are called (ids from content). */
export interface SportTerms {
  score: string;
  match: string;
  season: string;
}

/** A preset emblem: a shape, an icon and two colors, all ids from content. */
export interface Emblem {
  shape: string;
  icon: string;
  primary: string;
  secondary: string;
}

/** What the player chooses at setup. */
export interface IdentitySetup {
  sportName: string;
  /** A real place of the anchor (places.yaml) where the founding club is based. */
  foundingPlace: string;
  clubName: string;
  groundName: string;
  birthplace: string;
  ethos: string;
  terms: SportTerms;
  emblem: Emblem;
}

/** The sport's identity in a campaign. The founding club's place and name live on the club. */
export interface SportIdentity {
  sportName: string;
  /** A flagship club at the anchor. */
  foundingClubId: number;
  groundName: string;
  birthplace: string;
  ethos: string;
  terms: SportTerms;
  emblem: Emblem;
}

// ---- Rules evolution (GDD v1.20; src/sim/rules.ts) -------------------------------------------

/** One amendment to the rulebook: a rule trait changed from one option to another. */
export interface Amendment {
  turn: number;
  /** The quarter it was made in (the rule's age counts from here). */
  quarter: number;
  year: number;
  axis: AxisId;
  from: string;
  to: string;
  jump: number;
  /** Hardcore fans who turned casual in protest. */
  demoted: number;
}

export interface RulesState {
  /** Every amendment made, oldest first. */
  amendments: Amendment[];
}

// ---- Culture (GDD v1.22; src/sim/culture.ts) -------------------------------------------------

export type TraditionLossReason = "faded" | "folded" | "broken" | "renamed";

/**
 * A tradition: born only from recorded facts, held by the player's fans in its follower countries
 * (home first). Name parts are facts: the clubs (derby: two; rite and venue: one), the star (star
 * legacy), or a name (the trophy's, given by the player; a rite's or national name's, from a pool).
 */
export interface Tradition {
  id: number;
  type: TraditionType;
  /** Its home country. */
  countryId: string;
  clubIds: number[];
  playerId: number | null;
  name: string | null;
  /** The flagship seasons whose facts made it, oldest first (empty for a national name). */
  seasons: number[];
  /** The rule traits it was born under: amendments away from them offend it. */
  rules: Partial<Record<AxisId, string>>;
  bornTurn: number;
  bornQuarter: number;
  /** 0–1. Renewed by new facts, decaying each year without one; lost at 0. */
  strength: number;
  /** The last in-game year a fact renewed it (its birth year at first). */
  renewedYear: number;
  /** Countries whose fans hold it, home first. Abroad they hold it at reach.followerShare. */
  followers: string[];
  lost: { turn: number; quarter: number; reason: TraditionLossReason } | null;
}

/** A "Stoke it" answer on the repeat-final card: one extra meeting toward a derby. */
export interface DerbyStoke {
  clubIds: number[];
  season: number;
}

export interface CultureState {
  /** Facts count from this flagship season on (no retroactive history for older saves). */
  startSeason: number;
  /** Landmarks before this index have been read. */
  landmarkCursor: number;
  /** The last in-game year whose decay and reach rolls have run. */
  year: number;
  /** Culture's own random stream (reach rolls), so the world's sequence never depends on it. */
  rng: number[];
  traditions: Tradition[];
  nextId: number;
  stokes: DerbyStoke[];
  /** The trophy the player may name for free (born on the champion card now open), or null. */
  naming: number | null;
}

export interface GameState {
  seed: number;
  /** Seeded generator state; part of the save so a resumed game rolls identically. */
  rng: number[];
  anchorCountryId: string;
  /** The player's sport genome (GDD Sport Genome). Identity axes never change. */
  genome: Genome;
  /** The turn the player is on. Starts at 1. */
  turn: number;
  /** Quarters simulated since the campaign began. */
  quarter: number;
  pp: number;
  ppTier: number;
  tierTrack: TierTrack;
  /** Focus slots: the country each slot is on, or null if empty. */
  focus: (string | null)[];
  /** Growth tree nodes owned, in purchase order (GDD PP Growth Tree). No refunds. */
  growthNodes: string[];
  win: WinTrack;
  /** Set once the campaign has ended; nothing may be played after that. */
  outcome: GameOutcome | null;
  /** The player's sport first, then rivals in content order, then the "other" bucket. */
  sports: SportState[];
  /** Rivals in content order (GameState.sports without the player and "other"). */
  rivals: RivalState[];
  /** Same order as World.countries. */
  countries: CountryState[];
  landmarks: Landmark[];
  yearly: YearlySnapshot[];
  events: EventState;
  seasonFormat: SeasonFormat;
  flagship: FlagshipState;
  /** The sport's name, founding club and ground, founding character, terms and emblem. */
  identity: SportIdentity;
  /** The rulebook's amendments (GDD v1.20). */
  rules: RulesState;
  /** Traditions and what makes them (GDD v1.22). */
  culture: CultureState;
  /** The Hall of Fame's inductees (GDD v1.31). */
  hallOfFame: HallOfFameState;
}

/** The career facts a player's induction quotes, read from retained records (GDD v1.31). */
export interface InducteeFacts {
  starSeasons: number;
  titles: number;
  topScorerSeasons: number;
  /** Player of the Season awards (GDD v1.33). */
  awards: number;
  /** Whether they ever held the league's all-time scoring record. */
  record: boolean;
  /** Career scores. */
  scores: number;
}

/** One Hall of Fame inductee: a player, or a first in the Moments wing. */
export interface Inductee {
  id: number;
  wing: HallWing;
  /** The flagship season whose end inducted them (their class). */
  season: number;
  turn: number;
  quarter: number;
  /** Home: a player's birth country; a first's landmark country (the anchor for #1 and the win). */
  countryId: string;
  playerId: number | null;
  facts: InducteeFacts | null;
  first: HallFirst | null;
  /** The landmark a first was read from (landmarks are never removed). */
  landmarkIndex: number | null;
}

export interface HallOfFameState {
  /** Only players retiring in this flagship season or later are eligible (no retroactive ones). */
  startSeason: number;
  /** Firsts count only from landmarks at or after this index. */
  landmarkStart: number;
  inductees: Inductee[];
  nextId: number;
}

export interface CampaignSetup {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  /** Defaults to European. */
  seasonFormat?: SeasonFormat;
  /** Defaults to the identity generated from the seed (defaultIdentitySetup). */
  identity?: IdentitySetup;
}

/** Index of the player's sport in GameState.sports and CountryState.fans. */
export const PLAYER_INDEX = 0;
