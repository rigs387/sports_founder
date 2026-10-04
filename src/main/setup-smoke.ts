import type { BrowserWindow } from "electron";

export async function verifySetup(win: BrowserWindow, screenshot: (name: string) => Promise<void>) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const waitFor = async (code: string) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new Error(`Setup condition timed out: ${code}`);
  };
  await waitFor(`document.querySelector('[data-testid="setup-anchor"]')?.options.length === 214`);
  if (
    await evaluate<boolean>(
      `!!document.querySelector('[data-testid="game"]') || !document.querySelector('[data-testid="setup-continue"]').disabled`,
    )
  )
    throw new Error("Campaign started before an anchor was chosen.");
  const select = (selector: string, value: string) =>
    evaluate(
      `(() => { const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  await select('[data-testid="setup-anchor"]', "tuvalu");
  await waitFor(
    `document.querySelector('[data-testid="setup-hints"]')?.dataset.anchor === 'tuvalu'`,
  );
  await screenshot("00-setup-tuvalu.png");
  await select('[data-testid="setup-anchor"]', "india");
  await select('[data-testid="setup-anchor"]', "brazil");
  await waitFor(
    `document.querySelector('[data-testid="setup-hints"]')?.dataset.anchor === 'brazil'`,
  );
  await select('[data-testid="setup-preset"]', "street-court");
  await evaluate(`document.querySelector('input[name="contact"][value="full"]').click()`);
  await waitFor(`document.querySelector('[data-testid="setup-preset"]').value === 'custom'`);
  const seed = (value: string) =>
    evaluate(
      `(() => {const input=document.querySelector('[data-testid="setup-seed"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await seed("-1");
  await waitFor(`document.querySelector('[data-testid="setup-continue"]').disabled`);
  await seed("424242");
  await waitFor(`!document.querySelector('[data-testid="setup-continue"]').disabled`);
  const expectedGenome = await evaluate<Record<string, string>>(
    `Object.fromEntries([...document.querySelectorAll('.genome-grid input:checked')].map(input=>[input.name,input.value]))`,
  );
  if (
    Object.keys(expectedGenome).length !== 10 ||
    expectedGenome.surface !== "street" ||
    expectedGenome.contact !== "full"
  )
    throw new Error("Preset/custom genome controls did not update.");
  await screenshot("00-setup-ready.png");
  const fits = (control: string) =>
    evaluate<boolean>(
      `document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight && document.querySelector('[data-testid="${control}"]').getBoundingClientRect().bottom <= innerHeight`,
    );
  if (!(await fits("setup-continue")))
    throw new Error("Setup's continue control does not fit the desktop viewport.");
  const narrow = async (name: string) => {
    win.setContentSize(390, 844);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!(await evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)))
      throw new Error(`Setup overflows on a narrow viewport (${name}).`);
    await screenshot(name);
    win.setContentSize(1280, 800);
    await new Promise((resolve) => setTimeout(resolve, 150));
  };
  await narrow("00-setup-narrow.png");

  // The founding (GDD v1.18): name the sport, its club and ground, pick terms and an emblem.
  await evaluate(`document.querySelector('[data-testid="setup-continue"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="setup-identity"]')`);
  if (
    !(await evaluate<boolean>(
      `document.querySelector('[data-testid="start-campaign"]').disabled === false`,
    ))
  )
    throw new Error("The seed's default identity should be ready to start.");
  const type = (testId: string, value: string) =>
    evaluate(
      `(() => {const input=document.querySelector('[data-testid="${testId}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await type("setup-sport-name", "x");
  await waitFor(`document.querySelector('[data-testid="start-campaign"]').disabled`);
  await type("setup-sport-name", "Kettleball");
  const town = await evaluate<string>(
    `document.querySelector('[data-testid="setup-founding-town"]').options[2].value`,
  );
  await select('[data-testid="setup-founding-town"]', town);
  await type("setup-club-name", "Pioneers");
  await select('[data-testid="setup-term-score"]', "goal");
  await select('[data-testid="setup-term-match"]', "fixture");
  await evaluate(
    `document.querySelector('input[name="emblem-shape"][aria-label="Banner"]').click()`,
  );
  await evaluate(`document.querySelector('input[name="emblem-icon"][aria-label="Bolt"]').click()`);
  const ground = await evaluate<string>(
    `document.querySelector('[data-testid="setup-ground-name"]').value`,
  );
  if (!ground.startsWith(town))
    throw new Error(`The default ground should follow the founding town: ${ground}`);
  // The American format: the world plays out the same; only the flagship's champion changes.
  await evaluate(`document.querySelector('[data-testid="setup-format-american"]').click()`);
  await waitFor(`document.querySelector('[data-testid="setup-format-american"]').checked`);
  await waitFor(`!document.querySelector('[data-testid="start-campaign"]').disabled`);
  await screenshot("00-setup-founding.png");
  if (!(await fits("start-campaign")))
    throw new Error("Setup launch control does not fit the desktop viewport.");
  await narrow("00-setup-founding-narrow.png");
  await evaluate(
    `(() => {const button=document.querySelector('[data-testid="start-campaign"]');button.click();button.click();})()`,
  );
  await waitFor(`document.querySelector('[data-testid="game"]')?.dataset.status === 'ready'`);
  const started = await evaluate<{
    anchor: string;
    seed: number;
    turn: number;
    quarter: number;
    genome: Record<string, string>;
    format: string;
    founding: string;
  }>(
    `(() => {const game=document.querySelector('[data-testid="game"]');return {anchor:game.dataset.anchor,seed:Number(game.dataset.seed),turn:Number(game.dataset.turn),quarter:Number(game.dataset.quarter),genome:JSON.parse(game.dataset.genome),format:document.querySelector('[data-testid="flagship-screen"]')?.dataset.format,founding:document.querySelector('[data-testid="flagship-founding"]')?.closest('th')?.textContent ?? ''};})()`,
  );
  if (
    started.anchor !== "brazil" ||
    started.seed !== 424242 ||
    started.turn !== 1 ||
    started.quarter !== 0 ||
    started.format !== "american" ||
    !started.founding.includes(`${town} Pioneers`) ||
    Object.entries(expectedGenome).some(([axis, option]) => started.genome[axis] !== option)
  )
    throw new Error(`Setup choices did not reach the worker: ${JSON.stringify(started)}`);
  return {
    ...started,
    allMarkets: 213,
    invalidSeedBlocked: true,
    customGenome: true,
    shortNameBlocked: true,
    groundFollowsTown: true,
  };
}
