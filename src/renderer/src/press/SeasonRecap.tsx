import { useTranslation } from "react-i18next";
import type { TurnSnapshot } from "../../../sim";
import { useAwardWords } from "../awards/words";
import { useTraditionWords } from "../culture/traditions";
import { useTermVars } from "../identity/terms";
import "./press.css";

// The season in review (GDD v1.34): a stats recap on the offseason screen, not a second front page
// (the champion's moment already had its headline). The champion and the final, the table's top
// four, the playoff path, the awards, and the records and culture the season made. Every line is a
// recorded fact.
export function SeasonRecap({
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
  const last = flagship.recentSeasons[0];
  const page = flagship.frontPage;
  if (!last || !page)
    return <p className="flagship-empty">{t("flagship.champions.none", nouns())}</p>;
  const player = (id: number | null) => flagship.players.find((p) => p.id === id)?.name ?? "";
  const playerClub = (id: number | null) =>
    clubName(flagship.players.find((p) => p.id === id)?.clubId ?? 0);
  const list = (names: string[]) => new Intl.ListFormat(i18n.language).format(names);
  const final = last.playoffs.at(-1);
  const path = last.playoffs.slice(0, -1);
  const traditions = snapshot.culture.traditions.filter((tr) => page.traditionIds.includes(tr.id));
  const inductees = snapshot.hallOfFame.inductees.filter((i) => page.inducteeIds.includes(i.id));
  const legends = inductees.filter((i) => i.playerId !== null).map((i) => player(i.playerId));
  const result = (match: (typeof last.playoffs)[number], key = "flagship.champions.final") =>
    t(key, {
      home: clubName(match.homeId),
      away: clubName(match.awayId),
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    });
  const culture: string[] = [];
  if (last.recordCrowd && last.matchCrowd !== null)
    culture.push(t("press.items.recordCrowd", { ...nouns(), crowd: last.matchCrowd }));
  if (traditions.length > 0)
    culture.push(
      t("press.items.traditions", {
        ...nouns(),
        count: traditions.length,
        names: list(traditions.map((tr) => words.name(tr))),
      }),
    );
  if (legends.length > 0) culture.push(t("press.items.hall", { names: list(legends) }));
  else if (inductees.length > 0) culture.push(t("press.items.hallMoment"));

  return (
    <article className="season-recap" data-testid="season-recap" data-story={page.story ?? "none"}>
      <header className="recap-header">
        <small>{t("press.recap", { ...nouns(), season: last.season, year: last.year })}</small>
        <h3 className="offseason-champion" data-testid="offseason-champion">
          {t("offseason.review.champion", {
            ...nouns(),
            season: last.season,
            club: clubName(last.championId),
          })}
        </h3>
        <p>
          {final
            ? result(final)
            : t("flagship.champions.runnerUp", { club: clubName(last.runnerUpId) })}
        </p>
      </header>
      <div className="recap-grid">
        <section>
          <h4>{t("press.recapTable")}</h4>
          <ol className="recap-table">
            {flagship.table.slice(0, 4).map((row) => (
              <li key={row.clubId}>
                <span>{clubName(row.clubId)}</span>
                <b>{t("press.recapPoints", { count: row.points })}</b>
              </li>
            ))}
          </ol>
        </section>
        {path.length > 0 && (
          <section>
            <h4>{t("press.recapPlayoffs")}</h4>
            <ul>
              {path.map((match) => (
                <li key={`${match.homeId}-${match.awayId}`}>{result(match, "press.recapMatch")}</li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h4>{t("press.recapAwards")}</h4>
          <ul>
            {last.playerOfSeason !== null && (
              <li data-testid="offseason-award">
                {t("awards.winner", {
                  award: awards.award,
                  player: player(last.playerOfSeason),
                  club: playerClub(last.playerOfSeason),
                })}
              </li>
            )}
            {last.topScorer && (
              <li>
                {t("events.seasonScorer", {
                  ...nouns({ score: last.topScorer.scores }),
                  crown: awards.crown,
                  player: player(last.topScorer.playerId),
                  count: last.topScorer.scores,
                })}
              </li>
            )}
            {last.newStarId !== null && (
              <li data-testid="offseason-new-star">
                {t("offseason.review.newStar", { player: player(last.newStarId) })}
              </li>
            )}
          </ul>
        </section>
        {culture.length > 0 && (
          <section>
            <h4>{t("press.recapCulture")}</h4>
            <ul>
              {culture.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
