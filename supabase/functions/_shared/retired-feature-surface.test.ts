import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function repoRoot(): URL {
  return new URL('../../../', import.meta.url);
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await Deno.stat(new URL(relativePath, repoRoot()));
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

const retiredFunctionSlugs = [
  ['analyze', 'skills', 'gap'].join('-'),
  ['compare', 'jobs'].join('-'),
  ['chat', 'agent'].join('-'),
];
const retiredRoute = `/${['skills', 'gap', 'analysis'].join('-')}`;

Deno.test('retired product surfaces cannot be restored accidentally', async () => {
  for (const slug of retiredFunctionSlugs) {
    assertEquals(await pathExists(`supabase/functions/${slug}/index.ts`), false);
  }
  assertEquals(await pathExists('src/pages/SkillsGapAnalysis.tsx'), false);

  const app = await Deno.readTextFile(new URL('src/App.tsx', repoRoot()));
  const config = await Deno.readTextFile(new URL('supabase/config.toml', repoRoot()));
  const deploy = await Deno.readTextFile(new URL('scripts/deploy.ps1', repoRoot()));
  assert(!app.includes(retiredRoute));
  for (const slug of retiredFunctionSlugs) {
    assert(!config.includes(slug));
    assert(!deploy.includes(slug));
  }
});
