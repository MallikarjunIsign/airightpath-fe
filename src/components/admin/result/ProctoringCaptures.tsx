import { useState, useEffect, useRef } from 'react';
import {
  Camera,
  ScanLine,
  Loader2,
  ImageOff,
  Download,
  AlertTriangle,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { examProctoringService } from '@/services/exam-proctoring.service';
import { extractApiError } from '@/services/api.service';
import { downloadBlob } from '@/utils/question-paper.utils';
import { isWithinAttempt } from '@/utils/result.utils';
import type { AttemptWindow } from '@/utils/result.utils';
import type { ProctoringCapture } from '@/types/proctoring.types';

/**
 * What the camera saw before this attempt started: the identity photo, and the
 * room sweep if one was required.
 *
 * The images sit behind ASSESSMENT_READ and the access token lives in memory,
 * so each one is fetched as a blob and shown from an object URL — a plain
 * <img src> would arrive unauthenticated and render broken.
 */

interface ProctoringCapturesProps {
  /** The attempt to show captures for; captures name the paper they were filed against. */
  assessmentId?: number;
  /**
   * The candidate and job, which together list every capture across their
   * attempts.
   *
   * Preferred over asking for one assessment's captures: it survives the
   * attempt being filed against a paper the review screen resolved differently,
   * and it is the only way to tell "nothing was captured for this attempt" from
   * "the images are here, just filed elsewhere".
   */
  candidateEmail?: string;
  jobPrefix?: string;
  /**
   * Why the caller could not determine the assessment id, when it could not.
   *
   * Without this, a failed lookup and a genuinely unlinked result both arrive
   * as `assessmentId === undefined`, and the card would state the second as
   * fact — sending the reader after missing data when the real problem is a
   * request that failed.
   */
  lookupError?: string | null;
  /** "Aptitude" or "Coding" — used in the copy only. */
  moduleLabel: string;
  /**
   * When the attempt being reviewed was live, so a re-sit shows its own photo.
   *
   * A candidate given the exam twice is photographed twice. Whether both sets
   * come back under one assessment id depends on how the re-assignment was
   * recorded, so the card cannot assume the list it fetched belongs to the
   * attempt on screen — it keeps only what was captured inside this window.
   * Omitted for a single attempt, where there is nothing to separate.
   */
  attemptWindow?: AttemptWindow;
}

/** A capture paired with the object URL its bytes were loaded into. */
interface LoadedCapture {
  capture: ProctoringCapture;
  url: string | null;
  /** Why the bytes could not be shown, when they could not. */
  error?: string;
}

/**
 * Turns a failed request into something a reviewer can act on.
 *
 * "Couldn't load" tells nobody whether the capture is missing, their account
 * lacks the permission, or the API is down — and those need different people to
 * fix them.
 */
function describeFailure(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) {
    return 'Your account does not have permission to view exam captures (ASSESSMENT_READ).';
  }
  if (status === 404) return 'The stored image is no longer available.';
  if (status && status >= 500) return 'The server could not return the image.';
  return extractApiError(err).message;
}

/**
 * The captures belonging to the attempt on screen, out of everything on file for
 * the candidate.
 *
 * Three rules, tried in order, because no single one holds in every case:
 *
 *  1. The assessment id a capture was filed against. Authoritative — it names
 *     the paper the candidate had open when the shutter fired.
 *  2. Failing that, when the capture was taken. This is what rescues an earlier
 *     attempt whose captures were filed against a paper this screen resolved
 *     differently: matching only on id showed the re-sit's photos and reported
 *     the first attempt as never captured, when its images were on file all
 *     along.
 *  3. Failing both — a single attempt, so no window to judge against — show
 *     everything. There is nothing to separate it from.
 *
 * Returns nothing when captures exist but belong to other attempts, which the
 * card states rather than papering over with someone else's photo.
 */
function selectForAttempt(
  all: ProctoringCapture[],
  assessmentId: number | undefined,
  window: AttemptWindow,
): ProctoringCapture[] {
  if (assessmentId !== undefined) {
    const filed = all.filter((capture) => capture.assessmentId === assessmentId);
    if (filed.length > 0) return filed;
  }

  const bounded = window.from !== null || window.to !== null;
  if (bounded) {
    return all.filter((capture) => isWithinAttempt(capture.capturedAt ?? capture.uploadedAt, window));
  }

  return all;
}

export function ProctoringCaptures({
  assessmentId,
  candidateEmail,
  jobPrefix,
  lookupError,
  moduleLabel,
  attemptWindow,
}: Readonly<ProctoringCapturesProps>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LoadedCapture[]>([]);
  /** Captures on file for this candidate that belong to a different attempt. */
  const [elsewhere, setElsewhere] = useState(0);
  const [preview, setPreview] = useState<LoadedCapture | null>(null);
  /** Bumped to re-run the load after a failure. */
  const [attempt, setAttempt] = useState(0);

  const objectUrlsRef = useRef<string[]>([]);

  // Primitives, not the window object: a fresh `{from, to}` on every render
  // would restart the load on every render.
  const windowFrom = attemptWindow?.from ?? null;
  const windowTo = attemptWindow?.to ?? null;
  const canLookUp = (!!candidateEmail && !!jobPrefix) || assessmentId !== undefined;

  useEffect(() => {
    if (!canLookUp) return;
    let cancelled = false;

    // URLs from a previous assessment are released before the next load.
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    setLoading(true);
    setError(null);
    setItems([]);
    setElsewhere(0);

    (async () => {
      try {
        // Everything on file for this candidate and job, so a capture filed
        // against a paper this screen resolved differently is still found.
        // Falls back to the single-assessment read when the caller could not
        // supply both.
        const res =
          candidateEmail && jobPrefix
            ? await examProctoringService.getCapturesForCandidate(candidateEmail, jobPrefix)
            : await examProctoringService.getCapturesForAssessment(assessmentId!);

        // Tolerate both the ApiResponse envelope and a bare array, since older
        // endpoints in this API return the list unwrapped.
        const body = res.data as unknown;
        const all: ProctoringCapture[] = Array.isArray(body)
          ? (body as ProctoringCapture[])
          : ((body as { data?: ProctoringCapture[] })?.data ?? []);
        if (cancelled) return;

        const captures = selectForAttempt(all, assessmentId, { from: windowFrom, to: windowTo });
        if (!cancelled) setElsewhere(all.length - captures.length);

        // The bytes are fetched per capture — and only for the ones being shown,
        // so a re-sit does not download the other attempt's images too. One
        // unreadable image leaves a placeholder rather than emptying the card.
        const loaded = await Promise.all(
          captures.map(async (capture) => {
            try {
              const image = await examProctoringService.getCaptureImage(capture.id);
              const url = URL.createObjectURL(image.data);
              objectUrlsRef.current.push(url);
              return { capture, url };
            } catch (err) {
              return { capture, url: null, error: describeFailure(err) };
            }
          })
        );

        if (!cancelled) setItems(loaded);
      } catch (err) {
        if (!cancelled) setError(describeFailure(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canLookUp, assessmentId, candidateEmail, jobPrefix, windowFrom, windowTo, attempt]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const hasAssessment = canLookUp;
  const mine = items;

  const photo = mine.find((i) => i.capture.captureType === 'IDENTITY_PHOTO');
  const frames = mine
    .filter((i) => i.capture.captureType === 'ROOM_SCAN_FRAME')
    .sort((a, b) => a.capture.frameIndex - b.capture.frameIndex);

  /**
   * Captures exist for this candidate, but none belong to this attempt.
   *
   * Worth saying out loud rather than falling back to another attempt's photo:
   * the whole point of the check is to confirm who sat *this* paper.
   */
  const otherAttemptOnly = mine.length === 0 && elsewhere > 0;

  // Every path below renders the card. Returning null when there is nothing to
  // show reads as a broken page — the reviewer cannot tell "no photo was taken"
  // from "the photo failed to load", and both matter.
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--warningMuted, rgba(245,158,11,0.12))' }}
          >
            <Camera size={16} style={{ color: 'var(--warning)' }} />
          </div>
          <CardTitle>Identity &amp; Room Check</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* The lookup failed, so we do not know whether an attempt exists. Say
            that, rather than claiming the record is missing. */}
        {!hasAssessment && lookupError && (
          <div className="py-3 space-y-1.5">
            <p className="flex items-start gap-2 text-sm text-[var(--error)]">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              Couldn&apos;t look up the {moduleLabel.toLowerCase()} assessment for this
              candidate, so its captures can&apos;t be shown.
            </p>
            <p className="text-xs text-[var(--textTertiary)] pl-6">{lookupError}</p>
          </div>
        )}

        {/* No assessment record — we cannot even ask which attempt to show. */}
        {!hasAssessment && !lookupError && (
          <EmptyRow
            text={`This result isn't linked to a ${moduleLabel.toLowerCase()} assessment record, so no pre-exam capture can be looked up.`}
          />
        )}

        {hasAssessment && loading && (
          <p className="flex items-center gap-2 text-sm text-[var(--textSecondary)] py-4">
            <Loader2 size={16} className="animate-spin" />
            Loading what was captured before the {moduleLabel.toLowerCase()} exam…
          </p>
        )}

        {hasAssessment && !loading && error && (
          <div className="py-3 space-y-2.5">
            <p className="flex items-start gap-2 text-sm text-[var(--error)]">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              {error}
            </p>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RefreshCw size={14} />}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </Button>
          </div>
        )}

        {hasAssessment && !loading && !error && items.length === 0 && elsewhere === 0 && (
          <EmptyRow
            text={`Nothing was captured for this ${moduleLabel.toLowerCase()} attempt. Expected for exams sat before the pre-exam check was switched on, or while it was turned off.`}
          />
        )}

        {hasAssessment && !loading && !error && otherAttemptOnly && (
          <EmptyRow
            text={`Nothing was captured during this ${moduleLabel.toLowerCase()} attempt — the ${elsewhere === 1 ? 'capture' : `${elsewhere} captures`} on file for this candidate ${elsewhere === 1 ? 'belongs' : 'belong'} to another attempt at this exam.`}
          />
        )}

        {hasAssessment && !loading && !error && mine.length > 0 && (
          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest mb-2.5">
                Candidate photo
              </p>
              {photo ? (
                <div className="flex items-start gap-4 flex-wrap">
                  <CaptureThumb item={photo} size="lg" onOpen={setPreview} />
                  <div className="text-xs text-[var(--textSecondary)] space-y-1">
                    <p>
                      Taken on the instructions screen, with a single face verified in frame before
                      the shutter fired.
                    </p>
                    {photo.capture.capturedAt && (
                      <p className="text-[var(--textTertiary)]">
                        Captured {new Date(photo.capture.capturedAt).toLocaleString()}
                      </p>
                    )}
                    {photo.error && <p className="text-[var(--error)]">{photo.error}</p>}
                  </div>
                </div>
              ) : (
                <EmptyRow text="No identity photo was taken for this attempt." compact />
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest mb-2.5">
                <ScanLine size={12} className="inline mr-1 -mt-0.5" />
                Room scan
                {frames.length > 0 && ` (${frames.length} frame${frames.length === 1 ? '' : 's'})`}
              </p>
              {frames.length > 0 ? (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {frames.map((frame) => (
                    <CaptureThumb key={frame.capture.id} item={frame} size="sm" onOpen={setPreview} />
                  ))}
                </div>
              ) : (
                <EmptyRow
                  text="No room scan was recorded — it is only asked for when the room check is switched on."
                  compact
                />
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CapturePreviewModal item={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}

/** A stated absence — "nothing here" said out loud rather than left blank. */
function EmptyRow({ text, compact = false }: Readonly<{ text: string; compact?: boolean }>) {
  return (
    <p
      className={`flex items-start gap-2 text-sm text-[var(--textSecondary)] ${compact ? 'py-1' : 'py-4'}`}
    >
      <Info size={15} className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]" />
      {text}
    </p>
  );
}

/** One capture, clickable to open full size. */
function CaptureThumb({
  item,
  size,
  onOpen,
}: Readonly<{
  item: LoadedCapture;
  size: 'sm' | 'lg';
  onOpen: (item: LoadedCapture) => void;
}>) {
  const box = size === 'lg' ? 'w-40 h-40' : 'w-24 h-20';
  const isPhoto = item.capture.captureType === 'IDENTITY_PHOTO';
  const alt = isPhoto
    ? 'Candidate, captured before the exam'
    : `Room scan frame ${item.capture.frameIndex + 1}`;

  // The capture exists but its bytes did not arrive — say which, and why.
  if (!item.url) {
    return (
      <div
        className={`${box} rounded-xl border border-dashed border-[var(--borderMuted)] flex flex-col items-center justify-center gap-1 flex-shrink-0 text-[var(--textTertiary)] p-2 text-center`}
        title={item.error ?? 'The image could not be loaded.'}
      >
        <ImageOff size={16} />
        <span className="text-[10px] leading-tight">Image didn&apos;t load</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`${box} rounded-xl overflow-hidden border border-[var(--border)] flex-shrink-0 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]`}
      title="Open full size"
    >
      <img src={item.url} alt={alt} className="w-full h-full object-cover" />
    </button>
  );
}

/** Full-size view with a download, for attaching to a review. */
function CapturePreviewModal({
  item,
  onClose,
}: Readonly<{ item: LoadedCapture | null; onClose: () => void }>) {
  if (!item?.url) return null;

  const isPhoto = item.capture.captureType === 'IDENTITY_PHOTO';
  const title = isPhoto ? 'Candidate photo' : `Room scan — frame ${item.capture.frameIndex + 1}`;

  async function handleDownload() {
    if (!item?.url) return;
    const blob = await fetch(item.url).then((r) => r.blob());
    const extension = item.capture.contentType?.includes('png') ? 'png' : 'jpg';
    const name = isPhoto ? 'candidate-photo' : `room-scan-${item.capture.frameIndex + 1}`;
    downloadBlob(blob, `${item.capture.candidateEmail}-${name}.${extension}`);
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <div className="space-y-3">
        <img
          src={item.url}
          alt={title}
          className="w-full rounded-xl border border-[var(--border)]"
        />
        <div className="flex items-center justify-between gap-3 text-xs text-[var(--textSecondary)]">
          <span>
            {item.capture.capturedAt
              ? `Captured ${new Date(item.capture.capturedAt).toLocaleString()}`
              : 'Capture time not recorded'}
          </span>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--primary)] hover:underline"
          >
            <Download size={13} />
            Download image
          </button>
        </div>
      </div>
    </Modal>
  );
}
