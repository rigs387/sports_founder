import { createRngState, nextFloat, restoreRng } from "./rng";
import type { Club, GameState, Genome, IdentitySetup, SportIdentity, World } from "./types";

// Sport identity (GDD v1.18): the sport's name, the founding club and its ground, founding
// character (birthplace and ethos), the sport's terms and a preset emblem. Chosen at setup,
// validated here, and kept in GameState.identity. None of it touches the simulation's numbers:
// birthplace and ethos seed Culture later, and the founding club plays like any club.
//
// Defaults come from the campaign seed on their own random stream, so they never change the
// world's random sequence or the flagship's.

/** Distinguishes the identity defaults' random stream from the world's and the flagship's. */
const IDENTITY_STREAM = 0x5f35_6495;

function identityRng(seed: number, salt: number) {
  const rng = restoreRng(createRngState((seed ^ IDENTITY_STREAM) >>> 0));
  for (let i = 0; i < salt; i += 1) nextFloat(rng);
  return rng;
}

function pick<T>(rng: ReturnType<typeof identityRng>, items: readonly T[]): T {
  const item = items[Math.floor(nextFloat(rng) * items.length)] ?? items[0];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

/** A generated sport name: a first and a second part joined. `attempt` re-rolls it. */
export function suggestSportName(world: World, seed: number, attempt = 0): string {
  const rng = identityRng(seed, attempt * 2);
  const { first, second } = world.names.sportNameParts;
  return `${pick(rng, first)}${pick(rng, second)}`;
}

/** The founding ground's default name: the club's town and a ground word. */
export function defaultGroundName(world: World, seed: number, place: string): string {
  return `${place} ${pick(identityRng(seed, 101), world.names.groundWords)}`;
}

/** Every default for a new campaign, from the seed: what the setup screen starts from. */
export function defaultIdentitySetup(
  world: World,
  seed: number,
  anchorCountryId: string,
): IdentitySetup {
  const { identity } = world;
  const rng = identityRng(seed, 200);
  const place = world.places[anchorCountryId]?.[0]?.name ?? "";
  const colors = Object.keys(identity.emblem.colors);
  const primary = pick(rng, colors);
  const secondary = pick(
    rng,
    colors.filter((color) => color !== primary),
  );
  const first = (list: readonly string[]) => list[0] ?? "";
  return {
    sportName: suggestSportName(world, seed),
    foundingPlace: place,
    clubName: pick(rng, world.names.clubNicknames),
    groundName: defaultGroundName(world, seed, place),
    birthplace: pick(rng, identity.birthplaces),
    ethos: pick(rng, identity.ethos),
    terms: {
      score: first(identity.terms.score),
      match: first(identity.terms.match),
      season: first(identity.terms.season),
    },
    emblem: {
      shape: pick(rng, identity.emblem.shapes),
      icon: pick(rng, identity.emblem.icons),
      primary,
      secondary,
    },
  };
}

/** Removes surrounding spaces and collapses runs of whitespace. */
export function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Every way an identity setup is invalid for this anchor, or an empty list. */
export function identityProblems(
  setup: IdentitySetup,
  world: World,
  anchorCountryId: string,
): string[] {
  const problems: string[] = [];
  const { identity, config } = world;
  const limits = config.identity;
  const checkName = (field: string, value: string, max: number) => {
    const length = tidyName(value).length;
    if (length < limits.nameMinLength || length > max)
      problems.push(`${field} must be ${limits.nameMinLength}–${max} characters (got ${length})`);
  };
  checkName("sportName", setup.sportName, limits.sportNameMaxLength);
  checkName("clubName", setup.clubName, limits.clubNameMaxLength);
  checkName("groundName", setup.groundName, limits.groundNameMaxLength);
  if (!(world.places[anchorCountryId] ?? []).some((place) => place.name === setup.foundingPlace))
    problems.push(`"${setup.foundingPlace}" is not a place in ${anchorCountryId}`);
  const known = (field: string, value: string, list: readonly string[]) => {
    if (!list.includes(value)) problems.push(`unknown ${field} "${value}"`);
  };
  known("birthplace", setup.birthplace, identity.birthplaces);
  known("ethos", setup.ethos, identity.ethos);
  known("score term", setup.terms.score, identity.terms.score);
  known("match term", setup.terms.match, identity.terms.match);
  known("season term", setup.terms.season, identity.terms.season);
  known("emblem shape", setup.emblem.shape, identity.emblem.shapes);
  known("emblem icon", setup.emblem.icon, identity.emblem.icons);
  const colors = Object.keys(identity.emblem.colors);
  known("emblem color", setup.emblem.primary, colors);
  known("emblem color", setup.emblem.secondary, colors);
  if (setup.emblem.primary === setup.emblem.secondary)
    problems.push("the emblem's two colors must differ");
  return problems;
}

/** The anchor's founding club: its oldest flagship club. */
export function foundingClubOf(clubs: readonly Club[], anchorCountryId: string): Club | undefined {
  return clubs
    .filter((club) => club.countryId === anchorCountryId)
    .sort((a, b) => a.firstSeason - b.firstSeason || a.id - b.id)[0];
}

/**
 * Applies a checked identity setup to a new campaign: the anchor's oldest club becomes the
 * founding club, based in the chosen place under the chosen name. Another club there with the same
 * place and name takes the first unused nickname instead.
 */
export function foundSport(
  state: Omit<GameState, "identity">,
  world: World,
  setup: IdentitySetup,
): GameState {
  const founding = foundingClubOf(state.flagship.clubs, state.anchorCountryId);
  if (!founding) throw new Error(`No flagship club at "${state.anchorCountryId}"`);
  const clubName = tidyName(setup.clubName);
  const here = state.flagship.clubs.filter(
    (club) => club.countryId === state.anchorCountryId && club.id !== founding.id,
  );
  const taken = new Set([clubName, ...here.map((club) => club.nickname)]);
  const spare = world.names.clubNicknames.filter((name) => !taken.has(name));
  let next = 0;
  const clubs = state.flagship.clubs.map((club) => {
    if (club.id === founding.id) return { ...club, place: setup.foundingPlace, nickname: clubName };
    if (
      club.countryId === state.anchorCountryId &&
      club.place === setup.foundingPlace &&
      club.nickname === clubName
    ) {
      const nickname = spare[next] ?? `${club.nickname} ${club.id}`;
      next += 1;
      return { ...club, nickname };
    }
    return club;
  });
  return {
    ...state,
    flagship: { ...state.flagship, clubs },
    identity: {
      sportName: tidyName(setup.sportName),
      foundingClubId: founding.id,
      groundName: tidyName(setup.groundName),
      birthplace: setup.birthplace,
      ethos: setup.ethos,
      terms: { ...setup.terms },
      emblem: { ...setup.emblem },
    },
  };
}

/** Every way a campaign's identity does not fit its flagship or the current content. */
export function identityStateProblems(state: GameState, world: World): string[] {
  const { identity } = state;
  const club = state.flagship.clubs.find((c) => c.id === identity.foundingClubId);
  const problems = identityProblems(
    {
      ...identity,
      foundingPlace: club?.place ?? "",
      clubName: club?.nickname ?? "",
    },
    world,
    state.anchorCountryId,
  )
    // An older save's founding club keeps the name it had, whatever today's limits say.
    .filter((problem) => !problem.startsWith("clubName"));
  if (!club || club.countryId !== state.anchorCountryId)
    problems.push(`founding club #${identity.foundingClubId} is not a club of the anchor`);
  return problems.map((problem) => `identity: ${problem}`);
}

/** The odd trait pairings a genome has, in content order, at most maxOddLines (GDD v1.18). */
export function oddPairings(genome: Genome, world: World): string[] {
  return world.identity.oddPairings
    .filter((pairing) =>
      Object.entries(pairing.when).every(
        ([axis, option]) => genome[axis as keyof Genome] === option,
      ),
    )
    .map((pairing) => pairing.id)
    .slice(0, world.identity.maxOddLines);
}

/** The identity as the UI shows it: emblem colors resolved, odd pairings and the founding year. */
export interface IdentitySnapshot extends SportIdentity {
  colors: { primary: string; secondary: string };
  oddPairings: string[];
  foundedYear: number;
  /** Players a side, by the genome's team size. */
  playersPerSide: number;
}

export function identitySnapshot(state: GameState, world: World): IdentitySnapshot {
  const { colors } = world.identity.emblem;
  return {
    ...state.identity,
    colors: {
      primary: colors[state.identity.emblem.primary] ?? "#000000",
      secondary: colors[state.identity.emblem.secondary] ?? "#ffffff",
    },
    oddPairings: oddPairings(state.genome, world),
    foundedYear: world.config.calendar.startYear,
    playersPerSide: world.identity.playersPerSide[state.genome.teamSize],
  };
}
