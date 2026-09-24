import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import { AXIS_IDS } from "../../../content/genome-axes";
import type { Action, TurnSnapshot } from "../../../sim";
import { ActionFeedback } from "./ActionFeedback";

export type Overview = "sport" | "leagues" | "growth";
interface Props {
  view: Overview;
  snapshot: TurnSnapshot;
  names: Names;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAction: (action: Action) => void;
  busy: boolean;
}

/** The existing campaign readouts remain available while the map is the main screen. */
export function CampaignOverview({
  view,
  snapshot,
  names,
  onClose,
  onSelect,
  onAction,
  busy,
}: Props) {
  const { t, i18n } = useTranslation();
  const nodeNames = (ids: string[]) =>
    new Intl.ListFormat(i18n.language, { style: "long" }).format(
      ids.map((id) => t(`growth.nodes.${id}`)),
    );
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
      <ActionFeedback />
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
          <p>{t("actions.focusInstructions")}</p>
          {snapshot.tierTrack.slotsToDrop > 0 && (
            <p role="status">{t("actions.dropHint", { count: snapshot.tierTrack.slotsToDrop })}</p>
          )}
          <ul className="focus-list">
            {snapshot.focus.map((id, index) => (
              <li key={id ?? `slot-${index}`}>
                <span>
                  {t(id ? "actions.occupiedSlot" : "actions.emptySlot", {
                    slot: index + 1,
                    country: id ? name(id) : "",
                  })}
                </span>
                {id && (
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => {
                      onSelect(id);
                      onClose();
                    }}
                  >
                    {t("actions.inspect")}
                  </button>
                )}
                {snapshot.tierTrack.slotsToDrop > 0 && (
                  <button
                    type="button"
                    className="action-button"
                    disabled={busy || !!snapshot.outcome}
                    onClick={() => onAction({ type: "dropFocusSlot", slot: index })}
                  >
                    {t("actions.dropSlot", { slot: index + 1 })}
                  </button>
                )}
              </li>
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
          <p>{t("actions.growthBudget", { pp: snapshot.pp })}</p>
          <ul className="growth-list">
            {snapshot.growthNodes.map((node) => (
              <li
                key={node.nodeId}
                data-node={node.nodeId}
                data-status={node.status}
                data-cost={node.cost}
              >
                <div>
                  <strong>{t(`growth.nodes.${node.nodeId}`)}</strong>
                  <small>{t(`growth.categories.${node.category}`)}</small>
                  {node.lock?.kind === "tier" && (
                    <small>
                      {t("actions.lockTier", {
                        tier: node.lock.unlockTier,
                        name: t(`tiers.${node.lock.unlockTier}`),
                      })}
                    </small>
                  )}
                  {node.lock?.kind === "prerequisites" && (
                    <small>
                      {t("actions.lockPrerequisites", { nodes: nodeNames(node.lock.missing) })}
                    </small>
                  )}
                  {node.lock?.kind === "fork" && (
                    <small>
                      {t("actions.lockFork", { node: t(`growth.nodes.${node.lock.takenBy}`) })}
                    </small>
                  )}
                  {node.status !== "owned" &&
                    node.lock?.kind !== "fork" &&
                    node.forkSiblings.length > 0 && (
                      <small className="fork-warning">
                        {t("actions.forkWarning", { nodes: nodeNames(node.forkSiblings) })}
                      </small>
                    )}
                </div>
                <span>
                  {node.status === "owned"
                    ? t("growth.owned")
                    : t(node.affordable ? "growth.cost" : "growth.tooExpensive", {
                        cost: node.cost,
                      })}
                </span>
                <button
                  type="button"
                  className="action-button"
                  data-testid="buy-node"
                  disabled={
                    busy || !!snapshot.outcome || node.status !== "available" || !node.affordable
                  }
                  aria-label={t("actions.buyNamed", {
                    node: t(`growth.nodes.${node.nodeId}`),
                    cost: node.cost,
                  })}
                  onClick={() => onAction({ type: "buyNode", nodeId: node.nodeId })}
                >
                  {t(node.status === "available" ? "actions.buy" : `map.nodeStatus.${node.status}`)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </dialog>
  );
}
