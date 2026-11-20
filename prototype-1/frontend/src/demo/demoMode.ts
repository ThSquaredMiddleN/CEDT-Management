import { z } from "zod";
import type {
  Announcement,
  NewsArticle,
} from "@/api/types";

const PREFIX = "cedt-labsync-demo";
const SESSION_ID_KEY = `${PREFIX}:session-id`;
const ACTIVE_SESSIONS_KEY = `${PREFIX}:active-sessions`;
const ANNOUNCEMENTS_KEY = (sessionId: string) =>
  `${PREFIX}:${sessionId}:announcements`;
const NEWS_KEY = (sessionId: string) => `${PREFIX}:${sessionId}:news`;
const DATABASE_NAME = "cedt-labsync-demo-images";
const IMAGE_STORE = "news-images";
const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const TAGS = [
  "competition",
  "activities",
  "scholarship",
  "internship",
  "academic",
  "other",
] as const;

export const isDemoMode =
  import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Demo Staff",
  email: "demo@cedt.local",
  role: "staff" as const,
  titlePrefix: null,
};

interface StoredImage {
  key: string;
  sessionId: string;
  newsId: string;
  imageId: string;
  blob: Blob;
}

export class DemoStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoStorageError";
  }
}

function isStoredImage(value: unknown): value is StoredImage {
  if (typeof value !== "object" || value === null) return false;
  return (
    "key" in value &&
    typeof value.key === "string" &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "newsId" in value &&
    typeof value.newsId === "string" &&
    "imageId" in value &&
    typeof value.imageId === "string" &&
    "blob" in value &&
    typeof Blob !== "undefined" &&
    value.blob instanceof Blob
  );
}

const announcementSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  audiences: z.array(z.enum(["all", "year1", "year2", "year3", "year4"])),
  status: z.enum(["draft", "published"]),
  authorId: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const newsImageSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  position: z.number(),
});

const newsArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.enum(TAGS)),
  status: z.enum(["draft", "published"]),
  authorId: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  images: z.array(newsImageSchema),
});

const activeSessionsSchema = z.record(z.string(), z.number().finite());

let sessionPromise: Promise<string> | undefined;
let databasePromise: Promise<IDBDatabase> | undefined;

function storageFailure(action: string, error: unknown): DemoStorageError {
  const reason = error instanceof Error ? ` (${error.message})` : "";
  return new DemoStorageError(
    `Demo Mode ไม่สามารถ${action}ใน browser ได้${reason} กรุณาตรวจสิทธิ์ sessionStorage/IndexedDB แล้วลองใหม่`,
  );
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new DemoStorageError("เบราว์เซอร์นี้ไม่รองรับ IndexedDB ซึ่งจำเป็นสำหรับเก็บรูปใน Demo Mode"),
    );
  }
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(IMAGE_STORE)) {
          database.createObjectStore(IMAGE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
    }).catch((error: unknown) => {
      databasePromise = undefined;
      throw storageFailure("เปิด IndexedDB", error);
    });
  }
  const database = databasePromise;
  if (!database) {
    throw new DemoStorageError("ไม่สามารถเริ่มฐานข้อมูลรูปสำหรับ Demo Mode ได้");
  }
  return database;
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function refreshActiveSessions(sessionId: string): Set<string> {
  try {
    const now = Date.now();
    const serialized = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    const parsed: unknown = serialized === null ? {} : JSON.parse(serialized);
    const result = activeSessionsSchema.safeParse(parsed);
    if (!result.success) {
      throw new DemoStorageError("รายการ session Demo ใน browser เสียหาย");
    }

    const activeSessions = Object.fromEntries(
      Object.entries(result.data).filter(
        ([, lastActiveAt]) => now - lastActiveAt < ACTIVE_SESSION_TTL_MS,
      ),
    );
    activeSessions[sessionId] = now;
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
    return new Set(Object.keys(activeSessions));
  } catch (error) {
    if (error instanceof DemoStorageError) throw error;
    throw storageFailure("ติดตาม session Demo", error);
  }
}

async function clearOldImages(activeSessionIds: Set<string>): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(IMAGE_STORE, "readwrite");
  const cursorRequest = transaction.objectStore(IMAGE_STORE).openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;

    const record: unknown = cursor.value;
    if (!isStoredImage(record) || !activeSessionIds.has(record.sessionId)) {
      cursor.delete();
    }
    cursor.continue();
  };
  cursorRequest.onerror = () => {
    transaction.abort();
  };
  await waitForTransaction(transaction);
}

async function createSession(): Promise<string> {
  try {
    const storedId = sessionStorage.getItem(SESSION_ID_KEY);
    const sessionId = storedId ?? crypto.randomUUID();
    const activeSessionIds = refreshActiveSessions(sessionId);

    if (!storedId) {
      await clearOldImages(activeSessionIds);
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(`${PREFIX}:`)) sessionStorage.removeItem(key);
      }
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  } catch (error) {
    if (error instanceof DemoStorageError) throw error;
    throw storageFailure("เริ่ม session", error);
  }
}

export async function getDemoSessionId(): Promise<string> {
  sessionPromise ??= createSession().catch((error: unknown) => {
    sessionPromise = undefined;
    throw error;
  });
  const sessionId = await sessionPromise;
  refreshActiveSessions(sessionId);
  return sessionId;
}

function readSessionRecords<T>(
  key: string,
  schema: z.ZodType<T[]>,
): Promise<T[]> {
  try {
    const serialized = sessionStorage.getItem(key);
    if (serialized === null) return Promise.resolve([]);
    const parsed: unknown = JSON.parse(serialized);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return Promise.reject(
        new DemoStorageError("ข้อมูล Demo ในแท็บนี้เสียหาย กรุณาเปิดแท็บใหม่เพื่อเริ่ม session ใหม่"),
      );
    }
    return Promise.resolve(result.data);
  } catch (error) {
    return Promise.reject(
      error instanceof DemoStorageError ? error : storageFailure("อ่านข้อมูล", error),
    );
  }
}

function writeSessionRecords<T>(key: string, records: T[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(records));
  } catch (error) {
    throw storageFailure("บันทึกข้อมูล", error);
  }
}

export async function readDemoAnnouncements(): Promise<Announcement[]> {
  const sessionId = await getDemoSessionId();
  return readSessionRecords(
    ANNOUNCEMENTS_KEY(sessionId),
    z.array(announcementSchema),
  );
}

export async function writeDemoAnnouncements(records: Announcement[]): Promise<void> {
  const sessionId = await getDemoSessionId();
  writeSessionRecords(ANNOUNCEMENTS_KEY(sessionId), records);
}

export async function readDemoNews(): Promise<NewsArticle[]> {
  const sessionId = await getDemoSessionId();
  return readSessionRecords(NEWS_KEY(sessionId), z.array(newsArticleSchema));
}

export async function writeDemoNews(records: NewsArticle[]): Promise<void> {
  const sessionId = await getDemoSessionId();
  writeSessionRecords(NEWS_KEY(sessionId), records);
}

function imageKey(sessionId: string, newsId: string, imageId: string): string {
  return `${sessionId}:${newsId}:${imageId}`;
}

export async function putDemoNewsImage(
  newsId: string,
  imageId: string,
  blob: Blob,
): Promise<void> {
  try {
    const sessionId = await getDemoSessionId();
    const database = await openDatabase();
    const transaction = database.transaction(IMAGE_STORE, "readwrite");
    const record: StoredImage = {
      key: imageKey(sessionId, newsId, imageId),
      sessionId,
      newsId,
      imageId,
      blob,
    };
    transaction.objectStore(IMAGE_STORE).put(record);
    await waitForTransaction(transaction);
  } catch (error) {
    if (error instanceof DemoStorageError) throw error;
    throw storageFailure("บันทึกรูป", error);
  }
}

export async function getDemoNewsImage(
  newsId: string,
  imageId: string,
): Promise<Blob> {
  try {
    const sessionId = await getDemoSessionId();
    const database = await openDatabase();
    const transaction = database.transaction(IMAGE_STORE, "readonly");
    const request = transaction.objectStore(IMAGE_STORE).get(imageKey(sessionId, newsId, imageId));
    const transactionDone = waitForTransaction(transaction);
    const record = await new Promise<StoredImage | undefined>((resolve, reject) => {
      request.onsuccess = () => {
        const result: unknown = request.result;
        if (result === undefined || isStoredImage(result)) resolve(result);
        else reject(new Error("Stored image metadata is invalid"));
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
    await transactionDone;
    if (!record || record.sessionId !== sessionId) {
      throw new DemoStorageError("ไม่พบไฟล์รูป Demo ใน session ปัจจุบัน");
    }
    return record.blob;
  } catch (error) {
    if (error instanceof DemoStorageError) throw error;
    throw storageFailure("อ่านรูป", error);
  }
}

export async function deleteDemoNewsImage(
  newsId: string,
  imageId: string,
): Promise<Blob | undefined> {
  try {
    const sessionId = await getDemoSessionId();
    const database = await openDatabase();
    const transaction = database.transaction(IMAGE_STORE, "readwrite");
    const store = transaction.objectStore(IMAGE_STORE);
    const request = store.get(imageKey(sessionId, newsId, imageId));
    const transactionDone = waitForTransaction(transaction);
    const record = await new Promise<StoredImage | undefined>((resolve, reject) => {
      request.onsuccess = () => {
        const result: unknown = request.result;
        if (result === undefined || isStoredImage(result)) resolve(result);
        else reject(new Error("Stored image metadata is invalid"));
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
    store.delete(imageKey(sessionId, newsId, imageId));
    await transactionDone;
    return record?.blob;
  } catch (error) {
    if (error instanceof DemoStorageError) throw error;
    throw storageFailure("ลบรูป", error);
  }
}

export const demoValidation = {
  maxImages: MAX_IMAGES,
  maxImageBytes: MAX_IMAGE_BYTES,
  tags: TAGS,
};
