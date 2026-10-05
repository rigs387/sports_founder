import { useTranslation } from "react-i18next";
import { useGameStore } from "../state/game-store";

export function ActionFeedback() {
  const { t } = useTranslation();
  const { status, actionError, lastAction, names, snapshot } = useGameStore();
  if (actionError)
    return (
      <p className="action-feedback error" role="alert">
        {t(`actions.${actionError}`)}
      </p>
    );
  if (status === "acting")
    return (
      <p className="action-feedback" role="status">
        {t("actions.working")}
      </p>
    );
  if (!lastAction) return null;
  return (
    <p className="action-feedback" role="status">
      {t(`actions.success.${lastAction.type}`, {
        node: lastAction.type === "buyNode" ? t(`growth.nodes.${lastAction.nodeId}`) : "",
        country:
          "countryId" in lastAction
            ? (names?.countries[lastAction.countryId] ?? lastAction.countryId)
            : "",
        slot: "slot" in lastAction ? lastAction.slot + 1 : 0,
        trait: "axis" in lastAction ? t(`genome.axes.${lastAction.axis}`) : "",
        option:
          "axis" in lastAction ? t(`genome.options.${lastAction.axis}.${lastAction.option}`) : "",
        player:
          "playerId" in lastAction
            ? (snapshot?.flagship.players.find((p) => p.id === lastAction.playerId)?.name ?? "")
            : "",
        name: "name" in lastAction ? lastAction.name.trim().replace(/s+/g, " ") : "",
      })}
    </p>
  );
}
