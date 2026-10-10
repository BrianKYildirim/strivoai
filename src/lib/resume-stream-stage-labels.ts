export type StreamStage =
  | 'connecting'
  | 'scoring'
  | 'writing_summary'
  | 'analyzing_criteria'
  | 'writing_suggestions'
  | 'complete'
  | 'error';

export const STAGE_LABELS: Readonly<Record<StreamStage, string>> = Object.freeze({
  connecting: 'Connecting...',
  scoring: 'Evaluating your resume...',
  writing_summary: 'Writing your assessment...',
  analyzing_criteria: 'Analyzing each criterion...',
  writing_suggestions: 'Writing improvement recommendations...',
  complete: 'Analysis complete!',
  error: 'Analysis failed',
});
