/**
 * Big and headline moments cannot be skipped (GDD v1.26): Next Turn waits until each is
 * collected. Smoke steps run this before ending a turn. It collects every waiting moment window
 * (Next Turn leads back to the map from other screens) and returns to the screen the step was on.
 * Resolves to the number of moments collected.
 */
export const COLLECT_NEWS = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const view = document.querySelector('.game-nav [aria-current="page"]')?.dataset.view ?? "world";
  let collected = 0;
  for (let tries = 0; tries < 200; tries += 1) {
    const game = document.querySelector('[data-testid="game"]');
    const next = document.querySelector('[data-testid="end-turn"]');
    if (!next || next.dataset.news === "0") break;
    if (game.dataset.status !== "ready") { await sleep(40); continue; }
    const collect = document.querySelector('[data-testid="moment-window-collect"]');
    if (collect) { collect.click(); collected += 1; } else next.click();
    await sleep(60);
  }
  if (view !== "world" && document.querySelector('.game-nav [aria-current="page"]')?.dataset.view !== view)
    document.querySelector('.game-nav [data-view="' + view + '"]')?.click();
  await sleep(60);
  return collected;
})()`;
