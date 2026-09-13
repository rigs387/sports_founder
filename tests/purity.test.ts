import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkPurity, pureZones } from "../scripts/purity";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sf-purity-"));
  tempDirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

describe("simulation purity check", () => {
  it("the real simulation core and content schemas are pure", () => {
    expect(checkPurity(pureZones(repoRoot), repoRoot)).toEqual([]);
  });

  it("flags UI, DOM, Electron, Node, and nondeterministic code in the simulation core", () => {
    const root = fakeRepo({
      "src/sim/bad.ts": [
        'import { app } from "electron";',
        'import { useState } from "react";',
        'import { readFileSync } from "node:fs";',
        'import { App } from "../renderer/src/App";',
        "export const roll = Math.random();",
        "export const now = Date.now();",
        "export const title = document.title;",
      ].join("\n"),
      "src/content/bad.ts": 'import { rand } from "pure-rand";\nexport const env = process.env;',
    });
    const messages = checkPurity(pureZones(root), root).map(
      (v) => `${v.file}:${v.line} ${v.message}`,
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/src\/sim\/bad\.ts:1 .*"electron"/),
        expect.stringMatching(/src\/sim\/bad\.ts:2 .*"react"/),
        expect.stringMatching(/src\/sim\/bad\.ts:3 .*Node built-in "node:fs"/),
        expect.stringMatching(/src\/sim\/bad\.ts:4 .*"\.\.\/renderer\/src\/App"/),
        expect.stringMatching(/src\/sim\/bad\.ts:5 .*Math\.random/),
        expect.stringMatching(/src\/sim\/bad\.ts:6 .*Date/),
        expect.stringMatching(/src\/sim\/bad\.ts:7 .*document/),
        expect.stringMatching(/src\/content\/bad\.ts:1 .*"pure-rand"/),
        expect.stringMatching(/src\/content\/bad\.ts:2 .*process/),
      ]),
    );
  });

  it("allows allowlisted imports, property names, and comments that mention forbidden things", () => {
    const root = fakeRepo({
      "src/sim/ok.ts": [
        'import { z } from "zod";',
        'import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";',
        'import type { World } from "../content";',
        "// Never call Math.random() or Date.now() here.",
        "export const shape = { document: 1, process: 2 };",
        "export const value = shape.document + shape.process;",
      ].join("\n"),
      "src/content/index.ts": "export interface World { id: string }",
    });
    expect(checkPurity(pureZones(root), root)).toEqual([]);
  });
});
