import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  User,
  Bot,
  ArrowLeft,
  MessageSquare,
  FileText,
  BarChart3,
  Mic2,
  Loader2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EvaluationBreakdown } from '@/components/interview/EvaluationBreakdown';
import { aiService } from '@/services/ai.service';
import { ROUTES } from '@/config/routes';
import type {
  InterviewSchedule,
  ConversationEntry,
  InterviewEvaluation,
  VoiceEvaluationResult,
} from '@/types/interview.types';

interface SummaryState {
  interview?: InterviewSchedule;
  scheduleId?: number;
  conversation?: ConversationEntry[];
  summary?: string;
  evaluation?: InterviewEvaluation | VoiceEvaluationResult;
}

function isVoiceEvaluation(eval_: any): eval_ is VoiceEvaluationResult {
  return eval_ && 'speechAnalysis' in eval_;
}

export function InterviewSummaryPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as SummaryState | null;
  const interview = state?.interview;
  const scheduleId = state?.scheduleId;
  const conversation = state?.conversation ?? [];
  const summary = state?.summary;
  const [evaluation, setEvaluation] = useState<InterviewEvaluation | VoiceEvaluationResult | null>(
    (state?.evaluation as any) ?? null
  );
  const [loadingEval, setLoadingEval] = useState(false);

  // If no evaluation yet and we have a scheduleId, poll with retry
  useEffect(() => {
    if (!evaluation && scheduleId) {
      let cancelled = false;
      setLoadingEval(true);

      (async () => {
        const MAX_RETRIES = 10;
        const INITIAL_DELAY = 3000;
        const MAX_DELAY = 15000;
        const BACKOFF_FACTOR = 1.5;
        let delay = INITIAL_DELAY;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (cancelled) return;
          try {
            const res = await aiService.getVoiceEvaluation(scheduleId);
            if (res.data && res.data.overallScore !== undefined && res.data.overallScore > 0) {
              if (!cancelled) setEvaluation(res.data);
              return;
            }
          } catch {
            // Continue polling
          }

          if (attempt < MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY);
          }
        }
      })().finally(() => {
        if (!cancelled) setLoadingEval(false);
      });

      return () => { cancelled = true; };
    }
  }, [evaluation, scheduleId]);

  if (!interview) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">No interview summary data available.</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.INTERVIEWS)}>
          Back to Interviews
        </Button>
      </div>
    );
  }

  const voiceEval = evaluation && isVoiceEvaluation(evaluation) ? evaluation : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(ROUTES.CANDIDATE.DASHBOARD)}
          leftIcon={<ArrowLeft size={18} />}
        >
          Back to Dashboard
        </Button>
      </div>

      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Interview Complete</h1>
        <p className="mt-2 text-[var(--textSecondary)]">
          Your interview for <strong className="text-[var(--text)]">{interview.jobPrefix}</strong>{' '}
          has been completed.
        </p>
      </div>

      {/* Loading evaluation */}
      {loadingEval && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
              <span className="text-[var(--textSecondary)]">Generating evaluation...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice Evaluation Results */}
      {voiceEval && (
        <>
          {/* Overall Score & Recommendation */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[var(--primary)]" />
                  Evaluation Results
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-[var(--textSecondary)]">Overall Score</p>
                  <p className="text-4xl font-bold text-[var(--text)]">
                    {(voiceEval.overallScore ?? 0).toFixed(1)}
                    <span className="text-lg text-[var(--textTertiary)]">/10</span>
                  </p>
                </div>
                {voiceEval.recommendation && (
                  <Badge
                    variant={
                      voiceEval.recommendation === 'STRONG_HIRE' || voiceEval.recommendation === 'HIRE'
                        ? 'success'
                        : voiceEval.recommendation === 'NO_HIRE'
                          ? 'warning'
                          : 'error'
                    }
                    size="lg"
                  >
                    {voiceEval.recommendation.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>

              {/* Summary */}
              {voiceEval.summary && (
                <p className="text-sm text-[var(--text)] mb-4 leading-relaxed">{voiceEval.summary}</p>
              )}

              {/* Category Scores */}
              <div className="space-y-3">
                {voiceEval.categoryScores.map((cat, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[var(--text)]">{cat.category}</span>
                      <span className="text-sm font-semibold text-[var(--text)]">{cat.score}/10</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--surface1)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          cat.score >= 7 ? 'bg-emerald-500' : cat.score >= 5 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${(cat.score / 10) * 100}%` }}
                      />
                    </div>
                    {cat.feedback && (
                      <p className="text-xs text-[var(--textTertiary)] mt-1">{cat.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Speech Analysis */}
          {voiceEval.speechAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Mic2 className="w-5 h-5 text-[var(--primary)]" />
                    Speech Analysis
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 rounded-lg bg-[var(--surface1)]">
                    <p className="text-2xl font-bold text-[var(--text)]">
                      {Math.round(voiceEval.speechAnalysis.averageWordsPerMinute)}
                    </p>
                    <p className="text-xs text-[var(--textTertiary)]">Words/min</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[var(--surface1)]">
                    <p className="text-2xl font-bold text-[var(--text)]">
                      {voiceEval.speechAnalysis.totalFillerWords}
                    </p>
                    <p className="text-xs text-[var(--textTertiary)]">Filler Words</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[var(--surface1)]">
                    <p className="text-2xl font-bold text-[var(--text)]">
                      {Math.round(voiceEval.speechAnalysis.confidenceScore)}%
                    </p>
                    <p className="text-xs text-[var(--textTertiary)]">Confidence</p>
                  </div>
                </div>
                {voiceEval.speechAnalysis.paceAssessment && (
                  <p className="text-sm text-[var(--text)]">
                    <strong>Pace:</strong> {voiceEval.speechAnalysis.paceAssessment}
                  </p>
                )}
                {voiceEval.speechAnalysis.articulationFeedback && (
                  <p className="text-sm text-[var(--text)] mt-1">
                    <strong>Articulation:</strong> {voiceEval.speechAnalysis.articulationFeedback}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Strengths & Areas for Improvement */}
          {(voiceEval.strengths?.length > 0 || voiceEval.areasForImprovement?.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {voiceEval.strengths?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <TrendingUp className="w-4 h-4" />
                        Strengths
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {voiceEval.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-[var(--text)] flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">+</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {voiceEval.areasForImprovement?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <TrendingDown className="w-4 h-4" />
                        Areas for Improvement
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {voiceEval.areasForImprovement.map((a, i) => (
                        <li key={i} className="text-sm text-[var(--text)] flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">-</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Legacy evaluation (non-voice) */}
      {evaluation && !isVoiceEvaluation(evaluation) && (
        <>
          {summary && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                    Overall Feedback
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">{summary}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-[var(--primary)]" />
                  Evaluation Results
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EvaluationBreakdown evaluation={evaluation} />
            </CardContent>
          </Card>
        </>
      )}

      {/* Conversation History */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
                Conversation History
              </div>
              <Badge variant="secondary" size="sm">
                {conversation.filter((e) => e.role !== 'filler').length} messages
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conversation.length === 0 ? (
            <p className="text-center py-8 text-[var(--textSecondary)]">
              No conversation history available.
            </p>
          ) : (
            <div className="space-y-4">
              {conversation
                .filter((entry) => entry.role !== 'filler')
                .map((entry, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 ${
                    entry.role === 'candidate' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      entry.role === 'interviewer'
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : 'bg-green-100 dark:bg-green-900/30'
                    }`}
                  >
                    {entry.role === 'interviewer' ? (
                      <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <User className="w-4 h-4 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div
                    className={`max-w-[75%] p-4 rounded-lg ${
                      entry.role === 'interviewer'
                        ? 'bg-[var(--surface1)]'
                        : 'bg-[var(--primary)]/10 border border-[var(--primary)]/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[var(--textSecondary)]">
                        {entry.role === 'interviewer' ? 'Interviewer' : 'You'}
                      </span>
                      <span className="text-xs text-[var(--textTertiary)]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text)] whitespace-pre-wrap">
                      {entry.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 pb-8">
        <Button variant="outline" onClick={() => navigate(ROUTES.CANDIDATE.INTERVIEWS)}>
          View All Interviews
        </Button>
        <Button onClick={() => navigate(ROUTES.CANDIDATE.DASHBOARD)}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
