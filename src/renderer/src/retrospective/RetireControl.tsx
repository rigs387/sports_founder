import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, TurnSnapshot } from "../../../sim";
import "./retrospective.css";

interface Props {
  snapshot: TurnSnapshot;
  busy: boolean;
  onAction: (action: Action) => void;
}

// Retiring (GDD v1.38): offered any time after the win, behind a confirmation, because it ends
// the campaign for good. Legality stays in the simulation (`canRetire`).
export function RetireControl({ snapshot, busy, onAction }: Props) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (asking) dialog.current?.showModal();
    else dialog.current?.close();
  }, [asking]);
  if (!snapshot.canRetire) return null;
  const sport = snapshot.identity.sportName;
  return (
    <>
      <button
        type="button"
        className="retire-open"
        data-testid="retire-open"
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        {t("retire.open")}
      </button>
      <dialog
        ref={dialog}
        className="retire-dialog"
        data-testid="retire-dialog"
        aria-labelledby="retire-heading"
        onCancel={(event) => {
          event.preventDefault();
          setAsking(false);
        }}
      >
        <h2 id="retire-heading">{t("retire.heading", { sport })}</h2>
        <p>{t("retire.body", { sport })}</p>
        <p className="retire-warning">{t("retire.warning")}</p>
        <div className="retire-actions">
          <button
            type="button"
            className="flagship-back"
            data-testid="retire-cancel"
            onClick={() => setAsking(false)}
          >
            {t("retire.cancel")}
          </button>
          <button
            type="button"
            className="action-button"
            data-testid="retire-confirm"
            disabled={busy}
            onClick={() => {
              setAsking(false);
              onAction({ type: "retire" });
            }}
          >
            {t("retire.confirm")}
          </button>
        </div>
      </dialog>
    </>
  );
}
