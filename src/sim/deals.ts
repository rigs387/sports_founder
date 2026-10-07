import { type AxisId, type DealSlot, GEAR_BRAND_ID, GENOME_AXES, LEAGUE_TIERS } from "../content";
import { offseasonOpen, tierEntry } from "./calendar";
import { hasCountermove, mediaRevenueFactor } from "./countermoves";
import { growthFactorsAt } from "./growth";
import { revenuePerQuarter, runningCostPerQuarter } from "./leagues";
import { landmarks } from "./records";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import type {
  CountryState,
  Deal,
  DealDemandTerms,
  DealOffer,
  DealsState,
  FlagshipState,
  GameState,
  LeagueState,
  LeagueTierId,
  World,
} from "./types";
import { PLAYER_INDEX } from "./types";

// Flagship deals (GDD v1.28, tech plan 2.15). Only the flagship signs deals. Each offseason every
// open slot (one TV slot, sponsor slots by league tier, a naming-rights slot for the founding
// ground and each famous ground) gets offers on the deals' own random stream, so neither the
// world's sequence nor the flagship's matches depend on them. A signed deal pays a value locked
// at signing for its term. Offers lapse when the offseason closes. Demands never block: doing the
// thing breaks the deal (step 4). Rule demands are rare and never required: at most one offer
// with one per offseason, only where its slot has another offer, only on a deal still running at
// its deadline, none while one is due.

const DEALS_STREAM = 0x6a09_e667;

/** The deals at campaign start: nothing signed, no offers made yet. */
export function newDeals(seed: number): DealsState {
  return {
    rng: createRngState((seed ^ DEALS_STREAM) >>> 0),
    signed: [],
    offers: [],
    shunned: [],
    nextId: 1,
    offeredSeason: null,
  };
}

function indexOf(world: World, countryId: string): number {
  return world.countries.findIndex((country) => country.id === countryId);
}

/** A uniform integer in [min, max]. */
function between(rng: Rng, min: number, max: number): number {
  return min + Math.min(max - min, Math.floor(nextFloat(rng) * (max - min + 1)));
}

/** Whether the deals' slot is the same (kind and position). */
const sameSlot = (
  a: { slot: DealSlot; position: number },
  b: { slot: DealSlot; position: number },
) => a.slot === b.slot && a.position === b.position;

/** A slot the flagship can sign a deal in. */
export interface DealSlotRef {
  slot: DealSlot;
  position: number;
}

/**
 * Every slot the seat league has now: one TV slot, sponsor slots by its tier, and a naming-rights
 * slot for the founding ground (while the founding club plays in it) and each famous ground there.
 */
export function dealSlots(state: GameState, world: World, league: LeagueState): DealSlotRef[] {
  const { flagship } = state;
  const slots: DealSlotRef[] = [{ slot: "tv", position: 0 }];
  const sponsors = world.config.flagship.deals.sponsorSlots[league.tier];
  for (let i = 0; i < sponsors; i += 1) slots.push({ slot: "sponsor", position: i });
  const playing = (clubId: number) =>
    flagship.clubs.some(
      (club) => club.id === clubId && club.active && club.countryId === flagship.countryId,
    );
  const grounds = new Set<number>();
  if (playing(state.identity.foundingClubId)) grounds.add(state.identity.foundingClubId);
  for (const tradition of state.culture.traditions) {
    const clubId = tradition.clubIds[0];
    if (
      tradition.type === "venue" &&
      tradition.lost === null &&
      tradition.countryId === flagship.countryId &&
      clubId !== undefined &&
      playing(clubId)
    ) {
      grounds.add(clubId);
    }
  }
  for (const clubId of [...grounds].sort((a, b) => a - b)) {
    slots.push({ slot: "namingRights", position: clubId });
  }
  return slots;
}

/** The product of the owned TV fork nodes' effects on TV offers. */
function tvForkFactors(state: GameState, world: World) {
  let value = 1;
  let exclusivityChance = 1;
  for (const nodeId of state.growthNodes) {
    const fork = world.config.flagship.deals.tvFork[nodeId];
    if (!fork) continue;
    value *= fork.value;
    exclusivityChance *= fork.exclusivityChance;
  }
  return { value, exclusivityChance };
}

/**
 * What an ordinary offer in a slot is worth a season at the seat now, before the random spread,
 * demands and the cap: like the media line, × the league tier's revenue multiplier and the PP
 * tier's media revenue multiplier. A rival's sponsor lockout shrinks sponsor and naming offers.
 */
export function ordinaryDealValue(state: GameState, world: World, ref: DealSlotRef): number {
  const seat = indexOf(world, state.flagship.countryId);
  const country = state.countries[seat];
  const league = country?.league ?? null;
  const derived = world.derived[seat];
  const fans = country?.fans[PLAYER_INDEX];
  if (!country || !league || !derived || !fans) return 0;
  const { deals, leagues } = { deals: world.config.flagship.deals, leagues: world.config.leagues };
  const { revenue } = leagues;
  const multiplier =
    leagues.tiers[league.tier].revenueMultiplier *
    tierEntry(state.ppTier, world.config).mediaRevenueMultiplier;
  const wealth = revenue.wealthFloor + (1 - revenue.wealthFloor) * derived.wealth;
  const market = revenue.mediaMarketFloor + (1 - revenue.mediaMarketFloor) * derived.mediaMarket;
  const lockout = hasCountermove(country, "sponsorLockout") ? deals.sponsorLockout.value : 1;
  let quarter: number;
  if (ref.slot === "tv") {
    quarter = fans.casual * deals.value.tvPerCasual * market * tvForkFactors(state, world).value;
  } else if (ref.slot === "sponsor") {
    const share = deals.value.sponsorSlotShares[ref.position] ?? 0;
    quarter = (fans.casual + fans.hardcore) * deals.value.sponsorPerFan * wealth * share * lockout;
  } else {
    quarter = fans.hardcore * deals.value.namingPerHardcore * wealth * lockout;
  }
  return 4 * quarter * multiplier;
}

/**
 * The most an ordinary offer is worth a season now, before its own spread, share and premium: the
 * PP tier's cap × the league's annual running cost.
 */
export function dealCap(state: GameState, world: World): number {
  const seat = indexOf(world, state.flagship.countryId);
  const league = state.countries[seat]?.league ?? null;
  if (!league) return 0;
  const { capByPpTier } = world.config.flagship.deals;
  const share = capByPpTier[state.ppTier - 1] ?? capByPpTier[capByPpTier.length - 1] ?? 0;
  return share * 4 * runningCostPerQuarter(world, seat, league.tier, state.growthNodes);
}

/**
 * The balance guard's measure (GDD v1.28): a full slate of ordinary offers at the seat now, one
 * in every slot with no demand, plus the baseline share, as a share of the media line it replaces.
 * Before the PP tier's cap unless `capped` (the cap is a separate lever: it trims windfalls while
 * the sport is young). Null without a seat league or media income.
 */
export function dealSlateShare(state: GameState, world: World, capped = false): number | null {
  const seat = indexOf(world, state.flagship.countryId);
  const country = state.countries[seat];
  const league = country?.league ?? null;
  const fans = country?.fans[PLAYER_INDEX];
  if (!country || !league || !fans) return null;
  const media = revenuePerQuarter(world, seat, league.tier, fans, state.ppTier).media;
  if (media <= 0) return null;
  const cap = capped ? dealCap(state, world) : Number.POSITIVE_INFINITY;
  const slate = dealSlots(state, world, league).reduce(
    (sum, ref) => sum + Math.min(cap, ordinaryDealValue(state, world, ref)) / 4,
    0,
  );
  return world.config.flagship.deals.baselineShare + slate / media;
}

/** The rule one step from the genome's current option toward `toward`, or null if already there. */
function stepToward(state: GameState, axis: AxisId, toward: string): string | null {
  const options: readonly string[] = GENOME_AXES[axis].options;
  const current = options.indexOf(state.genome[axis]);
  const target = options.indexOf(toward);
  if (current < 0 || target < 0 || current === target) return null;
  return options[current + Math.sign(target - current)] ?? null;
}

/** A signed deal's rule demand still waiting to be met. */
export function dueRuleDemand(state: GameState): Deal | null {
  return (
    state.flagship.deals.signed.find(
      (deal) =>
        deal.demand?.kind === "ruleChange" &&
        state.genome[deal.demand.axis] !== deal.demand.option &&
        deal.demand.dueSeason >= state.flagship.season,
    ) ?? null
  );
}

/**
 * Makes the offseason's offers, once per offseason, after the turn's culture update (src/sim/turn.ts):
 * deals whose term is over end, and every open slot gets offers. Outside the offseason, or once
 * offers have been made this offseason, nothing changes.
 */
export function offerDeals(state: GameState, world: World): GameState {
  const { flagship } = state;
  if (!offseasonOpen(state) || flagship.deals.offeredSeason === flagship.season) return state;
  const settings = world.config.flagship.deals;
  const season = flagship.season;
  const seat = indexOf(world, flagship.countryId);
  const country = state.countries[seat];
  const league = country?.league ?? null;
  const ended = flagship.deals.signed.filter((deal) => deal.lastSeason < season);
  const signed = flagship.deals.signed.filter((deal) => deal.lastSeason >= season);
  const shunned = flagship.deals.shunned.filter((entry) => entry.untilSeason >= season);
  const base: DealsState = {
    ...flagship.deals,
    signed,
    offers: [],
    shunned,
    offeredSeason: season,
  };
  // Deals that ran their term are news (GDD v1.28).
  const recorded =
    ended.length === 0
      ? state
      : {
          ...state,
          landmarks: [
            ...state.landmarks,
            ...ended.map((deal) =>
              landmarks.dealEnded(
                state.turn,
                state.quarter,
                deal.countryId,
                deal.id,
                deal.partnerId,
                deal.slot,
              ),
            ),
          ],
        };
  if (!country || !league) return withDeals(recorded, base);

  const rng = restoreRng(flagship.deals.rng);
  const shunnedIds = new Set(shunned.map((entry) => entry.partnerId));
  const used = new Set<string>();
  const fork = tvForkFactors(state, world);
  const cap = dealCap(state, world);
  const tierFloorAllowed =
    LEAGUE_TIERS.indexOf(league.tier) >= LEAGUE_TIERS.indexOf(settings.tierFloorMinTier);
  const broadcastBlocked = hasCountermove(country, "broadcastDeal");
  const lockout = hasCountermove(country, "sponsorLockout");
  const { broadcasters, sponsors } = world.names.dealPartners;
  let nextId = base.nextId;
  // Ordinary values before demands, by offer id, for the rule demand placed afterwards.
  const ordinary = new Map<number, number>();
  const offers: DealOffer[] = [];

  const offer = (
    ref: DealSlotRef,
    partnerId: string,
    value: number,
    demand: DealDemandTerms | null,
    renewal: boolean,
  ) => {
    const id = nextId;
    nextId += 1;
    ordinary.set(id, value);
    const premium = demand ? settings.demands[demand.kind].premium : 0;
    offers.push({
      id,
      ...ref,
      partnerId,
      annualValue: value * (1 + premium),
      seasons: between(rng, settings.seasons.min, settings.seasons.max),
      demand,
      renewal,
    });
  };

  for (const ref of dealSlots(state, world, league)) {
    if (signed.some((deal) => sameSlot(deal, ref))) continue;
    if (ref.slot === "tv" && broadcastBlocked) continue;
    const sponsorKind = ref.slot !== "tv";
    const count = Math.max(
      1,
      between(rng, settings.offersPerSlot.min, settings.offersPerSlot.max) -
        (sponsorKind && lockout ? settings.sponsorLockout.offersCut : 0),
    );
    // The PP tier's cap bounds the ordinary value; each offer's own spread, share and premium apply
    // after it, so capped offers still differ and a demand still pays more.
    const ordinaryValue = Math.min(cap, ordinaryDealValue(state, world, ref));
    let made = 0;

    // The partner whose deal here just ended offers to renew (not through a sponsor lockout).
    const previous = ended.find((deal) => sameSlot(deal, ref));
    if (
      previous &&
      !shunnedIds.has(previous.partnerId) &&
      !used.has(previous.partnerId) &&
      !(sponsorKind && lockout)
    ) {
      const gear = previous.partnerId === GEAR_BRAND_ID;
      // Each season its clause was met earns the partner's renewal a larger edge (GDD v1.29).
      const edge =
        (gear ? settings.gearBrand.renewalEdge : settings.renewalEdge) +
        settings.clauses.renewalEdgePerMet * previous.clauseMet;
      const share = gear ? settings.gearBrand.valueShare : 1;
      offer(ref, previous.partnerId, ordinaryValue * share * (1 + edge), null, true);
      used.add(previous.partnerId);
      made += 1;
    }
    // The homegrown gear brand always offers for the main sponsor: demand-free and smaller.
    if (ref.slot === "sponsor" && ref.position === 0 && !used.has(GEAR_BRAND_ID) && made < count) {
      offer(ref, GEAR_BRAND_ID, ordinaryValue * settings.gearBrand.valueShare, null, false);
      used.add(GEAR_BRAND_ID);
      made += 1;
    }
    const pool = (ref.slot === "tv" ? broadcasters : sponsors).filter(
      (partner) => !shunnedIds.has(partner.id) && !used.has(partner.id),
    );
    for (; made < count && pool.length > 0; made += 1) {
      const [partner] = pool.splice(Math.floor(nextFloat(rng) * pool.length), 1);
      const spread = 1 + settings.value.spread * (2 * nextFloat(rng) - 1);
      const roll = nextFloat(rng);
      if (!partner) break;
      used.add(partner.id);
      // One demand or clause, by cumulative chance in config order (GDD v1.28, v1.29).
      const { tierFloor, seatLock, exclusivity, balance, star, fans } = settings.demands;
      const draws: [number, DealDemandTerms][] = [
        [tierFloorAllowed ? tierFloor.chance : 0, { kind: "tierFloor", tier: league.tier }],
        [seatLock.chance, { kind: "seatLock", countryId: flagship.countryId }],
        [
          ref.slot === "tv" ? exclusivity.chance * fork.exclusivityChance : 0,
          { kind: "exclusivity" },
        ],
        [ref.slot === "tv" ? balance.chance : 0, { kind: "balance" }],
        [ref.slot === "sponsor" ? star.chance : 0, { kind: "star" }],
        [fans.chance, { kind: "fans" }],
      ];
      let demand: DealDemandTerms | null = null;
      let edge = 0;
      for (const [chance, terms] of draws) {
        edge += chance;
        if (roll < edge) {
          demand = terms;
          break;
        }
      }
      offer(ref, partner.id, ordinaryValue * spread, demand, false);
    }
    // Every slot keeps an offer with no demand or clause (GDD v1.29): if all demand something,
    // the last fresh offer asks nothing, at its plain value.
    const here = offers.filter((candidate) => sameSlot(candidate, ref));
    const last = here[here.length - 1];
    if (last && here.every((candidate) => candidate.demand !== null)) {
      last.demand = null;
      last.annualValue = ordinary.get(last.id) ?? last.annualValue;
    }
  }

  // At most one rule demand an offseason, by chance, never while one is due, and only on a TV or
  // sponsor offer whose slot has another offer: a deal never needs a rule change to be had.
  const roll = nextFloat(rng);
  const pick = nextFloat(rng);
  const wishPick = nextFloat(rng);
  if (roll < settings.ruleDemand.chancePerOffseason && dueRuleDemand(state) === null) {
    const candidates = offers.flatMap((candidate) => {
      if (candidate.slot === "namingRights" || candidate.renewal) return [];
      // Only a deal still running at the deadline: a shorter one would end before its demand
      // could break, a premium for nothing.
      if (candidate.seasons < settings.ruleDemand.dueOffseasons + 1) return [];
      if (candidate.partnerId === GEAR_BRAND_ID) return [];
      if (offers.filter((other) => sameSlot(other, candidate)).length < 2) return [];
      const wishes = settings.ruleDemand.wishes[candidate.slot === "tv" ? "tv" : "sponsor"]
        .map((wish) => ({
          axis: wish.axis as AxisId,
          option: stepToward(state, wish.axis as AxisId, wish.toward),
        }))
        .filter((wish): wish is { axis: AxisId; option: string } => wish.option !== null);
      return wishes.length > 0 ? [{ candidate, wishes }] : [];
    });
    const chosen = candidates[Math.floor(pick * candidates.length)];
    const wish = chosen?.wishes[Math.floor(wishPick * chosen.wishes.length)];
    if (chosen && wish) {
      const value = ordinary.get(chosen.candidate.id) ?? 0;
      chosen.candidate.demand = {
        kind: "ruleChange",
        axis: wish.axis,
        option: wish.option,
        dueSeason: season + settings.ruleDemand.dueOffseasons,
      };
      chosen.candidate.annualValue = value * (1 + settings.demands.ruleChange.premium);
    }
  }

  return withDeals(recorded, { ...base, rng: saveRng(rng), offers, nextId });
}

function withDeals(state: GameState, deals: DealsState): GameState {
  return { ...state, flagship: { ...state.flagship, deals } };
}

/** The signed deals paying in the flagship's current season. */
export function payingDeals(flagship: FlagshipState): Deal[] {
  return flagship.deals.signed.filter(
    (deal) => deal.firstSeason <= flagship.season && deal.lastSeason >= flagship.season,
  );
}

/** Deal income a quarter at the flagship: a quarter of each paying deal's annual value. */
export function dealIncomePerQuarter(flagship: FlagshipState): number {
  return payingDeals(flagship).reduce((sum, deal) => sum + deal.annualValue / 4, 0);
}

/**
 * The share of the media line the flagship keeps (GDD v1.28): the baseline once deals have been
 * offered, all of it before the first offers (a new campaign's first season, an older save).
 */
export function flagshipMediaShare(flagship: FlagshipState, world: World): number {
  return flagship.deals.offeredSeason === null ? 1 : world.config.flagship.deals.baselineShare;
}

/** A paying TV deal with exclusivity cuts the broadcast's lift (GDD v1.28). */
export function exclusiveTv(flagship: FlagshipState): boolean {
  return payingDeals(flagship).some((deal) => deal.demand?.kind === "exclusivity");
}

/**
 * A league's income a quarter: gate plus the media line, cut by a rival's sponsor lockout. At
 * the flagship the media line keeps only its baseline share and signed deals pay on top; they are
 * locked, so no countermove cuts them (GDD v1.28). `country` and `tier` default to the state's.
 */
export function leagueIncomePerQuarter(
  state: Pick<GameState, "countries" | "flagship" | "ppTier" | "growthNodes">,
  world: World,
  index: number,
  country: CountryState | undefined = state.countries[index],
  tier: LeagueTierId | undefined = country?.league?.tier,
): number {
  const fans = country?.fans[PLAYER_INDEX];
  if (!country || !fans || tier === undefined) return 0;
  const revenue = revenuePerQuarter(
    world,
    index,
    tier,
    fans,
    state.ppTier,
    mediaRevenueFactor(
      country,
      world.config,
      growthFactorsAt(world, state.growthNodes, index).countermoveEffect,
    ),
  );
  if (world.countries[index]?.id !== state.flagship.countryId) return revenue.total;
  return (
    revenue.gate +
    revenue.media * flagshipMediaShare(state.flagship, world) +
    dealIncomePerQuarter(state.flagship)
  );
}

/**
 * Whether a signed deal's demand is broken now (GDD v1.28). A tier floor breaks when the seat
 * league falls below it or folds; a seat lock when the seat leaves the country; a rule demand
 * when the offseason before its due season closes without the rule amended (`closing`).
 * Exclusivity never breaks: it only cuts the broadcast's lift.
 */
function broken(state: GameState, world: World, deal: Deal, closing: boolean): boolean {
  const demand = deal.demand;
  if (!demand) return false;
  const { flagship } = state;
  switch (demand.kind) {
    case "tierFloor": {
      const league = state.countries[indexOf(world, flagship.countryId)]?.league ?? null;
      return (
        league === null || LEAGUE_TIERS.indexOf(league.tier) < LEAGUE_TIERS.indexOf(demand.tier)
      );
    }
    case "seatLock":
      return flagship.countryId !== demand.countryId;
    case "ruleChange":
      return (
        closing &&
        flagship.season === demand.dueSeason &&
        state.genome[demand.axis] !== demand.option
      );
    // Exclusivity and clauses never break: exclusivity cuts the broadcast's lift, clauses are
    // judged at season's end (GDD v1.29).
    case "exclusivity":
    case "balance":
    case "star":
    case "fans":
      return false;
  }
}

/**
 * Ends every signed deal whose demand is broken (GDD v1.28): demands never block, doing the thing
 * breaks the deal, and a forced breach counts too. Its remaining value is lost, the league that
 * signed it pays penaltySeasons × its annual value in cash (the seat's league if that one is
 * gone), the partner shuns the sport for shunSeasons, and a landmark records it. Called after
 * every action, when the offseason closes (`closing`: rule deadlines, a seat move) and after the
 * turn's league evaluation (a fold, a seat sent home).
 */
export function breakDeals(state: GameState, world: World, closing = false): GameState {
  const { flagship } = state;
  const breaking = flagship.deals.signed.filter((deal) => broken(state, world, deal, closing));
  if (breaking.length === 0) return state;
  const { penaltySeasons, shunSeasons } = world.config.flagship.deals.breach;
  const countries = [...state.countries];
  const found = breaking.map((deal) => {
    const penalty = penaltySeasons * deal.annualValue;
    const signedAt = indexOf(world, deal.countryId);
    const at = countries[signedAt]?.league ? signedAt : indexOf(world, flagship.countryId);
    const country = countries[at];
    const league = country?.league ?? null;
    if (country && league) {
      countries[at] = { ...country, league: { ...league, cash: league.cash - penalty } };
    }
    return landmarks.dealBroken(
      state.turn,
      state.quarter,
      deal.countryId,
      deal.id,
      deal.partnerId,
      deal.slot,
      deal.demand?.kind ?? "exclusivity",
      league ? penalty : 0,
    );
  });
  const ids = new Set(breaking.map((deal) => deal.id));
  const partners = new Set(breaking.map((deal) => deal.partnerId));
  const shunned = [
    ...flagship.deals.shunned.filter((entry) => !partners.has(entry.partnerId)),
    ...breaking.map((deal) => ({
      partnerId: deal.partnerId,
      untilSeason: flagship.season + shunSeasons,
    })),
  ];
  return {
    ...withDeals(state, {
      ...flagship.deals,
      signed: flagship.deals.signed.filter((deal) => !ids.has(deal.id)),
      shunned,
    }),
    countries,
    landmarks: [...state.landmarks, ...found],
  };
}

/** A signed deal as the UI sees it (GDD v1.28). */
export interface SignedDealSnapshot extends Deal {
  /** It pays this season. */
  paying: boolean;
  /** Its rule demand is still unmet. */
  ruleOpen: boolean;
  /** Its rule demand's deadline is this offseason's close: amend now or the deal breaks. */
  ruleDueNow: boolean;
}

/** What the UI shows of the flagship's deals (GDD v1.28). Prices and legality stay here. */
export interface DealsSnapshot {
  signed: SignedDealSnapshot[];
  /** Offers on the table, renewals marked (`renewal`). Empty outside the offseason. */
  offers: DealOffer[];
  /** The seat league's slots now, with the signed deal in each (null when open). */
  slots: { slot: DealSlot; position: number; dealId: number | null }[];
  shunned: { partnerId: string; untilSeason: number }[];
  /** Share of the media line kept: the baseline once offers have been made, else all of it. */
  mediaShare: number;
  /** Paying deals' income a quarter. */
  incomePerQuarter: number;
  /** What a breach costs: seasons of value in cash, seasons shunned. */
  breach: { penaltySeasons: number; shunSeasons: number };
  /** How clauses are judged (GDD v1.29): the bonus share, the edge per season met, the walk. */
  clauses: { bonusShare: number; renewalEdgePerMet: number; walkAfterMisses: number };
}

export function dealsSnapshot(state: GameState, world: World): DealsSnapshot {
  const { flagship } = state;
  const league = state.countries[indexOf(world, flagship.countryId)]?.league ?? null;
  const paying = new Set(payingDeals(flagship).map((deal) => deal.id));
  return {
    signed: flagship.deals.signed.map((deal) => {
      const rule = deal.demand?.kind === "ruleChange" ? deal.demand : null;
      const ruleOpen = rule !== null && state.genome[rule.axis] !== rule.option;
      return {
        ...deal,
        paying: paying.has(deal.id),
        ruleOpen,
        ruleDueNow: ruleOpen && flagship.offseason && rule?.dueSeason === flagship.season,
      };
    }),
    offers: flagship.deals.offers,
    slots: (league ? dealSlots(state, world, league) : []).map((ref) => ({
      ...ref,
      dealId: flagship.deals.signed.find((deal) => sameSlot(deal, ref))?.id ?? null,
    })),
    shunned: flagship.deals.shunned,
    mediaShare: flagshipMediaShare(flagship, world),
    incomePerQuarter: dealIncomePerQuarter(flagship),
    breach: world.config.flagship.deals.breach,
    clauses: world.config.flagship.deals.clauses,
  };
}

/** Offers lapse when the offseason closes (src/sim/flagship.ts closeOffseason). */
export function lapseOffers(flagship: FlagshipState): FlagshipState {
  if (flagship.deals.offers.length === 0) return flagship;
  return { ...flagship, deals: { ...flagship.deals, offers: [] } };
}

/** Why an offer cannot be signed now (GDD v1.28), or null if it can. */
export type SignBlocker = "window" | "offer";
export function signBlocker(state: GameState, offerId: number): SignBlocker | null {
  if (!offseasonOpen(state)) return "window";
  if (!state.flagship.deals.offers.some((offer) => offer.id === offerId)) return "offer";
  return null;
}

/**
 * Signs an offer (checked by the caller): it pays from the coming season for its term, and the
 * slot's other offers are withdrawn.
 */
export function signDeal(state: GameState, offerId: number): GameState {
  const { flagship } = state;
  const offer = flagship.deals.offers.find((candidate) => candidate.id === offerId);
  if (!offer) throw new Error(`No deal offer #${offerId}`);
  const seat = state.countries.find((country) => country.countryId === flagship.countryId);
  const fans = seat?.fans[PLAYER_INDEX];
  const deal: Deal = {
    ...offer,
    firstSeason: flagship.season,
    lastSeason: flagship.season + offer.seasons - 1,
    countryId: flagship.countryId,
    clauseMet: 0,
    clauseMisses: 0,
    fansMark: fans ? fans.casual + fans.hardcore : 0,
  };
  return withDeals(state, {
    ...flagship.deals,
    signed: [...flagship.deals.signed, deal],
    offers: flagship.deals.offers.filter((other) => !sameSlot(other, offer)),
  });
}

/** Everything wrong with the deals in `state` (invariants). */
export function dealProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const { deals } = state.flagship;
  const ids = [...deals.signed, ...deals.offers].map((deal) => deal.id);
  if (new Set(ids).size !== ids.length) problems.push("deal ids repeat");
  if (ids.some((id) => id >= deals.nextId)) problems.push("a deal id is not below nextId");
  if (deals.offers.length > 0 && !offseasonOpen(state)) {
    problems.push("deal offers stand outside the offseason");
  }
  for (const deal of deals.signed) {
    if (deal.clauseMet < 0 || deal.clauseMisses < 0 || deal.fansMark < 0) {
      problems.push(`deal #${deal.id} has an invalid clause record`);
    }
  }
  for (const deal of [...deals.signed, ...deals.offers]) {
    if (!Number.isFinite(deal.annualValue) || deal.annualValue < 0) {
      problems.push(`deal #${deal.id} has an invalid value`);
    }
    if (deal.demand?.kind === "ruleChange") {
      const options: readonly string[] = GENOME_AXES[deal.demand.axis]?.options ?? [];
      if (!options.includes(deal.demand.option)) {
        problems.push(`deal #${deal.id} demands an unknown rule "${deal.demand.option}"`);
      }
    }
  }
  const signedSlots = deals.signed.map((deal) => `${deal.slot}:${deal.position}`);
  if (new Set(signedSlots).size !== signedSlots.length) {
    problems.push("two signed deals share a slot");
  }
  const ruleOffers = deals.offers.filter((offer) => offer.demand?.kind === "ruleChange");
  if (ruleOffers.length > 1) problems.push("more than one offer demands a rule change");
  for (const offer of ruleOffers) {
    if (deals.offers.filter((other) => sameSlot(other, offer)).length < 2) {
      problems.push("a slot's only offer demands a rule change");
    }
  }
  const partners = new Set([
    GEAR_BRAND_ID,
    ...world.names.dealPartners.broadcasters.map((p) => p.id),
    ...world.names.dealPartners.sponsors.map((p) => p.id),
  ]);
  for (const deal of [...deals.signed, ...deals.offers]) {
    if (!partners.has(deal.partnerId)) problems.push(`deal #${deal.id}: unknown partner`);
  }
  return problems;
}
