/* Documentation prototype: local, recorded TurnSnapshot data; no simulation in the renderer. */
(async () => {
  const bytes = Uint8Array.from(atob(globalThis.MAP_EXAMPLE_CHUNKS.join("")), (c) =>
    c.charCodeAt(0),
  );
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const data = await new Response(stream).json();
  delete globalThis.MAP_EXAMPLE_CHUNKS;
  const byId = (id) => document.getElementById(id);
  const svg = byId("world-map");
  const ns = "http://www.w3.org/2000/svg";
  const names = data.names.countries;
  const metadata = new Map(data.countries.map((country) => [country.id, country]));
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });
  const tiers = [
    "",
    "Backyard Game",
    "Local Curiosity",
    "National Pastime",
    "International Sport",
    "Global Religion",
  ];
  const leagueNames = {
    amateur: "Amateur",
    "semi-pro": "Semi-pro",
    professional: "Professional",
    elite: "Elite",
  };
  const moves = {
    mediaBlitz: "Media blitz",
    youthPrograms: "Youth programs",
    broadcastDeal: "Exclusive broadcast deal",
    sponsorLockout: "Sponsor lockout",
  };
  const levelNames = {
    none: "Not watching",
    watching: "Watching",
    defending: "Defending",
    entrenched: "Entrenched",
  };
  const healthNames = {
    healthy: "Healthy",
    struggling: "Struggling",
    "near-collapse": "Near collapse",
  };
  let campaignIndex = 0;
  let frameIndex = 50;
  let selected = "senegal";
  let timer = null;
  let current = new Map();
  let pointer = null;
  let dragged = false;
  const camera = { x: 0, y: 0, zoom: 1 };
  const paths = [];
  const islands = [];
  const centerByMarket = new Map();
  const shapeByMarket = new Map();

  const campaign = () => data.campaigns[campaignIndex];
  const frame = () => campaign().frames[frameIndex];
  const setText = (id, text) => {
    byId(id).textContent = text;
  };
  const isDefending = (country) =>
    country.rivals.some((rival) => ["defending", "entrenched"].includes(rival.level));
  const strength = (value) => (value > 0 && value < 0.001 ? "<0.1%" : percent.format(value));
  const heatBin = (value) =>
    value <= 0
      ? 0
      : value < 0.001
        ? 1
        : value < 0.01
          ? 2
          : value < 0.05
            ? 3
            : value < 0.15
              ? 4
              : value < 0.3
                ? 5
                : 6;

  function element(tag, attributes = {}, parent) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (parent) parent.append(node);
    return node;
  }

  // Fixed thresholds across every turn and both treatments: the legend never rescales itself.
  const legendLabels = ["0", "<0.1%", "0.1–1%", "1–5%", "5–15%", "15–30%", "30%+"];
  for (const [index, label] of legendLabels.entries()) {
    const stop = document.createElement("span");
    stop.className = "heat-stop";
    const swatch = document.createElement("i");
    swatch.style.background = `var(--heat-${index})`;
    stop.append(swatch, label);
    byId("heat-legend").append(stop);
    if (index > 0) {
      const spacing = 15 - index * 1.6;
      const pattern = element(
        "pattern",
        {
          id: `heat-pattern-${index}`,
          width: spacing,
          height: spacing,
          patternUnits: "userSpaceOnUse",
        },
        svg.querySelector("defs"),
      );
      element(
        "circle",
        { cx: 2, cy: 2, r: index < 4 ? 0.8 : 1.15, fill: "var(--ink)", opacity: 0.3 },
        pattern,
      );
      if (index >= 5)
        element(
          "path",
          {
            d: `M0 ${spacing}L${spacing} 0`,
            stroke: "var(--ink)",
            "stroke-width": 0.6,
            opacity: 0.28,
          },
          pattern,
        );
    }
  }
  for (const path of data.graticule) element("path", { d: path }, byId("graticule"));

  for (const shape of data.shapes) {
    const path = element(
      "path",
      {
        d: shape.path,
        class: shape.market ? "market" : "unclaimed",
        "fill-rule": "evenodd",
      },
      byId("countries"),
    );
    if (!shape.market) {
      element("title", {}, path).textContent = `${shape.name} · outside a game market`;
      continue;
    }
    path.dataset.market = shape.market;
    element("title", {}, path).textContent = names[shape.market];
    const pattern = element(
      "path",
      { d: shape.path, "fill-rule": "evenodd" },
      byId("market-patterns"),
    );
    const outline = element(
      "path",
      { d: shape.path, class: "rival-outline" },
      byId("country-outlines"),
    );
    paths.push({ shape, path, pattern, outline });
    const grouped = shapeByMarket.get(shape.market) ?? [];
    grouped.push(shape);
    shapeByMarket.set(shape.market, grouped);
    if (!centerByMarket.has(shape.market)) centerByMarket.set(shape.market, shape.center);
    if (shape.small) {
      const group = element(
        "g",
        { transform: `translate(${shape.center.join(" ")})` },
        byId("microstates"),
      );
      group.dataset.market = shape.market;
      const target = element("circle", { r: 13, class: "island-target" }, group);
      const dot = element("circle", { r: 3.1, class: "island-dot" }, group);
      element("title", {}, group).textContent = names[shape.market];
      islands.push({ market: shape.market, group, target, dot });
    }
  }
  // Use mainland label points for multi-unit markets, independent of the source's feature order.
  for (const [market, unit] of Object.entries({
    portugal: "PRX",
    belgium: "BCR",
    "antigua-and-barbuda": "ACA",
    "papua-new-guinea": "PNX",
    serbia: "SRS",
    tanzania: "TZA",
  })) {
    centerByMarket.set(market, data.shapes.find((shape) => shape.unit === unit).center);
  }

  for (const country of data.countries.toSorted((a, b) => names[a.id].localeCompare(names[b.id]))) {
    const option = document.createElement("option");
    option.value = country.id;
    option.textContent = names[country.id];
    byId("market-picker").append(option);
  }

  function updateCamera() {
    byId("map-camera").setAttribute(
      "transform",
      `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`,
    );
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    for (const island of islands) {
      island.target.setAttribute("r", 12 / (camera.zoom * scale));
      island.dot.setAttribute("r", 3.1 / (camera.zoom * scale));
    }
    svg.querySelector(".ocean-labels").style.opacity = camera.zoom > 1.2 ? "0" : "0.65";
    byId("zoom-out").disabled = camera.zoom <= 1;
    byId("zoom-in").disabled = camera.zoom >= 10;
    byId("map-tooltip").hidden = true;
    drawSelection();
  }

  function resetView() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    updateCamera();
  }

  function zoomTo(factor, pivot = [550, 280]) {
    const next = Math.max(1, Math.min(10, camera.zoom * factor));
    const ratio = next / camera.zoom;
    camera.x = pivot[0] - (pivot[0] - camera.x) * ratio;
    camera.y = pivot[1] - (pivot[1] - camera.y) * ratio;
    camera.zoom = next;
    if (next === 1) resetView();
    else updateCamera();
  }

  function locate() {
    const center = centerByMarket.get(selected);
    camera.zoom = [
      "tuvalu",
      "gibraltar",
      "england",
      "scotland",
      "wales",
      "northern-ireland",
    ].includes(selected)
      ? 5
      : 3;
    camera.x = 530 - center[0] * camera.zoom;
    camera.y = 285 - center[1] * camera.zoom;
    updateCamera();
  }

  function drawSelection() {
    const layer = byId("selection");
    layer.replaceChildren();
    if (byId("country-panel").hidden) return;
    for (const shape of shapeByMarket.get(selected))
      element("path", { d: shape.path, class: "selected-shape" }, layer);
    const [x, y] = centerByMarket.get(selected);
    const label = element(
      "g",
      { transform: `translate(${x} ${y}) scale(${1 / camera.zoom})` },
      layer,
    );
    element("circle", { r: 9, class: "selected-ring" }, label);
    element("text", { x: 15, y: 4, class: "selected-label" }, label).textContent =
      names[selected].toUpperCase();
  }

  function updatePanel() {
    const country = current.get(selected);
    const meta = metadata.get(selected);
    setText("country-title", names[selected]);
    setText(
      "country-type",
      selected === campaign().anchorCountryId
        ? "BIRTHPLACE OF THE SPORT"
        : country.focused
          ? "IN YOUR FOCUS"
          : "COUNTRY FIELD NOTES",
    );
    setText(
      "country-subtitle",
      `${compact.format(meta.population)} people · ${meta.continent.replaceAll("-", " ")}`,
    );
    setText("country-share", strength(country.share));
    const previous = campaign().frames[Math.max(0, frameIndex - 1)].countries.find(
      (entry) => entry.countryId === selected,
    );
    const change = (country.share - previous.share) * 100;
    setText(
      "country-trend",
      frameIndex === 0
        ? "The founding turn. Everything to play for."
        : `${change >= 0 ? "+" : ""}${change.toFixed(2)} percentage points this turn`,
    );
    setText("casual", compact.format(country.casual));
    setText("hardcore", compact.format(country.hardcore));
    byId("casual").title = integer.format(country.casual);
    byId("hardcore").title = integer.format(country.hardcore);
    const league = country.league;
    setText(
      "league-status",
      league
        ? `${leagueNames[league.tier] ?? league.tier} · ${healthNames[league.health]}`
        : "No league here yet",
    );
    setText(
      "league-finance",
      league
        ? `$${compact.format(league.cash)} in reserve · ${league.lastFlowPerQuarter === null ? "cash flow not yet measured" : `${league.lastFlowPerQuarter >= 0 ? "+" : "−"}$${compact.format(Math.abs(league.lastFlowPerQuarter))} / quarter`}`
        : "A following comes before a fixture list.",
    );
    byId("league-dot").style.color = !league
      ? "var(--muted)"
      : league.health === "healthy"
        ? "var(--accent)"
        : "var(--rust)";
    const rivalList = byId("rival-list");
    rivalList.replaceChildren();
    for (const rival of country.rivals) {
      const row = document.createElement("div");
      row.className = "rival-row";
      const name = document.createElement("span");
      name.textContent = data.names.sports[rival.sportId] ?? rival.sportId;
      const state = document.createElement("span");
      state.className = "rival-state";
      state.textContent = levelNames[rival.level];
      row.append(name, state);
      rivalList.append(row);
      if (rival.countermoves.length) {
        const text = document.createElement("p");
        text.className = "countermoves";
        text.textContent = rival.countermoves.map((move) => moves[move] ?? move).join(" · ");
        rivalList.append(text);
      }
    }
    setText(
      "focus-note",
      country.focused
        ? "◎ Your attention is on this market."
        : country.exposure > 0
          ? "Word of the sport is reaching this market."
          : "The sport has not reached this market yet.",
    );
    const history = campaign()
      .frames.slice(0, frameIndex + 1)
      .map((entry) => entry.countries.find((c) => c.countryId === selected).share);
    const max = Math.max(0.01, ...history);
    const points = history.map(
      (value, index) =>
        `${((index / Math.max(1, history.length - 1)) * 260).toFixed(1)},${(44 - (value / max) * 40).toFixed(1)}`,
    );
    byId("sparkline-line").setAttribute("d", `M${points.join("L")}`);
    byId("sparkline-fill").setAttribute("d", `M0,48L${points.join("L")}L260,48Z`);
    byId("sparkline").querySelector("title").textContent =
      `${names[selected]} fandom strength: ${strength(history[0])} at founding, ${strength(country.share)} now`;
    byId("market-picker").value = selected;
    drawSelection();
  }

  function selectMarket(id, shouldLocate = false) {
    selected = id;
    byId("country-panel").hidden = false;
    updatePanel();
    if (shouldLocate) locate();
  }

  function render() {
    const snapshot = frame();
    current = new Map(snapshot.countries.map((country) => [country.countryId, country]));
    const rivalVisible = byId("rival-toggle").checked;
    const patternVisible = byId("pattern-toggle").checked;
    for (const entry of paths) {
      const country = current.get(entry.shape.market);
      const bin = heatBin(country.share);
      entry.path.style.fill = `var(--heat-${bin})`;
      entry.pattern.setAttribute(
        "fill",
        patternVisible && bin > 0 ? `url(#heat-pattern-${bin})` : "none",
      );
      entry.outline.style.display = rivalVisible && isDefending(country) ? "" : "none";
    }
    for (const island of islands) {
      const country = current.get(island.market);
      island.dot.style.fill = `var(--heat-${heatBin(country.share)})`;
      island.dot.style.stroke = rivalVisible && isDefending(country) ? "var(--rust)" : "var(--ink)";
    }
    const score = snapshot.countries.reduce(
      (sum, country) => sum + country.share * metadata.get(country.countryId).population,
      0,
    );
    setText("total-score", compact.format(score));
    byId("total-score").title = `${integer.format(score)} Fandom Score`;
    const established = snapshot.countries.filter((country) => country.share >= 0.01).length;
    setText("market-count", established);
    setText("pp", integer.format(snapshot.pp));
    byId("pp").title = tiers[snapshot.ppTier];
    setText(
      "plate-description",
      `Backyard Kickball · born in ${names[campaign().anchorCountryId]}`,
    );
    setText("turn-label", `TURN ${snapshot.turn} · Q${snapshot.quarterOfYear}`);
    setText("date-label", snapshot.year);
    setText("start-year", campaign().frames[0].year);
    setText("end-year", campaign().frames.at(-1).year);
    byId("turn-slider").max = campaign().frames.length - 1;
    byId("turn-slider").value = frameIndex;
    byId("turn-slider").setAttribute(
      "aria-valuetext",
      `Turn ${snapshot.turn}, quarter ${snapshot.quarterOfYear}, ${snapshot.year}`,
    );
    byId("next").disabled = frameIndex === campaign().frames.length - 1;
    const defending = snapshot.countries.filter(isDefending).length;
    setText(
      "note-title",
      snapshot.outcome
        ? "The founding league has folded."
        : established === 0
          ? "It begins with a handful of believers."
          : established < 15
            ? "The neighbours have noticed."
            : "It has travelled beyond the touchline.",
    );
    setText(
      "field-note",
      snapshot.outcome
        ? "This recorded campaign has ended. Scrub back to see how it unfolded."
        : `${established} ${established === 1 ? "market has" : "markets have"} reached 1% fandom strength. Rivals are defending in ${defending}. ${campaignIndex === 1 ? "Even the smallest birthplace gets a place on the map." : "Apparently, it was more than a passing interest."}`,
    );
    updatePanel();
  }

  function stopPlayback() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    setText(
      "play",
      frameIndex === campaign().frames.length - 1 ? "↺ Replay spread" : "▶ Play spread",
    );
    byId("play").setAttribute("aria-pressed", "false");
  }

  byId("play").addEventListener("click", () => {
    if (timer !== null) return stopPlayback();
    if (frameIndex === campaign().frames.length - 1) frameIndex = 0;
    setText("play", "Ⅱ Pause spread");
    byId("play").setAttribute("aria-pressed", "true");
    render();
    timer = setInterval(() => {
      frameIndex += 1;
      render();
      if (frameIndex === campaign().frames.length - 1) stopPlayback();
    }, 650);
  });
  byId("turn-slider").addEventListener("input", (event) => {
    frameIndex = Number(event.target.value);
    stopPlayback();
    render();
  });
  byId("next").addEventListener("click", () => {
    frameIndex = Math.min(campaign().frames.length - 1, frameIndex + 1);
    stopPlayback();
    render();
  });
  byId("campaign").addEventListener("change", (event) => {
    campaignIndex = Number(event.target.value);
    frameIndex = 50;
    stopPlayback();
    selected = campaign().anchorCountryId;
    byId("country-panel").hidden = false;
    resetView();
    render();
  });
  byId("rival-toggle").addEventListener("change", render);
  byId("pattern-toggle").addEventListener("change", render);
  byId("zoom-in").addEventListener("click", () => zoomTo(1.45));
  byId("zoom-out").addEventListener("click", () => zoomTo(1 / 1.45));
  byId("reset-view").addEventListener("click", resetView);
  byId("locate").addEventListener("click", locate);
  byId("market-picker").addEventListener("change", (event) => selectMarket(event.target.value));
  byId("find-market").addEventListener("click", () =>
    selectMarket(byId("market-picker").value, true),
  );
  byId("close-panel").addEventListener("click", () => {
    byId("country-panel").hidden = true;
    drawSelection();
    byId("market-picker").focus({ preventScroll: true });
  });
  for (const button of document.querySelectorAll("[data-theme-choice]")) {
    button.addEventListener("click", () => {
      document.documentElement.dataset.theme = button.dataset.themeChoice;
      for (const candidate of document.querySelectorAll("[data-theme-choice]"))
        candidate.setAttribute("aria-pressed", String(candidate === button));
    });
  }

  function mapPoint(event) {
    const point = new DOMPoint(event.clientX, event.clientY);
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    return [local.x, local.y];
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomTo(event.deltaY < 0 ? 1.12 : 1 / 1.12, mapPoint(event));
    },
    { passive: false },
  );
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, start: mapPoint(event), x: camera.x, y: camera.y };
    dragged = false;
  });
  svg.addEventListener("pointermove", (event) => {
    if (pointer?.id === event.pointerId) {
      const position = mapPoint(event);
      const dx = position[0] - pointer.start[0];
      const dy = position[1] - pointer.start[1];
      if (Math.hypot(dx, dy) > 4) {
        dragged = true;
        svg.setPointerCapture(event.pointerId);
      }
      if (dragged) {
        camera.x = pointer.x + dx;
        camera.y = pointer.y + dy;
        updateCamera();
        return;
      }
    }
    const market = event.target.closest("[data-market]")?.dataset.market;
    const tooltip = byId("map-tooltip");
    tooltip.hidden = !market;
    if (!market) return;
    const country = current.get(market);
    tooltip.textContent = `${names[market]} · ${strength(country.share)} fandom\n${country.focused ? "In your focus. " : ""}${isDefending(country) ? "A rival is defending here." : country.share > 0 ? "The sport has found a following." : "Waiting for the first fans."}`;
    const rect = byId("map-stage").getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(event.clientX - rect.left + 16, rect.width - tooltip.offsetWidth - 10))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(event.clientY - rect.top + 16, rect.height - tooltip.offsetHeight - 10))}px`;
  });
  svg.addEventListener("pointerup", (event) => {
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (pointer?.id === event.pointerId) pointer = null;
  });
  svg.addEventListener("pointercancel", () => {
    pointer = null;
  });
  svg.addEventListener("pointerleave", () => {
    byId("map-tooltip").hidden = true;
    if (!dragged) pointer = null;
  });
  svg.addEventListener("click", (event) => {
    const market = event.target.closest("[data-market]")?.dataset.market;
    if (market && !dragged) selectMarket(market);
    dragged = false;
  });
  window.addEventListener("resize", updateCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlayback();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      stopPlayback();
      byId("country-panel").hidden = true;
      drawSelection();
    }
  });
  render();
  updateCamera();
  document.body.dataset.ready = "true";
})();
