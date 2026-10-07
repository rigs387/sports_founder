import { useTranslation } from "react-i18next";
import { GEAR_BRAND_ID, type Names } from "../../../content";

/**
 * A deal partner's display name (GDD v1.28): the invented broadcasters and sponsors in names.yaml;
 * the homegrown gear brand is named from the sport.
 */
export function useDealPartnerName(names: Names | null | undefined, sportName: string) {
  const { t } = useTranslation();
  return (id: string) =>
    id === GEAR_BRAND_ID
      ? t("deals.gearBrand", { sport: sportName })
      : ([
          ...(names?.dealPartners.broadcasters ?? []),
          ...(names?.dealPartners.sponsors ?? []),
        ].find((partner) => partner.id === id)?.name ?? id);
}
