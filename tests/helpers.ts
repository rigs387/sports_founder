import {
  type Config,
  deriveWorld,
  type Genome,
  type World,
  type WorldContent,
} from "../src/content";
import { loadWorldFromDisk } from "../src/runner/content-from-disk";
import { type CampaignSetup, defaultGenome, type GameState, newCulture } from "../src/sim";

export const world = loadWorldFromDisk();

export const firstAnchor = world.countries[0]?.id ?? "missing-country";

export const baseGenome: Genome = defaultGenome(world);

// Anchors spanning the world's extremes: tiny and huge, rich and poor, cold and hot, dense and
// sparse. Per-anchor sweeps use only these; never sweep campaigns over all 213 markets.
export const sweepAnchors: string[] = [
  "tuvalu",
  "china",
  "india",
  "united-states",
  "brazil",
  "ecuador",
  "iceland",
  "chad",
  "singapore",
  "qatar",
  "mongolia",
];

export function setupFor(seed: number, anchorCountryId = firstAnchor, genome = baseGenome) {
  return { seed, anchorCountryId, genome } satisfies CampaignSetup;
}

export function presetGenome(id: string): Genome {
  const preset = world.genome.presets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`No preset "${id}" in content`);
  return preset.genome;
}

/** A copy of `base` with one edit to its content, re-derived. The original is untouched. */
export function withWorld(base: World, edit: (content: WorldContent) => void): World {
  const copy: WorldContent = structuredClone({
    countries: base.countries,
    rivals: base.rivals,
    otherSports: base.otherSports,
    genome: base.genome,
    growthTree: base.growthTree,
    events: base.events,
    identity: base.identity,
    names: base.names,
    places: base.places,
    sources: base.sources,
    config: base.config,
  });
  edit(copy);
  return deriveWorld(copy);
}

/** A copy of `base` with one config change applied. The original is untouched. */
export function withConfig(base: World, change: (config: Config) => void): World {
  return withWorld(base, (content) => change(content.config));
}

export function countryIndex(w: World, id: string): number {
  const index = w.countries.findIndex((country) => country.id === id);
  if (index < 0) throw new Error(`No country "${id}" in content`);
  return index;
}

/** The culture an older save gains on loading (format 18): none yet, facts counted from now. */
export function migratedCulture(state: GameState) {
  return newCulture(
    state.seed,
    state.flagship.season,
    state.landmarks.length,
    state.quarter,
    world,
  );
}

/** Leagues as an older save gains them on loading (format 22): level 1, nothing built, no record. */
export function venueless(state: GameState): GameState["countries"] {
  return state.countries.map((country) =>
    country.league
      ? {
          ...country,
          league: { ...country.league, venue: { level: 1, building: null, record: null } },
        }
      : country,
  );
}

/** Seasons as an older save gains them on loading (format 22): no crowd, no record. */
export function crowdless(seasons: GameState["flagship"]["seasons"]) {
  return seasons.map((season) => ({ ...season, crowd: null, recordCrowd: false }));
}

/**
 * The world without the flagship's ways of reaching fans: no season, star or tradition cards, no
 * tradition effects, no broadcast and no star wages (GDD v1.15, v1.16, v1.22, v1.23, v1.30). Its matches alone must
 * leave the world as it was.
 */
export function cardless(base: World): World {
  const { culture, flagship } = base.config;
  const silent = { amateur: 0, "semi-pro": 0, professional: 0, elite: 0 };
  return {
    ...base,
    config: {
      ...base.config,
      culture: { ...culture, turnoverCut: 0, poachCut: 0, pilgrimage: 0, seatWeight: 0 },
      flagship: {
        ...flagship,
        broadcast: { ...flagship.broadcast, ceiling: silent },
        payroll: { ...flagship.payroll, wageShare: 0 },
      },
    },
    events: {
      ...base.events,
      cards: base.events.cards.filter(
        (card) => !["seasonEnd", "star", "tradition"].includes(card.trigger),
      ),
    },
  };
}

/** The events without tradition cards: what a save older than format 18 could hold. */
export function withoutTraditionEvents(events: GameState["events"]): GameState["events"] {
  const keep = (list: GameState["events"]["pending"]) =>
    list.filter((event) => event.facts.tradition === null);
  return { ...events, pending: keep(events.pending), history: keep(events.history) };
}
