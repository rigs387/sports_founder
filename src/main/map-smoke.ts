import type { BrowserWindow } from "electron";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exercises real DOM controls and physical canvas input, not a map-only test backend. */
export async function verifyMap(win: BrowserWindow, screenshot: (name: string) => Promise<void>) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const flush = async () => {
    await win.webContents.capturePage();
    await delay(60);
  };
  const state = () =>
    evaluate<{
      ready: boolean;
      turn: number;
      drawnTurn: number;
      markets: number;
      selected: string;
      camera: string;
      zoom: number;
      hitTarget: number;
      patterns: string;
      rivals: string;
      overflow: boolean;
      renderer: string;
    }>(`(() => {
    const map = document.querySelector('[data-testid="world-map"]');
    return {ready:map?.dataset.ready==='true',turn:Number(map?.dataset.turn),drawnTurn:Number(map?.dataset.drawnTurn),markets:Number(map?.dataset.markets),selected:map?.dataset.selected,camera:map?.dataset.camera,zoom:Number(map?.dataset.zoom),hitTarget:Number(map?.dataset.hitTargetPixels),patterns:map?.dataset.patterns,rivals:map?.dataset.rivals,overflow:document.documentElement.scrollWidth>innerWidth,renderer:map?.dataset.renderer};
  })()`);
  const deadline = Date.now() + 15000;
  while (!(await state()).ready && Date.now() < deadline) await delay(100);
  await flush();
  const first = await state();
  if (!first.ready || first.markets !== 213 || first.drawnTurn !== first.turn || first.overflow)
    throw new Error(`Map did not initialize: ${JSON.stringify(first)}`);
  const frames = () =>
    evaluate<number>(`Number(document.querySelector('[data-testid="world-map"]').dataset.frames)`);
  const beforeIdle = await frames();
  await delay(250);
  if ((await frames()) !== beforeIdle) throw new Error("The idle map keeps rendering frames.");
  const history = await evaluate<number>(
    `Number(document.querySelector('[data-testid="country-card"]').dataset.historyPoints)`,
  );
  if (history < 2) throw new Error("Live country history did not grow across turns.");
  const failures = await evaluate<string[]>(`(async () => {
    const picker=document.querySelector('[data-testid="market-picker"]'); const failures=[];
    for(const option of [...picker.options].filter(option=>option.value)) {
      picker.value=option.value; picker.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,5));
      if(document.querySelector('[data-testid="country-card"]')?.dataset.country!==option.value)failures.push(option.value);
    }
    return failures;
  })()`);
  if (failures.length) throw new Error(`Country selector failed: ${failures.join(", ")}`);
  const select = async (id: string) => {
    await evaluate(
      `(() => {const picker=document.querySelector('[data-testid="market-picker"]');picker.value=${JSON.stringify(id)};picker.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await flush();
  };
  const target = () =>
    evaluate<{ x: number; y: number; cardLeft: number }>(
      `(() => {const map=document.querySelector('[data-testid="world-map"]');const box=map.getBoundingClientRect();return {x:Math.round(box.x+Number(map.dataset.selectedX)),y:Math.round(box.y+Number(map.dataset.selectedY)),cardLeft:document.querySelector('[data-testid="country-card"]').getBoundingClientRect().left};})()`,
    );
  await select("brazil");
  const brazil = await target();
  await evaluate(`document.querySelector('.card-close').click()`);
  await flush();
  win.webContents.sendInputEvent({ type: "mouseMove", x: brazil.x, y: brazil.y });
  await flush();
  const hovered = await evaluate<boolean>(
    `document.querySelector('[data-testid="map-tooltip"]')?.textContent.includes('Brazil') ?? false`,
  );
  if (!hovered) throw new Error("Physical hover did not show Brazil's quick card.");
  await screenshot("03-brazil-hover.png");
  win.webContents.sendInputEvent({
    type: "mouseDown",
    x: brazil.x,
    y: brazil.y,
    button: "left",
    clickCount: 1,
  });
  win.webContents.sendInputEvent({
    type: "mouseUp",
    x: brazil.x,
    y: brazil.y,
    button: "left",
    clickCount: 1,
  });
  await flush();
  if ((await state()).selected !== "brazil") throw new Error("Physical click did not pin Brazil.");
  await select("tuvalu");
  const tuvalu = await target();
  if (tuvalu.x >= tuvalu.cardLeft - 12 || tuvalu.x < 12 || tuvalu.y < 90 || tuvalu.y > 700)
    throw new Error(`Tuvalu is hidden by the screen UI: ${JSON.stringify(tuvalu)}`);
  await screenshot("04-tuvalu.png");
  await evaluate(`document.querySelector('.card-close').click()`);
  await flush();
  win.webContents.sendInputEvent({ type: "mouseMove", x: tuvalu.x - 10, y: tuvalu.y });
  await flush();
  const islandHover = await evaluate<boolean>(
    `document.querySelector('[data-testid="map-tooltip"]')?.textContent.includes('Tuvalu') ?? false`,
  );
  if (!islandHover) throw new Error("Tuvalu's minimum screen-space target failed.");
  win.webContents.sendInputEvent({
    type: "mouseDown",
    x: tuvalu.x - 10,
    y: tuvalu.y,
    button: "left",
    clickCount: 1,
  });
  win.webContents.sendInputEvent({
    type: "mouseUp",
    x: tuvalu.x - 10,
    y: tuvalu.y,
    button: "left",
    clickCount: 1,
  });
  await flush();
  if ((await state()).selected !== "tuvalu")
    throw new Error("Tuvalu cannot be pinned through its expanded target.");
  const beforePan = (await state()).camera;
  win.webContents.sendInputEvent({
    type: "mouseDown",
    x: 380,
    y: 420,
    button: "left",
    clickCount: 1,
  });
  for (let step = 1; step <= 6; step++) {
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: 380 + step * 12,
      y: 420,
      movementX: 12,
      movementY: 0,
    });
    await flush();
  }
  win.webContents.sendInputEvent({
    type: "mouseUp",
    x: 452,
    y: 420,
    button: "left",
    clickCount: 1,
  });
  await flush();
  const afterPan = await state();
  if (afterPan.camera === beforePan || afterPan.selected !== "tuvalu")
    throw new Error("Dragging failed or incorrectly selected a market.");
  win.webContents.sendInputEvent({
    type: "mouseWheel",
    x: 450,
    y: 400,
    deltaX: 0,
    deltaY: -120,
    canScroll: true,
  });
  await flush();
  const afterWheel = await state();
  if (Math.abs(afterWheel.zoom - afterPan.zoom) < 0.001)
    throw new Error(
      `Mouse wheel did not zoom: ${JSON.stringify({ before: afterPan, after: afterWheel })}`,
    );
  await evaluate(`document.querySelector('.map-options input').click()`);
  await flush();
  if ((await state()).patterns !== "true") throw new Error("Patterns did not reach the renderer.");
  await evaluate(`document.querySelectorAll('.map-options input')[1].click()`);
  await flush();
  if ((await state()).rivals !== "false") throw new Error("Rival overlay did not turn off.");
  await screenshot("05-patterns.png");
  await evaluate(
    `document.querySelector('.map-options input').click();document.querySelectorAll('.map-options input')[1].click();document.querySelector('.game-topbar > button').click();`,
  );
  await select("albania");
  await evaluate(`document.querySelector('.game-topbar > button').click()`);
  await flush();
  const layout = await evaluate<{ cardFits: boolean; history: number; turn: number }>(
    `(() => {const card=document.querySelector('[data-testid="country-card"]');return {cardFits:card.getBoundingClientRect().bottom<document.querySelector('.game-bottom').getBoundingClientRect().top,history:Number(card.dataset.historyPoints),turn:Number(card.dataset.turn)};})()`,
  );
  if (!layout.cardFits || layout.turn !== first.turn)
    throw new Error(`Card layout/state failed: ${JSON.stringify(layout)}`);
  await screenshot("06-world.png");
  for (const index of [1, 2, 3]) {
    await evaluate(`document.querySelectorAll('.game-nav button')[${index}].click()`);
    await flush();
    const open = await evaluate<boolean>(`document.querySelector('dialog')?.open ?? false`);
    if (!open) throw new Error("Campaign overview did not open.");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await flush();
    if (await evaluate<boolean>(`!!document.querySelector('dialog[open]')`))
      throw new Error("Escape did not close the overview.");
  }
  win.setContentSize(390, 844);
  await delay(150);
  await flush();
  if ((await state()).overflow) throw new Error("Small-screen layout overflows horizontally.");
  await screenshot("07-small-screen.png");
  win.setContentSize(1280, 800);
  await delay(150);
  await flush();
  return {
    first,
    marketsChecked: 213,
    hovered,
    islandHover,
    tuvalu,
    panned: true,
    wheelZoomed: true,
    idleFramesStable: true,
    layout,
    mobileOverflow: false,
  };
}
