import { useEffect, useRef, useState } from 'react';
import { Smartphone, Loader2, ImageOff, ScanLine } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { interviewService } from '@/services/interview.service';
import type { MobileCapture } from '@/types/interview.types';

/**
 * The stills taken from the candidate's paired phone: the room as it was
 * approved before the interview, and a frame every so often while it ran.
 *
 * Shown only when there are some. An interview sat without a phone has none,
 * and an empty card there would read as something having gone wrong.
 *
 * The images sit behind the reviewer's permission, so each is fetched as a blob
 * and shown from an object URL — and only once it scrolls into view, because an
 * hour-long interview has well over a hundred of them.
 */
/** How many alerts are listed before "View more". */
const ALERTS_SHOWN = 4;

export function MobileCaptures({ scheduleId }: Readonly<{ scheduleId: number }>) {
  const [captures, setCaptures] = useState<MobileCapture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ capture: MobileCapture; url: string } | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCaptures(null);
    setError(null);
    interviewService
      .listMobileCaptures(scheduleId)
      .then((res) => {
        if (!cancelled) setCaptures(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('The phone captures could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleId]);

  if (captures === null && !error) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 py-4 text-sm text-[var(--textSecondary)]">
            <Loader2 size={16} className="animate-spin" /> Loading phone captures…
          </div>
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="py-4 text-sm text-amber-600">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (!captures || captures.length === 0) return null;

  const room = captures.filter((c) => c.kind === 'ROOM_PHOTO');
  const alerts = captures.filter((c) => c.kind === 'EXTRA_PERSON' || c.kind === 'NO_CANDIDATE');
  const periodic = captures.filter((c) => c.kind === 'MONITOR_FRAME');
  const shownAlerts = showAllAlerts ? alerts : alerts.slice(0, ALERTS_SHOWN);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-[var(--primary)]" />
          <CardTitle>
            Phone camera ({alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* What the phone saw go wrong while the interview ran: a second person in its view, or nobody. A photo is
            kept only then, so this is a short list to read down, not a gallery to search. */}
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
            Alerts during the interview
          </p>
          {alerts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--textSecondary)]">
              The phone saw nothing wrong: no second person, and the candidate stayed in view.
            </p>
          ) : (
            <>
              <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                {shownAlerts.map((capture) => (
                  <li key={capture.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2">
                    <div className="w-32 flex-shrink-0">
                      <Thumb capture={capture} onOpen={(url) => setOpen({ capture, url })} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {capture.kind === 'EXTRA_PERSON' ? 'A second person in view' : 'Candidate not in view'}
                      </p>
                      <p className="text-xs text-[var(--textSecondary)]">
                        {capture.capturedAt ? new Date(capture.capturedAt).toLocaleString() : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {alerts.length > ALERTS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAllAlerts((current) => !current)}
                  className="mt-2 text-sm font-medium text-[var(--primary)] hover:underline"
                >
                  {showAllAlerts ? 'Show fewer' : `View more (${alerts.length - ALERTS_SHOWN} more)`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Laid out exactly as the desktop's room scan is in the Identity & Room Check card. */}
        {room.length > 0 && (
          <div className="mb-4">
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
              <ScanLine size={12} className="-mt-0.5 mr-1 inline" />
              Room scan ({room.length} {room.length === 1 ? 'frame' : 'frames'})
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {room.map((capture) => (
                <Thumb key={capture.id} capture={capture} compact onOpen={(url) => setOpen({ capture, url })} />
              ))}
            </div>
          </div>
        )}

        {periodic.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-[var(--textSecondary)]">
              Earlier periodic photos ({periodic.length}) — no longer taken
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {periodic.map((capture) => (
                <Thumb key={capture.id} capture={capture} onOpen={(url) => setOpen({ capture, url })} />
              ))}
            </div>
          </details>
        )}
      </CardContent>

      <Modal
        isOpen={open !== null}
        onClose={() => setOpen(null)}
        title={open ? captureTitle(open.capture) : ''}
        size="xl"
      >
        {open && <img src={open.url} alt={captureTitle(open.capture)} className="w-full rounded-lg" />}
      </Modal>
    </Card>
  );
}

function captureTitle(capture: MobileCapture): string {
  const when = capture.capturedAt ? new Date(capture.capturedAt).toLocaleTimeString() : '';
  const what =
    capture.kind === 'ROOM_PHOTO'
      ? 'Room scan photo'
      : capture.kind === 'EXTRA_PERSON'
        ? 'A second person in view'
        : capture.kind === 'NO_CANDIDATE'
          ? 'Candidate not in view'
          : 'Phone frame';
  return `${what}${when ? ` · ${when}` : ''}`;
}

/** One still, fetched when it first scrolls into view. */
function Thumb({
  capture,
  onOpen,
  compact = false,
}: Readonly<{ capture: MobileCapture; onOpen: (url: string) => void; compact?: boolean }>) {
  const holder = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    const element = holder.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setWanted(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setWanted(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let created: string | null = null;
    interviewService
      .getMobileCaptureImage(capture.id)
      .then((res) => {
        if (cancelled) return;
        created = URL.createObjectURL(res.data);
        setUrl(created);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [wanted, capture.id]);

  const time = capture.capturedAt ? new Date(capture.capturedAt).toLocaleTimeString() : '';
  return (
    <button
      ref={holder}
      type="button"
      onClick={() => url && onOpen(url)}
      disabled={!url}
      className={`group relative overflow-hidden bg-[var(--surface1)] ring-1 ring-[var(--border)] disabled:cursor-default ${compact ? 'h-20 w-24 flex-shrink-0 rounded-xl' : 'aspect-video rounded-lg'}`}
      title={time}
    >
      {url ? (
        <img src={url} alt={captureTitle(capture)} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      ) : failed ? (
        <span className="flex h-full w-full items-center justify-center text-[var(--textTertiary)]">
          <ImageOff size={16} />
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[var(--textTertiary)]">
          <Loader2 size={14} className="animate-spin" />
        </span>
      )}
      {time && (
        <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[9px] text-white">{time}</span>
      )}
    </button>
  );
}
