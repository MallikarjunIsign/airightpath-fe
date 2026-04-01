import { HTMLAttributes } from 'react';
import { Check, X } from 'lucide-react';
import type { JobApplicationStatus } from '@/types/job.types';

interface StatusStepperProps extends HTMLAttributes<HTMLDivElement> {
  currentStatus: JobApplicationStatus;
  orientation?: 'horizontal' | 'vertical';
}

interface StepConfig {
  key: JobApplicationStatus;
  label: string;
}

const WORKFLOW_STEPS: StepConfig[] = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'RECONFIRMED', label: 'Reconfirmed' },
  { key: 'EXAM_SENT', label: 'Exam Sent' },
  { key: 'EXAM_COMPLETED', label: 'Exam Done' },
  { key: 'INTERVIEW_SCHEDULED', label: 'Interview' },
];

const TERMINAL_STEP_INDEX = WORKFLOW_STEPS.length;

function getStepIndex(status: JobApplicationStatus): number {
  if (status === 'SELECTED' || status === 'REJECTED') {
    return TERMINAL_STEP_INDEX;
  }
  const index = WORKFLOW_STEPS.findIndex((s) => s.key === status);
  return index >= 0 ? index : 0;
}

type StepState = 'completed' | 'current' | 'upcoming' | 'selected' | 'rejected';

function getStepState(
  stepIndex: number,
  currentIndex: number,
  currentStatus: JobApplicationStatus,
  isTerminal: boolean
): StepState {
  if (isTerminal) {
    if (currentStatus === 'SELECTED') return 'selected';
    if (currentStatus === 'REJECTED') return 'rejected';
  }
  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'current';
  return 'upcoming';
}

export function StatusStepper({
  currentStatus,
  orientation = 'horizontal',
  className = '',
  ...props
}: StatusStepperProps) {
  const currentIndex = getStepIndex(currentStatus);
  const isTerminal = currentStatus === 'SELECTED' || currentStatus === 'REJECTED';

  const allSteps: (StepConfig & { isTerminal: boolean })[] = [
    ...WORKFLOW_STEPS.map((s) => ({ ...s, isTerminal: false })),
    {
      key: currentStatus === 'REJECTED' ? 'REJECTED' : 'SELECTED',
      label: currentStatus === 'REJECTED' ? 'Rejected' : 'Selected',
      isTerminal: true,
    },
  ];

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={`
        ${isHorizontal ? 'flex items-start' : 'flex flex-col'}
        ${className}
      `}
      {...props}
    >
      {allSteps.map((step, index) => {
        const state = getStepState(index, currentIndex, currentStatus, step.isTerminal);
        const isLast = index === allSteps.length - 1;

        return (
          <div
            key={step.key}
            className={`
              flex
              ${isHorizontal ? 'flex-col items-center flex-1' : 'flex-row items-start'}
              ${!isLast && !isHorizontal ? 'pb-6' : ''}
            `}
          >
            <div className={`flex items-center ${isHorizontal ? 'w-full' : 'flex-col'}`}>
              <div className={`flex items-center ${!isHorizontal ? 'flex-col' : ''}`}>
                <StepCircle state={state} stepNumber={index + 1} />
              </div>

              {!isLast && (
                <div
                  className={`
                    ${isHorizontal ? 'flex-1 h-0.5 mx-1' : 'w-0.5 h-6 mx-auto mt-0 ml-[17px]'}
                    transition-colors duration-300 rounded-full
                    ${index < currentIndex
                      ? 'gradient-brand'
                      : 'bg-[var(--borderMuted,var(--border))]/30'
                    }
                  `}
                />
              )}
            </div>

            <div
              className={`
                ${isHorizontal
                  ? 'mt-2 text-center w-full'
                  : 'ml-3 pt-0.5'
                }
              `}
            >
              <p
                className={`
                  text-xs font-medium leading-tight
                  ${state === 'completed' || state === 'current' || state === 'selected'
                    ? 'text-[var(--text)]'
                    : state === 'rejected'
                      ? 'text-[var(--error)]'
                      : 'text-[var(--textTertiary)]'
                  }
                `}
              >
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface StepCircleProps {
  state: StepState;
  stepNumber: number;
}

function StepCircle({ state, stepNumber }: StepCircleProps) {
  const base = 'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 text-xs font-bold';

  switch (state) {
    case 'completed':
      return (
        <div className={`${base} gradient-brand text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)]`}>
          <Check size={16} />
        </div>
      );
    case 'current':
      return (
        <div className={`${base} gradient-brand text-white ring-4 ring-[var(--primary)]/15 shadow-[0_2px_8px_rgba(99,102,241,0.25)]`}>
          {stepNumber}
        </div>
      );
    case 'selected':
      return (
        <div className={`${base} bg-[var(--success)] text-white shadow-[0_2px_8px_rgba(34,197,94,0.25)]`}>
          <Check size={16} />
        </div>
      );
    case 'rejected':
      return (
        <div className={`${base} bg-[var(--error)] text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)]`}>
          <X size={16} />
        </div>
      );
    case 'upcoming':
    default:
      return (
        <div className={`${base} bg-[var(--bgOverlay,var(--surface2))] text-[var(--textTertiary)] border border-[var(--borderMuted,var(--border))]/50`}>
          {stepNumber}
        </div>
      );
  }
}
