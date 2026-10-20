import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolvePlanningPhaseDir(phaseSlug: string, guardName: string): string {
  const candidates = [
    join(process.cwd(), '.planning', 'phases', phaseSlug),
    join(process.cwd(), '.planning', 'milestones', 'v5.0-phases', phaseSlug),
  ];
  const phaseDir = candidates.find((candidate) => existsSync(candidate));

  if (!phaseDir) {
    throw new Error(
      `[${guardName}] required planning phase directory missing (fail-closed); checked: ${candidates.join(', ')}`,
    );
  }

  return phaseDir;
}
