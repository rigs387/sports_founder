import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "../state/game-store";
import "./save-load.css";

export function SaveLoadControls() {
  const { t } = useTranslation();
  const { status, snapshot, dirty, fileName, fileNotice, saveCampaign, loadCampaign } =
    useGameStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const busy = !["ready", "setup", "error"].includes(status);
  useEffect(() => {
    const sync = () => {
      const state = useGameStore.getState();
      window.saveFiles?.closeState({
        dirty: state.dirty,
        busy: !["ready", "setup", "error", "idle"].includes(state.status),
        title: t("saves.closeTitle"),
        message: t("saves.closeMessage"),
        detail: t("saves.closeDetail"),
        stay: t("saves.stay"),
        leave: t("saves.leave"),
      });
    };
    sync();
    return useGameStore.subscribe(sync);
  }, [t]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const copy = (kind: "save" | "load") => ({
    title: t(`saves.${kind}Title`),
    button: t(`saves.${kind}`),
    filter: t("saves.filter"),
  });
  const load = async () => {
    setConfirmLoad(false);
    await loadCampaign(copy("load"));
  };
  return (
    <>
      <button
        type="button"
        className="campaign-files-button"
        data-testid="campaign-files"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {t(snapshot ? "saves.menu" : "saves.load")}
        {dirty && (
          <>
            <i aria-hidden="true" />
            <span className="sr-only">{t("saves.unsaved")}</span>
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        className="save-dialog"
        data-testid="save-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) {
            setOpen(false);
            setConfirmLoad(false);
          }
        }}
        aria-labelledby="save-heading"
      >
        <header>
          <span className="eyebrow">{t("saves.eyebrow")}</span>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            aria-label={t("saves.close")}
            onClick={() => {
              setOpen(false);
              setConfirmLoad(false);
            }}
          >
            &times;
          </button>
        </header>
        <h2 id="save-heading">{t("saves.heading")}</h2>
        <p>
          {snapshot
            ? t("saves.identity", {
                turn: snapshot.turn,
                country:
                  useGameStore.getState().names?.countries[snapshot.anchorCountryId] ??
                  snapshot.anchorCountryId,
              })
            : t("saves.welcome")}
        </p>
        <div className="save-file-card">
          <strong>{fileName ?? t("saves.noFile")}</strong>
          <span>
            {t(dirty ? "saves.unsaved" : snapshot ? "saves.upToDate" : "saves.chooseFile")}
          </span>
        </div>
        {fileNotice && (
          <p
            role={fileNotice.endsWith("Error") || fileNotice === "invalid" ? "alert" : "status"}
            data-testid="file-notice"
            data-notice={fileNotice}
          >
            {t(`saves.${fileNotice}`)}
          </p>
        )}
        {busy && <p role="status">{t(status === "saving" ? "saves.saving" : "saves.opening")}</p>}
        {confirmLoad ? (
          <div className="save-replace" data-testid="load-confirmation">
            <strong>{t("saves.replaceTitle")}</strong>
            <p>{t("saves.replaceDetail")}</p>
            <div className="save-buttons">
              <button type="button" className="action-button" onClick={() => setConfirmLoad(false)}>
                {t("saves.cancel")}
              </button>
              <button
                type="button"
                className="action-button"
                data-testid="confirm-load"
                onClick={() => void load()}
              >
                {t("saves.replace")}
              </button>
            </div>
          </div>
        ) : (
          <div className="save-buttons">
            {snapshot && (
              <button
                type="button"
                className="action-button save-primary"
                disabled={status !== "ready"}
                data-testid="save-campaign"
                onClick={() => void saveCampaign(copy("save"))}
              >
                {t("saves.save")}
              </button>
            )}
            <button
              type="button"
              className="action-button"
              disabled={busy}
              data-testid="load-campaign"
              onClick={() => (dirty ? setConfirmLoad(true) : void load())}
            >
              {t("saves.load")}
            </button>
          </div>
        )}
        <small className="save-hint">{t("saves.hint")}</small>
      </dialog>
    </>
  );
}
