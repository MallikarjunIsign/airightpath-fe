import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Download, ExternalLink, FastForward, Loader2, Play, Rewind, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { interviewService } from '@/services/interview.service';
import { extractApiError } from '@/services/api.service';
import { parseServerInstant } from '@/utils/format.utils';
import fixWebmDuration from 'fix-webm-duration';

/**
 * Plays one of an interview's recordings, in place.
 *
 * <p>Three things had to be true for a recording to be watchable at all, and
 * none of them were:</p>
 *
 * <ul>
 *   <li>The schedule stores an {@code s3://bucket/key} reference. No browser
 *       speaks that scheme, so opening it gave a blank tab.</li>
 *   <li>The objects were uploaded with no content type, so S3 served them as
 *       {@code application/octet-stream} and the browser downloaded them
 *       instead of playing.</li>
 *   <li>Playback lived in a new tab, which loses the transcript and scores the
 *       reviewer is comparing the recording against.</li>
 * </ul>
 *
 * <p>Shared between the results table and the candidate result page so a
 * recording behaves the same wherever it is reached from.</p>
 */
/**
 * What actually went wrong, in the reviewer's terms and the developer's.
 *
 * <p>A `<video>` reports one of four causes, and they point at completely
 * different problems: a truncated object in the bucket, a proxy refusing a
 * range request, and a codec the browser cannot open all present identically
 * as "the video stopped". Naming the cause is the difference between a
 * reviewer knowing whether to retry and an engineer knowing where to look.</p>
 */
function describePlaybackError(video: HTMLVideoElement | null): string {
  const code = video?.error?.code;
  const detail = video?.error?.message;
  const suffix = detail ? ` (${detail})` : '';

  switch (code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return `Playback stopped: the connection to the recording failed part way through. The file is there, but something between the browser and storage refused to serve the rest of it.${suffix}`;
    case MediaError.MEDIA_ERR_DECODE:
      return `Playback stopped: the recording is damaged or was only partly uploaded, so the browser cannot read past this point.${suffix}`;
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return `This recording cannot be played here — the file is missing, or its format is one this browser does not support.${suffix}`;
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was stopped before it finished loading.';
    default:
      return `Playback stopped for an unknown reason.${suffix}`;
  }
}

export function RecordingPlayerButton({
  scheduleId,
  kind,
  label,
  variant = 'ghost',
}: Readonly<{
  scheduleId: number;
  kind: 'camera' | 'screen' | 'mobile';
  label: string;
  variant?: 'ghost' | 'outline';
}>) {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  /**
   * Which part is open, and how many there are.
   *
   * <p>A screen recording is one file per share. The candidate can stop
   * sharing part way through an interview and start again, and each share is
   * stored separately because concatenated WebM plays only as far as the
   * first boundary. Before this the player fetched part 0 and the reviewer
   * had no way to know, or reach, the rest.</p>
   */
  const [part, setPart] = useState(0);
  const [parts, setParts] = useState(1);
  /** When this file was recorded, as the server stamped it. */
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  /** The recording's real length in seconds, once the player has worked it out. */
  const [lengthSeconds, setLengthSeconds] = useState<number | null>(null);
  const [jumpTo, setJumpTo] = useState('');

  /**
   * Stop the media, rather than trusting the element's removal to do it.
   *
   * Unmounting a playing `<video>` does not reliably end playback in Chromium:
   * the element is detached but the media resource keeps decoding, so closing
   * the dialog left the interview still audible with nothing on screen to pause.
   * Clearing the source and calling `load()` releases it for certain.
   */
  const stopPlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // The element may already be gone; nothing here is worth reporting.
      }
    }
    // Closing while expanded would otherwise leave the page in fullscreen with
    // the player it belonged to no longer there.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const close = useCallback(() => {
    stopPlayback();
    setUrl(null);
    setError(null);
    setPart(0);
    setParts(1);
    setRecordedAt(null);
    setSpeed(1);
    setLengthSeconds(null);
    setJumpTo('');
  }, [stopPlayback]);

  const play = useCallback(async (which = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await interviewService.getRecordingLink(scheduleId, kind, 'inline', which);
      if (!res.data?.url) throw new Error('The server returned no link for this recording.');
      stopPlayback();
      setUrl(res.data.url);
      setPart(res.data.part ?? which);
      setParts(res.data.parts ?? 1);
      setRecordedAt(res.data.recordedAt ?? null);
    } catch (err) {
      // The server distinguishes "never recorded" from a failure to sign a
      // link, and only it can say which — so its wording is preferred over a
      // generic message that would send the reviewer looking in the wrong place.
      const api = extractApiError(err);
      setError(api.serverMessage || api.message || 'This recording could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, kind, stopPlayback]);

  /** Jump by a number of seconds, staying inside the recording. */
  function skip(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(Math.max(0, video.currentTime + seconds), end);
  }

  /** "5", "5:00" or "1:05:30" as seconds, or null if it is not a time. */
  function parseTime(text: string): number | null {
    const parts = text.trim().split(':');
    if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    return parts.map(Number).reduce((total, n) => total * 60 + n, 0);
  }

  /** Play from an exact point, e.g. 5:00, instead of dragging the bar to find it. */
  function goTo() {
    const video = videoRef.current;
    const seconds = parseTime(jumpTo);
    if (!video || seconds === null) {
      showToast('Enter a time such as 5:00 or 1:05:30.', 'warning');
      return;
    }
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(seconds, end);
    void video.play().catch(() => {});
  }

  function changeSpeed(next: number) {
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  /** The recording's own date and time, in the reader's timezone, e.g. "Sat, 24 Oct 2026, 1:22 PM". */
  const recordedLabel = (() => {
    if (!recordedAt) return null;
    const at = parseServerInstant(recordedAt);
    return Number.isNaN(at.getTime())
      ? null
      : at.toLocaleString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  })();

  async function download() {
    setDownloading(true);
    try {
      // A second link. The disposition is signed into the URL, so one cannot
      // both play inline and save — the person has to say which they want.
      const res = await interviewService.getRecordingLink(scheduleId, kind, 'attachment', part);
      if (!res.data?.url) throw new Error('no url');

      // A browser's recording has no length written into it, so the saved file opens in a player that cannot
      // scroll: no bar to drag and no way to start at 5 minutes. Writing the length in makes it seekable. Done
      // here, where the length is known, and skipped (the plain download below) if the file cannot be fetched.
      if (lengthSeconds && lengthSeconds > 0) {
        try {
          const response = await fetch(res.data.url);
          if (response.ok) {
            const raw = await response.blob();
            const fixed = await fixWebmDuration(raw, Math.round(lengthSeconds * 1000), { logger: false });
            const local = URL.createObjectURL(fixed);
            const link = document.createElement('a');
            link.href = local;
            link.download = `interview-${scheduleId}-${kind}${parts > 1 ? `-part${part + 1}` : ''}.webm`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(local), 60_000);
            return;
          }
        } catch {
          // Fall through to the plain download.
        }
      }
      // A detached anchor, so an attachment response does not interrupt the
      // video playing behind it.
      const anchor = document.createElement('a');
      anchor.href = res.data.url;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      const api = extractApiError(err);
      showToast(api.serverMessage || api.message || 'The recording could not be downloaded.', 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className="px-2"
        leftIcon={loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        onClick={() => play(0)}
        disabled={loading}
      >
        {label}
      </Button>

      <Modal
        isOpen={!!url || !!error}
        onClose={close}
        title={parts > 1 ? `${label} recording — part ${part + 1} of ${parts}` : `${label} recording`}
        size="lg"
      >
        {error ? (
          <div className="space-y-4 py-6 text-center">
            <AlertTriangle size={28} className="mx-auto text-[var(--warning,orange)]" />
            <p className="text-sm text-[var(--textSecondary)]">{error}</p>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RotateCcw size={14} />}
              onClick={() => play(part)}
              disabled={loading}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* The parts bar. Shown only when there is more than one, because
                on a single-part recording it is noise — but when there is, a
                reviewer has to be told: the gap between two parts is time
                nothing was recorded, and that is exactly what they are
                looking for. */}
            {parts > 1 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-700/60 dark:bg-amber-900/20">
                <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                <span className="text-xs text-amber-800 dark:text-amber-200">
                  Recorded in {parts} parts — sharing stopped and restarted during the interview.
                  Nothing was captured between them.
                </span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {Array.from({ length: parts }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => play(i)}
                      disabled={loading}
                      className={`rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                        i === part
                          ? 'bg-amber-500 text-white'
                          : 'bg-white text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/70'
                      }`}
                    >
                      Part {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {recordedLabel && (
              <p className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                <CalendarClock size={15} className="shrink-0 text-[var(--primary)]" />
                <span>
                  Recorded <strong className="text-[var(--text)]">{recordedLabel}</strong>
                </span>
              </p>
            )}
            {/* Black behind the video so letterboxing on a portrait recording
                does not read as a broken player. */}
            <div className="overflow-hidden rounded-lg bg-black">
              {url && (
                <video
                  ref={videoRef}
                  src={url}
                  controls
                  autoPlay
                  playsInline
                  // Straight on to the next part. A recording is normally one
                  // file; it is several only where the candidate stopped sharing
                  // and started again, and the reviewer should not have to notice
                  // the join and press play.
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    // A new file starts at normal speed; carry the chosen one over to the next part.
                    video.playbackRate = speed;
                    // A browser-made recording carries no length, so the player reports Infinity and has no
                    // seek bar to drag. Asking for a point far past the end makes it find the real end, after
                    // which it can be scrubbed and started anywhere.
                    if (video.duration === Infinity) {
                      const back = () => {
                        video.removeEventListener('timeupdate', back);
                        video.currentTime = 0;
                      };
                      video.addEventListener('timeupdate', back);
                      video.currentTime = 1e101;
                    }
                  }}
                  onDurationChange={(e) => {
                    const length = e.currentTarget.duration;
                    if (Number.isFinite(length) && length > 0) setLengthSeconds(length);
                  }}
                  onEnded={() => {
                    if (part + 1 < parts) void play(part + 1);
                  }}
                  className="max-h-[70vh] w-full"
                  // Without this the player simply stalls, which reads as a
                  // recording that was never saved. The message names what the
                  // browser actually reported rather than guessing at expiry —
                  // the link lasts two hours, so a failure seconds in is never
                  // that, and saying so sent at least one investigation the
                  // wrong way.
                  onError={() => setError(describePlaybackError(videoRef.current))}
                />
              )}
            </div>
            {/* Skip controls. The browser's seek bar is hard to hit precisely on a long recording, so these
                jump by fixed steps, and the speed makes a long sitting quicker to get through. */}
            {url && (
              <div className="flex flex-wrap items-center gap-2">
                {[-60, -10].map((s) => (
                  <Button key={s} variant="outline" size="sm" leftIcon={<Rewind size={14} />} onClick={() => skip(s)}>
                    {Math.abs(s) === 60 ? '1 min' : `${Math.abs(s)} s`}
                  </Button>
                ))}
                {[10, 60].map((s) => (
                  <Button key={s} variant="outline" size="sm" rightIcon={<FastForward size={14} />} onClick={() => skip(s)}>
                    {s === 60 ? '1 min' : `${s} s`}
                  </Button>
                ))}
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    goTo();
                  }}
                >
                  <input
                    value={jumpTo}
                    onChange={(e) => setJumpTo(e.target.value)}
                    placeholder="Go to 5:00"
                    aria-label="Go to a time in the recording"
                    className="w-28 rounded border border-[var(--border)] bg-[var(--surface1)] px-2 py-1 text-sm text-[var(--text)]"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Go
                  </Button>
                </form>
                {lengthSeconds ? (
                  <span className="text-xs text-[var(--textTertiary)]">
                    Length {Math.floor(lengthSeconds / 60)}:{String(Math.floor(lengthSeconds % 60)).padStart(2, '0')}
                  </span>
                ) : null}
                <label className="ml-auto flex items-center gap-2 text-xs text-[var(--textSecondary)]">
                  Speed
                  <select
                    value={speed}
                    onChange={(e) => changeSpeed(Number(e.target.value))}
                    className="rounded border border-[var(--border)] bg-[var(--surface1)] px-2 py-1 text-[var(--text)]"
                  >
                    {[0.5, 1, 1.5, 2, 3].map((v) => (
                      <option key={v} value={v}>
                        {v}x
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--textTertiary)]">
                Use the player&apos;s fullscreen control to expand. The link expires in two hours.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* Offered, not forced. Playing in place is what a reviewer
                    normally wants; keeping a copy is occasionally what they
                    need, and that should be their choice rather than a side
                    effect of clicking the recording. */}
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={
                    downloading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )
                  }
                  onClick={download}
                  disabled={downloading}
                >
                  Download
                </Button>
                {url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<ExternalLink size={14} />}
                    onClick={() => window.open(url, '_blank')}
                  >
                    Open in new tab
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
