import { mediaReachBlocked } from "./countermoves";
import { eventFactors } from "./events";
import { fandomScore } from "./fandom";
import { backingEffects, broadcastEffects } from "./flagship";
import { growthFactors } from "./growth";
import { type GameState, PLAYER_INDEX, type World } from "./types";

// Cross-border spread and exposure (GDD Spread Model). Only casual exposure crosses borders: a
// country's outbound strength is its player Fandom Score (hardcore + weighted casual), and the
// exposure it creates in a target is that strength × channel link ÷ target population, summed over
// every source and the three channels (proximity, language, media reach). Local word of mouth
// adds the country's own following share, and a focus slot adds direct outreach. A rival's
// exclusive broadcast deal blocks the media reach channel into a country (GDD Rival AI), less the
// share the player's countermove resistance holds open. Growth tree nodes multiply each inbound
// channel in the target country (src/sim/growth.ts). Backed flagship stars multiply the media
// reach channel out of the flagship country; the flagship's broadcast multiplies all media reach
// into the markets the seat's media reaches (GDD v1.23, v1.27; src/sim/flagship.ts).

export interface CountryExposure {
  /** Word of mouth: localWeight × player Fandom Score ÷ population. */
  local: number;
  /**
   * Inbound spread by channel, after growth tree channel factors, the focus inbound multiplier and
   * any broadcast deal.
   */
  proximity: number;
  language: number;
  media: number;
  /** The part of `media` the flagship's broadcast and its pulse add (GDD v1.23). */
  broadcast: number;
  /** Direct outreach from a focus slot. */
  outreach: number;
  /** Local + inbound before any focus effects: what an unfocused country would have. */
  organic: number;
  /** What conversion and retention use: everything above, capped by config. */
  total: number;
  focused: boolean;
}

/** Player outbound spread strength per country: the Fandom Score formula on raw counts. */
export function outboundStrengths(state: Pick<GameState, "countries">, world: World): number[] {
  const { casualWeight } = world.config.fandomScore;
  return state.countries.map((countryState) => {
    const fans = countryState.fans[PLAYER_INDEX];
    return fans ? fandomScore(fans.casual, fans.hardcore, casualWeight) : 0;
  });
}

/**
 * Media reach exposure into a country as if no broadcast deal were in effect: what a deal there
 * would block. `strengths` comes from outboundStrengths.
 */
export function unblockedMediaReach(
  world: World,
  strengths: readonly number[],
  target: number,
): number {
  const population = world.countries[target]?.population ?? 1;
  let media = 0;
  for (const link of world.inbound[target] ?? []) {
    const strength = strengths[link.source] ?? 0;
    if (strength > 0) media += (link.media * strength) / population;
  }
  return media;
}

/** Exposure to the player's sport in every country at the current state. */
export function computeExposure(
  state: Pick<GameState, "countries" | "focus" | "growthNodes" | "events" | "quarter" | "flagship">,
  world: World,
): CountryExposure[] {
  const { exposure: settings, focus: focusSettings } = world.config;
  const strengths = outboundStrengths(state, world);
  const growth = growthFactors(world, state.growthNodes);
  const focused = new Set(state.focus.filter((id): id is string => id !== null));
  const backing = backingEffects(state.flagship, world);
  const backingSource = world.countries.findIndex((country) => country.id === backing.countryId);
  const broadcast = broadcastEffects(state, world);

  return state.countries.map((countryState, target) => {
    const country = world.countries[target];
    const links = world.inbound[target] ?? [];
    if (!country) throw new Error(`No country #${target} in content`);
    const population = country.population;
    const isFocused = focused.has(country.id);
    const inboundMultiplier = isFocused ? focusSettings.inboundMultiplier : 1;
    const factors = growth[target];
    const eventRates = eventFactors(state, world, country.id);
    if (!factors) throw new Error(`No growth factors for country #${target}`);

    let proximity = 0;
    let language = 0;
    let media = 0;
    for (const link of links) {
      const strength = strengths[link.source] ?? 0;
      if (strength <= 0) continue;
      const perCapita = strength / population;
      proximity += link.proximity * perCapita;
      language += link.language * perCapita;
      if (link.media <= 0) continue;
      let reach = link.media * perCapita;
      if (link.source === backingSource) reach *= backing.mediaReach;
      media += reach;
    }
    proximity *= factors.proximity * eventRates.proximity;
    language *= factors.language * eventRates.language;
    const mediaFactor =
      factors.media *
      eventRates.media *
      (mediaReachBlocked(countryState) ? 1 - factors.countermoveEffect : 1);
    // The flagship's broadcast lifts all media reach where it airs (GDD v1.27).
    const broadcastLift = broadcast.boost * (broadcast.reach.get(target) ?? 0);
    const broadcastMedia = media * mediaFactor * broadcastLift;
    media *= mediaFactor * (1 + broadcastLift);
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
      broadcast: broadcastMedia * inboundMultiplier,
      outreach,
      organic,
      total,
      focused: isFocused,
    };
  });
}
