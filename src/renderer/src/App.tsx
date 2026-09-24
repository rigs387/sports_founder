import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CampaignOverview, type Overview } from "./components/CampaignOverview";
import { CountryCard } from "./components/CountryCard";
import { heatBand, mapSettings } from "./map/model";
import { type MapCommand, type MapHover, WorldMap } from "./map/WorldMap";
import { useGameStore } from "./state/game-store";

export function App() {
  const { t } = useTranslation();
  const {
    status,
    snapshot,
    names,
    history,
    selectedCountryId,
    error,
    startCampaign,
    endTurn,
    selectCountry,
  } = useGameStore();
  const [command, setCommand] = useState<MapCommand>({ kind: "home", serial: 0 });
  const [hover, setHover] = useState<MapHover | null>(null);
  const [patterns, setPatterns] = useState(false);
  const [rivals, setRivals] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    void startCampaign();
  }, [startCampaign]);
  const navigate = (kind: MapCommand["kind"], market?: string) =>
    setCommand((previous) => ({ kind, market, serial: previous.serial + 1 }));
  const countryName = (id: string) => names?.countries[id] ?? id;
  const player = snapshot?.sports.find((sport) => sport.kind === "player");
  const selected = snapshot?.countries.find((country) => country.countryId === selectedCountryId);
  const hovered = hover
    ? snapshot?.countries.find((country) => country.countryId === hover.id)
    : null;
  const established =
    snapshot?.countries.filter((country) => country.share >= mapSettings.establishedThreshold)
      .length ?? 0;
  const compact = (value: number) => t("format.compact", { value });
  const stateMessage = snapshot
    ? t(
        snapshot.win.rank === 1
          ? snapshot.win.won
            ? "win.top"
            : snapshot.win.holding
              ? "win.holding"
              : "win.topTooEarly"
          : snapshot.win.won
            ? "win.retake"
            : "win.chasing",
        {
          count: snapshot.win.turnsHeld,
          hold: snapshot.win.holdTurns,
          rank: snapshot.win.rank,
          leader: names?.sports[snapshot.win.leadingRivalId ?? ""] ?? "",
          tier: snapshot.win.requiredTier,
          name: t(`tiers.${snapshot.win.requiredTier}`),
        },
      )
    : "";

  return (
    <main
      className="game-screen"
      data-testid="game"
      data-status={status}
      data-turn={snapshot?.turn}
      data-quarter={snapshot?.quarter}
      data-player-fandom-score={player?.fandomScore}
    >
      <header className="game-topbar">
        <div className="game-brand">
          <span className="brand-emblem" aria-hidden="true">
            {t("map.monogram")}
            <small>&#9733;</small>
          </span>
          <span>
            {t("map.brandFirst")}
            <strong>{t("map.brandSecond")}</strong>
          </span>
        </div>
        <nav className="game-nav" aria-label={t("map.navigation")}>
          <button
            type="button"
            className="active"
            onClick={() => setOverview(null)}
            aria-current={overview ? undefined : "page"}
          >
            {t("map.nav.world")}
          </button>
          {(["sport", "leagues", "growth"] as const).map((view) => (
            <button type="button" key={view} disabled={!snapshot} onClick={() => setOverview(view)}>
              {t(`map.nav.${view}`)}
            </button>
          ))}
        </nav>
        <div className="resources">
          <div>
            <span aria-hidden="true">&#10022;</span>
            <div>
              <small>{t("map.prestige")}</small>
              <b>{compact(snapshot?.pp ?? 0)}</b>
            </div>
          </div>
          <div>
            <span aria-hidden="true">&#9672;</span>
            <div>
              <small>{t("fans.score")}</small>
              <b>{compact(player?.fandomScore ?? 0)}</b>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          title={t("map.home")}
          aria-label={t("map.home")}
          onClick={() => navigate("home")}
        >
          &#8982;
        </button>
      </header>
      <section className="world-stage" aria-label={t("map.stage")}>
        {snapshot && (
          <WorldMap
            countryNames={names?.countries ?? {}}
            snapshot={snapshot}
            selected={selectedCountryId}
            command={command}
            patterns={patterns}
            rivals={rivals}
            onSelect={selectCountry}
            onHover={setHover}
          />
        )}
        <div className="campaign-heading">
          <span className="eyebrow">{t("map.chapter")}</span>
          <h1>
            {t("map.headlineFirst")}
            <em>{t("map.headlineSecond")}</em>
          </h1>
          <p>
            <span aria-hidden="true">&#9675;</span>
            {t("map.campaignIdentity", {
              tier: snapshot ? t(`tiers.${snapshot.ppTier}`) : t("status.loading"),
            })}
          </p>
        </div>
        <div className="world-note">
          <i />
          {t("map.established", {
            count: established,
            threshold: t("format.percent", { value: mapSettings.establishedThreshold }),
          })}
        </div>
        {status === "loading" && (
          <p className="loading-notice" role="status">
            {t("status.loading")}
          </p>
        )}
        {error && (
          <p className="error-notice" role="alert">
            {t("status.error", { message: error })}
          </p>
        )}
        {snapshot?.outcome && (
          <p className="outcome-notice" role="alert">
            {t("campaign.over", {
              country: countryName(snapshot.outcome.countryId),
              turn: snapshot.outcome.turn,
            })}
          </p>
        )}
        <div className="map-controls">
          <div className="zoom-controls">
            <button
              type="button"
              aria-label={t("map.zoomIn")}
              onClick={() => navigate("in")}
              data-testid="zoom-in"
            >
              +
            </button>
            <button type="button" aria-label={t("map.zoomOut")} onClick={() => navigate("out")}>
              &minus;
            </button>
            <span>{t("map.dragHint")}</span>
          </div>
          <label className="market-picker">
            <span>{t("map.findCountry")}</span>
            <select
              value={selectedCountryId ?? ""}
              onChange={(event) => {
                const id = event.currentTarget.value;
                selectCountry(id);
                navigate("locate", id);
              }}
              data-testid="market-picker"
            >
              <option value="" disabled>
                {t("map.chooseCountry")}
              </option>
              {snapshot?.countries.map((country) => (
                <option value={country.countryId} key={country.countryId}>
                  {countryName(country.countryId)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selected && names && snapshot && (
          <CountryCard
            country={selected}
            names={names}
            history={history[selected.countryId] ?? []}
            anchor={snapshot.anchorCountryId}
            turn={snapshot.turn}
            onClose={() => selectCountry(null)}
            onLocate={() => navigate("locate", selected.countryId)}
          />
        )}
        {hover && hovered && hovered.countryId !== selectedCountryId && (
          <div
            className="quick-stat"
            data-testid="map-tooltip"
            role="tooltip"
            style={{
              left: Math.max(12, Math.min(hover.x + 18, window.innerWidth - 275)),
              top: Math.max(140, Math.min(hover.y + 16, window.innerHeight - 310)),
            }}
          >
            <div className="quick-heading">
              <strong>{countryName(hover.id)}</strong>
              <span aria-hidden="true">&#8599;</span>
            </div>
            <div className="quick-body">
              <div>
                <b>
                  {t(
                    hovered.share > 0 && hovered.share < 0.001
                      ? "map.tinyShare"
                      : "format.strength",
                    { value: hovered.share },
                  )}
                </b>
                <small>{t("map.strength")}</small>
              </div>
              <div>
                <b>{compact(hovered.casual + hovered.hardcore)}</b>
                <small>{t("map.totalFans")}</small>
              </div>
            </div>
            <div className={`quick-meter band-${heatBand(hovered.share, mapSettings.heatBands)}`} />
            <div className="quick-footer">
              <span>
                {hovered.league
                  ? t("map.leagueName", { tier: t(`league.tiers.${hovered.league.tier}`) })
                  : t("league.none")}
              </span>
              <b>{t("map.clickToPin")}</b>
            </div>
          </div>
        )}
        {snapshot && (
          <div className="objective-card" data-testid="race" data-rank={snapshot.win.rank}>
            <span aria-hidden="true">&#10022;</span>
            <div>
              <span className="eyebrow">{t("map.bigPicture")}</span>
              <strong>
                {t(snapshot.win.rank === 1 ? "map.objectiveLeading" : "map.objectiveChasing", {
                  rank: snapshot.win.rank,
                })}
              </strong>
              <p>{stateMessage}</p>
              {snapshot.win.won && <p>{t("win.won", { turn: snapshot.win.won.turn })}</p>}
              {snapshot.tierTrack.atRisk && (
                <p className="warning">
                  {t("campaign.atRisk", { count: snapshot.tierTrack.atRisk.turnsUntilDemotion })}
                </p>
              )}
              {snapshot.tierTrack.pendingTierUp && (
                <p>
                  {t("campaign.approaching", {
                    tier: snapshot.tierTrack.pendingTierUp.tier,
                    name: t(`tiers.${snapshot.tierTrack.pendingTierUp.tier}`),
                    count: snapshot.tierTrack.pendingTierUp.turnsLeft,
                  })}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <footer className="game-bottom">
        <div className="map-legend">
          <span>{t("map.strength")}</span>
          <div className="legend-swatches">
            {[null, ...mapSettings.heatBands].map((threshold, index) => (
              <i
                className={`band-${index}`}
                key={threshold === null ? "empty" : String(threshold)}
                title={t(
                  index === 0
                    ? "map.bandZero"
                    : index === mapSettings.heatBands.length
                      ? "map.bandTop"
                      : "map.bandRange",
                  {
                    lower: t("format.percent", { value: mapSettings.heatBands[index - 1] ?? 0 }),
                    upper: t("format.percent", { value: mapSettings.heatBands[index] ?? 0 }),
                  },
                )}
              />
            ))}
          </div>
          <div className="legend-ends">
            <small>{t("format.percent", { value: 0 })}</small>
            <small>
              {t("map.bandTop", {
                lower: t("format.percent", { value: mapSettings.heatBands.at(-1) ?? 0 }),
              })}
            </small>
          </div>
        </div>
        <div className="replay-date">
          <span>
            {snapshot
              ? t("turn.date", { quarter: snapshot.quarterOfYear, year: snapshot.year })
              : ""}
          </span>
          <b>{t("turn.label", { turn: snapshot?.turn ?? 1 })}</b>
        </div>
        <div className="map-options">
          <label>
            <input
              type="checkbox"
              checked={patterns}
              onChange={(event) => setPatterns(event.currentTarget.checked)}
            />
            {t("map.patterns")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={rivals}
              onChange={(event) => setRivals(event.currentTarget.checked)}
            />
            {t("map.rivals")}
          </label>
        </div>
        <button
          type="button"
          className="advance-turn"
          data-testid="end-turn"
          disabled={status !== "ready" || !!snapshot?.outcome}
          onClick={() => void endTurn()}
        >
          <span>{t(status === "simulating" ? "status.simulating" : "map.nextTurn")}</span>
          <b aria-hidden="true">&#8594;</b>
        </button>
      </footer>
      <div className="sr-only" role="status" aria-live="polite">
        {snapshot
          ? t("map.turnAnnounced", {
              turn: snapshot.turn,
              score: compact(player?.fandomScore ?? 0),
            })
          : ""}
      </div>
      {overview && snapshot && names && (
        <CampaignOverview
          view={overview}
          snapshot={snapshot}
          names={names}
          onClose={() => setOverview(null)}
          onSelect={(id) => {
            selectCountry(id);
            navigate("locate", id);
          }}
        />
      )}
    </main>
  );
}
