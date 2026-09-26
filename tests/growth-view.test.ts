import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGrowthView } from "../src/renderer/src/growth/model";
import { createCampaign, snapshot } from "../src/sim";
import { setupFor, world } from "./helpers";

const view = parseGrowthView(readFileSync("content/growth-view.yaml", "utf8"));

describe("Clubhouse growth content", () => {
  it("places every shipped node without overlap and routes prerequisites left to right", () => {
    expect(Object.keys(view.nodes).sort()).toEqual(
      world.growthTree.nodes.map((node) => node.id).sort(),
    );
    for (const node of world.growthTree.nodes) {
      const position = view.nodes[node.id];
      expect(position).toBeDefined();
      if (!position) throw new Error(node.id);
      for (const prerequisite of node.requires)
        expect((view.nodes[prerequisite]?.x ?? 0) + view.tileWidth).toBeLessThan(position.x);
      for (const other of world.growthTree.nodes.filter(
        (candidate) => candidate.category === node.category && candidate.id !== node.id,
      )) {
        const next = view.nodes[other.id];
        if (!next) throw new Error(other.id);
        expect(
          Math.abs(position.x - next.x) >= view.tileWidth ||
            Math.abs(position.y - next.y) >= view.tileHeight,
        ).toBe(true);
      }
    }
  });

  it("sends real effect modifiers, prerequisites and category tiers across the snapshot boundary", () => {
    const state = createCampaign(world, setupFor(123, "brazil"));
    const nodes = snapshot(state, world).growthNodes;
    for (const content of world.growthTree.nodes) {
      expect(nodes.find((node) => node.nodeId === content.id)).toMatchObject({
        effects: content.effects,
        requires: content.requires,
        unlockTier: world.growthTree.categories[content.category]?.unlockTier,
      });
    }
  });

  it("rejects tile positions outside the board", () => {
    expect(() =>
      parseGrowthView(
        "width: 100\nheight: 100\ntileWidth: 60\ntileHeight: 60\nnodes:\n  too-far: {x: 80, y: 0, icon: ball}\n",
      ),
    ).toThrow("beyond the board");
  });
});
