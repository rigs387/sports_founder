import { useTranslation } from "react-i18next";
import type { EventEffect } from "../../../content";
import type { EventRecord } from "../../../sim";
import { useTraditionWords } from "../culture/traditions";
import { useDealPartnerName } from "../deals/partners";
import { PLAIN_TERMS, useTermVars } from "../identity/terms";
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
  const { t } = useTranslation();
  const { snapshot, names } = useGameStore();
  const termVars = useTermVars(snapshot?.identity.terms ?? PLAIN_TERMS);
  const words = useTraditionWords(snapshot);
  const dealPartnerName = useDealPartnerName(names, snapshot?.identity.sportName ?? "");
  if (!snapshot) return null;
  const country = (id: string) => names?.countries[id] ?? id;
  const club = (id: number | undefined) => {
    const found = snapshot.flagship.clubs.find((c) => c.id === id);
    return found ? t("flagship.club", { place: found.place, nickname: found.nickname }) : "";
  };
  const player = (id: number | null | undefined) =>
    snapshot.flagship.players.find((p) => p.id === id)?.name ?? "";
  // Deal cards (GDD v1.28) name the partner, the slot and what a breach cost.
  const dealText = (event: EventRecord) => {
    const deal = event.facts.deal;
    if (!deal) return {};
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
    const born = event.templateId === "tradition-born";
    return {
      ...termVars({ seasons: born ? snapshot.culture.derby.seasons : tradition.seasons.length }),
      name: words.name(tradition),
      club: club(tradition.clubIds[0]),
      clubA: club(tradition.clubIds[0]),
      clubB: club(tradition.clubIds[1]),
      ground: snapshot.flagship.clubs.find((c) => c.id === tradition.clubIds[0])?.ground ?? "",
      player: player(tradition.playerId),
      country: country(tradition.countryId),
      count: tradition.seasons.length,
      span: snapshot.culture.derby.seasons,
      context: born ? tradition.type : (tradition.lost?.reason ?? "faded"),
    };
  };
  // Star cards (GDD v1.16) name the player and clubs from the record.
  const starText = (event: EventRecord) => {
    const star = event.facts.star;
    if (!star) return traditionText(event);
    return {
      player: player(star.playerId),
      club: club(star.clubId),
      otherClub: club(star.otherClubId ?? undefined),
      candidate: player(star.candidateId),
      season: star.season,
      count: star.scores,
      matches: star.matches,
      seasons: star.seasons,
      share: star.clubScores > 0 ? star.scores / star.clubScores : 0,
      context: star.candidateId === null ? undefined : "mentor",
    };
  };
  // Season cards (GDD v1.15) name the real clubs from the record; their text varies by format.
  const seasonText = (event: EventRecord) => {
    const season = event.facts.season;
    if (!season) return starText(event);
    return {
      champion: club(season.championId),
      runnerUp: club(season.runnerUpId),
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
      ...values,
    };
  };
  const title = (event: EventRecord) =>
    t(`events.cards.${event.templateId}.title`, {
      country: country(event.countryId),
      rival: names?.sports[event.facts.rivalId ?? ""] ?? "",
      ...textVars(event),
    });
  const body = (event: EventRecord) =>
    t(`events.cards.${event.templateId}.body`, {
      country: country(event.countryId),
      fans: event.facts.casual + event.facts.hardcore,
      hardcore: event.facts.hardcore,
      rival: names?.sports[event.facts.rivalId ?? ""] ?? "",
      tournament: names?.tournaments[event.facts.rivalId ?? ""] ?? "",
      health: event.facts.health ? t(`league.health.${event.facts.health}`) : "",
      tier: event.facts.leagueTier ? t(`league.tiers.${event.facts.leagueTier}`) : "",
      ...textVars(event),
    });
  /** The season's leading player and top scorer, where the record names them. */
  const seasonLines = (event: EventRecord) => {
    const season = event.facts.season;
    const lines: string[] = [];
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
          player: player(season.topScorerId),
          count: season.topScorerScores ?? 0,
        }),
      );
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
  return { country, club, player, title, body, seasonLines, dateOf, termVars };
}
