import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveEntry } from "../../../shared/save-files";
import { useGameStore } from "../state/game-store";
import "./save-load.css";

export function SaveLoadControls() {
  const { t, i18n } = useTranslation();
  const {
    status,
    snapshot,
    names,
    dirty,
    fileName,
    fileNotice,
    saveCampaign,
    loadCampaign,
    loadNamed,
    listSaves,
  } = useGameStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  /** The load waiting on "replace unsaved progress?": a file chosen by dialog, or a listed save. */
  const [confirmLoad, setConfirmLoad] = useState<{ name: string | null } | null>(null);
  /** The saves folder's saves (GDD v1.35), read each time the menu opens. */
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
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
  useEffect(() => {
    if (!open || status === "saving" || status === "opening") return;
    let current = true;
    void listSaves().then((list) => {
      if (current) setSaves(list);
    });
    return () => {
      current = false;
    };
  }, [open, status, listSaves]);
  const copy = (kind: "save" | "load") => ({
    title: t(`saves.${kind}Title`),
    button: t(`saves.${kind}`),
    filter: t("saves.filter"),
  });
  const load = async (name: string | null) => {
    setConfirmLoad(null);
    if (name === null) await loadCampaign(copy("load"));
    else await loadNamed(name);
  };
  const ask = (name: string | null) => (dirty ? setConfirmLoad({ name }) : void load(name));
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
            setConfirmLoad(null);
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
              setConfirmLoad(null);
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
              <button type="button" className="action-button" onClick={() => setConfirmLoad(null)}>
                {t("saves.cancel")}
              </button>
              <button
                type="button"
                className="action-button"
                data-testid="confirm-load"
                onClick={() => void load(confirmLoad.name)}
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
              onClick={() => ask(null)}
            >
              {t("saves.openOther")}
            </button>
          </div>
        )}
        {!confirmLoad && saves && saves.length > 0 && (
          <section className="save-list" aria-labelledby="save-list-heading">
            <h3 id="save-list-heading">{t("saves.listHeading")}</h3>
            <ul data-testid="save-list">
              {saves.map((entry) => (
                <li key={entry.name} data-save={entry.name}>
                  <span>
                    <strong>
                      {entry.header
                        ? t("saves.entry", {
                            sport: entry.header.sportName,
                            country: names?.countries[entry.header.anchorCountryId] ?? "",
                          })
                        : entry.name}
                    </strong>
                    <small>
                      {t(entry.header ? "saves.entryWhen" : "saves.entryUnknown", {
                        turn: entry.header?.turn,
                        quarter: entry.header?.quarterOfYear,
                        year: entry.header?.year,
                        date: new Intl.DateTimeFormat(i18n.language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(entry.savedAt),
                        context: entry.autosave ? "auto" : undefined,
                      })}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="action-button"
                    disabled={busy}
                    data-testid="load-save"
                    onClick={() => ask(entry.name)}
                  >
                    {t("saves.loadThis")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <small className="save-hint">{t("saves.hint")}</small>
      </dialog>
    </>
  );
}
