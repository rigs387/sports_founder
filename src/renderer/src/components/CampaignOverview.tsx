import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import { AXIS_IDS } from "../../../content/genome-axes";
import type { Action, TurnSnapshot } from "../../../sim";
import { ActionFeedback } from "./ActionFeedback";
import { LeagueOverview } from "./LeagueOverview";

export type Overview = "sport" | "leagues" | "growth";
interface Props {
  view: Exclude<Overview, "growth">;
  snapshot: TurnSnapshot;
  names: Names;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAction: (action: Action) => void;
  busy: boolean;
  initialCountryId: string | null;
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
  initialCountryId,
}: Props) {
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
      className={`overview-dialog${view === "leagues" ? " leagues-dialog" : ""}`}
      aria-labelledby="overview-title"
      onCancel={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
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
      {view === "sport" && <ActionFeedback />}
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
        <LeagueOverview
          snapshot={snapshot}
          names={names}
          busy={busy}
          initialCountryId={initialCountryId}
          onAction={onAction}
          onInspect={(id) => {
            onSelect(id);
            onClose();
          }}
        />
      )}
    </dialog>
  );
}
