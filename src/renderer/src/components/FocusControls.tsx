import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, CountrySnapshot, TurnSnapshot } from "../../../sim";

interface Props {
  country: CountrySnapshot;
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  onAction: (action: Action) => void;
}

export function FocusControls({ country, snapshot, names, busy, onAction }: Props) {
  const { t } = useTranslation();
  const [slot, setSlot] = useState(0);
  const selectedSlot = slot < snapshot.focus.length ? slot : 0;
  const currentSlot = snapshot.focus.indexOf(country.countryId);
  const affordable = snapshot.pp >= country.focusCost;
  return (
    <section className="focus-controls" aria-label={t("actions.focusHeading")}>
      <strong>{t("actions.focusHeading")}</strong>
      {currentSlot >= 0 ? (
        <p data-testid="focused-market">{t("actions.focused", { slot: currentSlot + 1 })}</p>
      ) : (
        <>
          <label>
            <span>{t("actions.focusSlot")}</span>
            <select
              value={selectedSlot}
              onChange={(event) => setSlot(Number(event.currentTarget.value))}
              disabled={busy || !!snapshot.outcome || !snapshot.focus.length}
              data-testid="focus-slot"
            >
              {snapshot.focus.map((id, index) => (
                <option key={id ?? `empty-${index}`} value={index}>
                  {t(id ? "actions.occupiedSlot" : "actions.emptySlot", {
                    slot: index + 1,
                    country: id ? (names.countries[id] ?? id) : "",
                  })}
                </option>
              ))}
            </select>
          </label>
          <small>{t("actions.focusEffect")}</small>
          <button
            type="button"
            className="action-button"
            data-testid="assign-focus"
            data-cost={country.focusCost}
            disabled={busy || !!snapshot.outcome || !affordable || !snapshot.focus.length}
            onClick={() =>
              onAction({ type: "assignFocus", slot: selectedSlot, countryId: country.countryId })
            }
          >
            {t("actions.assignFocus", { cost: country.focusCost })}
          </button>
          {!affordable && (
            <small>{t("actions.needPrestige", { cost: country.focusCost, pp: snapshot.pp })}</small>
          )}
        </>
      )}
      {snapshot.tierTrack.slotsToDrop > 0 && (
        <small>{t("actions.dropHint", { count: snapshot.tierTrack.slotsToDrop })}</small>
      )}
    </section>
  );
}
