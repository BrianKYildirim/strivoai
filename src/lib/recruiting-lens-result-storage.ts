const LEGACY_RECRUITING_LENS_RESULT_KEY = 'recruiting-lens-result';
const RECRUITING_LENS_RESULT_KEY_PREFIX = `${LEGACY_RECRUITING_LENS_RESULT_KEY}:`;

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getRecruitingLensResultKey(userId: string): string {
  return `${RECRUITING_LENS_RESULT_KEY_PREFIX}${userId}`;
}

export function readRecruitingLensResult<T>(userId: string): T | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    // Never hydrate the pre-account-scoping cache. Its owner cannot be proven.
    storage.removeItem(LEGACY_RECRUITING_LENS_RESULT_KEY);
    const cached = storage.getItem(getRecruitingLensResultKey(userId));
    return cached ? JSON.parse(cached) as T : null;
  } catch {
    return null;
  }
}

export function writeRecruitingLensResult(userId: string, result: unknown): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(getRecruitingLensResultKey(userId), JSON.stringify(result));
  } catch {
    // Result rendering must not depend on browser storage availability.
  }
}

export function removeRecruitingLensResult(userId: string): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(getRecruitingLensResultKey(userId));
  } catch {
    // Browser storage can be unavailable in private or embedded contexts.
  }
}

export function clearRecruitingLensResultStorage(): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (
        key === LEGACY_RECRUITING_LENS_RESULT_KEY
        || key?.startsWith(RECRUITING_LENS_RESULT_KEY_PREFIX)
      ) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Auth teardown must continue even when browser storage is restricted.
  }
}
