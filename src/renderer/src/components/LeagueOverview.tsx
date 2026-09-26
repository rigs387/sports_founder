import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, TurnSnapshot } from "../../../sim";
import { LeagueControls } from "./LeagueControls";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  initialCountryId: string | null;
  onAction: (action: Action) => void;
  onInspect: (id: string) => void;
}

export function LeagueOverview({
  snapshot,
  names,
  busy,
  initialCountryId,
  onAction,
  onInspect,
}: Props) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(initialCountryId ?? snapshot.anchorCountryId);
  const name = (id: string) => names.countries[id] ?? id;
  const countries = snapshot.countries
    .filter((country) => country.league)
    .sort((a, b) => name(a.countryId).localeCompare(name(b.countryId), i18n.language));
  const country =
    countries.find((item) => item.countryId === selected) ??
    countries.find((item) => item.countryId === snapshot.anchorCountryId) ??
    countries[0];
  if (!country?.league) return <p>{t("league.manage.none")}</p>;
  return (
    <div className="league-overview">
      <label className="league-picker">
        {t("league.manage.select")}
        <select
          data-testid="league-picker"
          value={country.countryId}
          onChange={(event) => setSelected(event.currentTarget.value)}
        >
          {countries.map((item) => (
            <option key={item.countryId} value={item.countryId}>
              {t("league.manage.option", {
                country: name(item.countryId),
                tier: t(`league.tiers.${item.league?.tier}`),
                health: t(`league.healthLevels.${item.league?.health}`),
              })}
            </option>
          ))}
        </select>
      </label>
      <div className="league-overview-heading">
        <div>
          <h3>{name(country.countryId)}</h3>
          <p>{t("map.leagueName", { tier: t(`league.tiers.${country.league.tier}`) })}</p>
        </div>
        <span className={`health-pill ${country.league.health}`}>
          {t(`league.healthLevels.${country.league.health}`)}
        </span>
        <button
          type="button"
          className="action-button"
          onClick={() => onInspect(country.countryId)}
        >
          {t("actions.inspect")}
        </button>
      </div>
      <LeagueControls
        key={country.countryId}
        country={country}
        countryName={name(country.countryId)}
        snapshot={snapshot}
        busy={busy}
        onAction={onAction}
      />
    </div>
  );
}
