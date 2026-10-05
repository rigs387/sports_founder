import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../src/renderer/src/i18n/locales/en.json";
import { createSimWorkerApi } from "../src/renderer/src/worker/api";
import {
  activeClubs,
  applyAction,
  type BackBlocker,
  backingPrice,
  closeOffseason,
  createCampaign,
  type DropBlocker,
  type GameState,
  offseasonOpen,
  seatStars,
  snapshot,
  stepQuarter,
  type TurnSnapshot,
  type World,
} from "../src/sim";
import { setupFor, withConfig, world } from "./helpers";

// The Stars panel's data (GDD v1.16, tech plan 2.6 step 8): recorded facts, backing and the
// reasons an action is blocked. Skill and star strength never reach the snapshot.

/** Every score to the leading player, so season 1 makes a star; no star moves; PP to spend. */
const content: World = withConfig(world, (config) => {
  config.flagship.players.credit = { base: 1, perSkill: 0, pivot: 50, min: 1, max: 1 };
  config.flagship.stars.moveChance = 0;
  config.start.startingPP = 10_000;
});

/** Brazil after its first season, in the next offseason, with a star. */
function withStar(): GameState {
  let state = createCampaign(content, setupFor(11, "brazil"));
  while (state.flagship.seasons.length < 1) state = stepQuarter(state, content);
  while (!offseasonOpen(state)) state = stepQuarter(state, content);
  return state;
}

function starId(state: GameState): number {
  const star = seatStars(state.flagship)[0];
  if (!star) throw new Error("No star");
  return star.id;
}

const panelStar = (snap: TurnSnapshot, id: number) => {
  const star = snap.flagship.stars.find((s) => s.id === id);
  if (!star) throw new Error(`Player ${id} is not in the Stars panel`);
  return star;
};

/** Every key anywhere in a value. */
function keys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keys(item, found);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      keys(item, found);
    }
  return found;
}

describe("the Stars panel snapshot", () => {
  it("carries recorded facts and backing, never skill or strength", () => {
    const state = withStar();
    const id = starId(state);
    const player = state.flagship.players.find((p) => p.id === id);
    const snap = snapshot(applyAction(state, content, { type: "backStar", playerId: id }), content);
    const leaked = [...keys(snap)].filter((key) => /skill|strength|rating/i.test(key));
    expect(leaked).toEqual([]);
    const star = panelStar(snap, id);
    expect(star).toMatchObject({
      name: player?.name,
      clubId: player?.clubId,
      birthplace: player?.birthplace,
      age: state.flagship.season - (player?.birthSeason ?? 0),
      starSince: player?.starSince,
      finalSeason: player?.finalSeason,
      backing: { season: state.flagship.season, influence: 0, mentee: null },
    });
    expect(star.career.seasons).toBe(player?.career.length);
    expect(star.career.scores).toBe(player?.career.reduce((sum, line) => sum + line.scores, 0));
    expect(snap.flagship.backing).toMatchObject({ slots: 1, used: 1 });
  });

  it("gives every active club's leading player and their scores this season", () => {
    const state = withStar();
    const snap = snapshot(state, content);
    expect(snap.flagship.leaders.map((l) => l.clubId)).toEqual(
      activeClubs(state.flagship).map((club) => club.id),
    );
    for (const leader of snap.flagship.leaders) {
      const tally = state.flagship.tallies?.find((entry) => entry.playerId === leader.playerId);
      expect(leader.scores).toBe(tally?.scores ?? 0);
    }
    const untallied = snapshot(
      { ...state, flagship: { ...state.flagship, tallies: null } },
      content,
    );
    expect(untallied.flagship.leaders.every((l) => l.scores === null)).toBe(true);
    expect(untallied.flagship.stars.every((s) => s.season === null)).toBe(true);
  });
});

describe("backing review and blocker reasons", () => {
  it("quotes the price and says why backing is blocked", () => {
    const state = withStar();
    const id = starId(state);
    const open = snapshot(state, content);
    expect(open.flagship.backing.price).toBe(backingPrice(state, content));
    expect(panelStar(open, id).backBlocker).toBeNull();
    expect(panelStar(snapshot({ ...state, pp: 0 }, content), id).backBlocker).toBe("pp");
    let closed = state;
    closed = closeOffseason(closed, content);
    expect(panelStar(snapshot(closed, content), id).backBlocker).toBe("window");

    // A second star, made by hand, finds the only slot taken.
    const other = state.flagship.players.find(
      (p) =>
        p.starSince === null && p.retiredSeason === null && p.clubId !== panelStar(open, id).clubId,
    );
    if (!other) throw new Error("No second player");
    const twoStars = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map((p) =>
          p.id === other.id ? { ...p, starSince: 1 } : p,
        ),
      },
    };
    const backed = snapshot(
      applyAction(twoStars, content, { type: "backStar", playerId: id }),
      content,
    );
    expect(panelStar(backed, other.id).backBlocker).toBe("slots");
    expect(panelStar(backed, id).backBlocker).toBe("backed");
    expect(panelStar(backed, id).dropBlocker).toBeNull();
  });

  it("shows what a drop at full influence costs", () => {
    const state = withStar();
    const id = starId(state);
    const full = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map((p) =>
          p.id === id
            ? { ...p, backing: { season: 1, influence: 1, honors: false, mentee: null } }
            : p,
        ),
      },
    };
    const snap = snapshot(full, content);
    expect(panelStar(snap, id).backing?.influence).toBe(1);
    expect(snap.flagship.backing.dropHardcoreShare).toBe(
      content.config.flagship.stars.dropDemotionShare,
    );
    const card = content.events.cards.find((c) => c.star === "dropped");
    const drain = card?.arrivalEffects.find((effect) => effect.type === "conversion");
    expect(drain).toBeDefined();
    expect(snap.flagship.backing.dropPressure).toEqual({
      factor: drain?.type === "conversion" ? drain.factor : 0,
      quarters: drain?.quarters,
    });
    let closed = full;
    closed = closeOffseason(closed, content);
    expect(panelStar(snapshot(closed, content), id).dropBlocker).toBe("window");
  });

  it("has a player-facing reason for every blocker", () => {
    const back: BackBlocker[] = ["window", "notStar", "backed", "slots", "pp"];
    const drop: DropBlocker[] = ["window", "notBacked"];
    expect(Object.keys(en.flagship.stars.blockers.back).sort()).toEqual([...back].sort());
    expect(Object.keys(en.flagship.stars.blockers.drop).sort()).toEqual([...drop].sort());
  });
});

describe("the worker round-trip", () => {
  it("backs and drops a star through applyAction", () => {
    const api = createSimWorkerApi(content);
    let snap = api.newCampaign(setupFor(11, "brazil"));
    for (let turn = 0; turn < 20; turn += 1) {
      if (snap.offseasonOpen && snap.flagship.stars.some((s) => s.backBlocker === null)) break;
      snap = api.endTurn().snapshot;
    }
    const star = snap.flagship.stars.find((s) => s.backBlocker === null);
    if (!star) throw new Error("No backable star within 20 turns");

    const backed = api.applyAction({ type: "backStar", playerId: star.id });
    expect(backed.ok).toBe(true);
    expect(backed.snapshot.pp).toBeCloseTo(snap.pp - snap.flagship.backing.price);
    expect(panelStar(backed.snapshot, star.id).backing?.influence).toBe(0);
    expect(backed.snapshot.flagship.backing.used).toBe(1);
    expect(api.applyAction({ type: "backStar", playerId: star.id })).toEqual({
      ok: false,
      reason: "illegal-action",
      snapshot: backed.snapshot,
    });

    const dropped = api.applyAction({ type: "dropStar", playerId: star.id });
    expect(dropped.ok).toBe(true);
    expect(panelStar(dropped.snapshot, star.id).backing).toBeNull();
    expect(dropped.snapshot.flagship.backing.used).toBe(0);
    expect(dropped.snapshot.pp).toBe(backed.snapshot.pp);
    expect(api.applyAction({ type: "dropStar", playerId: star.id }).ok).toBe(false);
  });
});

describe("player-facing text", () => {
  it("confirms every action, stars included", () => {
    const source = readFileSync("src/sim/actions.ts", "utf8");
    const union = source.slice(
      source.indexOf("export type Action ="),
      source.indexOf("export class"),
    );
    const types = [...union.matchAll(/type: "(\w+)"/g)].map((match) => match[1]);
    expect(types).toContain("backStar");
    expect(types).toContain("dropStar");
    for (const type of types) expect(en.actions.success).toHaveProperty(type ?? "");
  });
});
