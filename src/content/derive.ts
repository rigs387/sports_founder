import type { AffinityAttributes } from "./genome";
import type {
  Config,
  Country,
  Curve,
  FanShares,
  GenomeContent,
  Names,
  RivalSport,
  SportsContent,
} from "./schemas";

// Derives what the simulation reads from raw country content (GDD Country attributes): 0–1
// attribute scores via config curves, sport culture from starting fans, media market size, the
// "other sports" hardcore share, and the per-pair spread link strengths (GDD Spread Model).

/** Validated content before derivation. */
export interface WorldContent {
  countries: Country[];
  rivals: RivalSport[];
  otherSports: SportsContent["otherSports"];
  genome: GenomeContent;
  names: Names;
  config: Config;
}

export interface CountryDerived extends AffinityAttributes {
  /** Hardcore share held by the passive "other sports" bucket at the start. */
  otherHardcoreShare: number;
  /** Indices of every proximity link (land borders and sea links, undirected). */
  proximity: number[];
}

/** Spread link strengths from one source into a target, per channel, before any modifiers. */
export interface SpreadLink {
  source: number;
  proximity: number;
  language: number;
  media: number;
}

/** Validated, static game content plus everything derived from it. Never changes in a campaign. */
export interface World extends WorldContent {
  /** Same order as countries. */
  derived: CountryDerived[];
  /** inbound[target]: every source with a nonzero link into it. */
  inbound: SpreadLink[][];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Turns a raw figure into a 0–1 score (config attributeCurves). */
export function applyCurve(curve: Curve, value: number): number {
  if (curve.type === "log") {
    if (value <= 0) return 0;
    return clamp01(
      (Math.log(value) - Math.log(curve.low)) / (Math.log(curve.high) - Math.log(curve.low)),
    );
  }
  return clamp01((value - curve.low) / (curve.high - curve.low));
}

/** Starting rival fan counts for a country. Shared by validation and campaign setup. */
export function startingRivalFanCounts(
  population: number,
  shares: FanShares | undefined,
): { casual: number; hardcore: number } {
  if (!shares) return { casual: 0, hardcore: 0 };
  return {
    casual: Math.floor(population * shares.casual),
    hardcore: Math.floor(population * shares.hardcore),
  };
}

export function otherHardcoreShare(country: Country, otherSports: WorldContent["otherSports"]) {
  return country.otherHardcoreShare ?? otherSports.hardcoreShareByContinent[country.continent];
}

/** Share of the population already hardcore about any sport (rivals + other) at the start. */
export function startingSportCulture(
  country: Country,
  otherSports: WorldContent["otherSports"],
): number {
  let share = otherHardcoreShare(country, otherSports);
  for (const fans of Object.values(country.startingRivalFans)) share += fans.hardcore;
  return share;
}

function deriveCountry(
  country: Country,
  content: WorldContent,
  indexOf: Map<string, number>,
): CountryDerived {
  const { attributeCurves } = content.config;
  const wealth = applyCurve(attributeCurves.wealth, country.incomePerPerson);
  const links = new Set<number>();
  for (const id of [...country.neighbors, ...country.seaLinks]) {
    const index = indexOf.get(id);
    if (index !== undefined) links.add(index);
  }
  return {
    climate: country.climate,
    wealth,
    urbanDensity: applyCurve(attributeCurves.urbanDensity, country.urbanShare),
    sportCulture: clamp01(startingSportCulture(country, content.otherSports)),
    mediaMarket: applyCurve(attributeCurves.mediaMarket, country.population * wealth),
    otherHardcoreShare: otherHardcoreShare(country, content.otherSports),
    proximity: [...links].sort((a, b) => a - b),
  };
}

/** Language channel link factor: 1 for shared primary spheres, scaled for secondary ones. */
export function languageLinkFactor(a: Country, b: Country, secondaryWeight: number): number {
  let best = 0;
  const spheres = (country: Country): [string, number][] => {
    const out: [string, number][] = [[country.languages.primary, 1]];
    if (country.languages.secondary) out.push([country.languages.secondary, secondaryWeight]);
    return out;
  };
  for (const [sphereA, weightA] of spheres(a)) {
    for (const [sphereB, weightB] of spheres(b)) {
      if (sphereA === sphereB) best = Math.max(best, weightA * weightB);
    }
  }
  return best;
}

function buildInboundLinks(content: WorldContent, derived: CountryDerived[]): SpreadLink[][] {
  const { spread } = content.config;
  const n = content.countries.length;
  const inbound: SpreadLink[][] = [];
  for (let target = 0; target < n; target += 1) {
    const targetCountry = content.countries[target];
    const targetDerived = derived[target];
    const links: SpreadLink[] = [];
    if (!targetCountry || !targetDerived) continue;
    for (let source = 0; source < n; source += 1) {
      if (source === target) continue;
      const sourceCountry = content.countries[source];
      const sourceDerived = derived[source];
      if (!sourceCountry || !sourceDerived) continue;

      // Proximity links are undirected: a link listed on either side counts for both.
      const adjacent =
        targetDerived.proximity.includes(source) || sourceDerived.proximity.includes(target);
      const proximity = adjacent ? spread.proximity.weight : 0;
      const language =
        spread.language.weight *
        languageLinkFactor(sourceCountry, targetCountry, spread.language.secondaryWeight);
      const bothLarge =
        sourceDerived.mediaMarket >= spread.media.minMarketScore &&
        targetDerived.mediaMarket >= spread.media.minMarketScore;
      const media = bothLarge
        ? spread.media.weight * sourceDerived.mediaMarket * targetDerived.mediaMarket
        : 0;
      if (proximity > 0 || language > 0 || media > 0) {
        links.push({ source, proximity, language, media });
      }
    }
    inbound.push(links);
  }
  return inbound;
}

/** Computes every derived value. Call again after changing config or countries. */
export function deriveWorld(content: WorldContent): World {
  const indexOf = new Map(content.countries.map((country, index) => [country.id, index]));
  const derived = content.countries.map((country) => deriveCountry(country, content, indexOf));
  const base: WorldContent = {
    countries: content.countries,
    rivals: content.rivals,
    otherSports: content.otherSports,
    genome: content.genome,
    names: content.names,
    config: content.config,
  };
  return { ...base, derived, inbound: buildInboundLinks(base, derived) };
}
