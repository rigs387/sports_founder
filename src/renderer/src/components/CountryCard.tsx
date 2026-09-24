import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { CountrySnapshot } from "../../../sim";
import { geometry } from "../map/model";
import type { HistoryPoint } from "../state/history";

interface Props {
  country: CountrySnapshot;
  names: Names;
  history: HistoryPoint[];
  anchor: string;
  turn: number;
  onClose: () => void;
  onLocate: () => void;
}
export function CountryCard({ country, names, history, anchor, turn, onClose, onLocate }: Props) {
  const { t, i18n } = useTranslation();
  const compact = (value: number) => t("format.compact", { value });
  const name = names.countries[country.countryId] ?? country.countryId;
  const continent = geometry.markets[country.countryId]?.continent ?? "";
  const change =
    history.length > 1 ? country.share - (history.at(-2)?.share ?? country.share) : null;
  const firstQuarter = history[0]?.quarter ?? 0;
  const quarterRange = Math.max(1, (history.at(-1)?.quarter ?? firstQuarter) - firstQuarter);
  const max = Math.max(...history.map((point) => point.share), 0.001);
  const points = history.map(
    (point) =>
      `${6 + ((point.quarter - firstQuarter) / quarterRange) * 268},${50 - (point.share / max) * 42}`,
  );
  const strongestRival = [...country.rivals].sort((a, b) => {
    const rank = { none: 0, watching: 1, defending: 2, entrenched: 3 };
    return rank[b.level] - rank[a.level];
  })[0];
  const defending = strongestRival && ["defending", "entrenched"].includes(strongestRival.level);
  const moves = strongestRival?.countermoves.map((move) => t(`rivals.moves.${move}`)) ?? [];
  const moveList = new Intl.ListFormat(i18n.language, { style: "short" }).format(moves);
  return (
    <aside
      className="country-card"
      data-testid="country-card"
      data-country={country.countryId}
      data-turn={turn}
      data-history-points={history.length}
      aria-labelledby="country-title"
    >
      <div className="card-series">{t("map.countrySeries")}</div>
      <div className="card-content">
        <div className="card-header">
          <div className="country-badge" aria-hidden="true">
            {name.slice(0, 2).toLocaleUpperCase(i18n.language)}
          </div>
          <div>
            <span className="eyebrow">
              {t(country.countryId === anchor ? "map.birthplace" : "map.market")}
            </span>
            <h2 id="country-title">{name}</h2>
            <p>
              {t("map.countryMeta", {
                population: compact(country.population),
                continent: t(`map.continents.${continent}`),
              })}
            </p>
          </div>
          <button
            type="button"
            className="card-close"
            aria-label={t("map.closeCard")}
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="card-score">
          <div>
            <span className="eyebrow">{t("map.strength")}</span>
            <div className="hero-number" data-testid="country-share">
              {t(country.share > 0 && country.share < 0.001 ? "map.tinyShare" : "format.strength", {
                value: country.share,
              })}
            </div>
          </div>
          <span className={`trend-pill ${change !== null && change < 0 ? "falling" : ""}`}>
            {change === null ? t("map.firstTurn") : t("map.change", { value: change * 100 })}
          </span>
        </div>
        <svg
          className="sparkline"
          viewBox="0 0 280 58"
          role="img"
          aria-label={t("map.historyDescription", { country: name })}
        >
          <title>{t("map.historyDescription", { country: name })}</title>
          {points.length > 1 ? (
            <>
              <path className="chart-area" d={`M6,55 L${points.join(" L")} L274,55 Z`} />
              <path className="chart-line" d={`M${points.join(" L")}`} />
            </>
          ) : (
            <circle cx="6" cy={50 - ((history[0]?.share ?? 0) / max) * 42} r="3" />
          )}
        </svg>
        <div className="chart-caption">
          <span>
            {t(history.length < 2 ? "map.historyEmpty" : "map.historySince", {
              turn: history[0]?.turn ?? turn,
            })}
          </span>
          <span>{t("turn.label", { turn })}</span>
        </div>
        <div className="fan-stats">
          <div>
            <span aria-hidden="true">&#9673;</span>
            <div>
              <small>{t("fans.casual")}</small>
              <strong>{compact(country.casual)}</strong>
            </div>
          </div>
          <div>
            <span aria-hidden="true">&#9733;</span>
            <div>
              <small>{t("fans.hardcore")}</small>
              <strong>{compact(country.hardcore)}</strong>
            </div>
          </div>
        </div>
        <div className="league-strip">
          <span className="league-icon" aria-hidden="true">
            &#9814;
          </span>
          <div>
            <strong>
              {country.league
                ? t("map.leagueName", { tier: t(`league.tiers.${country.league.tier}`) })
                : t("league.none")}
            </strong>
            <small>
              {country.league
                ? t("map.reserve", { value: country.league.cash })
                : t("map.noLeagueYet")}
            </small>
          </div>
          {country.league && (
            <span className={`health-pill ${country.league.health}`}>
              {t(`league.healthLevels.${country.league.health}`)}
            </span>
          )}
        </div>
        <div className={`rival-strip ${defending ? "contested" : ""}`}>
          <span aria-hidden="true">{defending ? "!" : "\u25c7"}</span>
          <div>
            <strong>
              {defending
                ? t("map.rivalPressure", {
                    rival: names.sports[strongestRival.sportId] ?? strongestRival.sportId,
                  })
                : t("map.noPressure")}
            </strong>
            <small>{moves.length ? moveList : t("map.roomToGrow")}</small>
          </div>
        </div>
        <button
          type="button"
          className="card-action"
          onClick={onLocate}
          data-testid="locate-market"
        >
          {t("map.findMarket")}
          <span aria-hidden="true">&#8599;</span>
        </button>
        <div className="card-footnote">
          <span>{t("map.countryIntelligence")}</span>
          <span>{t("map.liveTurn")}</span>
        </div>
      </div>
    </aside>
  );
}
