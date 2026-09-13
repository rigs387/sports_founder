import { startingRivalFanCounts } from "../content";
import { createRngState, MAX_SEED } from "./rng";
import {
  type CampaignSetup,
  type GameState,
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

  const { start } = world.config;
  const sports: SportState[] = [
    { id: PLAYER_SPORT_ID, kind: "player" },
    ...world.rivals.map((rival): SportState => ({ id: rival.id, kind: "rival" })),
  ];

  const countries = world.countries.map((country) => ({
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
      const counts = startingRivalFanCounts(
        country.population,
        country.startingRivalFans[sport.id],
      );
      return { sportId: sport.id, casual: counts.casual, hardcore: counts.hardcore };
    }),
  }));

  return {
    seed: setup.seed,
    rng: createRngState(setup.seed),
    anchorCountryId: setup.anchorCountryId,
    turn: 1,
    quarter: 0,
    pp: start.startingPP,
    ppTier: start.startingTier,
    sports,
    countries,
  };
}
