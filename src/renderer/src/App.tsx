import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AXIS_IDS } from "../../content/genome-axes";
import { useGameStore } from "./state/game-store";

const TOP_COUNTRIES = 8;

export function App() {
  const { t } = useTranslation();
  const { status, snapshot, names, error, startCampaign, endTurn } = useGameStore();

  useEffect(() => {
    void startCampaign();
  }, [startCampaign]);

  const player = snapshot?.sports.find((sport) => sport.kind === "player");
  const anchorLeague =
    snapshot?.countries.find((country) => country.countryId === snapshot.anchorCountryId)?.league ??
    null;
  const countryName = (id: string) => names?.countries[id] ?? id;
  const topCountries = snapshot
    ? [...snapshot.countries]
        .filter((country) => country.casual + country.hardcore > 0)
        .sort((a, b) => b.fandomScore - a.fandomScore)
        .slice(0, TOP_COUNTRIES)
    : [];

  return (
    <main
      className="screen"
      data-testid="game"
      data-status={status}
      data-turn={snapshot?.turn}
      data-quarter={snapshot?.quarter}
      data-player-fandom-score={player?.fandomScore}
    >
      <header className="header">
        <h1>{t("app.title")}</h1>
        <p className="subtitle">{t("app.subtitle")}</p>
      </header>

      {status === "error" && (
        <p role="alert" className="error">
          {t("status.error", { message: error })}
        </p>
      )}

      {!snapshot ? (
        status !== "error" && <p>{t("status.loading")}</p>
      ) : (
        <>
          <section className="stats" aria-label={t("turn.heading")}>
            <div className="stat stat-turn" data-testid="turn">
              {t("turn.label", { turn: snapshot.turn })}
            </div>
            <div className="stat">
              {t("turn.date", { quarter: snapshot.quarterOfYear, year: snapshot.year })}
            </div>
            <div className="stat">
              {t("turn.tier", { tier: snapshot.ppTier, name: t(`tiers.${snapshot.ppTier}`) })}
            </div>
            <div className="stat">{t("turn.pp", { pp: snapshot.pp })}</div>
            <div className="stat">{t("turn.length", { count: snapshot.turnLengthQuarters })}</div>
          </section>

          <p className="meta">
            {t("campaign.meta", {
              seed: snapshot.seed,
              country: countryName(snapshot.anchorCountryId),
            })}
          </p>
          <p className="meta" data-testid="focus">
            {t("campaign.focus", {
              countries: snapshot.focus
                .map((id) => (id === null ? t("campaign.emptySlot") : countryName(id)))
                .join(t("campaign.listSeparator")),
            })}
          </p>

          {snapshot.outcome && (
            <p role="alert" className="game-over" data-testid="game-over">
              {t("campaign.over", {
                country: countryName(snapshot.outcome.countryId),
                turn: snapshot.outcome.turn,
              })}
            </p>
          )}
          <p className="meta" data-testid="window">
            {snapshot.seasonalWindowOpen ? t("campaign.windowOpen") : t("campaign.windowClosed")}
          </p>
          {snapshot.tierTrack.pendingTierUp && (
            <p className="meta">
              {t("campaign.approaching", {
                tier: snapshot.tierTrack.pendingTierUp.tier,
                name: t(`tiers.${snapshot.tierTrack.pendingTierUp.tier}`),
                count: snapshot.tierTrack.pendingTierUp.turnsLeft,
              })}
            </p>
          )}
          {snapshot.tierTrack.atRisk && (
            <p className="meta warning">
              {t("campaign.atRisk", { count: snapshot.tierTrack.atRisk.turnsUntilDemotion })}
            </p>
          )}

          <section className="league" aria-label={t("league.heading")} data-testid="anchor-league">
            <h2>{t("league.heading")}</h2>
            {anchorLeague ? (
              <dl className="league-list">
                <div>
                  <dt>{t("league.tier")}</dt>
                  <dd>{t(`league.tiers.${anchorLeague.tier}`)}</dd>
                </div>
                <div>
                  <dt>{t("league.health")}</dt>
                  <dd className={`health-${anchorLeague.health}`}>
                    {t(`league.healthLevels.${anchorLeague.health}`)}
                  </dd>
                </div>
                <div>
                  <dt>{t("league.cash")}</dt>
                  <dd>{t("format.money", { value: anchorLeague.cash })}</dd>
                </div>
                <div>
                  <dt>{t("league.flow")}</dt>
                  <dd>
                    {anchorLeague.lastFlowPerQuarter === null
                      ? t("league.notYetMeasured")
                      : t("format.money", { value: anchorLeague.lastFlowPerQuarter })}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>{t("league.none")}</p>
            )}
          </section>

          <section className="genome" aria-label={t("genome.heading")}>
            <h2>{t("genome.heading")}</h2>
            <dl className="genome-list" data-testid="genome">
              {AXIS_IDS.map((axis) => (
                <div key={axis} className="genome-axis">
                  <dt>{t(`genome.axes.${axis}`)}</dt>
                  <dd>{t(`genome.options.${axis}.${snapshot.genome[axis]}`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <table className="fans">
            <caption>{t("fans.heading")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("fans.sport")}</th>
                <th scope="col">{t("fans.uninterested")}</th>
                <th scope="col">{t("fans.casual")}</th>
                <th scope="col">{t("fans.hardcore")}</th>
                <th scope="col">{t("fans.score")}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.sports.map((sport) => (
                <tr key={sport.sportId} data-testid="fan-row" className={sport.kind}>
                  <th scope="row">
                    {sport.kind === "player"
                      ? t("fans.yourSport")
                      : sport.kind === "other"
                        ? t("fans.otherSports")
                        : (names?.sports[sport.sportId] ?? sport.sportId)}
                  </th>
                  <td>{t("format.count", { value: sport.uninterested })}</td>
                  <td>{t("format.count", { value: sport.casual })}</td>
                  <td>{t("format.count", { value: sport.hardcore })}</td>
                  <td>{t("format.count", { value: sport.fandomScore })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="fans countries">
            <caption>{t("countries.heading", { count: topCountries.length })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("countries.country")}</th>
                <th scope="col">{t("fans.casual")}</th>
                <th scope="col">{t("fans.hardcore")}</th>
                <th scope="col">{t("countries.share")}</th>
                <th scope="col">{t("countries.affinity")}</th>
              </tr>
            </thead>
            <tbody>
              {topCountries.map((country) => (
                <tr
                  key={country.countryId}
                  data-testid="country-row"
                  className={country.focused ? "focused" : undefined}
                >
                  <th scope="row">
                    {country.focused
                      ? t("countries.focusedName", { name: countryName(country.countryId) })
                      : countryName(country.countryId)}
                  </th>
                  <td>{t("format.count", { value: country.casual })}</td>
                  <td>{t("format.count", { value: country.hardcore })}</td>
                  <td>{t("format.percent", { value: country.share })}</td>
                  <td>{t("format.multiplier", { value: country.affinity })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            className="end-turn"
            data-testid="end-turn"
            disabled={status !== "ready"}
            onClick={() => void endTurn()}
          >
            {status === "simulating" ? t("status.simulating") : t("actions.endTurn")}
          </button>
        </>
      )}
    </main>
  );
}
