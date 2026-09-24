(async () => {
  const bytes = Uint8Array.from(atob(globalThis.MAP_EXAMPLE_CHUNKS.join("")), (c) =>
    c.charCodeAt(0),
  );
  const data = await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).json();
  delete globalThis.MAP_EXAMPLE_CHUNKS;
  const $ = (id) => document.getElementById(id);
  const map = $("direction-map");
  const scene = $("game-screen");
  const names = data.names.countries;
  const meta = new Map(data.countries.map((country) => [country.id, country]));
  const frames = data.campaigns[0].frames;
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const leagues = {
    amateur: "Amateur",
    "semi-pro": "Semi-pro",
    professional: "Professional",
    elite: "Elite",
  };
  const moveNames = {
    mediaBlitz: "Media blitz",
    youthPrograms: "Youth programs",
    broadcastDeal: "Broadcast deal",
    sponsorLockout: "Sponsor lockout",
  };
  const lookInfo = globalThis.MAP_DIRECTION_OPTIONS ?? {
    floodlights: {
      title: "Floodlights",
      chapter: "YOUR NEXT BIG THING",
      headline: ["Make some", "noise."],
      caption: "Midnight indigo, electric lime, lit territory and a glass scouting card.",
    },
    clubhouse: {
      title: "Clubhouse",
      chapter: "EVERY OBSESSION STARTS SOMEWHERE",
      headline: ["Small sport.", "Big world."],
      caption: "A sunny tabletop world: raised land, rounded pieces and warm, tactile cards.",
    },
    worldtour: {
      title: "World Tour",
      chapter: "FROM THE BACKYARD TO EVERYWHERE",
      headline: ["Take it", "worldwide!"],
      caption:
        "Retro sports energy: lavender, tangerine, halftone ink and collectible country cards.",
    },
    broadcast: {
      title: "Broadcast",
      chapter: "THE WORLD IS YOUR HOME GROUND",
      headline: ["Build your", "legacy."],
      caption:
        "A premium sports game: slate geography, orange territory and crisp, cut-corner stats.",
    },
  };
  let turn = 50;
  let selected = "senegal";
  let countries = new Map();
  const shapes = [];
  const centers = new Map();
  const markers = [];
  const camera = { x: -25, y: 38, z: 1.12 };
  let down = null;
  let dragged = false;
  const defaultLook = Object.keys(lookInfo)[0];
  let look = new URLSearchParams(location.search).get("look") || defaultLook;
  const initials = (id) =>
    ({
      senegal: "SN",
      brazil: "BR",
      france: "FR",
      nigeria: "NG",
      tuvalu: "TV",
      "united-states": "US",
    })[id] ?? names[id].slice(0, 2).toUpperCase();
  const text = (id, value) => {
    $(id).textContent = value;
  };
  const strength = (share) =>
    share > 0 && share < 0.001 ? "<0.1%" : `${(share * 100).toFixed(1)}%`;
  const bin = (share) =>
    share <= 0
      ? 0
      : share < 0.001
        ? 1
        : share < 0.01
          ? 2
          : share < 0.05
            ? 3
            : share < 0.15
              ? 4
              : share < 0.3
                ? 5
                : 6;
  const defending = (country) =>
    country.rivals.find((rival) => ["defending", "entrenched"].includes(rival.level));
  function svg(tag, attributes, parent) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes ?? {})) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  }
  for (const path of data.graticule) svg("path", { d: path }, $("geo-lines"));
  for (const shape of data.shapes) {
    if (shape.unit === "ATA") continue;
    svg("path", { d: shape.path }, $("land-depth"));
    const path = svg(
      "path",
      {
        d: shape.path,
        class: shape.market ? "world-land" : "neutral-land",
        "fill-rule": "evenodd",
      },
      $("lands"),
    );
    if (!shape.market) continue;
    path.dataset.market = shape.market;
    shapes.push({ ...shape, node: path });
    svg("path", { d: shape.path, "fill-rule": "evenodd" }, $("land-grain"));
    if (!centers.has(shape.market)) centers.set(shape.market, shape.center);
    if (shape.small) {
      const group = svg(
        "g",
        { transform: `translate(${shape.center.join(" ")})` },
        $("market-dots"),
      );
      group.dataset.market = shape.market;
      const hit = svg("circle", { r: 8, fill: "transparent", "pointer-events": "all" }, group);
      const dot = svg("circle", { r: 2.2, class: "map-dot" }, group);
      markers.push({ dot, hit, market: shape.market });
    }
  }
  for (const [market, unit] of Object.entries({
    portugal: "PRX",
    belgium: "BCR",
    "antigua-and-barbuda": "ACA",
    "papua-new-guinea": "PNX",
    serbia: "SRS",
    tanzania: "TZA",
  })) {
    centers.set(market, data.shapes.find((shape) => shape.unit === unit).center);
  }
  for (const id of ["brazil", "united-states", "france", "nigeria", "india", "south-africa"]) {
    const [x, y] = centers.get(id);
    svg(
      "text",
      { x, y: y + 17, class: "market-label", "text-anchor": "middle" },
      $("map-labels"),
    ).textContent = names[id].toUpperCase();
  }
  // Decorative links to nearby markets; these are not estimates of the sim's spread channels.
  const [sx, sy] = centers.get("senegal");
  for (const id of ["cabo-verde", "gambia", "guinea-bissau"]) {
    const [x, y] = centers.get(id);
    svg(
      "path",
      { d: `M${sx},${sy}Q${(sx + x) / 2},${Math.min(sy, y) - 22} ${x},${y}`, class: "route" },
      $("expansion-routes"),
    );
  }
  for (let i = 0; i < 7; i++) {
    const swatch = document.createElement("i");
    swatch.style.background = `var(--h${i})`;
    $("direction-legend").append(swatch);
  }

  function paintSelection() {
    const layer = $("selected-land");
    layer.replaceChildren();
    if ($("country-card").hidden) return;
    for (const shape of shapes.filter((shape) => shape.market === selected))
      svg("path", { d: shape.path, class: "focus-shape" }, layer);
    const [x, y] = centers.get(selected);
    const group = svg("g", { transform: `translate(${x} ${y}) scale(${1 / camera.z})` }, layer);
    svg("circle", { r: 22, class: "focus-halo" }, group);
    svg("circle", { r: 13, class: "focus-ring" }, group);
    svg("circle", { r: 5, class: "focus-core" }, group);
    const labelWidth = Math.max(62, names[selected].length * 6 + 19);
    svg(
      "rect",
      {
        x: 19,
        y: -11,
        width: labelWidth,
        height: 23,
        rx: document.documentElement.dataset.look === "clubhouse" ? 8 : 3,
        class: "focus-label-bg",
      },
      group,
    );
    svg("text", { x: 28, y: 4, class: "focus-label" }, group).textContent =
      names[selected].toUpperCase();
  }
  function cameraUpdate() {
    $("world-camera").setAttribute(
      "transform",
      `translate(${camera.x} ${camera.y}) scale(${camera.z})`,
    );
    for (const marker of markers) {
      marker.dot.setAttribute("r", 2.2 / camera.z);
      marker.hit.setAttribute("r", 8 / camera.z);
    }
    $("quick-stat").hidden = true;
    paintSelection();
  }
  function reset() {
    Object.assign(camera, { x: -25, y: 38, z: 1.12 });
    cameraUpdate();
  }
  function zoom(factor, point = [560, 330]) {
    const z = Math.max(0.9, Math.min(5, camera.z * factor));
    const ratio = z / camera.z;
    camera.x = point[0] - (point[0] - camera.x) * ratio;
    camera.y = point[1] - (point[1] - camera.y) * ratio;
    camera.z = z;
    cameraUpdate();
  }
  function setLook(value) {
    look = Object.hasOwn(lookInfo, value) ? value : defaultLook;
    document.documentElement.dataset.look = lookInfo[look].baseLook ?? look;
    document.documentElement.dataset.variant = look;
    for (const button of document.querySelectorAll("[data-look-choice]"))
      button.setAttribute("aria-pressed", String(button.dataset.lookChoice === look));
    const info = lookInfo[look];
    text("chapter", info.chapter);
    $("direction-headline").replaceChildren(
      document.createTextNode(info.headline[0]),
      document.createElement("br"),
    );
    const emphasis = document.createElement("em");
    emphasis.textContent = info.headline[1];
    $("direction-headline").append(emphasis);
    text("look-description", info.title);
    text("look-caption", info.caption);
    paintSelection();
  }
  function updateCard() {
    const country = countries.get(selected);
    const rival = defending(country);
    text("country-badge", initials(selected));
    text("card-name", names[selected]);
    text(
      "card-kicker",
      selected === "senegal"
        ? "WHERE IT ALL STARTED"
        : country.focused
          ? "IN YOUR SPOTLIGHT"
          : "COUNTRY INTELLIGENCE",
    );
    const continent = meta.get(selected).continent.replaceAll("-", " ");
    text(
      "card-meta",
      `${compact.format(meta.get(selected).population)} people · ${continent[0].toUpperCase()}${continent.slice(1)}`,
    );
    $("card-share").replaceChildren(
      document.createTextNode(strength(country.share).replace("%", "")),
    );
    const unit = document.createElement("span");
    unit.textContent = "%";
    $("card-share").append(unit);
    const previous = frames[Math.max(0, turn - 1)].countries.find((c) => c.countryId === selected);
    const change = (country.share - previous.share) * 100;
    text("card-trend", `${change >= 0 ? "↗ +" : "↘ "}${change.toFixed(2)} pts`);
    text("card-casual", compact.format(country.casual));
    text("card-hardcore", compact.format(country.hardcore));
    text(
      "card-league",
      country.league ? `${leagues[country.league.tier]} league` : "No league yet",
    );
    text(
      "card-league-note",
      country.league
        ? `$${compact.format(country.league.cash)} in reserve`
        : "A following before a fixture list.",
    );
    text(
      "card-health",
      country.league ? country.league.health.replaceAll("-", " ") : "Undiscovered",
    );
    text(
      "card-rival",
      rival ? `${data.names.sports[rival.sportId]} is pushing back` : "Room to make your mark",
    );
    text(
      "card-rival-note",
      rival
        ? rival.countermoves
            .map((move) => moveNames[move])
            .slice(0, 2)
            .join(" · ") || "An established rival is defending."
        : "No rival is actively defending here.",
    );
    const history = frames
      .slice(0, turn + 1)
      .map((f) => f.countries.find((c) => c.countryId === selected).share);
    const max = Math.max(0.001, ...history);
    const points = history.map((value, i) => [
      (i / Math.max(1, history.length - 1)) * 274,
      46 - (value / max) * 40,
    ]);
    const curve = `M${points.map((p) => p.join(",")).join("L")}`;
    $("chart-line").setAttribute("d", curve);
    $("chart-area").setAttribute("d", `${curve}L274,54L0,54Z`);
    const last = points.at(-1);
    $("chart-dot").setAttribute("cx", last[0]);
    $("chart-dot").setAttribute("cy", last[1]);
    text("chart-end", `TURN ${frames[turn].turn}`);
    paintSelection();
  }
  function render() {
    countries = new Map(frames[turn].countries.map((country) => [country.countryId, country]));
    for (const shape of shapes)
      shape.node.style.fill = `var(--h${bin(countries.get(shape.market).share)})`;
    const score = frames[turn].countries.reduce(
      (sum, c) => sum + c.share * meta.get(c.countryId).population,
      0,
    );
    const count = frames[turn].countries.filter((c) => c.share >= 0.01).length;
    text("fandom", compact.format(score));
    text("prestige", new Intl.NumberFormat("en").format(frames[turn].pp));
    text("world-note", `${count} markets. One growing obsession.`);
    text("objective-note", `${count} markets have reached 1% fandom strength.`);
    text(
      "objective-title",
      count > 15 ? "Your game is going places." : "Every movement starts somewhere.",
    );
    text("season-label", `Q${frames[turn].quarterOfYear} / ${frames[turn].year}`);
    text("replay-label", `TURN ${frames[turn].turn}`);
    $("direction-turn").value = turn;
    $("advance-turn").disabled = turn === frames.length - 1;
    $("quick-stat").hidden = true;
    updateCard();
  }
  function showQuick(id, event) {
    const country = countries.get(id);
    text("quick-badge", initials(id));
    text("quick-name", names[id]);
    text(
      "quick-status",
      id === "senegal"
        ? "Home of your sport"
        : defending(country)
          ? "Rival defending this market"
          : "A place to grow the game",
    );
    text("quick-share", strength(country.share));
    text("quick-fans", compact.format(country.casual + country.hardcore));
    text(
      "quick-league",
      country.league ? `${leagues[country.league.tier]} league` : "No league yet",
    );
    $("quick-meter-fill").style.width = `${Math.min(100, country.share * 100)}%`;
    const tip = $("quick-stat");
    tip.hidden = false;
    const bounds = scene.getBoundingClientRect();
    let x = event.clientX - bounds.left + 20;
    if (x + tip.offsetWidth > bounds.width - 15)
      x = event.clientX - bounds.left - tip.offsetWidth - 20;
    tip.style.left = `${Math.max(10, x)}px`;
    tip.style.top = `${Math.max(90, Math.min(bounds.height - tip.offsetHeight - 90, event.clientY - bounds.top - 40))}px`;
  }
  const localPoint = (event) =>
    new DOMPoint(event.clientX, event.clientY).matrixTransform(map.getScreenCTM().inverse());
  map.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      down = { point: localPoint(event), x: camera.x, y: camera.y, id: event.pointerId };
      dragged = false;
    }
  });
  map.addEventListener("pointermove", (event) => {
    if (down) {
      const point = localPoint(event);
      const dx = point.x - down.point.x;
      const dy = point.y - down.point.y;
      if (Math.hypot(dx, dy) > 4) {
        dragged = true;
        map.setPointerCapture(event.pointerId);
      }
      if (dragged) {
        camera.x = down.x + dx;
        camera.y = down.y + dy;
        cameraUpdate();
        return;
      }
    }
    const id = event.target.closest("[data-market]")?.dataset.market;
    if (id) showQuick(id, event);
    else $("quick-stat").hidden = true;
  });
  map.addEventListener("pointerup", (event) => {
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    down = null;
  });
  map.addEventListener("pointercancel", () => {
    down = null;
  });
  map.addEventListener("pointerleave", () => {
    $("quick-stat").hidden = true;
    if (!dragged) down = null;
  });
  map.addEventListener("click", (event) => {
    const id = event.target.closest("[data-market]")?.dataset.market;
    if (!dragged && id) {
      selected = id;
      $("country-card").hidden = false;
      updateCard();
      $("quick-stat").hidden = true;
    }
    dragged = false;
  });
  map.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = localPoint(event);
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, [point.x, point.y]);
    },
    { passive: false },
  );
  for (const button of document.querySelectorAll("[data-look-choice]"))
    button.addEventListener("click", () => setLook(button.dataset.lookChoice));
  $("direction-turn").addEventListener("input", (event) => {
    turn = Number(event.target.value);
    render();
  });
  $("advance-turn").addEventListener("click", () => {
    turn = Math.min(frames.length - 1, turn + 1);
    render();
  });
  $("zoom-plus").addEventListener("click", () => zoom(1.35));
  $("zoom-minus").addEventListener("click", () => zoom(1 / 1.35));
  $("recenter").addEventListener("click", reset);
  $("card-close").addEventListener("click", () => {
    $("country-card").hidden = true;
    paintSelection();
  });
  $("card-action").addEventListener("click", () => {
    const [x, y] = centers.get(selected);
    camera.z = 2.5;
    camera.x = 530 - x * camera.z;
    camera.y = 355 - y * camera.z;
    cameraUpdate();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      $("quick-stat").hidden = true;
      $("country-card").hidden = true;
      paintSelection();
    }
  });
  setLook(look);
  render();
  cameraUpdate();
  document.body.dataset.ready = "true";
})().catch((error) => {
  console.error(error);
  document.getElementById("look-caption").textContent =
    "The local preview data could not load. Open this page in a current browser.";
});
