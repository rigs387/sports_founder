import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import { AXIS_IDS } from "../../../content/genome-axes";
import type { TurnSnapshot } from "../../../sim";

export type Overview = "sport" | "leagues" | "growth";
interface Props {
  view: Overview;
  snapshot: TurnSnapshot;
  names: Names;
  onClose: () => void;
  onSelect: (id: string) => void;
}

/** The existing campaign readouts remain available while the map is the main screen. */
export function CampaignOverview({ view, snapshot, names, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const name = (id: string) => names.countries[id] ?? id;
  return (
    <dialog
      ref={dialog}
      className="overview-dialog"
      aria-labelledby="overview-title"
      onCancel={onClose}
    >
      <header>
        <div>
          <span className="eyebrow">{t("map.campaignOverview")}</span>
          <h2 id="overview-title">{t(`map.nav.${view}`)}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t("map.closeOverview")}
          onClick={onClose}
        >
          &times;
        </button>
      </header>
      {view === "sport" && (
        <>
          <p>
            {t("campaign.meta", { seed: snapshot.seed, country: name(snapshot.anchorCountryId) })}
          </p>
          <p>{t(snapshot.seasonalWindowOpen ? "campaign.windowOpen" : "campaign.windowClosed")}</p>
          <dl className="overview-list">
            {AXIS_IDS.map((axis) => (
              <div key={axis}>
                <dt>{t(`genome.axes.${axis}`)}</dt>
                <dd>{t(`genome.options.${axis}.${snapshot.genome[axis]}`)}</dd>
              </div>
            ))}
          </dl>
          <h3>{t("map.focusHeading")}</h3>
          <ul>
            {snapshot.focus.map((id, index) => (
              <li key={id ?? `slot-${index}`}>{id ? name(id) : t("campaign.emptySlot")}</li>
            ))}
          </ul>
        </>
      )}
      {view === "leagues" && (
        <>
          <p>{t("map.leagueOverview")}</p>
          <div className="overview-list">
            {snapshot.countries
              .filter((country) => country.league)
              .map((country) => (
                <button
                  type="button"
                  className="league-row"
                  key={country.countryId}
                  onClick={() => {
                    onSelect(country.countryId);
                    onClose();
                  }}
                >
                  <strong>{name(country.countryId)}</strong>
                  <span>{t(`league.tiers.${country.league?.tier}`)}</span>
                  <span>{t(`league.healthLevels.${country.league?.health}`)}</span>
                  <span>{t("map.reserve", { value: country.league?.cash })}</span>
                </button>
              ))}
          </div>
        </>
      )}
      {view === "growth" && (
        <>
          <p>{t("map.growthOverview")}</p>
          <ul className="growth-list">
            {snapshot.growthNodes.map((node) => (
              <li key={node.nodeId}>
                <div>
                  <strong>{t(`growth.nodes.${node.nodeId}`)}</strong>
                  <small>{t(`growth.categories.${node.category}`)}</small>
                </div>
                <span>
                  {node.status === "owned"
                    ? t("growth.owned")
                    : t(node.affordable ? "growth.cost" : "growth.tooExpensive", {
                        cost: node.cost,
                      })}
                </span>
                <b>{t(`map.nodeStatus.${node.status}`)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </dialog>
  );
}
