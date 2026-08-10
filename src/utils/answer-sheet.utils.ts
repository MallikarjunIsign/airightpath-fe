/**
 * The candidate's answer sheet — what they were asked, and what they actually
 * wrote.
 *
 * The on-screen result is built for triage: scores, bands, filters. This is
 * built for the record — every question in paper order, the option the candidate
 * picked next to the correct one, and for coding the code they submitted with
 * how each test case fared. It is what gets attached to a hiring decision or
 * handed over when a candidate disputes a score, so nothing is summarised away.
 */

import {
  codeOf,
  normalizeBand,
  passedTestCount,
  rowLanguage,
  rowTitle,
  testsOf,
} from '@/utils/result.utils';
import type { CodingRow } from '@/utils/result.utils';
import type { AptitudeAnswer } from '@/types/result.types';
import type { RawQuestion } from '@/types/assessment.types';

export interface AnswerSheetAptitude {
  score: number | null;
  status?: string;
  /** Raw figure behind the percentage, e.g. "12/30 marks". */
  marksLabel?: string;
  answers: AptitudeAnswer[];
  /** The paper, used to print the option text the candidate chose between. */
  paper: RawQuestion[];
}

export interface AnswerSheetCoding {
  score: number | null;
  status?: string;
  rows: CodingRow[];
}

export interface AnswerSheetData {
  candidateEmail: string;
  jobPrefix: string;
  submittedAt?: string;
  overallStatus: string;
  overallScore: number | null;
  aptitude?: AnswerSheetAptitude;
  coding?: AnswerSheetCoding;
}

// ── Shared shaping ────────────────────────────────────────────────────

interface Option {
  key: string;
  text: string;
}

/** Options come back as {"A":"…"} or as a bare array; both are normalised here. */
function optionsOf(question?: RawQuestion): Option[] {
  const raw = question?.options;
  if (Array.isArray(raw)) {
    return raw.map((text, i) => ({ key: String.fromCharCode(65 + i), text: String(text) }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([key, text]) => ({ key, text: String(text) }));
  }
  return [];
}

/**
 * Pairs a stored answer with its question on the paper — by id where the result
 * carries one, else by position. Papers and results are written together, so
 * position is a safe fallback for older results that predate question ids.
 */
function paperQuestionFor(
  answer: AptitudeAnswer,
  index: number,
  paper: RawQuestion[]
): RawQuestion | undefined {
  if (answer.questionId !== undefined) {
    const byId = paper.find((q) => q.id === answer.questionId);
    if (byId) return byId;
  }
  return paper[index];
}

/** The text of the option the candidate picked, when the paper still has it. */
function optionText(options: Option[], key?: string): string {
  if (!key) return '';
  return options.find((o) => o.key === key)?.text ?? '';
}

const answered = (a: AptitudeAnswer) => !!(a.selectedAnswer ?? '').toString().trim();

const scoreLabel = (score: number | null) => (score === null ? 'N/A' : `${score}%`);

// ── HTML (Word, print, and the on-screen preview) ─────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function aptitudeHtml(section: AnswerSheetAptitude): string {
  const questions = section.answers
    .map((answer, i) => {
      const paperQuestion = paperQuestionFor(answer, i, section.paper);
      const options = optionsOf(paperQuestion);
      const wasAnswered = answered(answer);

      const optionsHtml = options.length
        ? `<ol class="options">${options
            .map((option) => {
              const classes = [
                option.key === answer.selectedAnswer ? 'picked' : '',
                option.key === answer.correctAnswer ? 'correct' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const marker =
                option.key === answer.selectedAnswer
                  ? ' &lt;-- candidate&#39;s answer'
                  : '';
              return `<li${classes ? ` class="${classes}"` : ''}>
                  <strong>${escapeHtml(option.key)}.</strong> ${escapeHtml(option.text)}${marker}
                </li>`;
            })
            .join('')}</ol>`
        : '';

      const verdict = wasAnswered
        ? answer.isCorrect
          ? '<span class="tag pass">Correct</span>'
          : '<span class="tag fail">Incorrect</span>'
        : '<span class="tag skip">Not answered</span>';

      const chosen = wasAnswered
        ? `${escapeHtml(answer.selectedAnswer!)}${optionText(options, answer.selectedAnswer) ? ` — ${escapeHtml(optionText(options, answer.selectedAnswer))}` : ''}`
        : 'Left blank';

      const correct = answer.correctAnswer
        ? `${escapeHtml(answer.correctAnswer)}${optionText(options, answer.correctAnswer) ? ` — ${escapeHtml(optionText(options, answer.correctAnswer))}` : ''}`
        : '--';

      return `<section class="q">
          <h3>Q${i + 1}. ${escapeHtml(answer.questionText || answer.question || '')} ${verdict}</h3>
          <p class="meta">${escapeHtml(normalizeBand(answer.Difficulty || answer.category))}${
            answer.marks !== undefined ? ` &middot; ${answer.marks} mark${answer.marks === 1 ? '' : 's'} awarded` : ''
          }</p>
          ${optionsHtml}
          <p class="line"><span class="label">Candidate answered</span>${chosen}</p>
          <p class="line"><span class="label">Correct answer</span>${correct}</p>
        </section>`;
    })
    .join('');

  return `<h2>Aptitude — ${escapeHtml(scoreLabel(section.score))}${
    section.marksLabel ? ` <span class="meta">(${escapeHtml(section.marksLabel)})</span>` : ''
  }${section.status ? ` <span class="tag ${section.status === 'PASSED' ? 'pass' : 'fail'}">${escapeHtml(section.status)}</span>` : ''}</h2>
    ${questions || '<p class="meta">No aptitude answers recorded.</p>'}`;
}

function codingHtml(section: AnswerSheetCoding): string {
  const questions = section.rows
    .map((row, i) => {
      const code = codeOf(row);
      const tests = testsOf(row);
      const passed = passedTestCount(row);
      const language = rowLanguage(row);

      const testsHtml = tests.length
        ? `<p class="label">Test cases — ${passed}/${tests.length} passed</p>
           <table class="cases">
             <tr><th>#</th><th>Input</th><th>Expected</th><th>Candidate output</th><th>Result</th></tr>
             ${tests
               .map(
                 (test, n) => `<tr>
                    <td>${n + 1}</td>
                    <td><pre>${escapeHtml(test.input ?? '')}</pre></td>
                    <td><pre>${escapeHtml(test.expectedOutput ?? '')}</pre></td>
                    <td><pre>${escapeHtml(test.actualOutput ?? '')}</pre></td>
                    <td>${test.passed ? 'Pass' : 'Fail'}</td>
                  </tr>`
               )
               .join('')}
           </table>`
        : '<p class="meta">No test cases were executed for this question.</p>';

      return `<section class="q">
          <h3>Q${i + 1}. ${escapeHtml(rowTitle(row))} ${
            code ? '' : '<span class="tag skip">Not attempted</span>'
          }</h3>
          <p class="meta">${escapeHtml(normalizeBand(row.question?.Difficulty))}${
            language ? ` &middot; ${escapeHtml(language)}` : ''
          }</p>
          ${row.question?.description ? `<p class="desc">${escapeHtml(row.question.description)}</p>` : ''}
          <p class="label">Code the candidate submitted</p>
          <pre>${code ? escapeHtml(code) : '(nothing submitted)'}</pre>
          ${testsHtml}
        </section>`;
    })
    .join('');

  return `<h2>Coding — ${escapeHtml(scoreLabel(section.score))}${
    section.status ? ` <span class="tag ${section.status === 'PASSED' ? 'pass' : 'fail'}">${escapeHtml(section.status)}</span>` : ''
  }</h2>
    ${questions || '<p class="meta">No coding submissions recorded.</p>'}`;
}

/** A self-contained document — styles inline, since Word and print see no app CSS. */
export function answerSheetToHtml(data: AnswerSheetData): string {
  const title = `${data.candidateEmail} — ${data.jobPrefix} answer sheet`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #111; margin: 32px; line-height: 1.5; }
  h1 { font-size: 20pt; margin: 0 0 4px; }
  h2 { font-size: 14pt; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #ddd; }
  h3 { font-size: 11.5pt; margin: 0 0 6px; font-weight: 600; }
  .sub { color: #555; font-size: 10pt; margin: 0 0 6px; }
  .q { margin: 0 0 16px; padding: 0 0 12px; border-bottom: 1px solid #eee; page-break-inside: avoid; }
  .meta { font-size: 9pt; color: #666; margin: 0 0 6px; }
  .desc { margin: 4px 0 8px; white-space: pre-wrap; font-size: 10pt; }
  .options { margin: 6px 0 8px 18px; padding: 0; }
  .options li { margin: 2px 0; list-style: none; font-size: 10pt; }
  .options li.correct { color: #147a3d; font-weight: 700; }
  .options li.picked { background: #fff4d6; }
  .options li.picked.correct { background: #e4f6ea; }
  .line { margin: 2px 0; font-size: 10pt; }
  .label { display: inline-block; min-width: 150px; font-size: 9pt; color: #666;
           text-transform: uppercase; letter-spacing: .04em; }
  .tag { font-size: 8.5pt; padding: 1px 7px; border-radius: 10px; font-weight: 600; }
  .tag.pass { background: #e4f6ea; color: #147a3d; }
  .tag.fail { background: #fdeaea; color: #a3262c; }
  .tag.skip { background: #f1f1f1; color: #666; }
  pre { background: #f5f5f5; padding: 8px 10px; border-radius: 4px; font-family: Consolas, monospace;
        font-size: 9.5pt; white-space: pre-wrap; margin: 0 0 8px; }
  table.cases { border-collapse: collapse; width: 100%; margin: 4px 0 8px; font-size: 9pt; }
  table.cases th { text-align: left; background: #f0f0f0; padding: 4px 8px; border: 1px solid #ddd; }
  table.cases td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: top; }
  table.cases pre { background: none; padding: 0; font-size: 9pt; margin: 0; }
</style></head>
<body>
  <h1>Answer sheet</h1>
  <p class="sub"><strong>${escapeHtml(data.candidateEmail)}</strong> &middot; ${escapeHtml(data.jobPrefix)}</p>
  <p class="sub">Overall ${escapeHtml(scoreLabel(data.overallScore))} &middot; ${escapeHtml(data.overallStatus)}${
    data.submittedAt ? ` &middot; submitted ${escapeHtml(new Date(data.submittedAt).toLocaleString())}` : ''
  }</p>
  ${data.aptitude ? aptitudeHtml(data.aptitude) : ''}
  ${data.coding ? codingHtml(data.coding) : ''}
</body></html>`;
}

// ── JSON ──────────────────────────────────────────────────────────────

/** The same content as data, for a reviewer who wants to process it. */
export function answerSheetToJson(data: AnswerSheetData): string {
  return JSON.stringify(
    {
      candidateEmail: data.candidateEmail,
      jobPrefix: data.jobPrefix,
      submittedAt: data.submittedAt ?? null,
      overallStatus: data.overallStatus,
      overallScorePercent: data.overallScore,
      aptitude: data.aptitude
        ? {
            scorePercent: data.aptitude.score,
            status: data.aptitude.status ?? null,
            questions: data.aptitude.answers.map((answer, i) => {
              const options = optionsOf(paperQuestionFor(answer, i, data.aptitude!.paper));
              return {
                number: i + 1,
                question: answer.questionText || answer.question || '',
                difficulty: normalizeBand(answer.Difficulty || answer.category),
                options,
                candidateAnswer: answer.selectedAnswer ?? null,
                candidateAnswerText: optionText(options, answer.selectedAnswer) || null,
                correctAnswer: answer.correctAnswer ?? null,
                correctAnswerText: optionText(options, answer.correctAnswer) || null,
                answered: answered(answer),
                isCorrect: !!answer.isCorrect,
                marksAwarded: answer.marks ?? null,
              };
            }),
          }
        : null,
      coding: data.coding
        ? {
            scorePercent: data.coding.score,
            status: data.coding.status ?? null,
            questions: data.coding.rows.map((row, i) => ({
              number: i + 1,
              title: rowTitle(row),
              difficulty: normalizeBand(row.question?.Difficulty),
              description: row.question?.description ?? null,
              language: rowLanguage(row) ?? null,
              submittedCode: codeOf(row) || null,
              testsPassed: passedTestCount(row),
              testsRun: testsOf(row).length,
              testCases: testsOf(row).map((test, n) => ({
                number: n + 1,
                input: test.input ?? null,
                expectedOutput: test.expectedOutput ?? null,
                candidateOutput: test.actualOutput ?? null,
                passed: !!test.passed,
              })),
            })),
          }
        : null,
    },
    null,
    2
  );
}

// ── PDF ───────────────────────────────────────────────────────────────

/**
 * A real PDF laid out as text — selectable, searchable, and a few KB, rather
 * than a screenshot of the page.
 */
export async function buildAnswerSheetPdf(data: AnswerSheetData) {
  // Loaded on demand — the PDF library is dead weight on every other screen.
  const { jsPDF } = await import('jspdf');

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

  write('Answer sheet', { size: 17, style: 'bold', gap: 2 });
  muted(`${data.candidateEmail}  ·  ${data.jobPrefix}`, 10);
  muted(
    `Overall ${scoreLabel(data.overallScore)}  ·  ${data.overallStatus}${
      data.submittedAt ? `  ·  submitted ${new Date(data.submittedAt).toLocaleString()}` : ''
    }`,
    9
  );

  if (data.aptitude) {
    const section = data.aptitude;
    heading(
      `Aptitude — ${scoreLabel(section.score)}${section.marksLabel ? ` (${section.marksLabel})` : ''}${
        section.status ? `  ·  ${section.status}` : ''
      }`
    );

    section.answers.forEach((answer, i) => {
      ensureRoom(70);
      const options = optionsOf(paperQuestionFor(answer, i, section.paper));
      const wasAnswered = answered(answer);
      let verdict = 'Not answered';
      if (wasAnswered) verdict = answer.isCorrect ? 'Correct' : 'Incorrect';

      write(`Q${i + 1}. ${answer.questionText || answer.question || ''}`, {
        size: 10.5,
        style: 'bold',
        gap: 2,
      });
      muted(
        `${normalizeBand(answer.Difficulty || answer.category)}  ·  ${verdict}${
          answer.marks !== undefined ? `  ·  ${answer.marks} mark(s) awarded` : ''
        }`
      );

      options.forEach((option) => {
        const isPicked = option.key === answer.selectedAnswer;
        const isCorrect = option.key === answer.correctAnswer;
        const suffix = isPicked ? "   <- candidate's answer" : '';
        write(`${option.key}. ${option.text}${suffix}`, {
          size: 9.5,
          style: isPicked || isCorrect ? 'bold' : 'normal',
          gap: 1,
          indent: 16,
        });
      });

      write(`Candidate answered: ${wasAnswered ? answer.selectedAnswer : 'Left blank'}`, {
        size: 9.5,
        gap: 1,
        indent: 16,
      });
      write(`Correct answer:     ${answer.correctAnswer ?? '--'}`, {
        size: 9.5,
        gap: 4,
        indent: 16,
      });
      y += 6;
    });
  }

  if (data.coding) {
    const section = data.coding;
    heading(
      `Coding — ${scoreLabel(section.score)}${section.status ? `  ·  ${section.status}` : ''}`
    );

    section.rows.forEach((row, i) => {
      ensureRoom(80);
      const code = codeOf(row);
      const tests = testsOf(row);
      const language = rowLanguage(row);

      write(`Q${i + 1}. ${rowTitle(row)}`, { size: 10.5, style: 'bold', gap: 2 });
      muted(
        `${normalizeBand(row.question?.Difficulty)}${language ? `  ·  ${language}` : ''}${
          tests.length ? `  ·  ${passedTestCount(row)}/${tests.length} tests passed` : '  ·  no tests run'
        }`
      );
      if (row.question?.description) write(row.question.description, { size: 9.5, gap: 4 });

      muted('Code the candidate submitted');
      doc.setFont('courier', 'normal');
      write(code || '(nothing submitted)', { size: 8.5, gap: 4, indent: 12 });
      doc.setFont('helvetica', 'normal');

      tests.forEach((test, n) => {
        write(
          `Test ${n + 1}: ${test.passed ? 'PASS' : 'FAIL'}   input: ${test.input ?? '(empty)'}`,
          { size: 9, gap: 1, indent: 12 }
        );
        write(
          `  expected: ${test.expectedOutput ?? '(empty)'}   got: ${test.actualOutput ?? '(empty)'}`,
          { size: 9, gap: 2, indent: 12 }
        );
      });
      y += 6;
    });
  }

  return doc;
}

/** Filename stem shared by every format, e.g. `FE-DEV-006-jane-answers`. */
export function answerSheetFileName(data: AnswerSheetData): string {
  const who = data.candidateEmail.split('@')[0].replace(/[^\w.-]+/g, '-');
  return `${data.jobPrefix}-${who}-answers`;
}
