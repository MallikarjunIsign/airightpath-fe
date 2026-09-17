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
export function RecordingPlayerButton({
  scheduleId,
  kind,
  label,
  variant = 'ghost',
}: Readonly<{
  scheduleId: number;
  kind: 'camera' | 'screen';
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
  }, [stopPlayback]);

  const play = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await interviewService.getRecordingLink(scheduleId, kind);
      if (!res.data?.url) throw new Error('The server returned no link for this recording.');
      setUrl(res.data.url);
    } catch (err) {
      // The server distinguishes "never recorded" from a failure to sign a
      // link, and only it can say which — so its wording is preferred over a
      // generic message that would send the reviewer looking in the wrong place.
      const api = extractApiError(err);
      setError(api.serverMessage || api.message || 'This recording could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, kind]);

  async function download() {
    setDownloading(true);
    try {
      // A second link. The disposition is signed into the URL, so one cannot
      // both play inline and save — the person has to say which they want.
      const res = await interviewService.getRecordingLink(scheduleId, kind, 'attachment');
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
        onClick={play}
        disabled={loading}
      >
        {label}
      </Button>

      <Modal isOpen={!!url || !!error} onClose={close} title={`${label} recording`} size="lg">
        {error ? (
          <div className="space-y-4 py-6 text-center">
            <AlertTriangle size={28} className="mx-auto text-[var(--warning,orange)]" />
            <p className="text-sm text-[var(--textSecondary)]">{error}</p>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RotateCcw size={14} />}
              onClick={play}
              disabled={loading}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
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
                  // A signed link can expire mid-watch, and S3 can refuse one.
                  // Without this the player simply stalls, which reads as a
                  // recording that was never saved.
                  onError={() =>
                    setError(
                      'Playback stopped. The link may have expired — try again to get a fresh one.',
                    )
                  }
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
