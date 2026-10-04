import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { genomeSchema, type Names } from "../../../content";
import { AXIS_IDS, GENOME_AXES, type Genome } from "../../../content/genome-axes";
import {
  type GenomeHints,
  type IdentitySetup,
  SEASON_FORMATS,
  type SeasonFormat,
} from "../../../sim";
import { nameProblems, SetupIdentity } from "../identity/SetupIdentity";
import { useGameStore } from "../state/game-store";
import type { SetupOptions } from "../worker/api";
import { sim } from "../worker/client";
import { SaveLoadControls } from "./SaveLoadControls";

export function CampaignSetupScreen() {
  const { t } = useTranslation();
  const { setupOptions, names, setupError, loadSetup } = useGameStore();
  return (
    <main className="setup-screen" data-testid="campaign-setup">
      <header className="setup-header">
        <span className="brand-emblem" aria-hidden="true">
          {t("map.monogram")}
        </span>
        <div>
          <span className="eyebrow">{t("setup.eyebrow")}</span>
          <h1>{t("setup.title")}</h1>
        </div>
        <p>{t("setup.tagline")}</p>
        <SaveLoadControls />
      </header>
      {setupOptions && names ? (
        <SetupForm options={setupOptions} names={names} />
      ) : (
        <div className="setup-wait" role="status">
          <p>{t(setupError ? "setup.loadError" : "setup.loading")}</p>
          {setupError && (
            <button type="button" className="action-button" onClick={() => void loadSetup()}>
              {t("setup.retry")}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function SetupForm({ options, names }: { options: SetupOptions; names: Names }) {
  const { t } = useTranslation();
  const { status, setupError, startCampaign } = useGameStore();
  const [hintRequest, setHintRequest] = useState({ anchor: "" });
  const { anchor } = hintRequest;
  const [genome, setGenome] = useState<Genome | null>(options.presets[0]?.genome ?? null);
  const [seed, setSeed] = useState(() =>
    String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1),
  );
  const [seasonFormat, setSeasonFormat] = useState<SeasonFormat>("european");
  const [hints, setHints] = useState<{ anchor: string; values: GenomeHints } | null>(null);
  const [hintError, setHintError] = useState(false);
  const [identity, setIdentity] = useState<IdentitySetup | null>(null);
  const [places, setPlaces] = useState<string[]>([]);
  // The ground's default ("<town> Park") follows the founding town until the player edits it.
  const [groundWord, setGroundWord] = useState("");
  const [groundEdited, setGroundEdited] = useState(false);
  const [rerolls, setRerolls] = useState(0);
  // Two pages, each fitting the window: the birthplace and the sport, then the founding.
  const [stage, setStage] = useState<"sport" | "founding">("sport");
  const busy = status !== "setup";
  const country = options.countries.find((entry) => entry.id === anchor);
  const preset = options.presets.find((entry) =>
    AXIS_IDS.every((axis) => entry.genome[axis] === genome?.[axis]),
  );
  const seedValue = Number(seed);
  const validSeed =
    /^\d+$/.test(seed) &&
    Number.isInteger(seedValue) &&
    seedValue >= 0 &&
    seedValue <= options.seedMax;
  const currentHints = hints?.anchor === anchor ? hints.values : null;
  const identityProblems = identity ? nameProblems(identity, options.identity) : null;
  const identityValid =
    !!identityProblems && !Object.values(identityProblems).some((problem) => problem);
  const canContinue = !busy && !!country && !!genome && !!currentHints && validSeed && !!identity;
  const canStart = canContinue && stage === "founding" && identityValid;

  useEffect(() => {
    let active = true;
    setHints(null);
    setHintError(false);
    if (hintRequest.anchor)
      void sim.anchorHints(hintRequest.anchor).then(
        (values) => {
          if (active) setHints({ anchor: hintRequest.anchor, values });
        },
        () => {
          if (active) setHintError(true);
        },
      );
    return () => {
      active = false;
    };
  }, [hintRequest]);

  // Choosing a birthplace country fills the founding panel from the seed's defaults the first time;
  // afterwards it moves only the founding town (and an unedited ground name) to the new country.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new country reloads the places
  useEffect(() => {
    let active = true;
    if (!anchor) return;
    void sim.identityDefaults(validSeed ? seedValue : 1, anchor).then((result) => {
      if (!active) return;
      const { defaults } = result;
      setPlaces(result.places);
      setGroundWord(defaults.groundName.slice(defaults.foundingPlace.length + 1));
      setIdentity((current) =>
        current
          ? {
              ...current,
              foundingPlace: defaults.foundingPlace,
              groundName: groundEdited ? current.groundName : defaults.groundName,
            }
          : defaults,
      );
    });
    return () => {
      active = false;
    };
  }, [anchor]);

  const changeIdentity = (next: IdentitySetup) => {
    if (!identity) return;
    if (next.groundName !== identity.groundName) setGroundEdited(true);
    else if (next.foundingPlace !== identity.foundingPlace && !groundEdited)
      next = { ...next, groundName: `${next.foundingPlace} ${groundWord}` };
    setIdentity(next);
  };

  return (
    <form
      className="setup-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canStart && genome)
          void startCampaign({
            anchorCountryId: anchor,
            genome: { ...genome },
            seed: seedValue,
            seasonFormat,
            ...(identity ? { identity } : {}),
          });
      }}
    >
      <div className="setup-columns" hidden={stage !== "sport"}>
        <section className="setup-anchor setup-panel" aria-labelledby="anchor-heading">
          <span className="eyebrow">{t("setup.stepOne")}</span>
          <h2 id="anchor-heading">{t("setup.anchorTitle")}</h2>
          <p>{t("setup.anchorIntro")}</p>
          <label className="setup-field">
            <span>{t("setup.anchorLabel")}</span>
            <select
              value={anchor}
              onChange={(event) => setHintRequest({ anchor: event.currentTarget.value })}
              disabled={busy}
              required
              data-testid="setup-anchor"
            >
              <option value="" disabled>
                {t("setup.chooseAnchor")}
              </option>
              {options.countries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {names.countries[entry.id] ?? entry.id}
                </option>
              ))}
            </select>
          </label>
          <div
            className="setup-anchor-profile"
            data-testid="setup-anchor-profile"
            data-country={anchor}
          >
            <span className="setup-country-badge" aria-hidden="true">
              {country ? (names.countries[anchor] ?? anchor).slice(0, 2).toUpperCase() : "?"}
            </span>
            <h3>{country ? (names.countries[anchor] ?? anchor) : t("setup.emptyAnchor")}</h3>
            <p>
              {country
                ? t("map.countryMeta", {
                    population: t("format.compact", { value: country.population }),
                    continent: t(`map.continents.${country.continent}`),
                  })
                : t("setup.allMarkets", { count: options.countries.length })}
            </p>
          </div>
          <p className="setup-stakes">{t("setup.anchorStakes")}</p>
          <label className="setup-field">
            <span>{t("setup.seed")}</span>
            <input
              type="text"
              inputMode="numeric"
              value={seed}
              onChange={(event) => setSeed(event.currentTarget.value)}
              disabled={busy}
              aria-invalid={!validSeed}
              aria-describedby="seed-help"
              data-testid="setup-seed"
            />
          </label>
          <small id="seed-help">
            {t(validSeed ? "setup.seedHelp" : "setup.seedInvalid", { max: options.seedMax })}
          </small>
        </section>
        <section className="setup-genome setup-panel" aria-labelledby="genome-heading">
          <div className="setup-genome-heading">
            <div>
              <span className="eyebrow">{t("setup.stepTwo")}</span>
              <h2 id="genome-heading">{t("setup.genomeTitle")}</h2>
            </div>
            <label className="setup-field">
              <span>{t("setup.preset")}</span>
              <select
                value={preset?.id ?? "custom"}
                disabled={busy}
                data-testid="setup-preset"
                onChange={(event) => {
                  const next = options.presets.find(
                    (entry) => entry.id === event.currentTarget.value,
                  );
                  if (next) setGenome({ ...next.genome });
                }}
              >
                <option value="custom" disabled>
                  {t("setup.custom")}
                </option>
                {options.presets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {t(`setup.presets.${entry.id}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p
            id="hint-legend"
            className="setup-hint-legend"
            role="status"
            data-testid="setup-hints"
            data-anchor={currentHints ? anchor : ""}
          >
            {t(
              !anchor
                ? "setup.selectForHints"
                : hintError
                  ? "setup.hintError"
                  : !currentHints
                    ? "setup.hintLoading"
                    : "setup.hintLegend",
              { country: names.countries[anchor] ?? anchor },
            )}
            {hintError && (
              <button
                type="button"
                className="action-button"
                onClick={() => setHintRequest({ anchor })}
              >
                {t("setup.retry")}
              </button>
            )}
          </p>
          <div className="genome-grid">
            {AXIS_IDS.map((axis) => (
              <fieldset key={axis} disabled={busy} data-axis={axis} aria-describedby="hint-legend">
                <legend>
                  {t(`genome.axes.${axis}`)}{" "}
                  <small>{t(`setup.kinds.${GENOME_AXES[axis].kind}`)}</small>
                </legend>
                <div className="genome-options">
                  {GENOME_AXES[axis].options.map((option) => {
                    const hint = currentHints?.[axis][option];
                    return (
                      <label key={option} className={genome?.[axis] === option ? "chosen" : ""}>
                        <input
                          type="radio"
                          name={axis}
                          value={option}
                          checked={genome?.[axis] === option}
                          onChange={() =>
                            setGenome(genomeSchema.parse({ ...genome, [axis]: option }))
                          }
                        />
                        <span>{t(`genome.options.${axis}.${option}`)}</span>
                        {currentHints && (
                          <b
                            role="img"
                            className={hint === "-" ? "hint-negative" : "hint-positive"}
                            aria-label={t(
                              hint === "++"
                                ? "setup.hints.strong"
                                : hint === "+"
                                  ? "setup.hints.good"
                                  : hint === "-"
                                    ? "setup.hints.poor"
                                    : "setup.hints.neutral",
                            )}
                          >
                            {hint ?? "·"}
                          </b>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <p className="setup-discovery">{t("setup.discovery")}</p>
        </section>
      </div>
      {stage === "founding" && (
        <SetupIdentity
          options={options.identity}
          identity={identity}
          places={places}
          countryName={names.countries[anchor] ?? anchor}
          genome={genome}
          busy={busy}
          onChange={changeIdentity}
          onReroll={() => {
            const attempt = rerolls + 1;
            setRerolls(attempt);
            void sim.suggestSportName(validSeed ? seedValue : 1, attempt).then((name) => {
              setIdentity((current) => (current ? { ...current, sportName: name } : current));
            });
          }}
        />
      )}
      {stage === "sport" ? (
        <footer className="setup-launch">
          <div>
            <strong>{t("identity.setup.next")}</strong>
            <p>
              {t(country ? "setup.summary" : "setup.readyHint", {
                country: names.countries[anchor] ?? anchor,
                genome: preset ? t(`setup.presets.${preset.id}`) : t("setup.custom"),
              })}
            </p>
          </div>
          <button
            className="advance-turn"
            type="button"
            disabled={!canContinue}
            data-testid="setup-continue"
            onClick={() => setStage("founding")}
          >
            {t("identity.setup.continue")} <span aria-hidden="true">→</span>
          </button>
        </footer>
      ) : (
        <footer className="setup-launch">
          <button
            type="button"
            className="setup-reroll"
            disabled={busy}
            data-testid="setup-back"
            onClick={() => setStage("sport")}
          >
            <span aria-hidden="true">←</span> {t("identity.setup.back")}
          </button>
          <div>
            <strong>{t("setup.stepThree")}</strong>
            <p>
              {t(country ? "setup.summary" : "setup.readyHint", {
                country: names.countries[anchor] ?? anchor,
                genome: preset ? t(`setup.presets.${preset.id}`) : t("setup.custom"),
              })}
            </p>
            {setupError && <p role="alert">{t("setup.startError")}</p>}
          </div>
          <fieldset className="setup-format" disabled={busy} aria-describedby="format-help">
            <legend>{t("setup.formatTitle")}</legend>
            <div>
              {SEASON_FORMATS.map((format) => (
                <label key={format} className={seasonFormat === format ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="season-format"
                    value={format}
                    checked={seasonFormat === format}
                    data-testid={`setup-format-${format}`}
                    onChange={() => setSeasonFormat(format)}
                  />
                  <span>{t(`setup.formats.${format}`)}</span>
                </label>
              ))}
            </div>
            <small id="format-help">{t("setup.formatHelp")}</small>
          </fieldset>
          <button
            className="advance-turn"
            type="submit"
            disabled={!canStart}
            data-testid="start-campaign"
          >
            {t(busy ? "setup.starting" : "setup.start")} <span aria-hidden="true">→</span>
          </button>
        </footer>
      )}
    </form>
  );
}
