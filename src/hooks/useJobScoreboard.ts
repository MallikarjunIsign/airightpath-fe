import { useState, useEffect, useRef } from 'react';
import { assessmentService } from '@/services/assessment.service';
import { compilerService } from '@/services/compiler.service';
import { toAssessmentList } from '@/utils/assessment.utils';
import { orderedAssessments } from '@/utils/result.utils';
import { buildCandidateStandings } from '@/utils/scoreboard.utils';
import type { CandidateStanding } from '@/utils/scoreboard.utils';
import type { Assessment, RawCodingQuestion } from '@/types/assessment.types';

/**
 * Where each candidate on a job stands in their exam, keyed by lowercased email.
 *
 * Loaded beside the pipeline rather than as part of it: the candidate list is
 * useful the moment it arrives, and the scores are extra context that can land a
 * moment later. Every request is silent — a scoreboard that cannot be read
 * should cost the column it fills, not put a red toast over the page.
 */
export function useJobScoreboard(jobPrefix: string, emails: string[]) {
  const [standings, setStandings] = useState<Map<string, CandidateStanding>>(new Map());
  const [loading, setLoading] = useState(false);

  /** Discards a slow load that lands after the job selection moved on. */
  const token = useRef(0);

  // Joined rather than passed as an array: a fresh array on every render would
  // restart the load on every render.
  const roster = emails.join(',');

  useEffect(() => {
    const wanted = roster ? roster.split(',') : [];
    const mine = ++token.current;

    setStandings(new Map());
    if (!jobPrefix || wanted.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);

    (async () => {
      try {
        const [resultsRes, submissionsRes, assessmentLists] = await Promise.all([
          assessmentService.getResultsByJobPrefix(jobPrefix, { silent: true }).catch(() => null),
          compilerService.getResultsByJobPrefix(jobPrefix, { silent: true }).catch(() => null),
          // One unreachable candidate costs that candidate their scores rather
          // than emptying the whole column.
          Promise.all(
            wanted.map(async (email) => {
              try {
                const res = await assessmentService.getAllAssessmentsForCandidate(email, {
                  silent: true,
                });
                return [
                  email.toLowerCase(),
                  toAssessmentList(res.data).filter((a) => a.jobPrefix === jobPrefix),
                ] as const;
              } catch {
                return [email.toLowerCase(), [] as Assessment[]] as const;
              }
            }),
          ),
        ]);
        if (mine !== token.current) return;

        const assessments = new Map(assessmentLists);

        // One paper for the job, as every candidate on it sits the same one.
        // Read off the newest coding assignment found: a re-sit's paper is the
        // one the latest attempt is scored against, and `buildCandidateStandings`
        // checks per candidate that it fits before using it.
        const codingAssessments = orderedAssessments(
          Array.from(assessments.values())
            .flat()
            .filter((a) => a.assessmentType === 'CODING'),
        );
        const paperId = codingAssessments[codingAssessments.length - 1]?.id;

        let codingPaper: RawCodingQuestion[] | null = null;
        if (paperId != null) {
          try {
            const paper = await assessmentService.fetchQuestions(paperId);
            const raw = paper.data?.questions;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) codingPaper = parsed as RawCodingQuestion[];
          } catch {
            // Best effort — a missing paper costs the coding percentage, which
            // is the honest outcome, never a number derived from a guess.
          }
        }
        if (mine !== token.current) return;

        setStandings(
          buildCandidateStandings({
            emails: wanted,
            results: resultsRes?.data ?? [],
            submissions: submissionsRes?.data ?? [],
            assessments,
            codingPaper,
          }),
        );
      } finally {
        if (mine === token.current) setLoading(false);
      }
    })();
  }, [jobPrefix, roster]);

  return { standings, loading };
}
