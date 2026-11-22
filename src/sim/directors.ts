import { DIRECTOR_ASKS, type DirectorAsk } from "../content";
import { offseasonOpen, QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import type { EventRecord } from "./events-state";
import { drawName } from "./flagship";
import { leagueActions } from "./league-actions";
import { leagueReserve } from "./league-costs";
import { demoteHardcore, promotionTerms, runningCostPerQuarter } from "./leagues";
import { landmarks } from "./records";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import { signingOffer } from "./talent";
import {
  type Director,
  type DirectorCandidate,
  type DirectorLeaving,
  type DirectorsState,
  type DirectorTerm,
  type GameState,
  HEALTH_LEVELS,
  type Landmark,
  type LeagueTierId,
  PLAYER_INDEX,
  type World,
} from "./types";
import { buildYouth, youthBlocker } from "./youth";

// League directors (GDD v1.40, tech plan 2.26 step 1). A league in a focus country, other than
// the seat's, has a director while the country holds a focus slot: focus made a person. Each has
// one trait (config `directors.traits`) that bends the simple model for their own league only:
// its running cost and income, and the conversion rates in its country. The salary comes from
// league cash. Directors are drawn on their own random stream, when End Turn starts (so the focus
// the player set this turn decides who serves through its quarters) and again at its end (a
// league formed, folded or the seat moved). Focus leaving ends the term with no severance;
// replacing a director is an offseason action. Every finished term is kept for the Builders wing.

const DIRECTORS_STREAM = 0x5be0_cd19;

export function newDirectors(seed: number): DirectorsState {
  return {
    rng: createRngState((seed ^ DIRECTORS_STREAM) >>> 0),
    nextId: 1,
    serving: [],
    past: [],
    candidates: [],
    openAsk: null,
    askedSeason: null,
    kept: [],
    holds: [],
    exhibitions: [],
  };
}

export interface TraitFactors {
  runningCost: number;
  income: number;
  casualConversion: number;
  hardcoreConversion: number;
}

const NEUTRAL: TraitFactors = {
  runningCost: 1,
  income: 1,
  casualConversion: 1,
  hardcoreConversion: 1,
};

/** The trait ids in content order. */
export function directorTraits(world: World): string[] {
  return Object.keys(world.config.directors.traits);
}

/** The director serving in a country's league now, if any. */
export function directorIn(
  state: Pick<GameState, "directors">,
  countryId: string,
): Director | undefined {
  return state.directors.serving.find((director) => director.countryId === countryId);
}

/** What a country's director does to its numbers; neutral where none serves, and at the seat. */
export function directorFactors(
  state: Pick<GameState, "directors" | "flagship">,
  world: World,
  countryId: string,
): TraitFactors {
  if (countryId === state.flagship.countryId) return NEUTRAL;
  const director = directorIn(state, countryId);
  if (!director) return NEUTRAL;
  return world.config.directors.traits[director.trait] ?? NEUTRAL;
}

/** A director's salary a quarter: a share of the league's running cost by its tier. */
export function directorSalary(
  state: Pick<GameState, "directors" | "flagship" | "growthNodes">,
  world: World,
  index: number,
  tier: LeagueTierId,
): number {
  const countryId = world.countries[index]?.id;
  if (countryId === undefined || countryId === state.flagship.countryId) return 0;
  if (!directorIn(state, countryId)) return 0;
  return (
    world.config.directors.salaryShare[tier] *
    runningCostPerQuarter(world, index, tier, state.growthNodes)
  );
}

/** The severance a director's replacement costs their league now. */
export function severance(state: GameState, world: World, countryId: string): number {
  const index = world.countries.findIndex((country) => country.id === countryId);
  const tier = state.countries[index]?.league?.tier;
  if (tier === undefined) return 0;
  return world.config.directors.severanceQuarters * directorSalary(state, world, index, tier);
}

/** Countries whose league should have a director now: focused, with a league, not the seat. */
function directedCountries(state: GameState): string[] {
  const seen = new Set<string>();
  for (const countryId of state.focus) {
    if (countryId === null || countryId === state.flagship.countryId) continue;
    if (!state.countries.find((c) => c.countryId === countryId)?.league) continue;
    seen.add(countryId);
  }
  return [...seen];
}

function takenNames(directors: DirectorsState): Set<string> {
  return new Set([
    ...directors.serving.map((d) => d.name),
    ...directors.past.map((d) => d.name),
    ...directors.candidates.flatMap((c) => c.options.map((o) => o.name)),
  ]);
}

function drawCandidate(
  world: World,
  rng: Rng,
  countryId: string,
  taken: Set<string>,
): DirectorCandidate {
  const traits = directorTraits(world);
  const name = drawName(world, rng, countryId, taken);
  taken.add(name);
  const trait = traits[Math.floor(nextFloat(rng) * traits.length)] ?? traits[0] ?? "";
  return { name, trait };
}

function tierIn(state: GameState, countryId: string): LeagueTierId | null {
  return state.countries.find((c) => c.countryId === countryId)?.league?.tier ?? null;
}

/** The player's hardcore fans in a country now. */
function hardcoreIn(state: GameState, countryId: string): number {
  return state.countries.find((c) => c.countryId === countryId)?.fans[PLAYER_INDEX]?.hardcore ?? 0;
}

/** Ends a term: the record the Builders wing reads. */
function endTerm(state: GameState, director: Director, reason: DirectorLeaving): DirectorTerm {
  const promotions = state.landmarks.filter(
    (l) =>
      l.kind === "leaguePromoted" &&
      l.countryId === director.countryId &&
      l.quarter >= director.fromQuarter,
  ).length;
  return {
    ...director,
    toQuarter: state.quarter,
    tierOnLeaving: tierIn(state, director.countryId),
    promotions,
    reason,
    hardcoreOnLeaving: hardcoreIn(state, director.countryId),
    healthOnLeaving:
      state.countries.find((c) => c.countryId === director.countryId)?.league?.health ?? null,
  };
}

/**
 * The answer to the last ask (GDD v1.41), once it is in the journal: granting restores patience,
 * declining uses it up, and a director out of patience resigns. Their league's health drops and
 * the country, still in focus, draws a new director below.
 */
function settlePatience(state: GameState, world: World, found: Landmark[]): GameState {
  const open = state.directors.openAsk;
  if (!open) return state;
  if (state.events.pending.some((e) => isAskFor(world, e, open))) return state;
  const answered = state.events.history.find((e) => isAskFor(world, e, open));
  const director = state.directors.serving.find((d) => d.id === open.directorId);
  const cleared = { ...state, directors: { ...state.directors, openAsk: null } };
  if (!answered || !director) return cleared;
  if (answered.resolution?.choiceId === "grant") {
    return {
      ...cleared,
      directors: {
        ...cleared.directors,
        serving: cleared.directors.serving.map((d) =>
          d.id === director.id ? { ...d, declines: 0 } : d,
        ),
      },
    };
  }
  const declines = director.declines + 1;
  if (declines < world.config.directors.patience) {
    return {
      ...cleared,
      directors: {
        ...cleared.directors,
        serving: cleared.directors.serving.map((d) =>
          d.id === director.id ? { ...d, declines } : d,
        ),
      },
    };
  }
  // Out of patience: the turmoil costs the league health, never into collapse.
  const worst = HEALTH_LEVELS.length - 1;
  const countries = cleared.countries.map((c) => {
    if (c.countryId !== director.countryId || !c.league) return c;
    const rung = Math.min(
      worst,
      HEALTH_LEVELS.indexOf(c.league.health) + world.config.directors.resignation.healthSteps,
    );
    return { ...c, league: { ...c.league, health: HEALTH_LEVELS[rung] ?? c.league.health } };
  });
  found.push(
    landmarks.directorResigned(state.turn, state.quarter, director.countryId, director.id),
  );
  return {
    ...cleared,
    countries,
    directors: {
      ...cleared.directors,
      serving: cleared.directors.serving.filter((d) => d.id !== director.id),
      past: [...cleared.directors.past, endTerm(cleared, { ...director, declines }, "resigned")],
    },
  };
}

/** Whether an event record is the card for this open ask. */
function isAskFor(
  world: World,
  event: GameState["events"]["pending"][number],
  open: { directorId: number; quarter: number },
): boolean {
  const card = world.events.cards.find((c) => c.id === event.templateId);
  return (
    card?.trigger === "directorAsk" &&
    event.facts.director?.directorId === open.directorId &&
    event.quarter === open.quarter
  );
}

/**
 * Brings the directors in line with the focus slots and leagues now: the last ask's answer is
 * read, terms end where focus left, the league folded or the seat arrived, and a director is
 * drawn for each focused league without one. While the offseason is open each serving director's
 * league has its candidates, and the standouts kept from the talent pull stay kept; once it
 * closes both are gone. With `quarters` (End Turn's end), each scandal-prone director may have a
 * scandal over that many quarters, and an open offseason gets its one ask.
 */
export function syncDirectors(state: GameState, world: World, quarters = 0): GameState {
  if (state.outcome !== null) return state;
  const found: Landmark[] = [];
  const answered = settlePatience(state, world, found);
  const wanted = new Set(directedCountries(answered));
  const current = answered.directors;
  const open = offseasonOpen(answered);

  const rng = restoreRng(current.rng);
  const past = [...current.past];
  const serving: Director[] = [];
  for (const director of current.serving) {
    if (wanted.has(director.countryId)) {
      serving.push(director);
      continue;
    }
    const reason: DirectorLeaving =
      director.countryId === answered.flagship.countryId
        ? "seat"
        : tierIn(answered, director.countryId) === null
          ? "league"
          : "focus";
    past.push(endTerm(answered, director, reason));
  }
  let nextId = current.nextId;
  const taken = takenNames(current);
  for (const countryId of wanted) {
    if (serving.some((d) => d.countryId === countryId)) continue;
    const drawn = drawCandidate(world, rng, countryId, taken);
    // Key order follows the save schema, so a resumed game re-serializes identically.
    serving.push({
      id: nextId++,
      name: drawn.name,
      countryId,
      trait: drawn.trait,
      fromQuarter: answered.quarter,
      tierOnArrival: tierIn(answered, countryId) ?? "amateur",
      declines: 0,
      hardcoreOnArrival: hardcoreIn(answered, countryId),
    });
  }
  // Candidates for each league while the offseason is open, drawn once.
  const candidates = open
    ? serving.map(
        (director) =>
          current.candidates.find((c) => c.countryId === director.countryId) ?? {
            countryId: director.countryId,
            options: Array.from({ length: world.config.directors.candidates }, () =>
              drawCandidate(world, rng, director.countryId, taken),
            ),
          },
      )
    : [];

  // Scandals over the turn just played.
  let countries = answered.countries;
  if (quarters > 0) {
    const { chancePerYear, hardcoreLoss } = world.config.directors.scandal;
    const chance = 1 - (1 - chancePerYear) ** (quarters / QUARTERS_PER_YEAR);
    for (const director of serving) {
      if (!world.config.directors.traits[director.trait]?.scandals) continue;
      if (nextFloat(rng) >= chance) continue;
      const index = countries.findIndex((c) => c.countryId === director.countryId);
      const country = countries[index];
      const fans = country?.fans[PLAYER_INDEX];
      if (!country || !fans) continue;
      const after = demoteHardcore(fans, hardcoreLoss);
      const demoted = fans.hardcore - after.hardcore;
      if (demoted <= 0) continue;
      const nextFans = [...country.fans];
      nextFans[PLAYER_INDEX] = after;
      countries = countries.map((c, i) => (i === index ? { ...country, fans: nextFans } : c));
      found.push(
        landmarks.directorScandal(
          answered.turn,
          answered.quarter,
          director.countryId,
          director.id,
          demoted,
        ),
      );
    }
  }

  let next: GameState = {
    ...answered,
    countries,
    directors: {
      rng: saveRng(rng),
      nextId,
      serving,
      past,
      candidates,
      openAsk: current.openAsk,
      askedSeason: current.askedSeason,
      kept: open ? current.kept : [],
      holds: current.holds.filter((h) => h.endQuarter > answered.quarter),
      exhibitions: current.exhibitions.filter((e) => e.endQuarter > answered.quarter),
    },
  };
  // One ask an offseason, once the turn has been played (GDD v1.41).
  if (
    quarters > 0 &&
    open &&
    next.directors.openAsk === null &&
    next.directors.askedSeason !== next.flagship.season
  ) {
    const asked = pressingAsk(next, world);
    if (asked) {
      found.push(
        landmarks.directorAsk(
          next.turn,
          next.quarter,
          asked.director.countryId,
          asked.director.id,
          asked.ask,
          asked.standoutId,
        ),
      );
      next = {
        ...next,
        directors: {
          ...next.directors,
          openAsk: { directorId: asked.director.id, quarter: next.quarter },
          askedSeason: next.flagship.season,
        },
      };
    }
  }
  return found.length > 0 ? { ...next, landmarks: [...next.landmarks, ...found] } : next;
}

// ---- Asks (GDD v1.41) ------------------------------------------------------------------------

/** Whether a league holds its money now (hold-the-money): no payout, no promotion. */
export function holdingMoney(state: Pick<GameState, "directors" | "quarter">, countryId: string) {
  return state.directors.holds.some(
    (h) => h.countryId === countryId && h.endQuarter > state.quarter,
  );
}

/** Countries a flagship exhibition is airing in now (host-something). */
export function exhibitionsNow(state: Pick<GameState, "directors" | "quarter">): string[] {
  return state.directors.exhibitions
    .filter((e) => e.endQuarter > state.quarter)
    .map((e) => e.countryId);
}

/** Whether the World Championship takes bids now and the country could join them. */
function canBid(state: GameState, countryId: string): boolean {
  const cup = state.worldChampionship;
  return (
    cup.founded !== null &&
    cup.hostId === null &&
    cup.bids.length > 0 &&
    !cup.bids.includes(countryId)
  );
}

/** What an ask would name now in a director's league, or null if the facts do not allow it. */
function askFacts(
  state: GameState,
  world: World,
  director: Director,
  ask: DirectorAsk,
): { standoutId: number | null } | null {
  const index = world.countries.findIndex((c) => c.id === director.countryId);
  const league = state.countries[index]?.league;
  if (!league) return null;
  const config = world.config.directors.asks;
  switch (ask) {
    case "keep-our-star": {
      const offer = signingOffer(state, world);
      return offer?.standout.countryId === director.countryId
        ? { standoutId: offer.standout.id }
        : null;
    }
    case "promotion-push": {
      if (holdingMoney(state, director.countryId)) return null;
      const blocker = leagueActions(state, world, index)?.promoteLeague.blocker;
      const near =
        blocker?.kind === "hardcore" &&
        blocker.current >= config["promotion-push"].nearShare * blocker.needed;
      return blocker === null || near ? { standoutId: null } : null;
    }
    case "hold-the-money": {
      if (holdingMoney(state, director.countryId)) return null;
      const ready = leagueActions(state, world, index)?.promoteLeague.blocker === null;
      const payingOut = league.cash >= leagueReserve(state, world, index);
      return ready || payingOut ? { standoutId: null } : null;
    }
    case "host-something":
      return canBid(state, director.countryId) ||
        !exhibitionsNow(state).includes(director.countryId)
        ? { standoutId: null }
        : null;
    case "community-drive":
      return { standoutId: null };
  }
}

/**
 * The offseason's ask: the highest-priority ask some director's trait makes and their league's
 * facts allow, from the director of the league with the most hardcore fans.
 */
function pressingAsk(
  state: GameState,
  world: World,
): { director: Director; ask: DirectorAsk; standoutId: number | null } | null {
  const asks = world.config.directors.asks;
  const order = [...DIRECTOR_ASKS].sort((a, b) => asks[b].priority - asks[a].priority);
  const hardcore = (d: Director) =>
    state.countries.find((c) => c.countryId === d.countryId)?.fans[PLAYER_INDEX]?.hardcore ?? 0;
  const directors = [...state.directors.serving].sort(
    (a, b) => hardcore(b) - hardcore(a) || a.id - b.id,
  );
  for (const ask of order) {
    for (const director of directors) {
      if (!asks[ask].traits.includes(director.trait)) continue;
      const facts = askFacts(state, world, director, ask);
      if (facts) return { director, ask, standoutId: facts.standoutId };
    }
  }
  return null;
}

/** Why an ask card cannot be granted now (its director gone, or the facts changed), or null. */
export function askBlocker(state: GameState, world: World, event: EventRecord): "director" | null {
  const told = event.facts.director;
  const director = state.directors.serving.find((d) => d.id === told?.directorId);
  if (!told?.ask || !director) return "director";
  if (told.ask === "keep-our-star")
    return state.standouts.players.some((p) => p.id === told.standoutId) ? null : "director";
  if (told.ask === "community-drive" || told.ask === "host-something") return null;
  return askFacts(state, world, director, told.ask) ? null : "director";
}

/** Grants the ask an ask card tells (GDD v1.41). */
export function grantAsk(state: GameState, world: World, event: EventRecord): GameState {
  const told = event.facts.director;
  if (!told?.ask) return state;
  const countryId = event.countryId;
  const config = world.config.directors.asks;
  const directors = state.directors;
  switch (told.ask) {
    case "keep-our-star":
      return told.standoutId === undefined
        ? state
        : { ...state, directors: { ...directors, kept: [...directors.kept, told.standoutId] } };
    case "promotion-push": {
      const index = world.countries.findIndex((c) => c.id === countryId);
      const country = state.countries[index];
      const league = country?.league;
      const terms = league ? promotionTerms(world, index, league.tier, state.growthNodes) : null;
      if (!country || !league || !terms) return state;
      const countries = [...state.countries];
      countries[index] = {
        ...country,
        league: {
          ...league,
          tier: terms.to,
          cash: league.cash + config["promotion-push"].investmentShare * terms.investment,
        },
      };
      return {
        ...state,
        countries,
        landmarks: [
          ...state.landmarks,
          landmarks.leaguePromoted(state.turn, state.quarter, countryId, league.tier, terms.to),
        ],
      };
    }
    case "hold-the-money":
      return {
        ...state,
        directors: {
          ...directors,
          holds: [
            ...directors.holds,
            { countryId, endQuarter: state.quarter + config["hold-the-money"].quarters },
          ],
        },
      };
    case "host-something":
      if (canBid(state, countryId))
        return {
          ...state,
          worldChampionship: {
            ...state.worldChampionship,
            bids: [...state.worldChampionship.bids, countryId],
          },
        };
      return {
        ...state,
        directors: {
          ...directors,
          exhibitions: [
            ...directors.exhibitions,
            {
              countryId,
              endQuarter: state.quarter + config["host-something"].exhibitionQuarters,
            },
          ],
        },
      };
    case "community-drive":
      // The next youth level, free, where the league can start one (GDD v1.42).
      return youthBlocker(state, world, countryId, true) === null
        ? buildYouth(state, world, countryId, true)
        : state;
  }
}

export type DirectorBlocker = "offseason" | "noDirector" | "candidate" | "cash";

/** Why a director cannot be replaced by candidate `pick` now, or null. */
export function replaceBlocker(
  state: GameState,
  world: World,
  countryId: string,
  pick: number,
): DirectorBlocker | null {
  if (!offseasonOpen(state)) return "offseason";
  if (!directorIn(state, countryId)) return "noDirector";
  const options = state.directors.candidates.find((c) => c.countryId === countryId)?.options;
  if (!options?.[pick]) return "candidate";
  const cash = state.countries.find((c) => c.countryId === countryId)?.league?.cash ?? 0;
  if (cash < severance(state, world, countryId)) return "cash";
  return null;
}

/**
 * Replaces a country's director with this offseason's candidate `pick` (GDD v1.40): severance
 * from the league's cash, the old term on record, and that league's candidates spent.
 */
export function replaceDirector(
  state: GameState,
  world: World,
  countryId: string,
  pick: number,
): GameState {
  const director = directorIn(state, countryId);
  const options = state.directors.candidates.find((c) => c.countryId === countryId)?.options;
  const chosen = options?.[pick];
  if (!director || !chosen) return state;
  const cost = severance(state, world, countryId);
  const directors = state.directors;
  return {
    ...state,
    countries: state.countries.map((c) =>
      c.countryId === countryId && c.league
        ? { ...c, league: { ...c.league, cash: c.league.cash - cost } }
        : c,
    ),
    directors: {
      ...directors,
      nextId: directors.nextId + 1,
      serving: directors.serving.map((d) =>
        d.id === director.id
          ? {
              id: directors.nextId,
              name: chosen.name,
              countryId,
              trait: chosen.trait,
              fromQuarter: state.quarter,
              tierOnArrival: tierIn(state, countryId) ?? director.tierOnArrival,
              declines: 0,
              hardcoreOnArrival: hardcoreIn(state, countryId),
            }
          : d,
      ),
      past: [...directors.past, endTerm(state, director, "replaced")],
      // One replacement a league an offseason: its candidates are spent, not drawn again.
      candidates: directors.candidates.map((c) =>
        c.countryId === countryId ? { countryId, options: [] } : c,
      ),
    },
  };
}

export interface DirectorSnapshot {
  id: number;
  name: string;
  countryId: string;
  trait: string;
  /** The year the term began. */
  fromYear: number;
  /** Years served so far, whole. */
  years: number;
  salaryPerQuarter: number;
  /** Declines in a row that would make them resign, counting the next (GDD v1.41). */
  patience: number;
}

export interface DirectorsSnapshot {
  serving: DirectorSnapshot[];
  /** Finished terms, newest first. */
  past: {
    id: number;
    name: string;
    countryId: string;
    trait: string;
    fromYear: number;
    toYear: number;
    promotions: number;
    reason: DirectorLeaving;
  }[];
  /** This offseason's replacements, with the severance each league would pay. */
  candidates: { countryId: string; severance: number; options: DirectorCandidate[] }[];
}

export function directorsSnapshot(state: GameState, world: World): DirectorsSnapshot {
  const { config } = world;
  return {
    serving: state.directors.serving.map((director) => {
      const index = world.countries.findIndex((c) => c.id === director.countryId);
      const tier = state.countries[index]?.league?.tier;
      return {
        id: director.id,
        name: director.name,
        countryId: director.countryId,
        trait: director.trait,
        fromYear: yearOfQuarter(director.fromQuarter, config),
        years: Math.floor((state.quarter - director.fromQuarter) / QUARTERS_PER_YEAR),
        salaryPerQuarter: tier ? directorSalary(state, world, index, tier) : 0,
        patience: Math.max(1, config.directors.patience - director.declines),
      };
    }),
    past: [...state.directors.past].reverse().map((term) => ({
      id: term.id,
      name: term.name,
      countryId: term.countryId,
      trait: term.trait,
      fromYear: yearOfQuarter(term.fromQuarter, config),
      toYear: yearOfQuarter(term.toQuarter, config),
      promotions: term.promotions,
      reason: term.reason,
    })),
    candidates: state.directors.candidates.map((c) => ({
      countryId: c.countryId,
      severance: severance(state, world, c.countryId),
      options: c.options,
    })),
  };
}
