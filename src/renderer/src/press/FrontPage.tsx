import { useTranslation } from "react-i18next";
import type { TurnSnapshot } from "../../../sim";
import { useAwardWords } from "../awards/words";
import { useTraditionWords } from "../culture/traditions";
import { useTermVars } from "../identity/terms";
import { useOutletName } from "./outlet";
import "./press.css";

// The season's front page (GDD v1.33): the offseason's season in review as the seat outlet's front
// page. The lead story is the champion, headlined by the rare story the season tells; below it,
// short items from the season's record. Every line is a recorded fact. Laid out to film in 9x16.
export function FrontPage({
  snapshot,
  clubName,
}: {
  snapshot: TurnSnapshot;
  clubName: (id: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const flagship = snapshot.flagship;
  const nouns = useTermVars(snapshot.identity.terms);
  const awards = useAwardWords(snapshot);
  const words = useTraditionWords(snapshot);
  const outletName = useOutletName(snapshot.identity.sportName);
  const last = flagship.recentSeasons[0];
  const page = flagship.frontPage;
  if (!last || !page)
    return <p className="flagship-empty">{t("flagship.champions.none", nouns())}</p>;
  const player = (id: number | null) => flagship.players.find((p) => p.id === id)?.name ?? "";
  const playerClub = (id: number | null) =>
    clubName(flagship.players.find((p) => p.id === id)?.clubId ?? 0);
  const list = (names: string[]) => new Intl.ListFormat(i18n.language).format(names);
  let streak = 0;
  for (const season of flagship.recentSeasons) {
    if (season.championId !== last.championId) break;
    streak += 1;
  }
  const final = last.playoffs.at(-1);
  const traditions = snapshot.culture.traditions.filter((tr) => page.traditionIds.includes(tr.id));
  const inductees = snapshot.hallOfFame.inductees.filter((i) => page.inducteeIds.includes(i.id));
  const legends = inductees.filter((i) => i.playerId !== null).map((i) => player(i.playerId));
  const items: { key: string; text: string; testId?: string }[] = [];
  if (last.playerOfSeason !== null)
    items.push({
      key: "award",
      testId: "offseason-award",
      text: t("awards.winner", {
        award: awards.award,
        player: player(last.playerOfSeason),
        club: playerClub(last.playerOfSeason),
      }),
    });
  if (last.topScorer)
    items.push({
      key: "crown",
      text: t("events.seasonScorer", {
        ...nouns({ score: last.topScorer.scores }),
        crown: awards.crown,
        player: player(last.topScorer.playerId),
        count: last.topScorer.scores,
      }),
    });
  if (last.newStarId !== null)
    items.push({
      key: "star",
      testId: "offseason-new-star",
      text: t("offseason.review.newStar", { player: player(last.newStarId) }),
    });
  if (last.recordCrowd && last.crowd !== null)
    items.push({
      key: "crowd",
      text: t("press.items.recordCrowd", { ...nouns(), crowd: last.crowd }),
    });
  if (traditions.length > 0)
    items.push({
      key: "traditions",
      text: t("press.items.traditions", {
        ...nouns(),
        count: traditions.length,
        names: list(traditions.map((tr) => words.name(tr))),
      }),
    });
  if (legends.length > 0)
    items.push({ key: "hall", text: t("press.items.hall", { names: list(legends) }) });
  else if (inductees.length > 0) items.push({ key: "hall", text: t("press.items.hallMoment") });

  return (
    <article className="front-page" data-testid="front-page" data-story={page.story ?? "none"}>
      <header className="front-masthead">
        <strong>{outletName(page.outlet)}</strong>
        <small>{t("press.dateline", { ...nouns(), season: last.season, year: last.year })}</small>
      </header>
      <h3 className="front-headline offseason-champion" data-testid="offseason-champion">
        {t(`press.lead.${page.story ?? "default"}`, {
          ...nouns(),
          club: clubName(last.championId),
          season: last.season,
          count: streak,
        })}
      </h3>
      <p className="front-deck">
        {final
          ? t("flagship.champions.final", {
              home: clubName(final.homeId),
              away: clubName(final.awayId),
              homeScore: final.homeScore,
              awayScore: final.awayScore,
            })
          : t("flagship.champions.runnerUp", { club: clubName(last.runnerUpId) })}
      </p>
      {items.length > 0 && (
        <ul className="front-items">
          {items.map((item) => (
            <li key={item.key} data-testid={item.testId}>
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
