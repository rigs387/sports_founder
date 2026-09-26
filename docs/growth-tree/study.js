(() => {
  const data = window.GROWTH_STUDY;
  const $ = (selector) => document.querySelector(selector);
  const byId = (id) => data.nodes.find((node) => node.id === id);
  const names = (ids) => ids.map((id) => byId(id).name).join(" + ");
  const number = (value) => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
  let owned = new Set(data.demo.owned);
  let budget = data.demo.budget;
  let category = "grassroots";
  let selected = data.demo.selected;
  let look = "clubhouse";
  let pending = null;
  const positions = {
    "backyard-clinics": [12, 158],
    "word-of-mouth": [216, 20],
    "weekend-leagues": [216, 130],
    "street-courts": [216, 240],
    "club-grounds": [216, 340],
    "fan-meetups": [420, 20],
    "border-tournaments": [420, 130],
    "volunteer-organisers": [420, 240],
    "community-ownership": [624, 90],
    "barnstorming-tours": [624, 220],
    "local-radio": [12, 158],
    "newspaper-columns": [216, 20],
    "highlight-reels": [216, 158],
    "dubbed-broadcasts": [216, 330],
    "star-profiles": [420, 20],
    "pay-tv-exclusivity": [420, 130],
    "free-to-air": [420, 230],
    "satellite-feed": [420, 340],
    "sponsor-showcase": [624, 20],
    "tabloid-buzz": [624, 130],
  };
  const drawings = {
    ball: '<circle cx="16" cy="16" r="11"/><path d="m16 10 6 4-2 7h-8l-2-7zM16 5v5m11 3-5 1m1 11-3-4m-11 4 3-4M5 13l5 1"/>',
    voice: '<path d="m5 13 17-7v20L5 19zm0 0v6m4 2 2 7h5l-3-5M26 10l3-2m-3 8h4m-4 6 3 2"/>',
    trophy:
      '<path d="M9 5h14v8c0 12-14 12-14 0zM9 8H4v5q0 6 7 6m12-11h5v5q0 6-7 6M16 23v5m-6 0h12"/>',
    court:
      '<path d="M4 7h24v18H4zM16 7v18M4 12h5v8H4m24-8h-5v8h5"/><circle cx="16" cy="16" r="4"/>',
    club: '<path d="m4 14 12-9 12 9M7 12v15h18V12M13 27V17h6v10M16 5V2h7v5"/>',
    fans: '<circle cx="16" cy="9" r="4"/><circle cx="5" cy="13" r="3"/><circle cx="27" cy="13" r="3"/><path d="M9 28v-7a7 7 0 0 1 14 0v7M1 25v-5q4-5 8 0m14 0q4-5 8 0v5"/>',
    flag: '<path d="M8 29V4m0 1q5-4 10 0t10 0v13q-5 4-10 0t-10 0"/>',
    shield: '<path d="m16 3 12 5v9c0 7-12 13-12 13S4 24 4 17V8zM10 16l4 4 8-9"/>',
    radio:
      '<rect x="4" y="10" width="24" height="18" rx="3"/><path d="m8 10 16-7M8 16h8m-8 5h8"/><circle cx="23" cy="19" r="3"/>',
    screen:
      '<rect x="3" y="7" width="26" height="18" rx="3"/><path d="m13 12 8 4-8 4zm-3 18h12M12 2l4 5 4-5"/>',
  };
  const icons = [
    "ball",
    "voice",
    "trophy",
    "court",
    "club",
    "fans",
    "flag",
    "flag",
    "shield",
    "flag",
    "radio",
    "voice",
    "screen",
    "radio",
    "screen",
    "screen",
    "fans",
    "shield",
    "voice",
    "radio",
  ];
  function icon(node) {
    return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[icons[data.nodes.indexOf(node)]]}</svg>`;
  }
  function sibling(node) {
    const fork = data.forks.find((item) => item.nodes.includes(node.id));
    return fork ? byId(fork.nodes.find((id) => id !== node.id)) : null;
  }
  function state(node) {
    if (owned.has(node.id))
      return { kind: "owned", label: "Owned", reason: "Already part of your sport." };
    const other = sibling(node);
    if (other && owned.has(other.id))
      return { kind: "excluded", label: "Path closed", reason: `Locked by ${other.name}.` };
    if (data.demo.tier < data.categories[node.category].unlockTier)
      return {
        kind: "locked",
        label: "Tier locked",
        reason: `Requires tier ${data.categories[node.category].unlockTier}.`,
      };
    const missing = node.requires.filter((id) => !owned.has(id));
    if (missing.length)
      return { kind: "locked", label: "Locked", reason: `Requires ${names(missing)}.` };
    if (budget < node.cost)
      return {
        kind: "locked",
        label: "Save PP",
        reason: `Need ${number(node.cost - budget)} more PP.`,
      };
    return { kind: "ready", label: "Available", reason: "Ready to add to your sport." };
  }
  const effectLabels = {
    casualConversion: "casual conversion",
    hardcoreConversion: "hardcore conversion",
    churnReduction: "casual churn",
    formationThresholdReduction: "league formation threshold",
    coldLaunchCostReduction: "cold-launch surcharge",
    ppIncome: "Prestige income",
    runningCostReduction: "league running costs",
    countermoveResistance: "rival countermove impact",
  };
  const attributeLabels = {
    urbanDensity: "urban density",
    wealth: "wealth",
    mediaMarket: "media market",
    sportCulture: "sport culture",
    climate: "climate",
  };
  function effects(node) {
    return `<ul class="effects">${node.effects
      .map((effect) => {
        const reduction =
          effect.type.endsWith("Reduction") || effect.type === "countermoveResistance";
        const signed = effect.amount * (reduction ? -1 : 1);
        const label =
          effect.type === "spreadChannel" ? `${effect.channel} spread` : effectLabels[effect.type];
        const conditions = effect.conditions
          ? `<small>Base effect; varies with ${Object.keys(effect.conditions)
              .map((key) => attributeLabels[key] ?? key)
              .join(" & ")}.</small>`
          : "";
        return `<li class="${effect.amount < 0 ? "downside" : ""}"><b>${effect.amount < 0 ? "!" : "✓"}</b><span>${signed > 0 ? "+" : "−"}${number(Math.abs(signed) * 100)}% ${label}${conditions}</span></li>`;
      })
      .join("")}</ul>`;
  }
  function renderInspector() {
    const node = byId(selected);
    const status = state(node);
    const other = sibling(node);
    const fork = data.forks.find((item) => item.nodes.includes(node.id));
    const serial = String(data.nodes.indexOf(node) + 1).padStart(2, "0");
    $("#inspector").innerHTML =
      `<div class="detail-art"><span class="serial">SF / GROWTH SERIES / ${serial}</span>${icon(node)}<span class="detail-stamp">${serial}</span></div><div class="detail-body"><p class="eyebrow">${node.category.toUpperCase()} / ${status.label.toUpperCase()}</p><h2>${node.name}</h2><p class="flavor">${data.demo.summaries[node.id]}</p>${effects(node)}<p class="requirement">${node.requires.length ? `Requires <strong>${names(node.requires)}</strong>.` : "Starting upgrade. No prerequisites."}</p>${other ? `<div class="fork-note"><strong>${data.demo.forkNames[fork.id]}</strong><br>${owned.has(other.id) ? `Closed by ${other.name}.` : `Choosing this closes ${other.name}.`}<button type="button" id="compare">Compare both paths ↔</button></div>` : ""}<button type="button" class="buy" id="buy" ${status.kind !== "ready" ? "disabled" : ""}><span>${status.kind === "ready" ? (other ? "Choose this path" : "Add to your sport") : status.reason}</span><b>${status.kind === "owned" ? "✓" : `${number(node.cost)} PP`}</b></button></div>`;
    $("#buy").addEventListener("click", () => (other ? openChoice(node) : purchase(node)));
    $("#compare")?.addEventListener("click", () => openChoice(node));
  }
  function render() {
    const nodes = data.nodes.filter((node) => node.category === category);
    $("#budget").textContent = number(budget);
    $("#owned-count").textContent =
      `${nodes.filter((node) => owned.has(node.id)).length} / ${nodes.length} OWNED`;
    $("#category-description").textContent =
      category === "grassroots" ? "LOCAL PEOPLE. LASTING ROOTS." : "SMALL SIGNAL. BIG AUDIENCE.";
    $("#nodes").innerHTML = nodes
      .map((node) => {
        const [x, y] = positions[node.id];
        const status = state(node);
        return `<button type="button" class="node ${status.kind}" style="left:${x}px;top:${y}px" data-node="${node.id}" aria-pressed="${selected === node.id}" aria-label="${node.name}, ${status.label}, ${node.cost} PP"><span class="node-icon">${icon(node)}</span><span class="node-title">${node.name}</span><span class="node-meta"><span>${status.label}</span><b>${owned.has(node.id) ? "✓" : `${node.cost} PP`}</b></span>${sibling(node) ? '<span class="node-fork">↔ CHOICE</span>' : ""}</button>`;
      })
      .join("");
    $(".routes").innerHTML = nodes
      .flatMap((node) =>
        node.requires.map((id) => {
          const [x1, y1] = positions[id];
          const [x2, y2] = positions[node.id];
          const start = x1 + 166;
          return `<path class="route ${owned.has(id) ? "active" : ""} ${node.id === selected ? "selected" : ""}" d="M${start} ${y1 + 38}C${start + 26} ${y1 + 38},${x2 - 26} ${y2 + 38},${x2} ${y2 + 38}"/>`;
        }),
      )
      .join("");
    document.querySelectorAll("[data-node]").forEach((button) => {
      button.addEventListener("click", () => {
        selected = button.dataset.node;
        render();
        $(`[data-node="${selected}"]`).focus({ preventScroll: true });
      });
    });
    document.querySelectorAll("[data-category]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.category === category));
    });
    $("#node-select").value = selected;
    renderInspector();
  }
  function purchase(node) {
    if (state(node).kind !== "ready") return;
    budget -= node.cost;
    owned.add(node.id);
    render();
    $("#status").textContent =
      `${node.name} added. ${number(budget)} PP left.${sibling(node) ? ` ${sibling(node).name} is now closed.` : ""}`;
    $(`[data-node="${node.id}"]`)?.focus({ preventScroll: true });
  }
  function openChoice(node) {
    pending = node.id;
    const other = sibling(node);
    $("#choice-title").textContent =
      data.demo.forkNames[data.forks.find((fork) => fork.nodes.includes(node.id)).id];
    $("#choice-warning").textContent =
      `Choosing ${node.name} permanently closes ${other.name}. Purchases have no refunds.`;
    $("#comparison").innerHTML = [node, other]
      .map(
        (item, index) =>
          `<section class="compare-card ${index === 0 ? "chosen" : ""}"><p class="eyebrow">${index === 0 ? "YOUR SELECTION" : "THE OTHER PATH"} / ${item.cost} PP</p><h3>${item.name}</h3>${effects(item)}<p class="requirement">${state(item).reason}</p></section>`,
      )
      .join("");
    const status = state(node);
    $("#confirm-choice").disabled = status.kind !== "ready";
    $("#confirm-choice").textContent =
      status.kind === "ready" ? `Choose ${node.name} · ${node.cost} PP` : status.reason;
    $("#choice-dialog").showModal();
    $("#cancel-choice").focus();
  }
  function setLook(value) {
    look = Object.hasOwn(data.demo.looks, value) ? value : "clubhouse";
    document.documentElement.dataset.look = look;
    document.querySelectorAll("button[data-look]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.look === look));
    });
    const description = data.demo.looks[look];
    $("#headline").textContent = description.title;
    $("#look-name").textContent = description.name;
    $("#look-caption").textContent = description.caption;
    history.replaceState(null, "", `#${look}`);
  }
  $("#node-select").innerHTML = Object.keys(data.categories)
    .map(
      (cat) =>
        `<optgroup label="${cat === "grassroots" ? "Grassroots" : "Media"}">${data.nodes
          .filter((node) => node.category === cat)
          .map((node) => `<option value="${node.id}">${node.name}</option>`)
          .join("")}</optgroup>`,
    )
    .join("");
  $("#node-select").addEventListener("change", (event) => {
    selected = event.target.value;
    category = byId(selected).category;
    render();
    $(`[data-node="${selected}"]`).scrollIntoView({ block: "nearest", inline: "center" });
  });
  document.querySelectorAll("button[data-look]").forEach((button) => {
    button.addEventListener("click", () => setLook(button.dataset.look));
  });
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      category = button.dataset.category;
      selected = category === "grassroots" ? "street-courts" : "free-to-air";
      render();
    });
  });
  $("#reset").addEventListener("click", () => {
    owned = new Set(data.demo.owned);
    budget = data.demo.budget;
    render();
    $("#status").textContent = "Example reset. Your campaign is unaffected.";
  });
  $("#cancel-choice").addEventListener("click", () => $("#choice-dialog").close());
  $("#confirm-choice").addEventListener("click", () => {
    $("#choice-dialog").close();
    if (pending) purchase(byId(pending));
    pending = null;
  });
  setLook(location.hash.slice(1));
  render();
})();
