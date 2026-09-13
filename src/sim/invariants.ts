import { type GameState, PLAYER_SPORT_ID, type World } from "./types";

/** Returns every way `state` is invalid for `world`. An empty list means the state is valid. */
export function checkInvariants(state: GameState, world: World): string[] {
  const problems: string[] = [];

  if (!Number.isInteger(state.turn) || state.turn < 1)
    problems.push(`turn ${state.turn} is invalid`);
  if (!Number.isInteger(state.quarter) || state.quarter < 0) {
    problems.push(`quarter ${state.quarter} is invalid`);
  }
  if (!Number.isFinite(state.pp) || state.pp < 0) problems.push(`pp ${state.pp} is invalid`);
  if (!world.config.ppTiers.some((tier) => tier.tier === state.ppTier)) {
    problems.push(`ppTier ${state.ppTier} is not in the tier table`);
  }
  if (!world.countries.some((country) => country.id === state.anchorCountryId)) {
    problems.push(`anchor "${state.anchorCountryId}" is not a known country`);
  }

  const expectedSports = [PLAYER_SPORT_ID, ...world.rivals.map((rival) => rival.id)];
  const actualSports = state.sports.map((sport) => sport.id);
  if (actualSports.join("|") !== expectedSports.join("|")) {
    problems.push(`sports [${actualSports}] do not match content [${expectedSports}]`);
  }
  state.sports.forEach((sport, index) => {
    const expectedKind = index === 0 ? "player" : "rival";
    if (sport.kind !== expectedKind) problems.push(`sport "${sport.id}" should be ${expectedKind}`);
  });

  if (state.countries.length !== world.countries.length) {
    problems.push(
      `state has ${state.countries.length} countries but content has ${world.countries.length}`,
    );
  }
  state.countries.forEach((countryState, index) => {
    const country = world.countries[index];
    if (!country || country.id !== countryState.countryId) {
      problems.push(`country #${index} "${countryState.countryId}" does not match content`);
      return;
    }
    if (countryState.fans.length !== state.sports.length) {
      problems.push(`${country.id}: has fans for ${countryState.fans.length} sports`);
    }
    let hardcore = 0;
    countryState.fans.forEach((fans, sportIndex) => {
      const where = `${country.id}/${fans.sportId}`;
      if (fans.sportId !== state.sports[sportIndex]?.id) problems.push(`${where}: out of order`);
      for (const bucket of ["casual", "hardcore"] as const) {
        const value = fans[bucket];
        if (!Number.isSafeInteger(value) || value < 0) {
          problems.push(`${where}: ${bucket} ${value} is not a non-negative whole number`);
        }
      }
      if (fans.casual + fans.hardcore > country.population) {
        problems.push(`${where}: casual + hardcore exceeds population`);
      }
      hardcore += fans.hardcore;
    });
    if (hardcore > country.population) {
      problems.push(`${country.id}: hardcore fans across sports exceed population`);
    }
  });

  return problems;
}
