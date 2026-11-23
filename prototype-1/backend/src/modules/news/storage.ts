import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import type { IncomingNewsImage } from "./image-validation.js";

const storageDirectory = path.resolve(config.NEWS_UPLOAD_DIR);

function extensionFor(mimeType: string): string {
  return mimeType === "image/png" ? ".png" : ".jpg";
}

export async function saveNewsImage(image: IncomingNewsImage): Promise<string> {
  await mkdir(storageDirectory, { recursive: true });
  const storageKey = `${randomUUID()}${extensionFor(image.mimeType)}`;
  await writeFile(path.join(storageDirectory, storageKey), image.buffer, { flag: "wx" });
  return storageKey;
}

export async function readNewsImage(storageKey: string): Promise<Buffer> {
  return readFile(path.join(storageDirectory, storageKey));
}

export async function removeNewsImage(storageKey: string): Promise<void> {
  await rm(path.join(storageDirectory, storageKey), { force: true });
}
