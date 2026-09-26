import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
// File protocol resource ceiling, not a simulation tuning value. Applies before and after inflate.
export const MAX_SAVE_BYTES = 64 * 1024 * 1024;

export async function writeCampaignFile(path: string, text: string): Promise<void> {
  if (Buffer.byteLength(text) > MAX_SAVE_BYTES) throw new Error("Save exceeds file size limit");
  await atomicWrite(path, await compress(text));
}

export async function readCampaignFile(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX_SAVE_BYTES) throw new Error("Invalid save file size");
    // A bounded read also protects against a file growing after stat.
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > info.size) throw new Error("Save file changed while reading");
    const data = bytes.subarray(0, length);
    // Plain JSON remains importable for existing headless saves and hand-authored migrations.
    return data[0] === 0x1f && data[1] === 0x8b
      ? (await decompress(data, { maxOutputLength: MAX_SAVE_BYTES })).toString("utf8")
      : data.toString("utf8");
  } finally {
    await file.close();
  }
}

/** Same-directory exclusive temp file, flushed and closed before the atomic replacement. */
export async function atomicWrite(path: string, text: string | Uint8Array): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await open(temporary, "wx");
    created = true;
    try {
      await file.writeFile(text, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    if (created)
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
}
