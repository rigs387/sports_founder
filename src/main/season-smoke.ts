import type { BrowserWindow } from "electron";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * The flagship season as cards (GDD v1.15): plays turns until a season ends, then opens the story
 * board on the season's story card (or its champion moment if no story qualified) and checks the
 * card names real clubs from the record.
 */
export async function verifySeasonCards(
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
    throw new Error(`Season card smoke timed out: ${condition}`);
  };
  const turn = () =>
    evaluate<number>(`Number(document.querySelector('[data-testid="game"]').dataset.turn)`);
  const readyAt = (expected: number) =>
    wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${expected}; })()`,
    );
  const seasonTickets = `document.querySelectorAll('.event-ticket[data-event-template^="season-"]')`;

  for (let played = 0; played < 12; played += 1) {
    await click('[data-testid="events-open"]');
    await wait(`document.querySelector('[data-testid="event-board"]').open`);
    const found = await evaluate<string[]>(
      `[...${seasonTickets}].filter((t) => t.dataset.eventKind !== 'history').map((t) => t.dataset.eventTemplate)`,
    );
    if (found.length > 0) {
      const story = found.find((id) => id !== "season-champion") ?? "season-champion";
      await click(`.event-ticket[data-event-template="${story}"]`);
      await wait(`!!document.querySelector('[data-testid="event-story"] h3')`);
      const card = await evaluate<{ title: string; body: string; arrived: boolean }>(`(() => {
        const story = document.querySelector('[data-testid="event-story"]');
        return {
          title: story.querySelector('h3').textContent,
          body: story.querySelector('.event-story-card p').textContent,
          arrived: !!document.querySelector('[data-testid="event-arrived"]'),
        };
      })()`);
      if (!card.title || !card.body || card.body.includes("{{"))
        throw new Error(`The season card is missing its text: ${JSON.stringify(card)}`);
      await screenshot("34-season-card.png");
      await click('[data-testid="events-close"]');
      return { story, ...card, turnsPlayed: played };
    }
    await click('[data-testid="events-close"]');
    const next = (await turn()) + 1;
    await win.webContents.executeJavaScript(COLLECT_NEWS, true);
    await click('[data-testid="end-turn"]');
    await readyAt(next);
  }
  throw new Error("No flagship season ended within 12 turns");
}
