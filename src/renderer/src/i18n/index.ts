import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

// All player-facing strings live in locale files. Never concatenate sentence fragments; pass
// names and numbers as interpolation variables.
void i18next.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

// Money (GDD v1.34): the simulation counts cash in its own unit; every money string formats it as
// US dollars with `{{value, money}}`, compact above a thousand ($4.2K, $310M, $12.4B).
let dollarsPerCash = 1;

/** The rate from the current snapshot (`TurnSnapshot.dollarsPerCash`). */
export function setDollarsPerCash(rate: number): void {
  dollarsPerCash = rate;
}

/** Cash as dollars in the current language, as the `money` formatter shows it. */
export function formatMoney(
  cash: number,
  lng: string | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  const dollars = cash * dollarsPerCash;
  const large = Math.abs(dollars) >= 1000;
  return new Intl.NumberFormat(lng, {
    style: "currency",
    currency: "USD",
    notation: large ? "compact" : "standard",
    maximumFractionDigits: large ? 1 : 0,
    ...options,
  }).format(dollars);
}

i18next.services.formatter?.add("money", (value, lng, options) =>
  formatMoney(Number(value), lng, options as Intl.NumberFormatOptions),
);

export default i18next;
