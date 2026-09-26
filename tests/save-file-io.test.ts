import { mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicWrite, readCampaignFile, writeCampaignFile } from "../src/main/save-file-io";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const directories: string[] = [];
afterEach(async () => {
  vi.mocked(rename).mockClear();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function location() {
  const directory = await mkdtemp(join(tmpdir(), "sports-founder-save-"));
  directories.push(directory);
  return { directory, path: join(directory, "campaign.sfsave") };
}

describe("atomic campaign files", () => {
  it("writes compressed JSON and imports both compressed and legacy plain files", async () => {
    const { path } = await location();
    const text = JSON.stringify({ formatVersion: 1, data: "campaign history".repeat(100) });
    await writeCampaignFile(path, text);
    const bytes = await readFile(path);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
    expect(bytes.length).toBeLessThan(Buffer.byteLength(text));
    expect(await readCampaignFile(path)).toBe(text);
    await writeFile(path, text, "utf8");
    expect(await readCampaignFile(path)).toBe(text);
  });
  it("rejects truncated compressed files instead of loading partial JSON", async () => {
    const { path } = await location();
    await writeCampaignFile(path, '{"formatVersion":1}');
    const bytes = await readFile(path);
    await writeFile(path, bytes.subarray(0, bytes.length - 8));
    await expect(readCampaignFile(path)).rejects.toThrow();
  });
  it("creates and replaces a save without leaving temporary files", async () => {
    const { directory, path } = await location();
    await atomicWrite(path, "first");
    await atomicWrite(path, "second");
    expect(await readFile(path, "utf8")).toBe("second");
    expect(await readdir(directory)).toEqual(["campaign.sfsave"]);
  });
  it("preserves the old save and cleans up if replacement fails", async () => {
    const { directory, path } = await location();
    await writeFile(path, "previous campaign", "utf8");
    vi.mocked(rename).mockRejectedValueOnce(new Error("Simulated disk failure"));
    await expect(atomicWrite(path, "new campaign")).rejects.toThrow("Simulated disk failure");
    expect(await readFile(path, "utf8")).toBe("previous campaign");
    expect(await readdir(directory)).toEqual(["campaign.sfsave"]);
  });
});
