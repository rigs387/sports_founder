import { useTranslation } from "react-i18next";
import type { EventEffect } from "../../../content";
import type { EventRecord } from "../../../sim";
import { useAwardWords } from "../awards/words";
import { cursedSeasons, useTraditionWords } from "../culture/traditions";
import { useDealPartnerName } from "../deals/partners";
import { PLAIN_TERMS, useTermVars } from "../identity/terms";
import { variantOf } from "../press/outlet";
import { useGameStore } from "../state/game-store";

// The words of event cards, shared by the board (the journal) and the pop-up event window
// (GDD v1.25): titles, bodies and effect lines, all built from the facts recorded on the card.

/** Names and numbers a star effect's line needs (GDD v1.16). */
interface StarValues {
  candidate?: string;
  cash?: number;
}

export function Effect({ effect, star = {} }: { effect: EventEffect; star?: StarValues }) {
  const { t } = useTranslation();
  const { snapshot } = useGameStore();
  const termVars = useTermVars(snapshot?.identity.terms ?? PLAIN_TERMS);
  if (effect.type === "starHonors" || effect.type === "starMentor" || effect.type === "starKeep") {
    const stars = snapshot?.flagship.starRules;
    return (
      <li>
        {t(`events.effects.${effect.type}`, {
          ...termVars({ seasons: stars?.afterglowSeasons ?? 0 }),
          seasons: stars?.afterglowSeasons ?? 0,
          share: stars?.mentorShare ?? 0,
          candidate: star.candidate ?? "",
          cash: star.cash ?? 0,
        })}
      </li>
    );
  }
  if (effect.type === "conversion" || effect.type === "spread")
    return (
      <li className={effect.factor < 1 ? "event-tradeoff" : undefined}>
        {t(`events.effects.${effect.type}`, {
          target: t(`events.targets.${effect.target}`),
          value: effect.factor - 1,
          quarters: effect.quarters,
        })}
      </li>
    );
  if (effect.type === "pp") return <li>{t("events.effects.pp", { amount: effect.amount })}</li>;
  if (effect.type === "leagueHealth")
    return <li>{t(effect.steps > 0 ? "events.effects.healthUp" : "events.effects.healthDown")}</li>;
  if (effect.type === "clubRating")
    return <li>{t(`events.effects.clubRating_${effect.target}`, { count: effect.steps })}</li>;
  if (effect.type === "derbyStoke") return <li>{t("events.effects.derbyStoke")}</li>;
  if (effect.type === "starBack") return <li>{t("events.effects.starBack")}</li>;
  if (effect.type === "starSign") return <li>{t("events.effects.starSign")}</li>;
  return (
    <li className={effect.type === "hardcoreDemotion" ? "event-tradeoff" : undefined}>
      {t(`events.effects.${effect.type === "fanShift" ? effect.target : effect.type}`, {
        share: effect.share,
      })}
    </li>
  );
}

/** Titles, bodies and named facts for event cards, read from the current snapshot. */
export function useEventText() {
  const { t, i18n } = useTranslation();
  const { snapshot, names } = useGameStore();
  const termVars = useTermVars(snapshot?.identity.terms ?? PLAIN_TERMS);
  const words = useTraditionWords(snapshot);
  const awards = useAwardWords(snapshot);
  const dealPartnerName = useDealPartnerName(names, snapshot?.identity.sportName ?? "");
  if (!snapshot) return null;
  const country = (id: string) => names?.countries[id] ?? id;
  const club = (id: number | undefined) => {
    const found = snapshot.flagship.clubs.find((c) => c.id === id);
    return found ? t("flagship.club", { place: found.place, nickname: found.nickname }) : "";
  };
  // A flagship player, or a standout still in their home league (GDD v1.37).
  const player = (id: number | null | undefined) =>
    snapshot.flagship.players.find((p) => p.id === id)?.name ??
    snapshot.countries.flatMap((c) => c.standouts).find((p) => p.playerId === id)?.name ??
    "";
  // The Hall of Fame's class card (GDD v1.31) names the class's year and size.
  const hallText = (event: EventRecord) => {
    const hall = event.facts.hall;
    if (!hall) return {};
    const first = snapshot.hallOfFame.inductees.find((i) => hall.inducteeIds.includes(i.id));
    return { year: first?.year ?? 0, count: hall.inducteeIds.length };
  };
  // A rival's countermove at the seat (GDD v1.34) names the move, its end and the TV cut.
  // A legacy goal met (GDD v1.38): the card's words are the goal's own.
  const legacyText = (event: EventRecord) => {
    const told = event.facts.legacy;
    if (!told) return hallText(event);
    const goal = snapshot.legacy.goals.find((entry) => entry.goalId === told.goalId);
    return {
      sport: snapshot.identity.sportName,
      rival: names?.sports[snapshot.legacy.heartlandSportId] ?? "",
      count: goal?.need ?? 0,
      context: told.goalId,
    };
  };
  // A World Championship story (GDD v1.37) names the tournament, its host and the opponent.
  const championshipText = (event: EventRecord) => {
    const cup = event.facts.championship;
    if (!cup) return legacyText(event);
    const lostFinal = !cup.champion && cup.roundsWon === cup.rounds - 1;
    return {
      name: snapshot.worldChampionship.founded?.name ?? "",
      host: country(cup.hostId),
      opponent: country(cup.opponentId ?? ""),
      round: cup.roundsWon + 1,
      rounds: cup.rounds,
      year: cup.year,
      context: cup.champion
        ? cup.hostId === event.countryId
          ? "host"
          : undefined
        : lostFinal
          ? "final"
          : undefined,
    };
  };
  const countermoveText = (event: EventRecord) => {
    const move = event.facts.countermove;
    if (!move) return championshipText(event);
    return {
      year: move.endYear,
      cut: snapshot.flagship.deals.tvLockout?.cut ?? 0.5,
      context: move.move,
    };
  };
  // Venue cards (GDD v1.30) name the level, and for a record crowd its size and ground.
  const venueText = (event: EventRecord) => {
    const venue = event.facts.venue;
    if (!venue) return countermoveText(event);
    const ground = snapshot.flagship.clubs.find((c) => c.id === venue.clubId)?.ground ?? "";
    return {
      level: venue.level,
      crowd: venue.matchCrowd ?? venue.crowd ?? 0,
      ground,
      club: club(venue.clubId ?? undefined),
    };
  };
  // Deal cards (GDD v1.28) name the partner, the slot and what a breach cost.
  const dealText = (event: EventRecord) => {
    const deal = event.facts.deal;
    if (!deal) return venueText(event);
    return {
      partner: dealPartnerName(deal.partnerId),
      slot: t(`deals.slots.${deal.slot}`),
      penalty: deal.penalty,
      seasons: snapshot.flagship.deals.breach.shunSeasons,
      // A walk is told by its clause; a breach by its demand and whether a penalty was paid.
      context:
        event.templateId === "deal-walked"
          ? (deal.demand ?? undefined)
          : deal.demand
            ? `${deal.demand}${deal.penalty > 0 ? "" : "Free"}`
            : undefined,
    };
  };
  // Tradition cards (GDD v1.22) name the tradition and the facts that made it.
  const traditionText = (event: EventRecord) => {
    const told = event.facts.tradition;
    if (!told) return dealText(event);
    const tradition = snapshot.culture.traditions.find((item) => item.id === told?.traditionId);
    if (!told || !tradition) return {};
    // Every birth card, including the minor national name and the curse (GDD v1.35).
    const born = event.templateId.endsWith("-born");
    // The first chant is the anthem (GDD v1.31).
    const anthem =
      tradition.type === "chant" &&
      snapshot.culture.traditions.find((t) => t.type === "chant")?.id === tradition.id;
    return {
      ...termVars({
        seasons: born
          ? snapshot.culture.derby.seasons
          : tradition.type === "redemption"
            ? cursedSeasons(tradition)
            : tradition.seasons.length,
      }),
      name: words.name(tradition),
      club: club(tradition.clubIds[0]),
      clubA: club(tradition.clubIds[0]),
      clubB: club(tradition.clubIds[1]),
      ground: snapshot.flagship.clubs.find((c) => c.id === tradition.clubIds[0])?.ground ?? "",
      player: player(tradition.playerId),
      country: country(tradition.countryId),
      count: tradition.seasons.length,
      cursed: cursedSeasons(tradition),
      span: snapshot.culture.derby.seasons,
      // A chant's first follower abroad is the card's own country.
      abroad: country(event.countryId),
      context: born
        ? anthem
          ? "anthem"
          : tradition.type
        : event.templateId === "chant-spread"
          ? undefined
          : (tradition.lost?.reason ?? "faded"),
    };
  };
  // Star cards (GDD v1.16) name the player and clubs from the record.
  const starText = (event: EventRecord) => {
    const star = event.facts.star;
    if (!star) return traditionText(event);
    return {
      player: player(star.playerId),
      // The card's country: a player from abroad's home (GDD v1.37).
      country: country(event.countryId),
      club: club(star.clubId),
      otherClub: club(star.otherClubId ?? undefined),
      candidate: player(star.candidateId),
      season: star.season,
      count: star.scores,
      matches: star.matches,
      seasons: star.seasons,
      share: star.clubScores > 0 ? star.scores / star.clubScores : 0,
      // The backable breakout names the open backing slots (GDD v1.35).
      free: Math.max(0, snapshot.flagship.backing.slots - snapshot.flagship.backing.used),
      slots: snapshot.flagship.backing.slots,
      context: star.candidateId === null ? undefined : "mentor",
    };
  };
  // Season cards (GDD v1.15) name the real clubs from the record; their text varies by format.
  const seasonText = (event: EventRecord) => {
    const season = event.facts.season;
    if (!season) return starText(event);
    const winner = snapshot.flagship.players.find((p) => p.id === season.playerOfSeasonId);
    return {
      champion: club(season.championId),
      runnerUp: club(season.runnerUpId),
      // The season's Player of the Season (GDD v1.33).
      player: winner?.name ?? "",
      club: club(winner?.clubId),
      season: season.season,
      streak: season.streak,
      count: season.pointsGap,
      context:
        season.finalMargin === null
          ? "european"
          : season.finalMargin === 0
            ? "deciders"
            : "american",
    };
  };
  // The sport's own nouns (GDD v1.18), in the number the card's counts call for.
  const textVars = (event: EventRecord) => {
    const values: Record<string, unknown> = seasonText(event);
    const number = (key: string) =>
      typeof values[key] === "number" ? (values[key] as number) : undefined;
    return {
      ...termVars({ score: number("count"), match: number("matches"), seasons: number("seasons") }),
      ...awards,
      ...values,
    };
  };
  // Headline variety (GDD v1.33): a card may carry title_v1, title_v2…; a stable hash of the event
  // picks one, so a card never changes on reload. A title for the card's context wins.
  const title = (event: EventRecord) => {
    const vars = {
      country: country(event.countryId),
      rival: names?.sports[event.facts.rivalId ?? ""] ?? "",
      ...textVars(event),
    };
    const base = `events.cards.${event.templateId}`;
    const context = (vars as { context?: string }).context;
    if (context && i18n.exists(`${base}.title_${context}`)) return t(`${base}.title`, vars);
    let variants = 1;
    while (i18n.exists(`${base}.title_v${variants}`)) variants += 1;
    const pick = variantOf(event.id, variants);
    return t(pick === 0 ? `${base}.title` : `${base}.title_v${pick}`, vars);
  };
  const body = (event: EventRecord) =>
    t(`events.cards.${event.templateId}.body`, {
      country: country(event.countryId),
      fans: event.facts.casual + event.facts.hardcore,
      hardcore: event.facts.hardcore,
      rival: names?.sports[event.facts.rivalId ?? ""] ?? "",
      tournament: names?.tournaments[event.facts.rivalId ?? ""] ?? "",
      health: event.facts.health ? t(`league.healthLevels.${event.facts.health}`) : "",
      tier: event.facts.leagueTier ? t(`league.tiers.${event.facts.leagueTier}`) : "",
      ...textVars(event),
    });
  /** A Hall of Fame class's inductees, one line each, from the facts recorded at induction. */
  const hallLines = (event: EventRecord) => {
    const hall = event.facts.hall;
    if (!hall) return [];
    return snapshot.hallOfFame.inductees
      .filter((inductee) => hall.inducteeIds.includes(inductee.id))
      .map((inductee) => {
        const facts = inductee.facts;
        // A player who was never a star got in on seasons as top scorer, or on a long career
        // alone (GDD v1.35).
        const star = facts.starSeasons > 0;
        const seasons = star ? facts.starSeasons : facts.topScorerSeasons;
        const line = star
          ? facts.record
            ? "hall.line_record"
            : "hall.line"
          : facts.topScorerSeasons > 0
            ? "hall.line_noStar"
            : "hall.line_career";
        return t(line, {
          ...termVars({ score: facts.scores, seasons }),
          player: player(inductee.playerId),
          club: club(inductee.clubId),
          count: facts.scores,
          seasons,
          titles: facts.titles,
          rank: facts.allTimeRank,
        });
      })
      .concat(nearMissLine(hall.nearMissId));
  };
  /** The class's near-miss (GDD v1.35): left out, passed over again, or off the ballot for good. */
  const nearMissLine = (playerId: number | null): string[] => {
    if (playerId === null) return [];
    const entry = snapshot.hallOfFame.ballot.find((b) => b.playerId === playerId);
    const vars = {
      player: player(playerId),
      points: entry?.points ?? 0,
      bar: snapshot.hallOfFame.bar,
    };
    if (!entry) return [t("hall.nearMissLast", vars)];
    return [t(entry.passedOver > 1 ? "hall.nearMissAgain" : "hall.nearMiss", vars)];
  };
  /**
   * The lines under a card's body: a season's leading player and top scorer, where the record
   * names them, or a Hall of Fame class's inductees.
   */
  const factLines = (event: EventRecord) => {
    const season = event.facts.season;
    const lines: string[] = hallLines(event);
    if (season?.championPlayerId != null)
      lines.push(
        t("events.seasonLeader", {
          player: player(season.championPlayerId),
          champion: club(season.championId),
        }),
      );
    if (season?.topScorerId != null)
      lines.push(
        t("events.seasonScorer", {
          ...termVars({ score: season.topScorerScores ?? 0 }),
          crown: awards.crown,
          player: player(season.topScorerId),
          count: season.topScorerScores ?? 0,
        }),
      );
    if (season?.playerOfSeasonId != null) {
      const winner = snapshot.flagship.players.find((p) => p.id === season.playerOfSeasonId);
      lines.push(
        t("awards.winner", {
          award: awards.award,
          player: winner?.name ?? "",
          club: club(winner?.clubId),
        }),
      );
    }
    return lines;
  };
  /**
   * When a card's fact happened. Its quarter counts the quarters simulated by then, so the fact
   * fell in the quarter before (the campaign's first quarter for facts recorded at the start).
   */
  const dateOf = (event: EventRecord) => {
    const index = Math.max(0, event.quarter - 1);
    return t("turn.date", {
      quarter: (index % 4) + 1,
      year: snapshot.year - Math.floor(snapshot.quarter / 4) + Math.floor(index / 4),
    });
  };
  return { country, club, player, title, body, factLines, dateOf, termVars };
}
