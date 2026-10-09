import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { CountrySnapshot, TurnSnapshot } from "../../../sim";

type Column = "country" | "tier" | "health" | "hardcore" | "cash" | "promotion";
const TIER_ORDER = ["amateur", "semi-pro", "professional", "elite"];
const HEALTH_ORDER = ["near-collapse", "struggling", "healthy"];

/**
 * Every league at a glance (GDD v1.34): tier, health, hardcore fans, cash and whether it can be
 * promoted now, sortable by any column. A row opens that league's controls below.
 */
export function LeaguesTable({
  snapshot,
  names,
  selected,
  onSelect,
}: {
  snapshot: TurnSnapshot;
  names: Names;
  selected: string;
  onSelect: (countryId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [sort, setSort] = useState<{ by: Column; down: boolean }>({ by: "cash", down: true });
  const name = (id: string) => names.countries[id] ?? id;
  const promotion = (country: CountrySnapshot) => {
    const action = country.league?.actions.promoteLeague;
    if (!action?.terms) return { order: -1, text: t("league.table.top") };
    if (action.blocker === null)
      return {
        order: 2,
        text: t("league.table.ready", { tier: t(`league.tiers.${action.terms.to}`) }),
      };
    return { order: 1, text: t(`league.table.blocked.${action.blocker.kind}`) };
  };
  const key = (country: CountrySnapshot): number | string => {
    const league = country.league;
    switch (sort.by) {
      case "country":
        return name(country.countryId);
      case "tier":
        return TIER_ORDER.indexOf(league?.tier ?? "");
      case "health":
        return HEALTH_ORDER.indexOf(league?.health ?? "");
      case "hardcore":
        return country.hardcore;
      case "cash":
        return league?.cash ?? 0;
      case "promotion":
        return promotion(country).order;
    }
  };
  const rows = snapshot.countries
    .filter((country) => country.league)
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const order =
        typeof ka === "string" && typeof kb === "string"
          ? ka.localeCompare(kb, i18n.language)
          : Number(ka) - Number(kb);
      return (sort.down ? -order : order) || name(a.countryId).localeCompare(name(b.countryId));
    });
  const header = (column: Column) => (
    <th
      scope="col"
      aria-sort={sort.by === column ? (sort.down ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() =>
          setSort((current) => ({
            by: column,
            down: current.by === column ? !current.down : column !== "country",
          }))
        }
      >
        {t(`league.table.columns.${column}`)}
        {sort.by === column ? (sort.down ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );
  return (
    <div className="leagues-table-wrap" data-testid="leagues-table">
      <table className="leagues-table">
        <thead>
          <tr>
            {header("country")}
            {header("tier")}
            {header("health")}
            {header("hardcore")}
            {header("cash")}
            {header("promotion")}
          </tr>
        </thead>
        <tbody>
          {rows.map((country) => {
            const league = country.league;
            if (!league) return null;
            const promote = promotion(country);
            return (
              <tr
                key={country.countryId}
                className={country.countryId === selected ? "is-selected" : undefined}
                data-country={country.countryId}
                onClick={() => onSelect(country.countryId)}
              >
                <th scope="row">
                  <button type="button" onClick={() => onSelect(country.countryId)}>
                    {name(country.countryId)}
                    {country.countryId === snapshot.flagship.countryId ? " ★" : ""}
                  </button>
                </th>
                <td>{t(`league.tiers.${league.tier}`)}</td>
                <td>
                  <span className={`health-pill ${league.health}`}>
                    {t(`league.healthLevels.${league.health}`)}
                  </span>
                </td>
                <td>{t("format.compact", { value: country.hardcore })}</td>
                <td>{t("format.money", { value: league.cash })}</td>
                <td className={promote.order === 2 ? "is-ready" : undefined}>{promote.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
