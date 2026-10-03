(() => {
  const data = window.SF_PROGRESS;
  const labels = { built: "Built", partial: "Partial", planned: "Planned" };
  const groupLabels = {
    foundation: "Foundation",
    core: "Core game",
    later: "Later depth",
    release: "Release",
  };
  const byId = new Map(data.systems.map((system) => [system.id, system]));
  const escapeHtml = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  const date = (value) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  const el = (id) => document.getElementById(id);
  const counts = (items) =>
    items.reduce(
      (result, [status]) => {
        result[status]++;
        return result;
      },
      { built: 0, partial: 0, planned: 0 },
    );
  const statusOf = (system) =>
    system.items.every(([status]) => status === "built")
      ? "built"
      : system.items.some(([status]) => status !== "planned")
        ? "partial"
        : "planned";
  const badge = (status) => `<span class="badge ${status}">${labels[status]}</span>`;
  function bar(items) {
    const count = counts(items);
    return `<div class="progress-bar" role="img" aria-label="${count.built} built, ${count.partial} partial, ${count.planned} planned deliverables">${Object.entries(
      count,
    )
      .map(([status, number]) =>
        number ? `<span class="${status}" style="flex-grow:${number}"></span>` : "",
      )
      .join("")}</div>`;
  }
  el("updated").textContent = `Reviewed ${date(data.updated)} · ${data.design}`;
  el("stage").textContent = data.stage;
  el("live-summary").textContent = `PLAYABLE TODAY · GROW A SPORT ACROSS ${data.markets} MARKETS`;
  el("overview-title").textContent = data.headline;
  el("summary").textContent = data.summary;
  el("milestone-title").textContent = data.milestone;
  el("milestone-description").textContent = data.milestoneDescription;
  el("footer-note").textContent =
    `Maintained snapshot · ${date(data.updated)} · Local files, no account or connection needed.`;
  const allItems = data.systems.flatMap((system) => system.items);
  const total = counts(allItems);
  const started = data.systems.filter((system) => statusOf(system) !== "planned").length;
  el("stats").innerHTML = [
    [
      "WORKING DELIVERABLES",
      `${total.built}<span> / ${allItems.length}</span>`,
      `${total.partial} partial · ${total.planned} planned`,
      "Checklist counts, not percent of effort",
    ],
    [
      "SYSTEMS UNDER WAY",
      `${started}<span> / ${data.systems.length}</span>`,
      "Foundation through release",
      "A system can work in part and still need depth",
    ],
    [
      "PLAYABLE EVENT DECK",
      `${data.eventDeck.current}<span> / ${data.eventDeck.target}</span>`,
      "Cards built / Phase 0 target",
      "The engine is ready for a richer library",
    ],
    [
      "AUTOMATED CHECKS",
      `${data.verification.tests}<span> passed</span>`,
      `${data.verification.files} test files · ${date(data.verification.date)}`,
      "Last recorded check, not a live test monitor",
    ],
  ]
    .map(
      ([label, value, note, hint]) =>
        `<div class="stat"><span class="small-label">${label}</span><strong>${value}</strong><p>${note}</p><small>${hint}</small></div>`,
    )
    .join("");
  el("phases").innerHTML = data.phases
    .map(
      (phase, index) =>
        `<article class="phase ${phase.state === "Current" ? "current" : ""}"><div class="phase-top"><span>${String(index + 1).padStart(2, "0")} / ${escapeHtml(phase.name)}</span><span class="phase-state">${escapeHtml(phase.state)}</span></div><h3>${escapeHtml(phase.title)}</h3><p>${escapeHtml(phase.text)}</p></article>`,
    )
    .join("");

  let statusFilter = "all";
  function renderSystems() {
    const query = el("search").value.toLowerCase().trim();
    const group = el("group").value;
    const visible = data.systems.filter(
      (system) =>
        (statusFilter === "all" || statusOf(system) === statusFilter) &&
        (group === "all" || system.group === group) &&
        `${system.title} ${system.gdd} ${system.summary} ${system.next} ${system.items.map((item) => item[1]).join(" ")}`
          .toLowerCase()
          .includes(query),
    );
    el("result-count").textContent = `Showing ${visible.length} of ${data.systems.length} systems`;
    el("empty").hidden = visible.length > 0;
    el("systems").innerHTML = visible
      .map((system) => {
        const count = counts(system.items);
        return `<button type="button" class="system-card" data-system="${escapeHtml(system.id)}" aria-label="${escapeHtml(system.title)}: ${labels[statusOf(system)]}. Open checklist."><span class="system-top"><span class="system-number">${escapeHtml(system.icon)} <span>/ ${groupLabels[system.group]}</span></span>${badge(statusOf(system))}</span><h3>${escapeHtml(system.title)}</h3><p>${escapeHtml(system.summary)}</p>${bar(system.items)}<span class="system-bottom"><span>${count.built} built${count.partial ? ` · ${count.partial} partial` : ""} · ${count.planned} planned</span><span class="card-arrow" aria-hidden="true">↗</span></span></button>`;
      })
      .join("");
  }
  for (const button of document.querySelectorAll("[data-status]"))
    button.addEventListener("click", () => {
      statusFilter = button.dataset.status;
      for (const filter of document.querySelectorAll("[data-status]"))
        filter.setAttribute("aria-pressed", String(filter === button));
      renderSystems();
    });
  el("search").addEventListener("input", renderSystems);
  el("group").addEventListener("change", renderSystems);
  el("reset").addEventListener("click", () => {
    el("search").value = "";
    el("group").value = "all";
    document.querySelector('[data-status="all"]').click();
  });
  renderSystems();

  const sectionLinks = [...document.querySelectorAll("nav a")];
  let scrollPending = false;
  function updateNavigation() {
    let current = sectionLinks[0];
    for (const link of sectionLinks) {
      if (document.querySelector(link.getAttribute("href")).getBoundingClientRect().top <= 180)
        current = link;
    }
    for (const link of sectionLinks) {
      if (link === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    scrollPending = false;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollPending) {
        scrollPending = true;
        requestAnimationFrame(updateNavigation);
      }
    },
    { passive: true },
  );
  updateNavigation();

  el("priority-cards").innerHTML = data.priorities
    .map(
      (priority, index) =>
        `<button type="button" class="priority-card" data-system="${escapeHtml(priority.system)}"><span class="priority-top"><strong>0${index + 1}</strong><span>${escapeHtml(priority.tag)}</span></span><h3>${escapeHtml(priority.title)}</h3><p>${escapeHtml(priority.text)}</p><span class="text-link">View the system <span aria-hidden="true">↗</span></span></button>`,
    )
    .join("");
  el("watch").innerHTML = data.watch
    .map(
      (item) =>
        `<article class="watch-card"><span class="watch-dot" aria-hidden="true"></span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.text)}</p><div><span>Recorded ${date(item.date)}</span><button type="button" data-system="${escapeHtml(item.system)}" aria-label="Inspect ${escapeHtml(byId.get(item.system).title)}">Inspect ↗</button></div></article>`,
    )
    .join("");
  el("history").innerHTML = data.history
    .map(
      (item) =>
        `<li><time datetime="${item.date}">${date(item.date)}</time><div><span class="history-type ${item.type.toLowerCase()}">${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div></li>`,
    )
    .join("");
  el("verification-title").textContent =
    `${data.verification.tests} tests. ${data.verification.files} files.`;
  el("verification-note").textContent =
    `${date(data.verification.date)} — ${data.verification.note}`;
  el("smoke-date").textContent = `UI smoke · ${date(data.verification.smokeDate)}`;
  el("smoke-note").textContent = data.verification.smoke;

  const dialog = el("detail");
  let returnFocus = null;
  function openSystem(id, trigger) {
    const system = byId.get(id);
    if (!system) return;
    if (!dialog.open) returnFocus = trigger;
    el("detail-gdd").textContent = system.gdd;
    el("detail-content").innerHTML =
      `${badge(statusOf(system))}<h2 id="detail-title">${escapeHtml(system.title)}</h2><p class="detail-summary">${escapeHtml(system.summary)}</p>${bar(system.items)}<div class="detail-next"><span class="small-label">NEXT USEFUL STEP</span><p>${escapeHtml(system.next)}</p></div><h3>Implementation checklist</h3><ul class="checklist">${system.items.map(([status, text]) => `<li><span class="check-symbol ${status}" aria-hidden="true">${status === "built" ? "✓" : status === "partial" ? "◐" : "○"}</span><span>${escapeHtml(text)}</span>${badge(status)}</li>`).join("")}</ul><h3>Builds on</h3><div class="dependencies">${system.depends.length ? system.depends.map((dependency) => `<button type="button" data-system="${escapeHtml(dependency)}">${escapeHtml(byId.get(dependency).title)} ↗</button>`).join("") : "<p>This is the foundation for the other systems.</p>"}</div><h3>Sources & evidence</h3><ul class="sources">${system.sources.map(([label, path]) => `<li><a href="${escapeHtml(path)}">${escapeHtml(label)} ↗</a></li>`).join("")}</ul><p class="detail-review">Reviewed ${date(data.updated)} against ${escapeHtml(data.design)}. Planned entries describe design intent, not implemented behavior.</p>`;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    el("close-detail").focus();
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-system]");
    if (trigger) openSystem(trigger.dataset.system, trigger);
  });
  el("close-detail").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => returnFocus?.focus());
  el("print").addEventListener("click", () => window.print());
})();
