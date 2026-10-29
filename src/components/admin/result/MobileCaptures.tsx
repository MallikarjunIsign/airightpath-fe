import { useEffect, useRef, useState } from 'react';
import { Smartphone, Loader2, ImageOff, ScanLine, ChevronLeft, ChevronRight, Download } from 'lucide-react';
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
  const [gallery, setGallery] = useState<{ items: MobileCapture[]; index: number } | null>(null);
  const images = useImageCache();
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
                      <Thumb capture={capture} images={images} onOpen={() => setGallery({ items: alerts, index: alerts.indexOf(capture) })} />
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
              {room.map((capture, index) => (
                <Thumb key={capture.id} capture={capture} images={images} compact onOpen={() => setGallery({ items: room, index })} />
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
              {periodic.map((capture, index) => (
                <Thumb key={capture.id} capture={capture} images={images} onOpen={() => setGallery({ items: periodic, index })} />
              ))}
            </div>
          </details>
        )}
      </CardContent>

      <CaptureGallery
        state={gallery}
        images={images}
        onNavigate={(index) => setGallery((prev) => (prev ? { ...prev, index } : prev))}
        onClose={() => setGallery(null)}
      />
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
  images,
  onOpen,
  compact = false,
}: Readonly<{ capture: MobileCapture; images: ImageCache; onOpen: () => void; compact?: boolean }>) {
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
    images
      .load(capture.id)
      .then((loaded) => {
        if (!cancelled) setUrl(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, capture.id, images]);

  const time = capture.capturedAt ? new Date(capture.capturedAt).toLocaleTimeString() : '';
  return (
    <button
      ref={holder}
      type="button"
      onClick={() => url && onOpen()}
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

/** The images fetched so far, kept while the card is on screen so the viewer and the thumbnails share them. */
interface ImageCache {
  load: (id: number) => Promise<string>;
}

function useImageCache(): ImageCache {
  const cache = useRef(new Map<number, Promise<string>>());
  const [images] = useState<ImageCache>(() => ({
    load: (id: number) => {
      let pending = cache.current.get(id);
      if (!pending) {
        pending = interviewService.getMobileCaptureImage(id).then((res) => URL.createObjectURL(res.data));
        // A failed fetch is forgotten, so opening it again tries again.
        pending.catch(() => cache.current.delete(id));
        cache.current.set(id, pending);
      }
      return pending;
    },
  }));
  useEffect(() => {
    const held = cache.current;
    return () => {
      held.forEach((pending) => void pending.then((url) => URL.revokeObjectURL(url)).catch(() => {}));
      held.clear();
    };
  }, []);
  return images;
}

/** Full-size viewer for a set of phone photos: previous and next, a strip to jump along, and a download. */
function CaptureGallery({
  state,
  images,
  onNavigate,
  onClose,
}: Readonly<{
  state: { items: MobileCapture[]; index: number } | null;
  images: ImageCache;
  onNavigate: (index: number) => void;
  onClose: () => void;
}>) {
  const items = state?.items ?? [];
  const index = state?.index ?? 0;
  const capture = items[index];
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!capture) return;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    images
      .load(capture.id)
      .then((loaded) => {
        if (!cancelled) setUrl(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [capture, images]);

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (event.key === 'ArrowRight' && index < items.length - 1) onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, index, items.length, onNavigate]);

  if (!state || !capture) return null;

  const sequence = items.length > 1;
  const title = captureTitle(capture);

  const download = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `phone-${capture.kind.toLowerCase().replace(/_/g, '-')}-${index + 1}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Modal isOpen onClose={onClose} title={sequence ? `${title}  ·  ${index + 1} of ${items.length}` : title} size="lg">
      <div className="space-y-3">
        <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface1)]">
          {url ? (
            <img src={url} alt={title} className="max-h-[65vh] w-full object-contain" />
          ) : failed ? (
            <span className="flex flex-col items-center gap-1 py-12 text-sm text-[var(--textTertiary)]">
              <ImageOff size={20} /> The image could not be loaded.
            </span>
          ) : (
            <Loader2 size={20} className="my-12 animate-spin text-[var(--textTertiary)]" />
          )}
          {sequence && (
            <>
              <GalleryArrow side="left" disabled={index === 0} onClick={() => onNavigate(index - 1)} />
              <GalleryArrow side="right" disabled={index === items.length - 1} onClick={() => onNavigate(index + 1)} />
            </>
          )}
        </div>

        {sequence && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {items.map((item, i) => (
              <StripThumb key={item.id} capture={item} images={images} active={i === index} onClick={() => onNavigate(i)} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-xs text-[var(--textSecondary)]">
          <span>{capture.capturedAt ? `Captured ${new Date(capture.capturedAt).toLocaleString()}` : 'Capture time not recorded'}</span>
          <button
            type="button"
            onClick={download}
            disabled={!url}
            className="inline-flex items-center gap-1.5 font-medium text-[var(--primary)] hover:underline disabled:opacity-50"
          >
            <Download size={13} />
            Download image
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StripThumb({
  capture,
  images,
  active,
  onClick,
}: Readonly<{ capture: MobileCapture; images: ImageCache; active: boolean; onClick: () => void }>) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    images
      .load(capture.id)
      .then((loaded) => {
        if (!cancelled) setUrl(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [capture.id, images]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-opacity ${
        active ? 'border-[var(--primary)]' : 'border-transparent opacity-60 hover:opacity-100'
      }`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-[var(--surface2)]">
          <Loader2 size={12} className="animate-spin text-[var(--textTertiary)]" />
        </span>
      )}
    </button>
  );
}

function GalleryArrow({ side, disabled, onClick }: Readonly<{ side: 'left' | 'right'; disabled: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-2' : 'right-2'} rounded-full bg-black/55 p-2 text-white transition-opacity hover:bg-black/75 disabled:pointer-events-none disabled:opacity-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
    >
      {side === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
}
