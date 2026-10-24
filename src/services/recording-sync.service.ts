import { aiService, recordingUploadApi } from '@/services/ai.service';
import { extractApiError } from '@/services/api.service';
import { interviewService } from '@/services/interview.service';
import { mobileUploadService } from '@/services/mobile-upload.service';
import { describeUploadFailure } from '@/utils/recording-upload.utils';

/**
 * Getting interview recordings to the server without the candidate waiting
 * for it, without it depending on the tab staying open, and as one continuous
 * file.
 *
 * <p>A recording used to live in the page's memory until the interview ended
 * and was then uploaded while the candidate watched a progress bar; closing the
 * tab lost all of it. It was then cut into ten-minute files, uploaded as it
 * went — which survived a closed tab, but left the reviewer with parts, and a
 * gap of seconds between them where one file ended and the next began.</p>
 *
 * <p>Now it is one file. A recorder emits its output in order, in chunks, and
 * all of them together are the one recording. Each chunk is kept in the
 * browser's own database as it arrives; as soon as five megabytes have
 * gathered they are sent to storage as the next piece of a single upload that
 * stays open for the whole interview; and when the interview ends the last
 * piece is sent and the upload is joined. The reviewer gets the interview, not
 * a playlist.</p>
 *
 * <p>Closing the tab costs the chunks not yet sent, not the recording: they are
 * still in the browser and are sent the next time the app opens, and if the
 * candidate never returns the server joins what arrived (see
 * {@code RecordingUploadSweeper}).</p>
 */

type Kind = 'camera' | 'screen' | 'mobile';

/** A multipart upload this session has begun, and how far through it is. */
interface UploadProgress {
  uploadId: string;
  blobName: string;
  /** The next piece's number; pieces are numbered from 1. */
  nextPart: number;
  /** The last chunk already sent. Everything after it is still to send. */
  uploadedKey: number;
  bytes: number;
}

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
  /** Present once the upload has begun. Persisted, so a reload carries on from here. */
  upload?: UploadProgress;
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
 * How much is gathered before a piece is sent. Five megabytes is the smallest a
 * piece may be (storage's own rule, for every piece but the last) and small
 * enough to get through whatever sits in front of the server.
 */
const PART_BYTES = (Number(import.meta.env.VITE_RECORDING_PART_MB) || 5) * 1024 * 1024;

/**
 * A recording session untouched for this long belongs to a page that is gone.
 * Chunks arrive every 15 seconds, so two minutes is a long silence — short
 * enough to rescue a closed tab promptly, long enough not to claim the
 * recording of a second tab that is still running.
 */
const ORPHAN_AFTER_MS = 2 * 60 * 1000;

/** Waits before a finish that failed every attempt is tried again. */
const RETRY_LATER_MS = [60_000, 5 * 60_000, 15 * 60_000];

/** Pause after a piece fails to send, so a dead connection is not hammered every chunk. */
const LIVE_BACKOFF_MS = 30_000;

const PAGE_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ── IndexedDB, kept deliberately small ────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;
let dbUnavailable = false;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const unavailable = () => {
      dbUnavailable = true;
      resolve(null);
    };
    try {
      if (typeof indexedDB === 'undefined') return unavailable();
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(SESSIONS, { keyPath: 'id' });
        const chunks = db.createObjectStore(CHUNKS, { keyPath: 'key', autoIncrement: true });
        chunks.createIndex('sessionId', 'sessionId');
      };
      request.onsuccess = () => resolve(request.result);
      // Private windows and locked-down browsers refuse. Recording still works,
      // held in memory; it simply cannot survive a closed tab.
      request.onerror = unavailable;
      request.onblocked = unavailable;
    } catch {
      unavailable();
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

/** Where chunks live when the browser will not give us a database. */
const memoryChunks = new Map<string, { key: number; blob: Blob }[]>();
let memoryKey = 0;

async function storeChunk(id: string, blob: Blob, meta: SessionMeta | undefined): Promise<void> {
  await openDb();
  if (dbUnavailable) {
    const rows = memoryChunks.get(id) ?? [];
    rows.push({ key: ++memoryKey, blob });
    memoryChunks.set(id, rows);
    return;
  }
  await io(async (db) => {
    const tx = db.transaction([CHUNKS, SESSIONS], 'readwrite');
    tx.objectStore(CHUNKS).add({ sessionId: id, blob } satisfies ChunkRow);
    if (meta) tx.objectStore(SESSIONS).put(meta);
    return new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  });
}

/** A session's chunks, in the order they were recorded. */
async function readChunks(id: string): Promise<{ key: number; blob: Blob }[]> {
  await openDb();
  if (dbUnavailable) return memoryChunks.get(id) ?? [];
  const rows = await io((db) =>
    wrap<ChunkRow[]>(db.transaction(CHUNKS, 'readonly').objectStore(CHUNKS).index('sessionId').getAll(id)),
  );
  return (rows ?? [])
    .map((row) => ({ key: row.key ?? 0, blob: row.blob }))
    .sort((a, b) => a.key - b.key);
}

// ── In-memory view of this page's work ────────────────────────────────────

const metas = new Map<string, SessionMeta>();

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
const keyOf = (target: Target) =>
  target.token ? `t:${target.token}:${target.kind}` : `${target.scheduleId}:${target.kind}`;
const stats = new Map<string, Stats>();
const pending = new Map<string, number>();
/** How each finished recording ended up, for a screen that wants to say so. */
const outcomes = new Map<string, boolean>();
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
  memoryChunks.delete(id);
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
  queuedIds.delete(id);
  pumpChains.delete(id);
  pumpQueued.delete(id);
  backoffUntil.delete(id);
}

// ── Sending ───────────────────────────────────────────────────────────────

interface Transport {
  begin: () => Promise<{ uploadId: string; blobName: string }>;
  part: (session: { uploadId: string; blobName: string }, partNumber: number, piece: Blob) => Promise<void>;
  complete: (session: { uploadId: string; blobName: string }) => Promise<void>;
}

/** The laptop signs requests as the candidate; the phone quotes its pairing token. */
function transportFor(meta: SessionMeta): Transport {
  const { token } = meta;
  if (token) {
    return {
      begin: () => mobileUploadService.begin(token, meta.mimeType),
      part: (session, partNumber, piece) => mobileUploadService.part(token, session, partNumber, piece),
      complete: (session) => mobileUploadService.complete(token, session),
    };
  }
  return {
    begin: () => recordingUploadApi.begin(meta.scheduleId, meta.kind, meta.mimeType),
    part: (session, partNumber, piece) => recordingUploadApi.part(meta.scheduleId, session, partNumber, piece),
    complete: (session) => recordingUploadApi.complete(meta.scheduleId, meta.kind, session),
  };
}

/** The server finished this upload without us — it joined what had arrived while we were away. */
const isGone = (err: unknown) => extractApiError(err).status === 410;

/**
 * Work on one session's upload, one thing at a time. The live sender and the
 * finishing step both move the same marker through the chunks, and two of them
 * at once would send the same piece twice.
 */
const pumpChains = new Map<string, Promise<void>>();
function runExclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = pumpChains.get(id) ?? Promise.resolve();
  const next = previous.then(work, work);
  pumpChains.set(id, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * Send what has gathered.
 *
 * <p>While the recording runs, a piece goes only once five megabytes are ready.
 * At the end everything left goes, however small — the last piece is allowed to
 * be. Each piece is followed at once by a note of how far it got, so a reload
 * carries on from the right chunk.</p>
 */
async function pump(meta: SessionMeta, final: boolean) {
  const transport = transportFor(meta);
  for (;;) {
    const sent = meta.upload?.uploadedKey ?? 0;
    const rows = (await readChunks(meta.id)).filter((row) => row.key > sent);
    if (rows.length === 0) return;

    let size = 0;
    const take: typeof rows = [];
    for (const row of rows) {
      take.push(row);
      size += row.blob.size;
      if (size >= PART_BYTES) break;
    }
    if (size < PART_BYTES && !final) return;

    if (!meta.upload) {
      const session = await transport.begin();
      meta.upload = { ...session, nextPart: 1, uploadedKey: 0, bytes: 0 };
      await writeMeta(meta);
    }
    await transport.part(
      meta.upload,
      meta.upload.nextPart,
      new Blob(take.map((row) => row.blob), { type: meta.mimeType }),
    );
    meta.upload.nextPart += 1;
    meta.upload.uploadedKey = take[take.length - 1].key;
    meta.upload.bytes += size;
    await writeMeta(meta);
  }
}

const pumpQueued = new Set<string>();
const backoffUntil = new Map<string, number>();

/** A chunk has arrived: send a piece if enough has gathered. Never throws. */
function scheduleLive(id: string) {
  const meta = metas.get(id);
  if (!meta || meta.status !== 'recording' || pumpQueued.has(id)) return;
  pumpQueued.add(id);
  void runExclusive(id, async () => {
    pumpQueued.delete(id);
    if ((backoffUntil.get(id) ?? 0) > Date.now()) return;
    try {
      await pump(meta, false);
    } catch (err) {
      if (isGone(err)) {
        // The server finished it already. Nothing more to send.
        await removeSession(id);
        return;
      }
      // Not lost: the chunks are still stored and go with the next attempt.
      backoffUntil.set(id, Date.now() + LIVE_BACKOFF_MS);
      console.warn(`A ${meta.kind} recording is behind on uploading:`, describeUploadFailure(err, meta.upload?.bytes ?? 0));
    }
  });
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
  outcomes.set(key, !failureReason);
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

// ── Finishing ─────────────────────────────────────────────────────────────

function enqueue(id: string, attempt = 0) {
  const meta = metas.get(id);
  if (!meta || queuedIds.has(id)) return;
  queuedIds.add(id);
  const key = keyOf(meta);
  pending.set(key, (pending.get(key) ?? 0) + 1);

  // One queue per kind and strictly in order: the server appends each finished
  // recording to the interview's list as it is joined, and where a candidate
  // stopped sharing and started again there are two, which must stay in the
  // order they were made.
  const tail = queues.get(meta.kind) ?? Promise.resolve();
  const job = tail.then(async () => {
    // Every write issued so far — the last chunks, the closing of the session —
    // has landed before anything is read back or deleted.
    await ioChain;
    try {
      await finalise(meta, attempt);
    } finally {
      pending.set(key, Math.max(0, (pending.get(key) ?? 1) - 1));
      await reportIfDone(meta);
    }
  });
  queues.set(meta.kind, job.catch(() => undefined));
}

async function finalise(meta: SessionMeta, attempt: number) {
  const entry = statsFor(meta);
  entry.attempts += 1;
  try {
    await runExclusive(meta.id, async () => {
      await pump(meta, true);
      if (!meta.upload) {
        // Nothing was ever recorded in this session.
        await removeSession(meta.id);
        return;
      }
      await transportFor(meta).complete(meta.upload);
      entry.ok += 1;
      entry.bytes += meta.upload.bytes;
      await removeSession(meta.id);
    });
    return;
  } catch (err) {
    if (isGone(err)) {
      await removeSession(meta.id);
      return;
    }

    // A backend that does not have the piecewise upload yet: send the whole
    // recording the old way, so the two halves can be deployed in either order.
    const status = extractApiError(err).status;
    if (!meta.upload && !meta.token && (status === 404 || status === 405)) {
      try {
        const rows = await readChunks(meta.id);
        const blob = new Blob(rows.map((row) => row.blob), { type: meta.mimeType });
        if (blob.size > 0) {
          await aiService.uploadRecording(meta.scheduleId, meta.kind, blob);
          entry.ok += 1;
          entry.bytes += blob.size;
        }
        await removeSession(meta.id);
        return;
      } catch (legacyErr) {
        entry.failureReason = describeUploadFailure(legacyErr, 0);
      }
    } else {
      entry.failureReason = describeUploadFailure(err, meta.upload?.bytes ?? 0);
    }
  }

  // Kept, not dropped. It stays in the browser's store, is tried again in a
  // while, and is tried again whenever the app next starts.
  console.warn(`A ${meta.kind} recording is not finished uploading yet:`, entry.failureReason);
  queuedIds.delete(meta.id);
  const wait = RETRY_LATER_MS[attempt];
  if (wait != null) {
    setTimeout(() => enqueue(meta.id, attempt + 1), wait);
  }
}

// ── The interface the recorders use ───────────────────────────────────────

function newSession(partial: { scheduleId: number; token?: string }, kind: Kind, mimeType: string, idPrefix: string): string {
  const now = Date.now();
  const id = `${idPrefix}-${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const meta: SessionMeta = {
    id,
    scheduleId: partial.scheduleId,
    token: partial.token,
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
}

export const recordingSync = {
  /** Start a recording session. Returns its id, or null when it cannot be stored. */
  begin(scheduleId: number | null | undefined, kind: Kind, mimeType: string): string | null {
    if (!scheduleId) return null;
    return newSession({ scheduleId }, kind, mimeType, String(scheduleId));
  },

  /**
   * Start a recording on the phone, which has no login: it belongs to a pairing
   * token, and is uploaded with that token.
   */
  beginForToken(token: string | null | undefined, kind: Kind, mimeType: string): string | null {
    if (!token) return null;
    return newSession({ scheduleId: 0, token }, kind, mimeType, `t-${token.slice(0, 8)}`);
  },

  /** Store one chunk as it is recorded, and send a piece if enough has gathered. */
  chunk(id: string | null, blob: Blob) {
    if (!id || blob.size === 0) return;
    const meta = metas.get(id);
    // A session that was thrown away (a start that was abandoned) can still have a
    // last chunk arrive as its recorder stops. Storing it would leave chunks that
    // belong to nothing.
    if (!meta) return;
    meta.updatedAt = Date.now();
    void storeChunk(id, blob, meta).then(() => scheduleLive(id));
  },

  /**
   * The session is complete: send the rest and join the upload, in the background.
   *
   * @param _blob accepted for the recorders' sake and not used — the chunks are
   *              already stored and are what is sent
   */
  submit(id: string | null, _blob?: Blob | null) {
    void _blob;
    if (!id) return;
    const meta = metas.get(id);
    if (!meta) return;
    meta.status = 'closed';
    void writeMeta(meta);
    // Counted as pending at once, not after the write: finish() decides
    // whether anything is outstanding, and must see this recording.
    enqueue(id);
  },

  /** A session that recorded nothing and is not worth keeping. */
  discard(id: string | null) {
    if (!id) return;
    void removeSession(id);
  },

  /**
   * The interview is over for this recording: once it is uploaded, say how it
   * went. Called once per kind, after the last session is submitted.
   */
  finish(scheduleId: number | null | undefined, kind: Kind) {
    if (!scheduleId) return;
    const target = { scheduleId, kind };
    finished.add(keyOf(target));
    void reportIfDone(target);
  },

  /**
   * Where the phone's recording stands once the interview is over: still being sent, sent, or not sent
   * (it keeps trying). 'none' where the phone never recorded anything.
   */
  statusForToken(token: string | null | undefined): 'uploading' | 'saved' | 'not-sent' | 'none' {
    if (!token) return 'none';
    const key = keyOf({ scheduleId: 0, kind: 'mobile', token });
    if ((pending.get(key) ?? 0) > 0 || finished.has(key)) return 'uploading';
    const outcome = outcomes.get(key);
    if (outcome === undefined) return 'none';
    return outcome ? 'saved' : 'not-sent';
  },

  /** The phone's recording is over: once it is uploaded, say how it went. */
  finishForToken(token: string | null | undefined, kind: Kind) {
    if (!token) return;
    const target = { scheduleId: 0, kind, token };
    finished.add(keyOf(target));
    void reportIfDone(target);
  },

  /**
   * Finish whatever an earlier page left behind: a closed tab, a reload, a
   * laptop that slept. Carries on from the last chunk that was sent. Safe to
   * call repeatedly.
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
      // pairing. Neither can send the other's, which needs the other's way
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
