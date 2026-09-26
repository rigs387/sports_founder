import { parse } from "yaml";
import { z } from "zod";
import type { GrowthNodeSnapshot } from "../../../sim";

export const growthIcons = [
  "ball",
  "voice",
  "trophy",
  "court",
  "club",
  "fans",
  "flag",
  "shield",
  "radio",
  "screen",
] as const;
export type GrowthIconName = (typeof growthIcons)[number];

const schema = z
  .strictObject({
    width: z.number().positive(),
    height: z.number().positive(),
    tileWidth: z.number().positive(),
    tileHeight: z.number().positive(),
    nodes: z.record(
      z.string(),
      z.strictObject({
        x: z.number().nonnegative(),
        y: z.number().nonnegative(),
        icon: z.enum(growthIcons),
      }),
    ),
  })
  .superRefine((layout, ctx) => {
    for (const [id, node] of Object.entries(layout.nodes)) {
      if (node.x + layout.tileWidth > layout.width || node.y + layout.tileHeight > layout.height)
        ctx.addIssue({
          code: "custom",
          path: ["nodes", id],
          message: "Tile extends beyond the board",
        });
    }
  });

export function parseGrowthView(text: string) {
  return schema.parse(parse(text));
}

/** Interaction gating only. The worker rechecks price and legality for every action. */
export function canPurchase(node: GrowthNodeSnapshot, busy: boolean, ended: boolean) {
  return !busy && !ended && node.status === "available" && node.affordable;
}
