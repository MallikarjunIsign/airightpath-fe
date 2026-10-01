import { stampBrand } from '@/utils/answer-sheet.utils';
import { describeInterviewSubmission } from '@/utils/interview-submission.utils';
import type { InterviewSchedule, VoiceEvaluationResult } from '@/types/interview.types';
import type { VoiceConversationEntryDTO } from '@/services/interview.service';

/**
 * One interview as a shareable PDF, watermarked like every other document the
 * platform produces.
 *
 * <p>The interview result could only be downloaded as a workbook. A workbook
 * is right for comparing a cohort and wrong for the thing a recruiter actually
 * does with one candidate's result — attach it to a mail, put it in front of a
 * hiring manager, keep it with the file. Those all wanted the same
 * watermarked PDF the aptitude and coding results already produced.</p>
 *
 * <p>The brand stamp is imported rather than reimplemented: one watermark, one
 * place to change it, and no chance of the interview PDF quietly diverging
 * from the exam one.</p>
 */
export interface InterviewReportInput {
  schedule: InterviewSchedule;
  evaluation: VoiceEvaluationResult | null;
  transcript: VoiceConversationEntryDTO[];
  /** Why it was flagged for review, if it was. */
  reviewReasons?: string[];
  generatedAt: Date;
}

export async function buildInterviewReportPdf(input: InterviewReportInput): Promise<Blob> {
  // On demand — jsPDF is dead weight on every screen that never exports.
  const { jsPDF, GState } = await import('jspdf');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const width = pageWidth - margin * 2;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const write = (
    text: string,
    { size = 10, style = 'normal' as 'normal' | 'bold' | 'italic', gap = 3, indent = 0 } = {}
  ) => {
    if (!text) return;
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width - indent) as string[];
    const lineHeight = size * 1.35;
    for (const line of lines) {
      ensureRoom(lineHeight);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  };

  const heading = (text: string) => {
    ensureRoom(40);
    y += 6;
    doc.setTextColor(17);
    write(text, { size: 13, style: 'bold', gap: 6 });
  };

  const muted = (text: string, size = 8.5) => {
    doc.setTextColor(110);
    write(text, { size, gap: 3 });
    doc.setTextColor(17);
  };

  const { schedule, evaluation, transcript } = input;

  // ── Who and what ─────────────────────────────────────────────────
  write('Interview Report', { size: 18, style: 'bold', gap: 2 });
  muted(
    `${schedule.roundLabel ?? schedule.round ?? 'Interview'} · ${schedule.jobPrefix}`,
    10
  );
  write(schedule.email, { size: 11, gap: 8 });

  // ── The verdict ──────────────────────────────────────────────────
  heading('Result');
  const score = evaluation?.overallScore;
  write(
    score != null ? `Overall score: ${score.toFixed(1)} / 10` : 'Overall score: not scored',
    { size: 11, style: 'bold', gap: 2 }
  );
  if (evaluation?.recommendation) {
    write(`Recommendation: ${evaluation.recommendation.replace(/_/g, ' ')}`, { gap: 2 });
  }
  // The result that stands, which is not always the machine's.
  if (schedule.overriddenResult) {
    write(
      `Result overridden to ${schedule.overriddenResult}` +
        (schedule.overriddenBy ? ` by ${schedule.overriddenBy}` : ''),
      { style: 'bold', gap: 2 }
    );
    muted(`The AI concluded ${schedule.interviewResult.toLowerCase()}.`);
  } else {
    write(`Result: ${schedule.interviewResult}`, { gap: 2 });
  }
  if (evaluation?.confidence != null) {
    muted(`Evaluator confidence: ${Math.round(evaluation.confidence * 100)}%`);
  }
  if (evaluation?.summary) {
    write(evaluation.summary, { gap: 6 });
  }

  // ── Why a person should look ─────────────────────────────────────
  if (input.reviewReasons?.length) {
    heading('Flagged for review');
    input.reviewReasons.forEach((reason) => write(`• ${reason}`, { indent: 10, gap: 1 }));
  }

  // ── How it ended ─────────────────────────────────────────────────
  const submission = describeInterviewSubmission(schedule);
  if (submission) {
    heading('Submission');
    write(submission.label, { style: 'bold', gap: 2 });
    write(submission.reason, { gap: 4 });
    muted(
      `Started ${fmt(submission.startedAt)}   ·   Ended ${fmt(submission.endedAt)}` +
        (submission.durationLabel ? `   ·   ${submission.durationLabel}` : '')
    );
  }

  // ── Scores by area ───────────────────────────────────────────────
  if (evaluation?.categoryScores?.length) {
    heading('Scores by area');
    evaluation.categoryScores.forEach((category) => {
      write(`${category.category} — ${category.score}/10`, { style: 'bold', gap: 1, indent: 0 });
      if (category.feedback) write(category.feedback, { size: 9, indent: 10, gap: 4 });
    });
  }

  bulletSection('Strengths', evaluation?.strengths);
  bulletSection('Areas to improve', evaluation?.areasForImprovement);

  // ── What was actually said ───────────────────────────────────────
  if (transcript.length) {
    heading(`Transcript (${transcript.length} turns)`);
    transcript.forEach((entry) => {
      const who = entry.role === 'CANDIDATE' ? 'Candidate' : 'Interviewer';
      const tags = [
        entry.topic,
        entry.turnKind && entry.turnKind !== 'NEW_QUESTION'
          ? entry.turnKind.replace('_', ' ').toLowerCase()
          : null,
        entry.answerScore != null ? `${entry.answerScore}/10` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      write(tags ? `${who}  (${tags})` : who, { size: 9, style: 'bold', gap: 1 });
      write(entry.content, { size: 9.5, indent: 10, gap: 2 });
      if (entry.codeContent) {
        muted('Code submitted:', 8);
        write(entry.codeContent, { size: 8, indent: 10, gap: 2 });
      }
      // An attempt to work the interviewer belongs in the record a hiring
      // decision is made from, not only on a screen somebody might scroll past.
      if (entry.injectionSuspected) {
        muted('[Flagged: tried to instruct the interviewer. It had no effect.]', 8);
      }
      y += 2;
    });
  }

  stampBrand(doc, GState);
  return doc.output('blob');

  function bulletSection(title: string, items?: string[]) {
    if (!items?.length) return;
    heading(title);
    items.forEach((item) => write(`• ${item}`, { indent: 10, gap: 1 }));
  }
}

/** A timestamp as a reader expects it, or a dash where there is none. */
function fmt(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

/** Filename stem, matching the answer sheet's shape. */
export function interviewReportFileName(schedule: InterviewSchedule): string {
  const who = schedule.email.split('@')[0].replace(/[^\w.-]+/g, '-');
  const round = (schedule.round ?? 'interview').toLowerCase().replace(/_/g, '-');
  return `${schedule.jobPrefix}-${who}-${round}-interview.pdf`;
}
