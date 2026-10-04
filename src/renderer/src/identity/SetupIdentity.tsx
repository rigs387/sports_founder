import { useTranslation } from "react-i18next";
import type { Genome } from "../../../content/genome-axes";
import type { IdentitySetup } from "../../../sim";
import type { SetupOptions } from "../worker/api";
import { Emblem } from "./Emblem";
import { FieldDiagram } from "./FieldDiagram";
import { VISITORS } from "./Rulebook";

type IdentityOptions = SetupOptions["identity"];

/** Name lengths the simulation accepts (it checks again when the campaign starts). */
export function nameProblems(identity: IdentitySetup, options: IdentityOptions) {
  const { limits } = options;
  const bad = (value: string, max: number) => {
    const length = value.trim().replace(/\s+/g, " ").length;
    return length < limits.nameMinLength || length > max;
  };
  return {
    sportName: bad(identity.sportName, limits.sportNameMaxLength),
    clubName: bad(identity.clubName, limits.clubNameMaxLength),
    groundName: bad(identity.groundName, limits.groundNameMaxLength),
    colors: identity.emblem.primary === identity.emblem.secondary,
  };
}

interface Props {
  options: IdentityOptions;
  identity: IdentitySetup | null;
  places: string[];
  countryName: string;
  genome: Genome | null;
  busy: boolean;
  onChange: (next: IdentitySetup) => void;
  onReroll: () => void;
}

// The founding panel (GDD v1.18): the sport's name, its first club in a real town of the anchor and
// that club's ground, founding character, terms and the preset emblem, with a live preview of the
// emblem and the field diagram. Every option list comes from content.
export function SetupIdentity({
  options,
  identity,
  places,
  countryName,
  genome,
  busy,
  onChange,
  onReroll,
}: Props) {
  const { t } = useTranslation();
  if (!identity) {
    return (
      <section className="setup-identity setup-panel" aria-labelledby="identity-heading">
        <span className="eyebrow">{t("identity.setup.step")}</span>
        <h2 id="identity-heading">{t("identity.setup.title")}</h2>
        <p>{t("identity.setup.chooseAnchorFirst")}</p>
      </section>
    );
  }
  const problems = nameProblems(identity, options);
  const set = (patch: Partial<IdentitySetup>) => onChange({ ...identity, ...patch });
  const lengthHint = (max: number) =>
    t("identity.setup.nameLength", { min: options.limits.nameMinLength, max });
  const colors = options.emblem.colors;
  const club = t("flagship.club", {
    place: identity.foundingPlace,
    nickname: identity.clubName.trim(),
  });

  return (
    <section
      className="setup-identity setup-panel"
      aria-labelledby="identity-heading"
      data-testid="setup-identity"
    >
      <span className="eyebrow">{t("identity.setup.step")}</span>
      <h2 id="identity-heading">{t("identity.setup.title")}</h2>
      <p>{t("identity.setup.intro")}</p>
      <fieldset className="setup-identity-grid" disabled={busy}>
        <div>
          <div className="setup-name-row">
            <label className="setup-field">
              <span>{t("identity.setup.sportName")}</span>
              <input
                type="text"
                value={identity.sportName}
                maxLength={options.limits.sportNameMaxLength + 8}
                aria-invalid={problems.sportName}
                data-testid="setup-sport-name"
                onChange={(event) => set({ sportName: event.currentTarget.value })}
              />
            </label>
            <button
              type="button"
              className="setup-reroll"
              onClick={onReroll}
              data-testid="setup-sport-reroll"
            >
              {t("identity.setup.reroll")}
            </button>
          </div>
          {problems.sportName && (
            <small className="invalid">{lengthHint(options.limits.sportNameMaxLength)}</small>
          )}
          <label className="setup-field">
            <span>{t("identity.setup.town")}</span>
            <select
              value={identity.foundingPlace}
              data-testid="setup-founding-town"
              onChange={(event) => set({ foundingPlace: event.currentTarget.value })}
            >
              {places.map((place) => (
                <option key={place} value={place}>
                  {place}
                </option>
              ))}
            </select>
            <small>{t("identity.setup.townHelp", { country: countryName })}</small>
          </label>
          <label className="setup-field">
            <span>{t("identity.setup.clubName")}</span>
            <input
              type="text"
              value={identity.clubName}
              maxLength={options.limits.clubNameMaxLength + 8}
              aria-invalid={problems.clubName}
              data-testid="setup-club-name"
              onChange={(event) => set({ clubName: event.currentTarget.value })}
            />
            <small className={problems.clubName ? "invalid" : undefined}>
              {problems.clubName
                ? lengthHint(options.limits.clubNameMaxLength)
                : t("identity.setup.clubPreview", { club })}
            </small>
          </label>
          <label className="setup-field">
            <span>{t("identity.setup.groundName")}</span>
            <input
              type="text"
              value={identity.groundName}
              maxLength={options.limits.groundNameMaxLength + 8}
              aria-invalid={problems.groundName}
              data-testid="setup-ground-name"
              onChange={(event) => set({ groundName: event.currentTarget.value })}
            />
            {problems.groundName && (
              <small className="invalid">{lengthHint(options.limits.groundNameMaxLength)}</small>
            )}
          </label>
        </div>
        <div>
          <label className="setup-field">
            <span>{t("identity.setup.birthplace")}</span>
            <select
              value={identity.birthplace}
              data-testid="setup-birthplace"
              onChange={(event) => set({ birthplace: event.currentTarget.value })}
            >
              {options.birthplaces.map((id) => (
                <option key={id} value={id}>
                  {t(`identity.birthplaces.${id}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="setup-field">
            <span>{t("identity.setup.ethos")}</span>
            <select
              value={identity.ethos}
              data-testid="setup-ethos"
              onChange={(event) => set({ ethos: event.currentTarget.value })}
            >
              {options.ethos.map((id) => (
                <option key={id} value={id}>
                  {t(`identity.ethos.${id}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>{t("identity.setup.terms")}</legend>
            <div className="setup-terms">
              {(["score", "match", "season"] as const).map((kind) => (
                <label key={kind} className="setup-field">
                  <span>{t(`identity.setup.${kind}Term`)}</span>
                  <select
                    value={identity.terms[kind]}
                    data-testid={`setup-term-${kind}`}
                    onChange={(event) =>
                      set({ terms: { ...identity.terms, [kind]: event.currentTarget.value } })
                    }
                  >
                    {options.terms[kind].map((id) => (
                      <option key={id} value={id}>
                        {t(`identity.terms.${kind}.${id}`, { count: 1 })}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="setup-preview" data-testid="setup-identity-preview">
          <div className="setup-preview-heading">
            <Emblem
              {...identity.emblem}
              primary={colors[identity.emblem.primary] ?? "#000"}
              secondary={colors[identity.emblem.secondary] ?? "#fff"}
              size={56}
            />
            <div>
              <span className="preview-note">{t("identity.setup.preview")}</span>
              <strong>{identity.sportName.trim()}</strong>
              <span className="preview-note">{t(`identity.ethos.${identity.ethos}`)}</span>
            </div>
          </div>
          {genome && (
            <FieldDiagram
              genome={genome}
              playersPerSide={options.playersPerSide[genome.teamSize]}
              homeColor={colors[identity.emblem.primary] ?? "#000"}
              awayColor={VISITORS}
              homeName={club}
            />
          )}
        </div>
        <div className="setup-emblem">
          <fieldset>
            <legend>{t("identity.setup.shape")}</legend>
            <div className="emblem-choices">
              {options.emblem.shapes.map((shape) => (
                <label key={shape} className={identity.emblem.shape === shape ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="emblem-shape"
                    checked={identity.emblem.shape === shape}
                    aria-label={t(`identity.shapes.${shape}`)}
                    onChange={() => set({ emblem: { ...identity.emblem, shape } })}
                  />
                  <Emblem
                    {...identity.emblem}
                    shape={shape}
                    primary={colors[identity.emblem.primary] ?? "#000"}
                    secondary={colors[identity.emblem.secondary] ?? "#fff"}
                    size={26}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t("identity.setup.icon")}</legend>
            <div className="emblem-choices">
              {options.emblem.icons.map((icon) => (
                <label key={icon} className={identity.emblem.icon === icon ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="emblem-icon"
                    checked={identity.emblem.icon === icon}
                    aria-label={t(`identity.icons.${icon}`)}
                    onChange={() => set({ emblem: { ...identity.emblem, icon } })}
                  />
                  <Emblem
                    {...identity.emblem}
                    icon={icon}
                    primary={colors[identity.emblem.primary] ?? "#000"}
                    secondary={colors[identity.emblem.secondary] ?? "#fff"}
                    size={26}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {(["primary", "secondary"] as const).map((which) => (
            <fieldset key={which}>
              <legend>{t(`identity.setup.${which}`)}</legend>
              <div className="emblem-choices">
                {Object.entries(colors).map(([id, hex]) => (
                  <label key={id} className={identity.emblem[which] === id ? "chosen" : ""}>
                    <input
                      type="radio"
                      name={`emblem-${which}`}
                      checked={identity.emblem[which] === id}
                      aria-label={t(`identity.colors.${id}`)}
                      onChange={() => set({ emblem: { ...identity.emblem, [which]: id } })}
                    />
                    <i
                      className="swatch"
                      style={{ background: hex }}
                      title={t(`identity.colors.${id}`)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {problems.colors && <small className="invalid">{t("identity.setup.sameColors")}</small>}
        </div>
      </fieldset>
    </section>
  );
}
