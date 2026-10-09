import { useEffect, useRef, useState } from 'react';
import { Smartphone, Loader2, ImageOff } from 'lucide-react';
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
export function MobileCaptures({ scheduleId }: Readonly<{ scheduleId: number }>) {
  const [captures, setCaptures] = useState<MobileCapture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ capture: MobileCapture; url: string } | null>(null);

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
  const frames = captures.filter((c) => c.kind === 'MONITOR_FRAME');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-[var(--primary)]" />
          <CardTitle>
            Phone camera ({captures.length} {captures.length === 1 ? 'capture' : 'captures'})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {room.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
              Room, as approved before the interview
            </p>
            <div className="flex flex-wrap gap-2">
              {room.map((capture) => (
                <Thumb key={capture.id} capture={capture} onOpen={(url) => setOpen({ capture, url })} />
              ))}
            </div>
          </div>
        )}
        {frames.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
              During the interview
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {frames.map((capture) => (
                <Thumb key={capture.id} capture={capture} onOpen={(url) => setOpen({ capture, url })} />
              ))}
            </div>
          </div>
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
  return `${capture.kind === 'ROOM_PHOTO' ? 'Room photo' : 'Phone frame'}${when ? ` · ${when}` : ''}`;
}

/** One still, fetched when it first scrolls into view. */
function Thumb({ capture, onOpen }: Readonly<{ capture: MobileCapture; onOpen: (url: string) => void }>) {
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
      className="group relative aspect-video overflow-hidden rounded-lg bg-[var(--surface1)] ring-1 ring-[var(--border)] disabled:cursor-default"
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
