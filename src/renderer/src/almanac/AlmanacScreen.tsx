import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { InducteeFacts, InducteeSnapshot, TurnSnapshot } from "../../../sim";
import { useAwardWords } from "../awards/words";
import { Emblem } from "../identity/Emblem";
import { useTermVars } from "../identity/terms";
import "./almanac.css";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  active: boolean;
  /** Shows a country on the world map (a plaque's home). */
  onCountry: (countryId: string) => void;
}

// The Almanac (GDD v1.31, v1.35): what the sport remembers. The Hall of Fame's players, the
// ballot for the next class, the sport's history (its firsts) and the records it is chosen from.
// Every line is read from retained records in the snapshot; points come from the simulation.
// Later it holds other kept history (all-time leaderboards, the heatmap timelapse).
export function AlmanacScreen({ snapshot, names, active, onCountry }: Props) {
  const { t } = useTranslation();
  const hall = snapshot.hallOfFame;
  const nouns = useTermVars(snapshot.identity.terms);
  const awards = useAwardWords(snapshot);
  const country = (id: string) => names.countries[id] ?? id;
  const clubs = new Map(snapshot.flagship.clubs.map((club) => [club.id, club]));
  const club = (id: number | null) => {
    const found = id === null ? undefined : clubs.get(id);
    return found ? t("flagship.club", { place: found.place, nickname: found.nickname }) : "";
  };
  const player = (id: number | null) =>
    snapshot.flagship.players.find((p) => p.id === id)?.name ?? "";
  const players = [...hall.inductees].reverse();
  const { champions, scorers, crowd, mostAwards } = hall.records;

  return (
    <section
      className="almanac-screen"
      hidden={!active}
      aria-labelledby="almanac-title"
      data-testid="almanac-screen"
      data-inductees={hall.inductees.length}
    >
      <div className="almanac-heading">
        <Emblem
          {...snapshot.identity.emblem}
          primary={snapshot.identity.colors.primary}
          secondary={snapshot.identity.colors.secondary}
          size={56}
          label={t("flagship.foundingEmblem", { sport: snapshot.identity.sportName })}
        />
        <div className="almanac-title">
          <span className="eyebrow">{t("almanac.eyebrow")}</span>
          <h1 id="almanac-title">{t("almanac.title", { sport: snapshot.identity.sportName })}</h1>
        </div>
        <p className="almanac-status">
          {t("almanac.status", {
            count: hall.inductees.length,
            seasons: champions.length,
            seasonsNoun: nouns({ seasons: champions.length }).seasonsNoun,
          })}
        </p>
      </div>
      <div className="almanac-layout">
        <div className="almanac-main">
          <section className="almanac-card" aria-labelledby="almanac-players-heading">
            <h2 id="almanac-players-heading">{t("almanac.players.heading")}</h2>
            {players.length === 0 ? (
              <p className="almanac-empty">{t("almanac.players.empty")}</p>
            ) : (
              <ul className="plaques" data-testid="hall-players">
                {players.map((inductee) => (
                  <Plaque
                    key={inductee.id}
                    inductee={inductee}
                    name={player(inductee.playerId)}
                    club={club(inductee.clubId)}
                    home={country(inductee.countryId)}
                    nouns={nouns}
                    onHome={() => onCountry(inductee.countryId)}
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="almanac-card" aria-labelledby="almanac-history-heading">
            <h2 id="almanac-history-heading">
              {t("almanac.history.heading", { sport: snapshot.identity.sportName })}
            </h2>
            {hall.history.length === 0 ? (
              <p className="almanac-empty">{t("almanac.history.empty")}</p>
            ) : (
              <ol className="moments-wing" data-testid="almanac-history">
                {hall.history.map((entry) => (
                  <li key={entry.first}>
                    <span className="roll-year">{entry.year}</span>
                    <span>
                      {t(`hall.firsts.${entry.first}`, {
                        year: entry.year,
                        player: player(entry.playerId),
                        club: club(entry.clubId),
                        country: country(entry.countryId),
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <div className="almanac-side">
          <section className="almanac-card" aria-labelledby="almanac-ballot-heading">
            <h2 id="almanac-ballot-heading">{t("almanac.ballot.heading")}</h2>
            {hall.ballot.length === 0 ? (
              <p className="almanac-empty">{t("almanac.ballot.empty")}</p>
            ) : (
              <ul className="waiting" data-testid="hall-ballot">
                {hall.ballot.map((entry) => (
                  <li
                    key={entry.playerId}
                    className={entry.points >= hall.bar ? "clears" : undefined}
                  >
                    <strong>{player(entry.playerId)}</strong>
                    <small>
                      {t("almanac.ballot.points", {
                        club: club(entry.clubId),
                        points: entry.points,
                        bar: hall.bar,
                      })}
                    </small>
                    <small>
                      {entry.eligibleSeason > snapshot.flagship.season - 1
                        ? t("almanac.ballot.from", { ...nouns(), season: entry.eligibleSeason })
                        : t("almanac.ballot.left", { count: entry.classesLeft })}
                    </small>
                  </li>
                ))}
              </ul>
            )}
            <p className="almanac-note">{t("almanac.ballot.note")}</p>
          </section>
          <section className="almanac-card" aria-labelledby="almanac-records-heading">
            <h2 id="almanac-records-heading">{t("almanac.records.heading")}</h2>
            <p className="record-crowd">
              {crowd
                ? t("almanac.records.crowd", {
                    crowd: crowd.crowd,
                    year: crowd.year,
                    country: country(crowd.countryId),
                  })
                : t("almanac.records.noCrowd")}
            </p>
            <h3>{t("almanac.records.scorers", { scoresNoun: nouns().scoresNoun })}</h3>
            {scorers.length === 0 ? (
              <p className="almanac-empty">{t("almanac.records.noScorers")}</p>
            ) : (
              <ol className="scorers" data-testid="almanac-scorers">
                {scorers.map((row) => (
                  <li key={row.playerId} className={row.retired ? "retired" : undefined}>
                    <span>
                      {player(row.playerId)}
                      <small>{club(row.clubId)}</small>
                    </span>
                    <b>{t("format.count", { value: row.scores })}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {mostAwards.length > 0 && (
            <section className="almanac-card" aria-labelledby="almanac-awards-heading">
              <h2 id="almanac-awards-heading">
                {t("almanac.records.mostAwards", { award: awards.award })}
              </h2>
              <ol className="scorers" data-testid="almanac-most-awards">
                {mostAwards.map((row) => (
                  <li key={row.playerId}>
                    <span>
                      {player(row.playerId)}
                      <small>{club(row.clubId)}</small>
                    </span>
                    <b>{t("format.count", { value: row.awards })}</b>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="almanac-card" aria-labelledby="almanac-roll-heading">
            <h2 id="almanac-roll-heading">{t("almanac.roll.heading")}</h2>
            {champions.length === 0 ? (
              <p className="almanac-empty">{t("almanac.roll.empty")}</p>
            ) : (
              <ol className="roll" data-testid="almanac-roll">
                {champions.map((season) => (
                  <li key={season.season}>
                    <span className="roll-year">{season.year}</span>
                    <span>
                      <strong>{club(season.championId)}</strong>
                      {season.topScorer && (
                        <small>
                          {t("almanac.roll.scorer", {
                            ...nouns({ score: season.topScorer.scores }),
                            player: player(season.topScorer.playerId),
                            count: season.topScorer.scores,
                          })}
                        </small>
                      )}
                      {season.playerOfSeason !== null && (
                        <small>
                          {t("almanac.roll.award", {
                            award: awards.award,
                            player: player(season.playerOfSeason),
                          })}
                        </small>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

/** One player's plaque: name, club, class, the facts that put them there, and their home. */
function Plaque({
  inductee,
  name,
  club,
  home,
  nouns,
  onHome,
}: {
  inductee: InducteeSnapshot;
  name: string;
  club: string;
  home: string;
  nouns: ReturnType<typeof useTermVars>;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const facts: InducteeFacts = inductee.facts;
  const stats: [string, number][] = [
    [t("almanac.stats.starSeasons"), facts.starSeasons],
    [t("almanac.stats.titles"), facts.titles],
    [t("almanac.stats.topScorer"), facts.topScorerSeasons],
    [t("almanac.stats.awards"), facts.awards],
    [t("almanac.stats.scores", { scoresNoun: nouns().scoresNoun }), facts.scores],
  ];
  return (
    <li className="plaque" data-player={inductee.playerId}>
      <span className="plaque-class">{t("almanac.classOf", { year: inductee.year })}</span>
      <h3>{name}</h3>
      <p>{club}</p>
      <dl>
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{t("format.count", { value })}</dd>
          </div>
        ))}
      </dl>
      {facts.record && <p className="plaque-record">{t("almanac.recordHolder")}</p>}
      <button type="button" className="plaque-home" onClick={onHome}>
        {t("almanac.home", { country: home })}
      </button>
    </li>
  );
}
