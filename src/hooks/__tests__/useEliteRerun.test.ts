import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hookSource = readFileSync(resolve('src/hooks/useEliteRerun.ts'), 'utf8').replace(/\r\n/g, '\n');
const streamSource = readFileSync(resolve('src/hooks/useResumeStream.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('same-row Elite unlock lease', () => {
  it('never inserts or clones a resumes row', () => {
    expect(hookSource).not.toContain(".from('resumes')");
    expect(hookSource).not.toContain('.insert(');
    expect(hookSource).not.toContain('newResumeId');
  });

  it('stores and navigates with the original resume ID', () => {
    expect(hookSource).toContain("mode: 'elite_unlock'");
    expect(hookSource).toContain('resumeId: sourceResume.id');
    expect(hookSource).toContain('`stream_params_${sourceResume.id}`');
    expect(hookSource).toContain('`/results/${sourceResume.id}?stream=true&unlock=${lease.createdAt}`');
  });

  it('carries only stable resume/base identifiers and database pricing', () => {
    const paramsBlock = hookSource.match(/sessionStorage\.setItem\([\s\S]*?navigate\(/)?.[0] ?? '';
    expect(paramsBlock).toContain("mode: 'elite_unlock'");
    expect(paramsBlock).toContain('resumeId: sourceResume.id');
    expect(paramsBlock).toContain('baseAnalysisId');
    expect(paramsBlock).toContain('meritCost');
    expect(paramsBlock).not.toContain('resumeText');
    expect(paramsBlock).not.toContain('grading_data');
    expect(paramsBlock).not.toContain('file_name');
    expect(paramsBlock).not.toContain("tier: 'elite'");
  });

  it('reuses one bounded same-source lease across duplicate clicks and refresh', () => {
    expect(hookSource).toContain("const LEASE_PREFIX = 'elite_unlock_'");
    expect(hookSource).toContain('existing.reuses < MAX_LEASE_REUSES');
    expect(hookSource).toContain('existing.baseAnalysisId === baseAnalysisId');
    expect(hookSource).toContain('reuses: existing.reuses + 1');
  });

  it('clears only on terminal success/failure, not transport interruption', () => {
    expect(streamSource).toContain("params.mode === 'elite_unlock'");
    const clearCalls = streamSource.match(/clearEliteRerunLeaseByNewResumeId\(params\.resumeId\)/g) ?? [];
    expect(clearCalls.length).toBeGreaterThanOrEqual(4);
    const connectionFailedIdx = streamSource.indexOf("'Connection failed. Please try again.'");
    const disconnectedIdx = streamSource.indexOf("'Stream disconnected. Please try again.'");
    expect(streamSource.slice(connectionFailedIdx - 200, connectionFailedIdx)).not.toContain('clearEliteRerunLeaseByNewResumeId');
    expect(streamSource.slice(disconnectedIdx - 200, disconnectedIdx)).not.toContain('clearEliteRerunLeaseByNewResumeId');
  });
});

describe('useResumeStream elite_unlock wire body', () => {
  it('sends mode, original resumeId, optional base ID, and no spoofable content', () => {
    const branch = streamSource.match(/params\.mode === 'elite_unlock' \? \{[\s\S]*?\} : \{/)?.[0] ?? '';
    expect(branch).toContain("mode: 'elite_unlock'");
    expect(branch).toContain('resumeId: params.resumeId');
    expect(branch).toContain('baseAnalysisId: params.baseAnalysisId');
    expect(branch).not.toContain('resumeText');
    expect(branch).not.toContain('userId');
    expect(branch).not.toContain('tier:');
    expect(branch).not.toContain('grading');
    expect(branch).not.toContain('file');
  });
});
