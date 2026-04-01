import { HTMLAttributes } from 'react';
import type { JobApplicationStatus } from '@/types/job.types';

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: JobApplicationStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<JobApplicationStatus, { label: string; colorVar: string }> = {
  APPLIED: {
    label: 'Applied',
    colorVar: 'stageApplied',
  },
  SHORTLISTED: {
    label: 'Shortlisted',
    colorVar: 'success',
  },
  ACKNOWLEDGED: {
    label: 'Acknowledged',
    colorVar: 'info',
  },
  ACKNOWLEDGED_BACK: {
    label: 'Acknowledged Back',
    colorVar: 'info',
  },
  RECONFIRMED: {
    label: 'Reconfirmed',
    colorVar: 'accent',
  },
  EXAM_SENT: {
    label: 'Exam Sent',
    colorVar: 'warning',
  },
  EXAM_COMPLETED: {
    label: 'Exam Completed',
    colorVar: 'stageAssessment',
  },
  INTERVIEW_SCHEDULED: {
    label: 'Interview Scheduled',
    colorVar: 'stageInterview',
  },
  INTERVIEW_COMPLETED: {
    label: 'Interview Completed',
    colorVar: 'stageInterview',
  },
  SELECTED: {
    label: 'Selected',
    colorVar: 'success',
  },
  REJECTED: {
    label: 'Rejected',
    colorVar: 'error',
  },
};

export function StatusBadge({ status, size = 'md', className = '', ...props }: StatusBadgeProps) {
  const config = statusConfig[status];

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-medium rounded-full
        ${sizes[size]}
        ${className}
      `}
      style={{
        backgroundColor: `color-mix(in srgb, var(--${config.colorVar}) 12%, transparent)`,
        color: `var(--${config.colorVar})`,
      }}
      {...props}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: `var(--${config.colorVar})` }}
      />
      {config.label}
    </span>
  );
}
