import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Shield,
  Camera,
  Mic,
  Maximize,
  AlertTriangle,
  CheckCircle,
  Monitor,
  Clock,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { APP_CONFIG } from '@/config/app.config';
import type { Assessment } from '@/types/assessment.types';

export function ExamInstructionsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const assessment = (location.state as { assessment?: Assessment })?.assessment;

  const [agreed, setAgreed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup camera stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const requestPermissions = async () => {
    setPermissionLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraReady(true);
      setMicReady(true);
      showToast('Camera and microphone access granted.', 'success');
    } catch {
      showToast('Failed to access camera/microphone. Please allow permissions.', 'error');
    } finally {
      setPermissionLoading(false);
    }
  };

  const handleStartExam = () => {
    if (!agreed) {
      showToast('Please agree to the terms and conditions.', 'warning');
      return;
    }
    if (!cameraReady || !micReady) {
      showToast('Please enable camera and microphone before starting.', 'warning');
      return;
    }

    // Stop the preview stream before navigating
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    const route =
      assessment?.assessmentType === 'CODING'
        ? ROUTES.CANDIDATE.EXAM_CODING
        : ROUTES.CANDIDATE.EXAM_APTITUDE;

    navigate(route, { state: { assessment } });
  };

  if (!assessment) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">
          No assessment data found. Please go back to assessments.
        </p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.ASSESSMENTS)}>
          Back to Assessments
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Exam Instructions</h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          {assessment.assessmentType} Assessment - {assessment.jobPrefix}
        </p>
      </div>

      {/* Rules */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--primary)]" />
              Rules and Guidelines
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {[
              {
                icon: <Clock size={18} />,
                text: `You have ${APP_CONFIG.EXAM_TIMER_MINUTES} minutes to complete this exam.`,
              },
              {
                icon: <Camera size={18} />,
                text: 'Your camera must remain on throughout the exam. Face detection is active.',
              },
              {
                icon: <Mic size={18} />,
                text: 'Your microphone must remain enabled during the exam.',
              },
              {
                icon: <Maximize size={18} />,
                text: 'The exam will run in fullscreen mode. Exiting fullscreen is not allowed.',
              },
              {
                icon: <Monitor size={18} />,
                text: 'Switching tabs or windows will trigger a warning. 3 warnings will auto-submit your exam.',
              },
              {
                icon: <AlertTriangle size={18} />,
                text: 'If your face is not detected 3 times, the exam will be auto-submitted.',
              },
              {
                icon: <Shield size={18} />,
                text: 'Do not use any external resources, notes, or assistance during the exam.',
              },
              {
                icon: <Shield size={18} />,
                text: 'Ensure a stable internet connection before starting.',
              },
            ].map((rule, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 mt-0.5 text-[var(--primary)]">{rule.icon}</span>
                <span className="text-[var(--text)]">{rule.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Camera Preview and Permission Check */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-[var(--primary)]" />
              System Check
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Camera Preview */}
            <div>
              <div className="aspect-video bg-[var(--surface2)] rounded-lg overflow-hidden border border-[var(--border)]">
                {cameraReady ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--textTertiary)]">
                    <Camera className="w-10 h-10 mb-2" />
                    <p className="text-sm">Camera preview will appear here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status Checks */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {cameraReady ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
                <span className="text-[var(--text)]">
                  Camera: {cameraReady ? 'Ready' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {micReady ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
                <span className="text-[var(--text)]">
                  Microphone: {micReady ? 'Ready' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Maximize className="w-5 h-5 text-blue-500" />
                <span className="text-[var(--text)]">
                  Fullscreen will be activated on exam start
                </span>
              </div>

              <Button
                variant="outline"
                onClick={requestPermissions}
                isLoading={permissionLoading}
                disabled={cameraReady && micReady}
                leftIcon={<Camera size={18} />}
                className="w-full mt-4"
              >
                {cameraReady && micReady ? 'Permissions Granted' : 'Enable Camera & Microphone'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agreement and Start */}
      <Card>
        <CardContent>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span className="text-[var(--text)]">
                I have read and understood all the instructions above. I agree to follow the rules
                and understand that violations may result in automatic submission of my exam.
              </span>
            </label>

            <Button
              size="lg"
              className="w-full"
              onClick={handleStartExam}
              disabled={!agreed || !cameraReady || !micReady}
            >
              Start Exam
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
