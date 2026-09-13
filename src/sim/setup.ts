import { genomeSchema, startingRivalFanCounts } from "../content";
import { createRngState, MAX_SEED } from "./rng";
import { tierEntry } from "./turn";
import {
  type CampaignSetup,
  type GameState,
  OTHER_SPORT_ID,
  PLAYER_SPORT_ID,
  type SportState,
  type World,
} from "./types";

export function createCampaign(world: World, setup: CampaignSetup): GameState {
  if (!Number.isInteger(setup.seed) || setup.seed < 0 || setup.seed > MAX_SEED) {
    throw new Error(`Seed must be an integer from 0 to ${MAX_SEED} (got ${setup.seed})`);
  }
  if (!world.countries.some((country) => country.id === setup.anchorCountryId)) {
    throw new Error(`Unknown anchor country "${setup.anchorCountryId}"`);
  }
  const genome = genomeSchema.safeParse(setup.genome);
  if (!genome.success) {
    const details = genome.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid genome: ${details.join("; ")}`);
  }

  const { start } = world.config;
  const sports: SportState[] = [
    { id: PLAYER_SPORT_ID, kind: "player" },
    ...world.rivals.map((rival): SportState => ({ id: rival.id, kind: "rival" })),
    { id: OTHER_SPORT_ID, kind: "other" },
  ];

  const countries = world.countries.map((country, index) => ({
    countryId: country.id,
    fans: sports.map((sport) => {
      if (sport.kind === "player") {
        const isAnchor = country.id === setup.anchorCountryId;
        return {
          sportId: sport.id,
          casual: isAnchor ? start.anchorCasualFans : 0,
          hardcore: isAnchor ? start.anchorHardcoreFans : 0,
        };
      }
      if (sport.kind === "other") {
        const share = world.derived[index]?.otherHardcoreShare ?? 0;
        return { sportId: sport.id, casual: 0, hardcore: Math.floor(country.population * share) };
      }
      const counts = startingRivalFanCounts(
        country.population,
        country.startingRivalFans[sport.id],
      );
      return { sportId: sport.id, casual: counts.casual, hardcore: counts.hardcore };
    }),
  }));

  // The first focus slot starts on the anchor (GDD Starting state); any others start empty.
  const slots = tierEntry(start.startingTier, world.config).focusSlots;
  const focus: (string | null)[] = Array.from({ length: slots }, (_, i) =>
    i === 0 ? setup.anchorCountryId : null,
  );

  return {
    seed: setup.seed,
    rng: createRngState(setup.seed),
    anchorCountryId: setup.anchorCountryId,
    genome: genome.data,
    turn: 1,
    quarter: 0,
    pp: start.startingPP,
    ppTier: start.startingTier,
    focus,
    sports,
    countries,
  };
}

/** The default genome: the first quick-start preset in content. */
export function defaultGenome(world: World) {
  const preset = world.genome.presets[0];
  if (!preset) throw new Error("Content has no genome presets");
  return preset.genome;
}
