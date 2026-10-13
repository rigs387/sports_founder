import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { TurnSnapshot } from "../../../sim";
import "../almanac/almanac.css";
import "./championship.css";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  active: boolean;
  /** Where "on with the season" leads: the offseason screen while it is open, else the map. */
  onContinue: () => void;
  onCountry: (id: string) => void;
}

// The World Championship's own page (GDD v1.37): it opens itself when a tournament has been
// played, as the offseason does, and tells it in order: the champion, the bracket round by round,
// then the draw. Every past tournament is kept and can be opened again.
export function ChampionshipScreen({ snapshot, names, active, onContinue, onCountry }: Props) {
  const { t } = useTranslation();
  const championship = snapshot.worldChampionship;
  const tournaments = championship.tournaments;
  const [shown, setShown] = useState(tournaments.length - 1);
  // A new tournament takes the page.
  useEffect(() => setShown(tournaments.length - 1), [tournaments.length]);
  const country = (id: string) => names.countries[id] ?? id;
  const tournament = tournaments[shown] ?? tournaments.at(-1);
  const seedOf = (id: string) => tournament?.teams.find((team) => team.countryId === id)?.seed;
  const final = tournament?.rounds.at(-1)?.[0];
  const runnerUp = final ? (final.winner === final.a ? final.b : final.a) : "";
  const squad = tournament?.teams.find((team) => team.countryId === tournament.championId);

  return (
    <section
      className="almanac-screen championship-screen"
      hidden={!active}
      aria-labelledby="championship-title"
      data-testid="championship-screen"
      data-tournaments={tournaments.length}
    >
      <div className="almanac-heading">
        <div className="almanac-title">
          <span className="eyebrow">{t("championship.page.eyebrow")}</span>
          <h1 id="championship-title">{championship.founded?.name ?? t("championship.heading")}</h1>
        </div>
        <button
          type="button"
          className="action-button"
          data-testid="championship-continue"
          onClick={onContinue}
        >
          {t(snapshot.offseasonOpen ? "championship.page.toOffseason" : "championship.page.toMap")}
        </button>
      </div>
      {!tournament ? (
        <div className="almanac-card">
          <p className="almanac-empty" data-testid="championship-waiting">
            {championship.nextYear === null
              ? t("championship.page.unfounded")
              : championship.hostId === null
                ? t("championship.page.waiting", { year: championship.nextYear })
                : t("championship.page.waitingHost", {
                    year: championship.nextYear,
                    country: country(championship.hostId),
                  })}
          </p>
        </div>
      ) : (
        <>
          {tournaments.length > 1 && (
            <div
              className="championship-years"
              role="tablist"
              aria-label={t("championship.page.past")}
            >
              {tournaments.map((entry, index) => (
                <button
                  type="button"
                  role="tab"
                  key={entry.season}
                  aria-selected={entry.season === tournament.season}
                  className={entry.season === tournament.season ? "active" : undefined}
                  onClick={() => setShown(index)}
                >
                  {entry.year}
                </button>
              ))}
            </div>
          )}
          <div className="championship-champion" data-testid="championship-champion">
            <span className="eyebrow">
              {t("championship.page.edition", {
                year: tournament.year,
                host: country(tournament.hostId),
                count: tournament.teams.length,
              })}
            </span>
            <h2>
              <button type="button" onClick={() => onCountry(tournament.championId)}>
                {t("championship.page.champions", { country: country(tournament.championId) })}
              </button>
            </h2>
            <p>
              {t("championship.page.final", {
                country: country(tournament.championId),
                opponent: country(runnerUp),
                seed: seedOf(tournament.championId),
              })}
            </p>
            {squad && squad.players.length > 0 && (
              <p className="championship-squad">
                {t("championship.page.squad", { names: squad.players.map((p) => p.name) })}
              </p>
            )}
          </div>
          <div className="almanac-card">
            <h2>{t("championship.page.bracket")}</h2>
            <div className="championship-bracket" data-testid="championship-bracket">
              {tournament.rounds.map((round, index) => (
                // A tournament's rounds never change: the index is the round.
                // biome-ignore lint/suspicious/noArrayIndexKey: rounds are fixed and ordered
                <section key={index} aria-label={t(roundKey(round.length))}>
                  <h3>{t(roundKey(round.length))}</h3>
                  <ul>
                    {round.map((match) => (
                      <li key={`${match.a}-${match.b}`}>
                        {[match.a, match.b].map((id) => (
                          <span key={id} className={id === match.winner ? "won" : "lost"}>
                            <small>{seedOf(id)}</small> {country(id)}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
          <div className="almanac-card">
            <h2>{t("championship.page.draw")}</h2>
            <ol className="championship-draw" data-testid="championship-draw">
              {tournament.teams.map((team) => (
                <li key={team.countryId}>
                  <span className="roll-year">{team.seed}</span>
                  <span>
                    <strong>
                      {country(team.countryId)}
                      {team.countryId === tournament.hostId ? t("championship.page.hostMark") : ""}
                    </strong>
                    <small>
                      {team.players.length === 0
                        ? t("almanac.teams.noPlayers")
                        : t("almanac.teams.players", { names: team.players.map((p) => p.name) })}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

/** A round's name by how many matches it has. */
function roundKey(matches: number): string {
  if (matches === 1) return "championship.page.rounds.final";
  if (matches === 2) return "championship.page.rounds.semi";
  if (matches === 4) return "championship.page.rounds.quarter";
  return matches === 8 ? "championship.page.rounds.sixteen" : "championship.page.rounds.first";
}
