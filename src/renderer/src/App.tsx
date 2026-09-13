import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "./state/game-store";

export function App() {
  const { t } = useTranslation();
  const { status, snapshot, names, error, startCampaign, endTurn } = useGameStore();

  useEffect(() => {
    void startCampaign();
  }, [startCampaign]);

  const player = snapshot?.sports.find((sport) => sport.kind === "player");

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
              country: names?.countries[snapshot.anchorCountryId] ?? snapshot.anchorCountryId,
            })}
          </p>

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
