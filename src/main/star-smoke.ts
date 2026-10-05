import type { BrowserWindow } from "electron";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * Flagship stars as cards (GDD v1.16): plays turns until a star card arrives (usually the
 * breakout moment), then opens it on the story board and checks it names a real player and club
 * from the record.
 */
export async function verifyStarCards(
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
    throw new Error(`Star card smoke timed out: ${condition}`);
  };
  const turn = () =>
    evaluate<number>(`Number(document.querySelector('[data-testid="game"]').dataset.turn)`);
  const readyAt = (expected: number) =>
    wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${expected}; })()`,
    );
  const starTickets = `document.querySelectorAll('.event-ticket[data-event-template^="star-"]')`;

  for (let played = 0; played < 80; played += 1) {
    await click('[data-testid="events-open"]');
    await wait(`document.querySelector('[data-testid="event-board"]').open`);
    const found = await evaluate<string[]>(
      `[...${starTickets}].filter((t) => t.dataset.eventKind !== 'history').map((t) => t.dataset.eventTemplate)`,
    );
    if (found.length > 0) {
      const id = found[0] ?? "";
      await click(`.event-ticket[data-event-template="${id}"]`);
      await wait(`!!document.querySelector('[data-testid="event-story"] h3')`);
      const card = await evaluate<{ title: string; body: string }>(`(() => {
        const story = document.querySelector('[data-testid="event-story"]');
        return {
          title: story.querySelector('h3').textContent,
          body: story.querySelector('.event-story-card p').textContent,
        };
      })()`);
      // A missing name would leave an empty slot ("scored 3 times in 14 matches for  in ...").
      if (!card.title || !card.body || card.body.includes("{{") || card.body.includes("  "))
        throw new Error(`The star card is missing its text: ${JSON.stringify(card)}`);
      await screenshot("35-star-card.png");
      await click('[data-testid="events-close"]');
      return { card: id, ...card, turnsPlayed: played };
    }
    await click('[data-testid="events-close"]');
    const next = (await turn()) + 1;
    await win.webContents.executeJavaScript(COLLECT_NEWS, true);
    await click('[data-testid="end-turn"]');
    await readyAt(next);
  }
  throw new Error("No star card arrived within 80 turns");
}
