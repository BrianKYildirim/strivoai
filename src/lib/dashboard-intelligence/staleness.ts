import type { SourceKey, StoredDashboardInputs } from './types';

const SOURCE_LABELS: Record<SourceKey, string> = {
  resume: 'resume analysis',
  linkedin: 'LinkedIn grade',
  careerCompass: 'Career Compass',
  savedJobs: 'saved jobs',
  recruitingLens: 'Recruiting Lens',
};

export function formatDashboardDate(date: string | null | undefined): string {
  if (!date) return 'Not recorded';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysBetweenDates(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const left = new Date(a);
  const right = new Date(b);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

export function buildStalenessNotes(inputs: StoredDashboardInputs): string[] {
  const datedSources: Array<{ key: SourceKey; date: string }> = [];
  if (inputs.resume?.date) datedSources.push({ key: 'resume', date: inputs.resume.date });
  if (inputs.linkedin?.date) datedSources.push({ key: 'linkedin', date: inputs.linkedin.date });
  if (inputs.careerCompass?.date) datedSources.push({ key: 'careerCompass', date: inputs.careerCompass.date });
  if (inputs.recruitingLens?.date) datedSources.push({ key: 'recruitingLens', date: inputs.recruitingLens.date });
  const latestSavedJob = inputs.savedJobs.find((job) => job.date)?.date;
  if (latestSavedJob) datedSources.push({ key: 'savedJobs', date: latestSavedJob });

  const notes: string[] = [];

  const resumeDate = inputs.resume?.date;
  const linkedinDate = inputs.linkedin?.date;
  const desync = daysBetweenDates(resumeDate, linkedinDate);
  if (desync !== null && desync >= 45) {
    notes.push('Your resume and LinkedIn signals were analyzed on different dates, so alignment may need a refresh.');
  }

  notes.push(...datedSources.map(({ key, date }) => (
    `Based on your ${SOURCE_LABELS[key]} from ${formatDashboardDate(date)}.`
  )));

  return Array.from(new Set(notes)).slice(0, 4);
}
