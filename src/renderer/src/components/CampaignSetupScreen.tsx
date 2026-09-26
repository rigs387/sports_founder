import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { genomeSchema, type Names } from "../../../content";
import { AXIS_IDS, GENOME_AXES, type Genome } from "../../../content/genome-axes";
import type { GenomeHints } from "../../../sim";
import { useGameStore } from "../state/game-store";
import type { SetupOptions } from "../worker/api";
import { sim } from "../worker/client";

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
  const [hints, setHints] = useState<{ anchor: string; values: GenomeHints } | null>(null);
  const [hintError, setHintError] = useState(false);
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
  const canStart = !busy && !!country && !!genome && !!currentHints && validSeed;

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

  return (
    <form
      className="setup-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canStart && genome)
          void startCampaign({ anchorCountryId: anchor, genome: { ...genome }, seed: seedValue });
      }}
    >
      <div className="setup-columns">
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
      <footer className="setup-launch">
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
        <button
          className="advance-turn"
          type="submit"
          disabled={!canStart}
          data-testid="start-campaign"
        >
          {t(busy ? "setup.starting" : "setup.start")} <span aria-hidden="true">→</span>
        </button>
      </footer>
    </form>
  );
}
