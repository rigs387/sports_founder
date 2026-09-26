import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NodeEffect } from "../../../content";
import type { Action, GrowthNodeSnapshot, TurnSnapshot } from "../../../sim";
import { ActionFeedback } from "../components/ActionFeedback";
import { GrowthIcon } from "./GrowthIcon";
import { canPurchase } from "./model";
import { growthView } from "./settings";
import "./growth.css";

type Node = GrowthNodeSnapshot;
interface Props {
  snapshot: TurnSnapshot;
  busy: boolean;
  active: boolean;
  error: string | null;
  onAction: (action: Action) => void;
}

function Effects({ effects }: { effects: NodeEffect[] }) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="growth-effects">
      {effects.map((effect, index) => {
        const reduction =
          effect.type.endsWith("Reduction") || effect.type === "countermoveResistance";
        const value = effect.amount * (reduction ? -1 : 1);
        const attributes = Object.keys(effect.conditions ?? {}).map((attribute) =>
          t(`growth.board.attributes.${attribute}`),
        );
        return (
          <li
            key={`${effect.type}-${effect.channel ?? index}`}
            className={effect.amount < 0 ? "downside" : ""}
          >
            <b
              role="img"
              aria-label={t(effect.amount < 0 ? "growth.board.downside" : "growth.board.benefit")}
            >
              {effect.amount < 0 ? "!" : "✓"}
            </b>
            <span>
              {t(`growth.board.effects.${effect.type}`, {
                value,
                channel: t(`growth.board.channels.${effect.channel ?? "proximity"}`),
              })}
              {attributes.length > 0 && (
                <small>
                  {t("growth.board.conditional", {
                    attributes: new Intl.ListFormat(i18n.language).format(attributes),
                  })}
                </small>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function GrowthScreen({ snapshot, busy, active, error, onAction }: Props) {
  const { t, i18n } = useTranslation();
  const [selectedId, setSelectedId] = useState(snapshot.growthNodes[0]?.nodeId ?? "");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const selected =
    snapshot.growthNodes.find((node) => node.nodeId === selectedId) ?? snapshot.growthNodes[0];
  const confirmation = snapshot.growthNodes.find((node) => node.nodeId === confirmId);
  const categories = [...new Set(snapshot.growthNodes.map((node) => node.category))];
  const name = (id: string) => t(`growth.nodes.${id}`);
  const nodeNames = (ids: string[]) => new Intl.ListFormat(i18n.language).format(ids.map(name));
  const cost = (node: Node) => t("growth.cost", { cost: node.cost });
  const tile = (node: Node) => {
    const position = growthView.nodes[node.nodeId];
    if (!position) throw new Error(`Missing growth-view.yaml position for ${node.nodeId}`);
    return position;
  };
  const state = (node: Node) =>
    node.status === "owned"
      ? "owned"
      : node.lock?.kind === "fork"
        ? "excluded"
        : node.status === "locked"
          ? "locked"
          : node.affordable
            ? "available"
            : "saving";
  const reason = (node: Node) => {
    if (node.status === "owned") return t("growth.owned");
    if (node.lock?.kind === "tier")
      return t("actions.lockTier", {
        tier: node.lock.unlockTier,
        name: t(`tiers.${node.lock.unlockTier}`),
      });
    if (node.lock?.kind === "prerequisites")
      return t("actions.lockPrerequisites", { nodes: nodeNames(node.lock.missing) });
    if (node.lock?.kind === "fork") return t("actions.lockFork", { node: name(node.lock.takenBy) });
    if (!node.affordable)
      return t("growth.board.need", { pp: Math.max(0, node.cost - snapshot.pp) });
    return t("growth.available");
  };
  useEffect(() => {
    if (active) selectRef.current?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    const element = dialog.current;
    if (confirmId && active) {
      element?.showModal();
      element?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    }
    return () => element?.close();
  }, [confirmId, active]);
  const purchase = (node: Node) => {
    if (!canPurchase(node, busy, !!snapshot.outcome)) return;
    onAction({ type: "buyNode", nodeId: node.nodeId });
    setConfirmId(null);
  };
  if (!selected) return null;
  const nodes = snapshot.growthNodes.filter((node) => node.category === selected.category);
  const selectedState = state(selected);
  const disabled = !canPurchase(selected, busy, !!snapshot.outcome);
  const comparisons = confirmation
    ? [
        confirmation,
        ...snapshot.growthNodes.filter((node) => confirmation.forkSiblings.includes(node.nodeId)),
      ]
    : [];

  return (
    <section
      className="growth-screen"
      hidden={!active}
      aria-labelledby="growth-title"
      data-testid="growth-screen"
    >
      <div className="growth-heading">
        <div>
          <span className="eyebrow">{t("growth.board.eyebrow")}</span>
          <h1 id="growth-title">{t("growth.board.title")}</h1>
        </div>
        <p>{t("actions.growthBudget", { pp: snapshot.pp })}</p>
      </div>
      <div className="growth-category-bar">
        <fieldset className="growth-categories" aria-label={t("growth.board.categories")}>
          {categories.map((category, index) => {
            const first = snapshot.growthNodes.find((node) => node.category === category);
            return (
              <button
                type="button"
                key={category}
                data-category={category}
                aria-pressed={selected.category === category}
                onClick={() => first && setSelectedId(first.nodeId)}
              >
                <span>{t("growth.board.index", { value: index + 1 })}</span>
                <b>{t(`growth.categories.${category}`)}</b>
                <small>{t("growth.board.tier", { tier: first?.unlockTier })}</small>
              </button>
            );
          })}
        </fieldset>
        <label className="growth-picker">
          {t("growth.board.find")}
          <select
            ref={selectRef}
            data-testid="growth-picker"
            value={selected.nodeId}
            onChange={(event) => {
              const id = event.currentTarget.value;
              setSelectedId(id);
              requestAnimationFrame(() =>
                board.current
                  ?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)
                  ?.scrollIntoView({ block: "nearest", inline: "center" }),
              );
            }}
          >
            {categories.map((category) => (
              <optgroup key={category} label={t(`growth.categories.${category}`)}>
                {snapshot.growthNodes
                  .filter((node) => node.category === category)
                  .map((node) => (
                    <option key={node.nodeId} value={node.nodeId}>
                      {name(node.nodeId)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="growth-workspace">
        <section className="growth-panel" aria-label={t("growth.board.paths")}>
          <div className="growth-caption">
            <span>{t(`growth.board.taglines.${selected.category}`)}</span>
            <span>
              {t("growth.board.ownedCount", {
                owned: nodes.filter((node) => node.status === "owned").length,
                total: nodes.length,
              })}
            </span>
          </div>
          <div className="growth-scroll" ref={board}>
            <div
              className="growth-board"
              style={{ width: growthView.width, height: growthView.height }}
            >
              <svg
                className="growth-routes"
                viewBox={`0 0 ${growthView.width} ${growthView.height}`}
                aria-hidden="true"
              >
                {nodes.flatMap((node) =>
                  node.requires.map((id) => {
                    const parent = snapshot.growthNodes.find(
                      (candidate) => candidate.nodeId === id,
                    );
                    if (!parent) return null;
                    const from = tile(parent);
                    const to = tile(node);
                    const x = from.x + growthView.tileWidth;
                    const y = from.y + growthView.tileHeight / 2;
                    const targetY = to.y + growthView.tileHeight / 2;
                    return (
                      <path
                        key={`${id}-${node.nodeId}`}
                        className={`${parent.status === "owned" ? "owned" : ""} ${selected.nodeId === node.nodeId ? "selected" : ""}`}
                        d={`M${x} ${y}C${x + 26} ${y},${to.x - 26} ${targetY},${to.x} ${targetY}`}
                      />
                    );
                  }),
                )}
              </svg>
              {nodes.map((node) => (
                <button
                  type="button"
                  key={node.nodeId}
                  data-node={node.nodeId}
                  data-status={node.status}
                  data-cost={node.cost}
                  className={`growth-node ${state(node)}`}
                  style={{
                    left: tile(node).x,
                    top: tile(node).y,
                    width: growthView.tileWidth,
                    height: growthView.tileHeight,
                  }}
                  aria-pressed={selected.nodeId === node.nodeId}
                  aria-label={t("growth.board.nodeLabel", {
                    name: name(node.nodeId),
                    status: reason(node),
                    cost: cost(node),
                  })}
                  onClick={() => setSelectedId(node.nodeId)}
                >
                  <span className="growth-node-icon">
                    <GrowthIcon name={tile(node).icon} />
                  </span>
                  <strong>{name(node.nodeId)}</strong>
                  <span className="growth-node-meta">
                    <span>{t(`growth.board.states.${state(node)}`)}</span>
                    <b>
                      {node.status === "owned"
                        ? "✓"
                        : t("growth.board.tileCost", { cost: node.cost })}
                    </b>
                  </span>
                  {node.forkSiblings.length > 0 && (
                    <span className="growth-choice-tag">{t("growth.board.choiceTag")}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="growth-legend">
            <span>
              <i className="owned" />
              {t("growth.owned")}
            </span>
            <span>
              <i className="available" />
              {t("growth.board.states.available")}
            </span>
            <span>
              <i className="locked" />
              {t("growth.board.states.locked")}
            </span>
            <span>{t("growth.board.permanentChoice")}</span>
          </div>
        </section>
        <aside
          className="growth-inspector"
          aria-labelledby="growth-node-title"
          data-testid="growth-inspector"
          data-node-id={selected.nodeId}
        >
          <div className="growth-art">
            <span>{t("growth.board.series")}</span>
            <GrowthIcon name={tile(selected).icon} />
            <b>{t("growth.board.index", { value: snapshot.growthNodes.indexOf(selected) + 1 })}</b>
          </div>
          <div className="growth-detail">
            <span className="eyebrow">
              {t("growth.board.categoryState", {
                category: t(`growth.categories.${selected.category}`),
                state: t(`growth.board.states.${selectedState}`),
              })}
            </span>
            <h2 id="growth-node-title">{name(selected.nodeId)}</h2>
            <p className="growth-flavor">{t(`growth.board.summaries.${selected.nodeId}`)}</p>
            <Effects effects={selected.effects} />
            <p className="growth-prerequisites">
              {selected.requires.length
                ? t("actions.lockPrerequisites", { nodes: nodeNames(selected.requires) })
                : t("growth.board.noPrerequisites")}
            </p>
            {selected.forkSiblings.length > 0 && (
              <div className="growth-fork-note">
                <p>
                  {selected.status === "owned"
                    ? t("growth.board.chosenPath", { nodes: nodeNames(selected.forkSiblings) })
                    : selected.lock?.kind === "fork"
                      ? reason(selected)
                      : t("actions.forkWarning", { nodes: nodeNames(selected.forkSiblings) })}
                </p>
                <button
                  type="button"
                  data-testid="compare-growth"
                  onClick={() => setConfirmId(selected.nodeId)}
                >
                  {t("growth.board.compare")}
                </button>
              </div>
            )}
            {selected.status !== "owned" && (
              <p className="growth-eligibility" data-testid="growth-reason">
                {reason(selected)}
              </p>
            )}
            <button
              type="button"
              className="growth-buy"
              data-testid="buy-node"
              data-cost={selected.cost}
              disabled={disabled}
              onClick={() =>
                selected.forkSiblings.length ? setConfirmId(selected.nodeId) : purchase(selected)
              }
              aria-label={t("actions.buyNamed", {
                node: name(selected.nodeId),
                cost: selected.cost,
              })}
            >
              <span>
                {t(
                  selected.status === "owned"
                    ? "growth.owned"
                    : busy
                      ? "actions.working"
                      : selected.forkSiblings.length
                        ? "growth.board.choose"
                        : "growth.board.add",
                )}
              </span>
              <b>{selected.status === "owned" ? "✓" : cost(selected)}</b>
            </button>
          </div>
        </aside>
      </div>
      <div className="growth-feedback">
        <ActionFeedback />
        {error && <p role="alert">{t("status.error", { message: error })}</p>}
        {snapshot.outcome && <p role="alert">{t("growth.board.ended")}</p>}
        <p>{t("growth.board.baseEffects")}</p>
      </div>
      {confirmation && (
        <dialog
          ref={dialog}
          className="growth-dialog"
          aria-labelledby="growth-choice-title"
          onCancel={() => setConfirmId(null)}
        >
          <button
            type="button"
            className="growth-dialog-close"
            aria-label={t("growth.board.cancel")}
            onClick={() => setConfirmId(null)}
          >
            ×
          </button>
          <span className="eyebrow">{t("growth.board.permanentChoice")}</span>
          <h2 id="growth-choice-title">{t("growth.board.chooseTitle")}</h2>
          <p>
            {t("growth.board.confirmWarning", {
              name: name(confirmation.nodeId),
              nodes: nodeNames(confirmation.forkSiblings),
            })}
          </p>
          <div className="growth-comparison">
            {comparisons.map((node) => (
              <section
                key={node.nodeId}
                className={node.nodeId === confirmation.nodeId ? "chosen" : ""}
              >
                <span className="eyebrow">
                  {t(
                    node.nodeId === confirmation.nodeId
                      ? "growth.board.yourSelection"
                      : "growth.board.otherPath",
                  )}
                </span>
                <h3>{name(node.nodeId)}</h3>
                <strong>{cost(node)}</strong>
                <Effects effects={node.effects} />
                <p>{reason(node)}</p>
              </section>
            ))}
          </div>
          <div className="growth-dialog-actions">
            <button type="button" data-cancel onClick={() => setConfirmId(null)}>
              {t("growth.board.cancel")}
            </button>
            <button
              type="button"
              className="growth-buy"
              data-testid="confirm-growth"
              disabled={!canPurchase(confirmation, busy, !!snapshot.outcome)}
              onClick={() => purchase(confirmation)}
            >
              {t("growth.board.confirm", {
                name: name(confirmation.nodeId),
                cost: cost(confirmation),
              })}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
