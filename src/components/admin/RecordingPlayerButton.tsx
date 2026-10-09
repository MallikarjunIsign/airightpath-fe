import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { interviewService } from '@/services/interview.service';
import { extractApiError } from '@/services/api.service';

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

  async function download() {
    setDownloading(true);
    try {
      // A second link. The disposition is signed into the URL, so one cannot
      // both play inline and save — the person has to say which they want.
      const res = await interviewService.getRecordingLink(scheduleId, kind, 'attachment', part);
      if (!res.data?.url) throw new Error('no url');
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
