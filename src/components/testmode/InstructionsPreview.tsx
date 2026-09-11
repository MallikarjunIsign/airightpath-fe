import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Clock,
  Maximize,
  Mic,
  Monitor,
  ScanLine,
  Shield,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { formatDurationLabel } from '@/utils/exam-duration.utils';

/**
 * The rules screen a candidate reads before an exam starts.
 *
 * Every item is derived from `PROCTORING_CONFIG` rather than written out, so
 * what this shows is what the environment will actually enforce. That is the
 * whole point: an admin checking "will a tab switch really end the exam?" needs
 * the answer for *this* deployment, not the answer from whenever the copy was
 * last edited.
 */
export function InstructionsPreview({
  questionCount,
  durationMinutes,
  kind,
}: Readonly<{
  questionCount: number;
  durationMinutes: number;
  kind: 'aptitude' | 'coding';
}>) {
  const proctoring = PROCTORING_CONFIG;

  const rules: { icon: React.ReactNode; text: string; enforced: boolean }[] = [
    {
      icon: <Camera size={16} />,
      text: 'The camera stays on for the whole exam.',
      enforced: proctoring.camera.required,
    },
    {
      icon: <Maximize size={16} />,
      text: proctoring.fullscreen.enabled
        ? 'The exam runs fullscreen. Leaving fullscreen is recorded.'
        : 'Fullscreen is not enforced in this environment.',
      enforced: proctoring.fullscreen.enabled,
    },
    {
      icon: <Monitor size={16} />,
      text:
        proctoring.tabSwitch.enabled && proctoring.tabSwitch.maxBeforeAutoSubmit > 0
          ? `Switching tabs or windows is counted. ${proctoring.tabSwitch.maxBeforeAutoSubmit} switches submits the exam automatically.`
          : 'Switching tabs is recorded but does not auto-submit.',
      enforced: proctoring.tabSwitch.enabled,
    },
    {
      icon: <Users size={16} />,
      text:
        proctoring.eyeDetection.enabled && proctoring.eyeDetection.maxBeforeAutoSubmit > 0
          ? `Looking away or a second face is counted. ${proctoring.eyeDetection.maxBeforeAutoSubmit} warnings submits the exam automatically.`
          : 'Face and gaze checks are advisory in this environment.',
      enforced: proctoring.eyeDetection.enabled,
    },
    {
      icon: <Mic size={16} />,
      text: proctoring.noise.blocksStart
        ? 'Background noise is measured, and a loud room blocks the start.'
        : 'Background noise is measured and warned about, but never blocks the start.',
      enforced: proctoring.noise.enabled,
    },
    {
      icon: <ScanLine size={16} />,
      text: proctoring.identityPhoto.required
        ? 'An identity photo is taken before the exam begins.'
        : 'No identity photo is required in this environment.',
      enforced: proctoring.identityPhoto.required,
    },
    {
      icon: <ScanLine size={16} />,
      text: proctoring.roomScan.required
        ? 'A short sweep of the room is recorded before the exam begins.'
        : 'No room scan is required in this environment.',
      enforced: proctoring.roomScan.required,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Your exam</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Fact label="Questions" value={String(questionCount)} />
            <Fact label="Time allowed" value={formatDurationLabel(durationMinutes)} icon={<Clock size={14} />} />
            <Fact label="Type" value={kind === 'aptitude' ? 'Multiple choice' : 'Coding'} />
          </div>

          <p className="mt-4 text-sm text-[var(--textSecondary)]">
            {kind === 'aptitude'
              ? 'Every question carries its marks. Unanswered questions score zero, and a wrong answer costs no more than a blank one.'
              : 'Each problem lists its test cases. Code is saved per problem as you move between them.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--primary)]" />
            <CardTitle>Proctoring rules in this environment</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {rules.map((rule) => (
              <li key={rule.text} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex-shrink-0 ${
                    rule.enforced ? 'text-[var(--success)]' : 'text-[var(--textTertiary)]'
                  }`}
                >
                  {rule.enforced ? <CheckCircle size={16} /> : rule.icon}
                </span>
                <span
                  className={`text-sm ${
                    rule.enforced ? 'text-[var(--text)]' : 'text-[var(--textTertiary)]'
                  }`}
                >
                  {rule.text}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--warning)] bg-[var(--warning)]/5 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-[var(--warning)]" />
            <p className="text-sm text-[var(--text)]">
              A candidate is warned here not to reload the page — a real exam restarts from the
              beginning and the clock does not stop. In Test Mode reloading is safe; it just ends
              the rehearsal.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({
  label,
  value,
  icon,
}: Readonly<{ label: string; value: string; icon?: React.ReactNode }>) {
  return (
    <div>
      <p className="text-sm text-[var(--textSecondary)]">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold text-[var(--text)]">
        {icon}
        {value}
      </p>
    </div>
  );
}
