// Run with: node scripts/capture-map-example.cjs
// Captures the documentation in the same Electron/Chromium runtime as the game.
const { spawnSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const electron = require("electron");

if (typeof electron === "string") {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [__filename], { stdio: "inherit", windowsHide: true, env });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = electron;
app.commandLine.appendSwitch("force-device-scale-factor", "1");
const out = resolve("docs/world-map/assets/previews");
const reportDir = resolve("runs/map-example");
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1600,
    height: 1320,
    show: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const errors = [];
  const remoteRequests = [];
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
  });
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const remote = /^https?:/.test(details.url);
    if (remote) remoteRequests.push(details.url);
    callback({ cancel: remote });
  });
  const read = (fn) => window.webContents.executeJavaScript(`(${fn.toString()})()`);
  const settle = () => new Promise((done) => setTimeout(done, 350));
  const capture = async (name) => {
    await settle();
    writeFileSync(resolve(out, name), (await window.webContents.capturePage()).toPNG());
  };
  try {
    await window.loadFile(resolve("docs/world-map/studies/atlas.html"));
    // Hidden windows can defer animation frames. Capture the final colours deterministically.
    await window.webContents.insertCSS(
      "* { transition: none !important; animation: none !important; }",
    );
    const deadline = Date.now() + 10000;
    while (!(await read(() => document.body.dataset.ready === "true")) && Date.now() < deadline)
      await settle();
    const ready = await read(() => document.body.dataset.ready === "true");
    if (!ready) throw new Error(`Example did not initialize: ${errors.join("; ")}`);
    await capture("almanac.png");
    const first = await read(() => ({
      turn: document.getElementById("turn-label").textContent,
      fandom: document.getElementById("country-share").textContent,
      markets: document.getElementById("market-picker").options.length,
      selected: document.getElementById("country-title").textContent,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    if (first.markets !== 213 || first.selected !== "Senegal" || first.pageOverflow)
      throw new Error(JSON.stringify(first));
    const next = await read(() => {
      document.getElementById("next").click();
      return document.getElementById("turn-label").textContent;
    });
    if (next === first.turn) throw new Error("Next turn did not advance");
    const allMarkets = await read(() => {
      const picker = document.getElementById("market-picker");
      const failures = [];
      for (const option of picker.options) {
        picker.value = option.value;
        picker.dispatchEvent(new Event("change"));
        if (document.getElementById("country-title").textContent !== option.textContent)
          failures.push(option.value);
        if (document.getElementById("country-share").textContent.includes("NaN"))
          failures.push(option.value);
      }
      return failures;
    });
    if (allMarkets.length) throw new Error(`Market selection failed: ${allMarkets}`);
    await read(() => {
      const picker = document.getElementById("market-picker");
      picker.value = "senegal";
      picker.dispatchEvent(new Event("change"));
      const slider = document.getElementById("turn-slider");
      slider.value = "50";
      slider.dispatchEvent(new Event("input"));
      document.querySelector('[data-theme-choice="night"]').click();
    });
    await capture("night.png");
    const paletteMatches = await read(() => {
      const swatch = document.createElement("span");
      swatch.style.color = "var(--heat-5)";
      document.body.append(swatch);
      const expected = getComputedStyle(swatch).color;
      const actual = getComputedStyle(
        document.querySelector('#countries [data-market="senegal"]'),
      ).fill;
      swatch.remove();
      return expected === actual;
    });
    if (!paletteMatches) throw new Error("Rendered map fill does not match the active palette");
    const patternCheck = await read(() => {
      document.getElementById("pattern-toggle").click();
      document.getElementById("rival-toggle").click();
      return {
        patterns: document.querySelectorAll('#market-patterns path[fill^="url"]').length,
        rivalHidden: [...document.querySelectorAll(".rival-outline")].every(
          (path) => path.style.display === "none",
        ),
      };
    });
    if (!patternCheck.patterns || !patternCheck.rivalHidden)
      throw new Error("Map overlay toggles failed");
    await read(() => {
      document.getElementById("pattern-toggle").click();
      document.getElementById("rival-toggle").click();
      document.querySelector('[data-theme-choice="almanac"]').click();
      const select = document.getElementById("campaign");
      select.value = "1";
      select.dispatchEvent(new Event("change"));
      document.getElementById("locate").click();
    });
    await capture("tuvalu.png");
    const tuvalu = await read(() => ({
      selected: document.getElementById("country-title").textContent,
      transform: document.getElementById("map-camera").getAttribute("transform"),
      marker: !!document.querySelector('#microstates [data-market="tuvalu"]'),
    }));
    if (tuvalu.selected !== "Tuvalu" || !tuvalu.marker || !tuvalu.transform.includes("scale(5)"))
      throw new Error("Tuvalu marker/locate failed");
    const target = await read(() => {
      const picker = document.getElementById("market-picker");
      picker.value = "fiji";
      picker.dispatchEvent(new Event("change"));
      const marker = document.querySelector('#microstates [data-market="tuvalu"] .island-target');
      const rect = marker.getBoundingClientRect();
      return {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        width: rect.width,
      };
    });
    if (target.width < 23.9) throw new Error("Tuvalu hit target is smaller than 24 pixels");
    window.webContents.sendInputEvent({ type: "mouseMove", x: target.x, y: target.y });
    await settle();
    const tooltipVisible = await read(() => !document.getElementById("map-tooltip").hidden);
    window.webContents.sendInputEvent({
      type: "mouseDown",
      x: target.x,
      y: target.y,
      button: "left",
      clickCount: 1,
    });
    window.webContents.sendInputEvent({
      type: "mouseUp",
      x: target.x,
      y: target.y,
      button: "left",
      clickCount: 1,
    });
    await settle();
    const clickedTuvalu = await read(
      () => document.getElementById("country-title").textContent === "Tuvalu",
    );
    if (!tooltipVisible || !clickedTuvalu) throw new Error("Physical hover/click on Tuvalu failed");
    const beforePan = await read(() =>
      document.getElementById("map-camera").getAttribute("transform"),
    );
    window.webContents.sendInputEvent({
      type: "mouseDown",
      x: 400,
      y: 420,
      button: "left",
      clickCount: 1,
    });
    window.webContents.sendInputEvent({
      type: "mouseMove",
      x: 490,
      y: 440,
      movementX: 90,
      movementY: 20,
    });
    window.webContents.sendInputEvent({
      type: "mouseUp",
      x: 490,
      y: 440,
      button: "left",
      clickCount: 1,
    });
    await settle();
    const afterPan = await read(() =>
      document.getElementById("map-camera").getAttribute("transform"),
    );
    if (beforePan === afterPan) throw new Error("Dragging did not pan the map");
    const limits = await read(() => {
      document.getElementById("reset-view").click();
      for (let i = 0; i < 12; i++) document.getElementById("zoom-in").click();
      const zoomInDisabled = document.getElementById("zoom-in").disabled;
      document.getElementById("reset-view").click();
      const slider = document.getElementById("turn-slider");
      slider.value = slider.max;
      slider.dispatchEvent(new Event("input"));
      return {
        zoomInDisabled,
        zoomOutDisabled: document.getElementById("zoom-out").disabled,
        endDisabled: document.getElementById("next").disabled,
      };
    });
    if (!Object.values(limits).every(Boolean)) throw new Error("Zoom/replay bounds failed");
    await read(() => {
      const slider = document.getElementById("turn-slider");
      slider.value = "0";
      slider.dispatchEvent(new Event("input"));
      document.getElementById("play").click();
    });
    await new Promise((done) => setTimeout(done, 1450));
    const playbackTurn = await read(() => {
      document.getElementById("play").click();
      return Number(document.getElementById("turn-slider").value);
    });
    if (playbackTurn < 1) throw new Error("Playback did not advance");
    window.setContentSize(1280, 800);
    await read(() => {
      const campaign = document.getElementById("campaign");
      campaign.value = "0";
      campaign.dispatchEvent(new Event("change"));
    });
    await capture("deck-1280.png");
    window.setContentSize(390, 844);
    await settle();
    const mobileOverflow = await read(() => document.documentElement.scrollWidth > innerWidth);
    if (mobileOverflow) throw new Error("Mobile page overflows horizontally");
    mkdirSync(reportDir, { recursive: true });
    const report = {
      passed: true,
      first,
      next,
      allMarketsChecked: first.markets,
      patternCheck,
      tuvalu,
      limits,
      playbackTurn,
      paletteMatches,
      clickedTuvalu,
      tooltipVisible,
      hitTargetPixels: target.width,
      mobileOverflow,
      errors,
      remoteRequests,
    };
    if (errors.length || remoteRequests.length)
      throw new Error(JSON.stringify({ errors, remoteRequests }));
    writeFileSync(
      resolve(reportDir, "capture-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
