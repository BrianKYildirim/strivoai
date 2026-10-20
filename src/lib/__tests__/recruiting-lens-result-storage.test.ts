import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRecruitingLensResultStorage,
  readRecruitingLensResult,
  writeRecruitingLensResult,
} from '../recruiting-lens-result-storage';

const accountAResult = { recruiterVerdict: 'Account A private result' };

beforeEach(() => {
  sessionStorage.clear();
});

describe('Recruiting Lens result storage account boundaries', () => {
  it('never returns Account A result while Account B is active', () => {
    writeRecruitingLensResult('account-a', accountAResult);

    expect(readRecruitingLensResult('account-b')).toBeNull();
    expect(readRecruitingLensResult('account-a')).toEqual(accountAResult);
  });

  it('ignores and removes the legacy unscoped result', () => {
    sessionStorage.setItem('recruiting-lens-result', JSON.stringify(accountAResult));

    expect(readRecruitingLensResult('account-b')).toBeNull();
    expect(sessionStorage.getItem('recruiting-lens-result')).toBeNull();
  });

  it('clears every Recruiting Lens result at an auth boundary without touching unrelated session data', () => {
    writeRecruitingLensResult('account-a', accountAResult);
    writeRecruitingLensResult('account-b', { recruiterVerdict: 'Account B result' });
    sessionStorage.setItem('unrelated-session-key', 'keep-me');

    clearRecruitingLensResultStorage();

    expect(readRecruitingLensResult('account-a')).toBeNull();
    expect(readRecruitingLensResult('account-b')).toBeNull();
    expect(sessionStorage.getItem('unrelated-session-key')).toBe('keep-me');
  });
});
