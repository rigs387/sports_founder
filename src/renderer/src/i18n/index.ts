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

export default i18next;
