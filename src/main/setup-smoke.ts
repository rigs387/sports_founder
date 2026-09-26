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
      `!!document.querySelector('[data-testid="game"]') || !document.querySelector('[data-testid="start-campaign"]').disabled`,
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
  await waitFor(`document.querySelector('[data-testid="start-campaign"]').disabled`);
  await seed("424242");
  await waitFor(`!document.querySelector('[data-testid="start-campaign"]').disabled`);
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
  const layout = await evaluate<boolean>(
    `document.documentElement.scrollWidth <= innerWidth && document.querySelector('[data-testid="start-campaign"]').getBoundingClientRect().bottom <= innerHeight`,
  );
  if (!layout) throw new Error("Setup launch control does not fit the desktop viewport.");
  win.setContentSize(390, 844);
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (!(await evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)))
    throw new Error("Setup overflows on a narrow viewport.");
  await screenshot("00-setup-narrow.png");
  win.setContentSize(1280, 800);
  await new Promise((resolve) => setTimeout(resolve, 150));
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
  }>(
    `(() => {const game=document.querySelector('[data-testid="game"]');return {anchor:game.dataset.anchor,seed:Number(game.dataset.seed),turn:Number(game.dataset.turn),quarter:Number(game.dataset.quarter),genome:JSON.parse(game.dataset.genome)};})()`,
  );
  if (
    started.anchor !== "brazil" ||
    started.seed !== 424242 ||
    started.turn !== 1 ||
    started.quarter !== 0 ||
    Object.entries(expectedGenome).some(([axis, option]) => started.genome[axis] !== option)
  )
    throw new Error(`Setup choices did not reach the worker: ${JSON.stringify(started)}`);
  return { ...started, allMarkets: 213, invalidSeedBlocked: true, customGenome: true };
}
