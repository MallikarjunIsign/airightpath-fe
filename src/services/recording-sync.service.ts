import { aiService } from '@/services/ai.service';
import { interviewService } from '@/services/interview.service';
import { mobileUploadService } from '@/services/mobile-upload.service';
import { uploadWithRetry } from '@/utils/recording-upload.utils';

/**
 * Getting interview recordings to the server without the candidate waiting
 * for it, and without it depending on the tab staying open.
 *
 * <p>A recording used to live in the page's memory until the interview ended
 * and was then uploaded while the candidate watched a progress bar. Closing
 * the tab, reloading, or a laptop going to sleep lost all of it — an hour of
 * footage, with "nothing was captured" the only trace. And the candidate was
 * held on a finishing screen for the length of the upload.</p>
 *
 * <p>Now every chunk is written to the browser's own database as it is
 * recorded, finished parts are uploaded from here in the background (this
 * module outlives the interview page), and anything still stored when the app
 * next starts is uploaded then. A closed tab costs the last few seconds, not
 * the recording.</p>
 */

type Kind = 'camera' | 'screen' | 'mobile';

interface SessionMeta {
  id: string;
  /** 0 for a session that belongs to a pairing token rather than a signed-in interview. */
  scheduleId: number;
  /**
   * Set on the phone, which has no login: the recording is filed against the
   * interview its pairing token was registered for, and uploaded with that
   * token instead of a session.
   */
  token?: string;
  kind: Kind;
  mimeType: string;
  /** Which page load wrote it. Another load's sessions are orphans. */
  pageId: string;
  createdAt: number;
  /** Refreshed on every chunk; how a live session is told from an abandoned one. */
  updatedAt: number;
  status: 'recording' | 'closed';
}

interface ChunkRow {
  key?: number;
  sessionId: string;
  blob: Blob;
}

const DB_NAME = 'rp-recordings';
const SESSIONS = 'sessions';
const CHUNKS = 'chunks';

/**
 * A recording session untouched for this long belongs to a page that is gone.
 * Chunks arrive every 15 seconds, so two minutes is a long silence — short
 * enough to rescue a closed tab promptly, long enough not to claim the
 * recording of a second tab that is still running.
 */
const ORPHAN_AFTER_MS = 2 * 60 * 1000;

/** Waits before an upload that failed every attempt is tried again. */
const RETRY_LATER_MS = [60_000, 5 * 60_000, 15 * 60_000];

const PAGE_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ── IndexedDB, kept deliberately small ────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(SESSIONS, { keyPath: 'id' });
        const chunks = db.createObjectStore(CHUNKS, { keyPath: 'key', autoIncrement: true });
        chunks.createIndex('sessionId', 'sessionId');
      };
      request.onsuccess = () => resolve(request.result);
      // Private windows and locked-down browsers refuse. Recording still works
      // and uploads from memory; it simply cannot survive a closed tab.
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Every write goes through one chain, so a delete can never overtake the chunk before it. */
let ioChain: Promise<unknown> = Promise.resolve();
function io<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T | null> {
  const next = ioChain.then(async () => {
    const db = await openDb();
    if (!db) return null;
    try {
      return await work(db);
    } catch (err) {
      console.warn('Recording store error:', err);
      return null;
    }
  });
  ioChain = next.catch(() => null);
  return next;
}

// ── In-memory view of this page's work ────────────────────────────────────

const metas = new Map<string, SessionMeta>();
/** Blobs handed over directly, so a finished part is not rebuilt from chunks. */
const blobs = new Map<string, Blob>();

interface Stats {
  ok: number;
  bytes: number;
  attempts: number;
  failureReason?: string;
}
/** Whose recording this is: an interview the signed-in candidate sits, or a phone's pairing token. */
interface Target {
  scheduleId: number;
  kind: Kind;
  token?: string;
}
const keyOf = (target: Target) => (target.token ? `t:${target.token}:${target.kind}` : `${target.scheduleId}:${target.kind}`);
const stats = new Map<string, Stats>();
const pending = new Map<string, number>();
const finished = new Set<string>();
const queuedIds = new Set<string>();
const queues = new Map<Kind, Promise<void>>();

function statsFor(target: Target): Stats {
  const key = keyOf(target);
  let entry = stats.get(key);
  if (!entry) {
    entry = { ok: 0, bytes: 0, attempts: 0 };
    stats.set(key, entry);
  }
  return entry;
}

async function writeMeta(meta: SessionMeta) {
  await io((db) => wrap(db.transaction(SESSIONS, 'readwrite').objectStore(SESSIONS).put(meta)));
}

async function removeSession(id: string) {
  await io(
    (db) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction([SESSIONS, CHUNKS], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
        tx.objectStore(SESSIONS).delete(id);
        // Plain callbacks rather than awaits: some browsers close a
        // transaction that is left waiting on a promise.
        const keysRequest = tx.objectStore(CHUNKS).index('sessionId').getAllKeys(id);
        keysRequest.onsuccess = () => {
          keysRequest.result.forEach((key) => tx.objectStore(CHUNKS).delete(key));
        };
      }),
  );
  metas.delete(id);
  blobs.delete(id);
  queuedIds.delete(id);
}

async function assemble(meta: SessionMeta): Promise<Blob | null> {
  const rows = await io(async (db) =>
    wrap<ChunkRow[]>(db.transaction(CHUNKS, 'readonly').objectStore(CHUNKS).index('sessionId').getAll(meta.id)),
  );
  if (!rows || rows.length === 0) return null;
  rows.sort((a, b) => (a.key ?? 0) - (b.key ?? 0));
  return new Blob(rows.map((row) => row.blob), { type: meta.mimeType || 'video/webm' });
}

// ── Outcome reporting ─────────────────────────────────────────────────────

async function reportIfDone(target: Target) {
  const { scheduleId, kind, token } = target;
  const key = keyOf(target);
  if (!finished.has(key) || (pending.get(key) ?? 0) > 0) return;
  finished.delete(key);
  const entry = stats.get(key) ?? { ok: 0, bytes: 0, attempts: 0 };

  const failureReason =
    entry.failureReason ?? (entry.ok === 0 ? 'Nothing was captured to upload.' : undefined);
  const payload = {
    kind,
    success: !failureReason,
    bytes: entry.bytes,
    attempts: entry.attempts,
    parts: entry.ok,
    failureReason,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (token) {
        await mobileUploadService.reportOutcome(token, { ...payload, kind: 'mobile' });
      } else {
        await interviewService.reportRecordingOutcome(scheduleId, payload);
      }
      break;
    } catch {
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
  stats.delete(key);
}

// ── Uploading ─────────────────────────────────────────────────────────────

function enqueue(id: string, attempt = 0) {
  const meta = metas.get(id);
  if (!meta || queuedIds.has(id)) return;
  queuedIds.add(id);
  const key = keyOf(meta);
  pending.set(key, (pending.get(key) ?? 0) + 1);

  // One queue per kind and strictly in order: the server appends each part to
  // the interview's list as it arrives, and two arriving together could
  // overwrite one another's entry.
  const tail = queues.get(meta.kind) ?? Promise.resolve();
  const job = tail.then(async () => {
    // Every write issued so far — the last chunks, the closing of the session —
    // has landed before anything is read back or deleted.
    await ioChain;
    try {
      await upload(meta, attempt);
    } finally {
      pending.set(key, Math.max(0, (pending.get(key) ?? 1) - 1));
      await reportIfDone(meta);
    }
  });
  queues.set(meta.kind, job.catch(() => undefined));
}

async function upload(meta: SessionMeta, attempt: number) {
  const blob = blobs.get(meta.id) ?? (await assemble(meta));
  if (!blob || blob.size === 0) {
    await removeSession(meta.id);
    return;
  }

  const entry = statsFor(meta);
  const outcome = await uploadWithRetry(
    // In pieces, so no single request is larger than a proxy will carry.
    (onProgress) =>
      meta.token
        ? mobileUploadService.upload(meta.token, blob, meta.mimeType, onProgress)
        : aiService.uploadRecording(meta.scheduleId, meta.kind, blob, onProgress),
    blob.size,
  );
  entry.attempts += outcome.attempts;

  if (outcome.ok) {
    entry.ok += 1;
    entry.bytes += blob.size;
    await removeSession(meta.id);
    return;
  }

  // Kept, not dropped. It stays in the browser's store, is tried again in a
  // while, and is tried again whenever the app next starts.
  entry.failureReason = outcome.failureReason;
  console.warn(`A ${meta.kind} recording part is not uploaded yet:`, outcome.failureReason);
  queuedIds.delete(meta.id);
  const wait = RETRY_LATER_MS[attempt];
  if (wait != null) {
    setTimeout(() => enqueue(meta.id, attempt + 1), wait);
  }
}

// ── The interface the recorders use ───────────────────────────────────────

export const recordingSync = {
  /** Start a recording session. Returns its id, or null when it cannot be stored. */
  begin(scheduleId: number | null | undefined, kind: Kind, mimeType: string): string | null {
    if (!scheduleId) return null;
    const now = Date.now();
    const id = `${scheduleId}-${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const meta: SessionMeta = {
      id,
      scheduleId,
      kind,
      mimeType,
      pageId: PAGE_ID,
      createdAt: now,
      updatedAt: now,
      status: 'recording',
    };
    metas.set(id, meta);
    void writeMeta(meta);
    return id;
  },

  /**
   * Start a recording on the phone, which has no login: it belongs to a pairing
   * token, and is uploaded with that token.
   */
  beginForToken(token: string | null | undefined, kind: Kind, mimeType: string): string | null {
    if (!token) return null;
    const now = Date.now();
    const id = `t-${token.slice(0, 8)}-${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const meta: SessionMeta = {
      id,
      scheduleId: 0,
      token,
      kind,
      mimeType,
      pageId: PAGE_ID,
      createdAt: now,
      updatedAt: now,
      status: 'recording',
    };
    metas.set(id, meta);
    void writeMeta(meta);
    return id;
  },

  /** Store one chunk as it is recorded. */
  chunk(id: string | null, blob: Blob) {
    if (!id || blob.size === 0) return;
    const meta = metas.get(id);
    if (meta) meta.updatedAt = Date.now();
    void io(async (db) => {
      const tx = db.transaction([CHUNKS, SESSIONS], 'readwrite');
      tx.objectStore(CHUNKS).add({ sessionId: id, blob } satisfies ChunkRow);
      if (meta) tx.objectStore(SESSIONS).put(meta);
      return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    });
  },

  /**
   * The session is complete: upload it in the background.
   *
   * @param blob the finished recording where the caller has it in hand;
   *             otherwise it is rebuilt from the stored chunks
   */
  submit(id: string | null, blob: Blob | null) {
    if (!id) return;
    const meta = metas.get(id);
    if (!meta) return;
    meta.status = 'closed';
    if (blob && blob.size > 0) blobs.set(id, blob);
    void writeMeta(meta);
    // Counted as pending at once, not after the write: finish() decides
    // whether anything is outstanding, and must see this part.
    enqueue(id);
  },

  /** A session that recorded nothing and is not worth keeping. */
  discard(id: string | null) {
    if (!id) return;
    void removeSession(id);
  },

  /**
   * The interview is over for this recording: once its parts are uploaded,
   * say how it went. Called once per kind, after the last part is submitted.
   */
  finish(scheduleId: number | null | undefined, kind: Kind) {
    if (!scheduleId) return;
    const target = { scheduleId, kind };
    finished.add(keyOf(target));
    void reportIfDone(target);
  },

  /** The phone's recording is over: once its parts are uploaded, say how it went. */
  finishForToken(token: string | null | undefined, kind: Kind) {
    if (!token) return;
    const target = { scheduleId: 0, kind, token };
    finished.add(keyOf(target));
    void reportIfDone(target);
  },

  /**
   * Upload whatever an earlier page left behind: a closed tab, a reload, a
   * laptop that slept. Safe to call repeatedly.
   */
  async resume(options?: { token?: string }) {
    const sessions = await io((db) =>
      wrap<SessionMeta[]>(db.transaction(SESSIONS, 'readonly').objectStore(SESSIONS).getAll()),
    );
    if (!sessions || sessions.length === 0) return;

    const now = Date.now();
    let waitingOnLive = false;
    sessions.sort((a, b) => a.createdAt - b.createdAt);
    for (const meta of sessions) {
      if (meta.pageId === PAGE_ID || queuedIds.has(meta.id)) continue;
      // The laptop resumes its own interviews; a phone resumes only its own
      // pairing. Neither can upload the other's, which needs the other's way
      // of signing a request.
      if (options?.token ? meta.token !== options.token : meta.token) continue;
      if (meta.status === 'recording' && now - meta.updatedAt < ORPHAN_AFTER_MS) {
        waitingOnLive = true;
        continue;
      }
      meta.status = 'closed';
      metas.set(meta.id, meta);
      enqueue(meta.id);
    }
    // A reload within the last two minutes leaves a session that is not yet
    // old enough to claim. Look again once it is.
    if (waitingOnLive) setTimeout(() => void recordingSync.resume(options), ORPHAN_AFTER_MS + 5_000);
  },
};
