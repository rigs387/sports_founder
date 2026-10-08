import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventSnapshot } from "../../../sim";
import { Emblem } from "../identity/Emblem";
import { geometry } from "../map/model";
import { useGameStore } from "../state/game-store";
import { Effect, useEventText } from "./event-text";
import "./event-popup.css";

// Event windows (GDD v1.25, v1.26): after Next Turn, big and headline moments come first (a back
// page, or a front page over a dimmed map), then the turn's decisions one at a time, each in the
// order its fact happened and with its country picked out on the map; minor moments are toasts.
// Big moments cannot be skipped. The board stays as the journal.

const byWhenItHappened = (a: EventSnapshot, b: EventSnapshot) =>
  a.quarter - b.quarter || a.id - b.id;

/**
 * The turn's cards over the map: the next unanswered decision as a window, and once none is
 * waiting, the moments as toasts. One thing at a time.
 */
export function EventLayer({
  autoCollect,
  onHighlight,
  onBurst,
}: {
  /** Minor moments collect themselves (GDD v1.32). */
  autoCollect: boolean;
  onHighlight: (countryId: string | null) => void;
  onBurst: (countryId: string) => void;
}) {
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
  // Big and headline moments come before decisions.
  const news = bigMoments(snapshot?.events ?? [])[0];
  const currentCountry = news?.countryId ?? current?.countryId ?? null;
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
  const collector = autoCollect ? <AutoCollect /> : null;
  if (news)
    return (
      <>
        {collector}
        <MomentWindow event={news} onBurst={onBurst} />
      </>
    );
  if (!current)
    return (
      <>
        {collector}
        {autoCollect ? null : <MomentToasts />}
      </>
    );
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
    <>
      {collector}
      <section
        className={`event-popup ${dock} family-${current.family}${current.tone === "pressure" ? " is-pressure" : ""}`}
        role="dialog"
        aria-labelledby="event-popup-title"
        data-testid="event-popup"
        data-event-id={current.id}
        data-event-template={current.templateId}
        data-country={current.countryId}
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
        {text.factLines(current).map((line) => (
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
                    {first ? (
                      <Effect effect={first} star={star} />
                    ) : (
                      <li>{t("events.noChange")}</li>
                    )}
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
    </>
  );
}

/**
 * Auto-collect (GDD v1.32): every minor moment waiting is collected at once as it arrives, and one
 * line says how many and the PP they brought, for a few seconds. The journal keeps every card.
 */
function AutoCollect() {
  const { t } = useTranslation();
  const { snapshot, status, dispatchAction } = useGameStore();
  const [note, setNote] = useState<{ count: number; pp: number; key: number } | null>(null);
  // Each set of waiting moments is tried once: a rejected collection is not retried in a loop.
  const tried = useRef("");
  const minor = (snapshot?.events ?? []).filter(
    (event) => event.kind === "moment" && event.weight === "minor",
  );
  const waiting = minor.map((event) => event.id).join(",");
  useEffect(() => {
    if (!waiting || status !== "ready" || snapshot?.outcome || tried.current === waiting) return;
    tried.current = waiting;
    const pp = minor.reduce(
      (sum, event) => sum + event.effects.reduce((s, e) => s + (e.type === "pp" ? e.amount : 0), 0),
      0,
    );
    setNote({ count: minor.length, pp, key: Date.now() });
    void dispatchAction({ type: "collectMinorMoments" });
  }, [waiting, status, snapshot?.outcome, minor, dispatchAction]);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);
  if (!note) return null;
  return (
    <p className="moment-collected" role="status" data-testid="moment-collected" key={note.key}>
      {t("events.popup.collected", { count: note.count, pp: note.pp })}
    </p>
  );
}

/** The turn's moments as toasts: a click collects one; Next Turn collects the rest. */
function MomentToasts() {
  const { t } = useTranslation();
  const { snapshot, status, dispatchAction } = useGameStore();
  const text = useEventText();
  if (!snapshot || !text || snapshot.outcome) return null;
  const moments = snapshot.events
    .filter((event) => event.kind === "moment" && event.weight === "minor")
    .sort(byWhenItHappened);
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

/** Uncollected big and headline moments, in the order they happened (GDD v1.26). */
export function bigMoments(events: readonly EventSnapshot[]): EventSnapshot[] {
  return events
    .filter((event) => event.kind === "moment" && event.weight !== "minor")
    .sort(byWhenItHappened);
}

/**
 * A big moment as a back page over the map, or a headline as a front page over a dimmed map in
 * the sport's colours. Collect is the only way on; a headline bursts from its country.
 */
function MomentWindow({
  event,
  onBurst,
}: {
  event: EventSnapshot;
  onBurst: (countryId: string) => void;
}) {
  const { t } = useTranslation();
  const { snapshot, status, dispatchAction } = useGameStore();
  const text = useEventText();
  if (!snapshot || !text) return null;
  const headline = event.weight === "headline";
  const x = geometry.markets[event.countryId]?.center[0] ?? 0;
  const dock = x < geometry.width / 2 ? "dock-right" : "dock-left";
  const { identity } = snapshot;
  const masthead = t(`events.mastheads.${event.family}`, { sport: identity.sportName });
  const page = (
    <section
      className={`moment-window family-${event.family}${headline ? " is-headline" : ` ${dock}`}${event.tone === "pressure" ? " is-pressure" : ""}`}
      role="dialog"
      aria-modal={headline}
      aria-labelledby="moment-window-title"
      data-testid="moment-window"
      data-weight={event.weight}
      data-family={event.family}
      data-event-template={event.templateId}
      data-country={event.countryId}
      style={
        headline
          ? ({
              "--sport-primary": identity.colors.primary,
              "--sport-secondary": identity.colors.secondary,
            } as React.CSSProperties)
          : undefined
      }
    >
      <header className="moment-masthead">
        {headline && (
          <Emblem
            {...identity.emblem}
            primary={identity.colors.primary}
            secondary={identity.colors.secondary}
            size={40}
            label={identity.sportName}
          />
        )}
        <strong>{masthead}</strong>
        <small className="moment-dateline">
          {t("events.popup.dateline", {
            country: text.country(event.countryId),
            date: text.dateOf(event),
          })}
        </small>
      </header>
      <h2 id="moment-window-title">{text.title(event)}</h2>
      <p>{text.body(event)}</p>
      {text.factLines(event).map((line) => (
        <p key={line}>{line}</p>
      ))}
      <footer>
        <ul className="moment-reward">
          {event.effects.map((effect) => (
            <Effect effect={effect} key={JSON.stringify(effect)} />
          ))}
        </ul>
        <button
          type="button"
          className="action-button"
          data-testid="moment-window-collect"
          disabled={status !== "ready"}
          onClick={() => {
            if (headline) onBurst(event.countryId);
            void dispatchAction({ type: "collectMoment", eventId: event.id });
          }}
        >
          {t("events.collect")}
        </button>
      </footer>
    </section>
  );
  return headline ? <div className="moment-backdrop">{page}</div> : page;
}
