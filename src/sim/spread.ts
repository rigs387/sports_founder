import { fandomScore } from "./fandom";
import { type GameState, PLAYER_INDEX, type World } from "./types";

// Cross-border spread and exposure (GDD Spread Model). Only casual exposure crosses borders: a
// country's outbound strength is its player Fandom Score (hardcore + weighted casual), and the
// exposure it creates in a target is that strength × channel link ÷ target population, summed over
// every source and the three channels (proximity, language, media reach). Local word of mouth
// adds the country's own following share, and a focus slot adds direct outreach.

export interface CountryExposure {
  /** Word of mouth: localWeight × player Fandom Score ÷ population. */
  local: number;
  /** Inbound spread by channel, after the focus inbound multiplier. */
  proximity: number;
  language: number;
  media: number;
  /** Direct outreach from a focus slot. */
  outreach: number;
  /** Local + inbound before any focus effects: what an unfocused country would have. */
  organic: number;
  /** What conversion and retention use: everything above, capped by config. */
  total: number;
  focused: boolean;
}

/** Player outbound spread strength per country: the Fandom Score formula on raw counts. */
export function outboundStrengths(state: GameState, world: World): number[] {
  const { casualWeight } = world.config.fandomScore;
  return state.countries.map((countryState) => {
    const fans = countryState.fans[PLAYER_INDEX];
    return fans ? fandomScore(fans.casual, fans.hardcore, casualWeight) : 0;
  });
}

/** Exposure to the player's sport in every country at the current state. */
export function computeExposure(state: GameState, world: World): CountryExposure[] {
  const { exposure: settings, focus: focusSettings } = world.config;
  const strengths = outboundStrengths(state, world);
  const focused = new Set(state.focus.filter((id): id is string => id !== null));

  return state.countries.map((_countryState, target) => {
    const country = world.countries[target];
    const links = world.inbound[target] ?? [];
    if (!country) throw new Error(`No country #${target} in content`);
    const population = country.population;
    const isFocused = focused.has(country.id);
    const inboundMultiplier = isFocused ? focusSettings.inboundMultiplier : 1;

    let proximity = 0;
    let language = 0;
    let media = 0;
    for (const link of links) {
      const strength = strengths[link.source] ?? 0;
      if (strength <= 0) continue;
      const perCapita = strength / population;
      proximity += link.proximity * perCapita;
      language += link.language * perCapita;
      media += link.media * perCapita;
    }
    const local = (settings.localWeight * (strengths[target] ?? 0)) / population;
    const organic = local + proximity + language + media;
    const outreach = isFocused ? focusSettings.outreachPeople / population : 0;
    const total = Math.min(
      settings.cap,
      local + (proximity + language + media) * inboundMultiplier + outreach,
    );
    return {
      local,
      proximity: proximity * inboundMultiplier,
      language: language * inboundMultiplier,
      media: media * inboundMultiplier,
      outreach,
      organic,
      total,
      focused: isFocused,
    };
  });
}
