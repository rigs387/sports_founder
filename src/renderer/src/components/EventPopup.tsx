import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventSnapshot } from "../../../sim";
import { geometry } from "../map/model";
import { useGameStore } from "../state/game-store";
import { Effect, useEventText } from "./event-text";
import "./event-popup.css";

// Event windows (GDD v1.25): after Next Turn, the turn's decisions appear one at a time over the
// map in the order their facts happened, with their country picked out on the map. Moments are
// toasts the player collects with a click. The board stays as the journal.

const byWhenItHappened = (a: EventSnapshot, b: EventSnapshot) =>
  a.quarter - b.quarter || a.id - b.id;

/**
 * The turn's cards over the map: the next unanswered decision as a window, and once none is
 * waiting, the moments as toasts. One thing at a time.
 */
export function EventLayer({ onHighlight }: { onHighlight: (countryId: string | null) => void }) {
  const { t } = useTranslation();
  const { snapshot, status, dispatchAction } = useGameStore();
  const text = useEventText();
  // Decisions the player set aside this turn: they stay on the board, and Next Turn settles them.
  const [later, setLater] = useState<{ turn: number; ids: number[] }>({ turn: 0, ids: [] });
  const [confirming, setConfirming] = useState<string | null>(null);
  const turn = snapshot?.turn ?? 0;
  const setAside = later.turn === turn ? later.ids : [];
  const queue = (snapshot?.events ?? [])
    .filter((event) => event.kind === "decision" && !setAside.includes(event.id))
    .sort(byWhenItHappened);
  const current = queue[0];
  const currentId = current?.id ?? null;
  const currentCountry = current?.countryId ?? null;
  // A new card comes up: drop any half-made choice.
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (currentId === shown.current) return;
    shown.current = currentId;
    setConfirming(null);
  }, [currentId]);
  // The card's country is outlined on the map while it is up.
  const outlined = snapshot?.outcome ? null : currentCountry;
  useEffect(() => {
    onHighlight(outlined);
    return () => onHighlight(null);
  }, [outlined, onHighlight]);
  if (!snapshot || !text || snapshot.outcome) return null;
  if (!current) return <MomentToasts />;
  const busy = status !== "ready";
  const total = snapshot.events.filter((event) => event.kind === "decision").length;
  const choice = current.choices.find((option) => option.id === confirming);
  const choose = (choiceId: string) =>
    void dispatchAction({ type: "chooseEvent", eventId: current.id, choiceId });
  const choiceName = (id: string) => t(`events.cards.${current.templateId}.choices.${id}`);
  // Docked on the side of the map away from the card's country, so its outline stays in view.
  const x = geometry.markets[current.countryId]?.center[0] ?? 0;
  const dock = x < geometry.width / 2 ? "dock-right" : "dock-left";
  return (
    <section
      className={`event-popup ${dock}${current.tone === "pressure" ? " is-pressure" : ""}`}
      role="dialog"
      aria-labelledby="event-popup-title"
      data-testid="event-popup"
      data-event-id={current.id}
      data-event-template={current.templateId}
    >
      <header>
        <span className="eyebrow">
          {t("events.popup.where", {
            kind: t("events.decision"),
            country: text.country(current.countryId),
            date: text.dateOf(current),
          })}
        </span>
        {total > 1 && (
          <small>
            {t("events.popup.position", { index: total - queue.length + 1, count: total })}
          </small>
        )}
      </header>
      <h3 id="event-popup-title">{text.title(current)}</h3>
      <p>{text.body(current)}</p>
      {text.seasonLines(current).map((line) => (
        <p key={line}>{line}</p>
      ))}
      {current.arrivalEffects.length > 0 && (
        <div className="event-popup-arrived">
          <strong>{t("events.arrived")}</strong>
          <ul>
            {current.arrivalEffects.map((effect) => (
              <Effect effect={effect} key={JSON.stringify(effect)} />
            ))}
          </ul>
        </div>
      )}
      <div className="event-popup-choices">
        {current.choices.map((option) => {
          const [first, ...rest] = option.effects;
          const star = {
            candidate: text.player(current.facts.star?.candidateId),
            cash: option.leagueCash,
          };
          return (
            <div className="event-popup-choice" key={option.id}>
              <button
                type="button"
                data-testid="event-popup-choice"
                data-choice={option.id}
                data-cost={option.cost}
                aria-pressed={confirming === option.id}
                aria-describedby={`event-choice-${option.id}`}
                disabled={busy || !!option.blocker}
                onClick={() => (option.cost > 0 ? setConfirming(option.id) : choose(option.id))}
              >
                <span className="choice-name">{choiceName(option.id)}</span>
                <b>{t(option.cost ? "events.cost" : "events.free", { amount: option.cost })}</b>
                <ul className="choice-line">
                  {first ? <Effect effect={first} star={star} /> : <li>{t("events.noChange")}</li>}
                  {rest.length > 0 && (
                    <li className="choice-more">
                      {t("events.popup.more", { count: rest.length })}
                    </li>
                  )}
                </ul>
              </button>
              <div className="event-popup-detail" role="tooltip" id={`event-choice-${option.id}`}>
                <ul>
                  {option.effects.length ? (
                    option.effects.map((effect) => (
                      <Effect effect={effect} key={JSON.stringify(effect)} star={star} />
                    ))
                  ) : (
                    <li>{t("events.noChange")}</li>
                  )}
                </ul>
                {option.blocker && (
                  <p className="event-tradeoff">{t(`events.blockers.${option.blocker}`)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {choice && (
        <fieldset className="event-popup-confirm" data-testid="event-popup-confirm">
          <strong>
            {t("events.confirm", {
              choice: choiceName(choice.id),
              country: text.country(current.countryId),
              amount: choice.cost,
            })}
          </strong>
          <div>
            <button
              type="button"
              className="action-button"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              {t("events.cancel")}
            </button>
            <button
              type="button"
              className="action-button"
              data-testid="event-popup-confirm-choice"
              disabled={busy || !!choice.blocker}
              onClick={() => choose(choice.id)}
            >
              {t("events.confirmChoice")}
            </button>
          </div>
        </fieldset>
      )}
      <footer>
        <small>
          {current.defaultChoice &&
            t("events.default", { choice: choiceName(current.defaultChoice) })}
        </small>
        <button
          type="button"
          className="event-popup-later"
          data-testid="event-popup-later"
          onClick={() => setLater({ turn, ids: [...setAside, current.id] })}
        >
          {t("events.popup.later")}
        </button>
      </footer>
    </section>
  );
}

/** The turn's moments as toasts: a click collects one; Next Turn collects the rest. */
function MomentToasts() {
  const { t } = useTranslation();
  const { snapshot, status, dispatchAction } = useGameStore();
  const text = useEventText();
  if (!snapshot || !text || snapshot.outcome) return null;
  const moments = snapshot.events.filter((event) => event.kind === "moment").sort(byWhenItHappened);
  if (moments.length === 0) return null;
  const shown = moments.slice(0, 3);
  return (
    <section
      className="moment-toasts"
      aria-label={t("events.popup.moments")}
      data-testid="moment-toasts"
    >
      {shown.map((moment) => (
        <button
          type="button"
          key={moment.id}
          className="moment-toast"
          data-event-id={moment.id}
          data-event-template={moment.templateId}
          disabled={status !== "ready"}
          onClick={() => void dispatchAction({ type: "collectMoment", eventId: moment.id })}
        >
          <small className="moment-where">
            {t("events.popup.where", {
              kind: t("events.moment"),
              country: text.country(moment.countryId),
              date: text.dateOf(moment),
            })}
          </small>
          <strong>{text.title(moment)}</strong>
          <ul className="choice-line">
            {moment.effects.slice(0, 1).map((effect) => (
              <Effect effect={effect} key={JSON.stringify(effect)} />
            ))}
          </ul>
          <span className="moment-collect">{t("events.collect")}</span>
        </button>
      ))}
      {moments.length > shown.length && (
        <p className="moment-more">
          {t("events.popup.moreMoments", { count: moments.length - shown.length })}
        </p>
      )}
    </section>
  );
}
