import type { BrowserWindow } from "electron";

/**
 * A rival world championship (GDD v1.17) reaches the player as a moment early in every campaign (after the first turns):
 * soccer's starts in the campaign's second quarter. Opens it on the story board and checks it names
 * the rival and its championship (a generic name from names.yaml).
 */
export async function verifyChampionshipCard(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new Error(`Championship card smoke timed out: ${condition}`);
  };
  const ticket = '.event-ticket[data-event-template="rival-championship"]';
  await click('[data-testid="events-open"]');
  await wait(`document.querySelector('[data-testid="event-board"]').open`);
  // Offered on turn 3 and collected since: it is in the recent history.
  await click('[data-testid="events-history"]');
  await wait(`!!document.querySelector('${ticket}')`);
  await click(ticket);
  await wait(`!!document.querySelector('[data-testid="event-story"] h3')`);
  const card = await evaluate<{ title: string; body: string }>(`(() => {
    const story = document.querySelector('[data-testid="event-story"]');
    return {
      title: story.querySelector('h3').textContent,
      body: story.querySelector('.event-story-card p').textContent,
    };
  })()`);
  if (
    !card.title.includes("Soccer") ||
    !card.body.includes("world championship") ||
    card.body.includes("{{")
  )
    throw new Error(`The championship card is missing its names: ${JSON.stringify(card)}`);
  await screenshot("02b-championship-card.png");
  await click('[data-testid="events-close"]');
  return card;
}
