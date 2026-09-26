const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { app, BrowserWindow } = require("electron");

// Run with Electron, not Node. See README for the hidden-window launcher command.
const output = join(__dirname, "previews");
const profile = join(__dirname, "../../runs/growth-study-profile");
mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.disableHardwareAcceleration();
const errors = [];
const remoteRequests = [];
let window;
const evaluate = (code) => window.webContents.executeJavaScript(code);
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function assert(code, message) {
  if (!(await evaluate(code))) throw new Error(message);
}
async function capture(name) {
  await new Promise((resolve) => setTimeout(resolve, 180));
  writeFileSync(join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  try {
    mkdirSync(output, { recursive: true });
    window = new BrowserWindow({
      width: 1280,
      height: 800,
      useContentSize: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.on("console-message", (details) => {
      if (details.level === "error") errors.push(details.message);
    });
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      if (/^https?:/.test(details.url)) remoteRequests.push(details.url);
      callback({ cancel: /^https?:/.test(details.url) });
    });
    await window.loadFile(join(__dirname, "index.html"));
    await assert(
      'document.querySelectorAll("#node-select option").length === 20',
      "All 20 upgrades available",
    );
    for (const look of ["clubhouse", "floodlit", "album"]) {
      await click(`button[data-look="${look}"]`);
      await capture(look);
      await assert(
        'document.querySelector("#buy").getBoundingClientRect().bottom < 800',
        `${look}: purchase visible at 1280×800`,
      );
      await assert(
        "document.documentElement.scrollWidth <= innerWidth",
        `${look}: no page overflow`,
      );
    }
    await click('button[data-look="clubhouse"]');
    await click('[data-node="community-ownership"]');
    await assert('document.querySelector("#buy").disabled', "Requires both prerequisite nodes");
    await click('[data-node="fan-meetups"]');
    await click("#buy");
    await click('[data-node="community-ownership"]');
    await assert('document.querySelector("#buy").disabled', "One prerequisite is insufficient");
    await click('[data-node="volunteer-organisers"]');
    await click("#buy");
    await click('[data-node="community-ownership"]');
    await assert('!document.querySelector("#buy").disabled', "Both prerequisites unlock the node");
    await click("#reset");
    await click('[data-node="street-courts"]');
    await click("#buy");
    await capture("fork-comparison");
    await click("#cancel-choice");
    await assert(
      'document.querySelector("#budget").textContent === "460"',
      "Cancelling does not spend",
    );
    await click("#buy");
    await click("#confirm-choice");
    await assert(
      'document.querySelector("#budget").textContent === "380"',
      "Fork spends exactly 80 PP",
    );
    await assert(
      'document.querySelector(\'[data-node="club-grounds"]\').classList.contains("excluded")',
      "Sibling is permanently excluded",
    );
    await click('[data-node="club-grounds"]');
    await assert('document.querySelector("#buy").disabled', "Excluded upgrade cannot be bought");
    await click("#reset");
    await click('[data-category="media"]');
    await capture("media");
    await click("#buy");
    await click("#confirm-choice");
    await assert(
      'document.querySelector("#budget").textContent === "160"',
      "Media fork spends 300 PP",
    );
    await click('[data-node="dubbed-broadcasts"]');
    await assert(
      'document.querySelector("#buy").disabled && document.querySelector("#buy").textContent.includes("80 more")',
      "Insufficient budget is explained",
    );
    await click("#reset");
    await evaluate(
      'document.querySelector("#node-select").value = "street-courts"; document.querySelector("#node-select").dispatchEvent(new Event("change"))',
    );
    await assert(
      'document.querySelector("#inspector h2").textContent === "Street Courts"',
      "Selector switches category and detail",
    );
    window.setContentSize(390, 844);
    for (const look of ["clubhouse", "floodlit", "album"]) {
      await click(`button[data-look="${look}"]`);
      await assert(
        "document.documentElement.scrollWidth <= innerWidth",
        `${look}: narrow page does not overflow`,
      );
    }
    await click('button[data-look="clubhouse"]');
    await capture("narrow");
    if (errors.length || remoteRequests.length)
      throw new Error(JSON.stringify({ errors, remoteRequests }));
    console.log(
      "Growth studies passed: 3 looks, 20 nodes, prerequisites, purchases, forks, budget, selector, desktop/narrow, offline.",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
