/**
 * Release-readiness audit — upload a REAL, text-bearing resume PDF to storage for the
 * audit users and point their resumes row at it.
 *
 * Career Compass (elite) and Interview Prep both read the resume from the `resumes`
 * STORAGE bucket via resumes.file_path. The audit users were seeded with a placeholder
 * (file_url='seed://audit', no file_path), so both features failed for a reason that had
 * nothing to do with the product. This seeds the real thing.
 *
 * extracted_text/text_hash are nulled so the edge function performs a genuine
 * server-side PDF extraction (the faithful path) rather than trusting a hand-forged
 * cached string that would have to satisfy assessExtractionQuality() by luck.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

config({ path: '.env.test.local', quiet: true });

const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pdf = readFileSync('e2e/fixtures/test-resume.pdf');
console.log(`fixture PDF: ${pdf.length} bytes`);

const EMAILS = ['audit+free@strivo.test', 'audit+elite@strivo.test'];

for (const email of EMAILS) {
  const { data: prof } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (!prof) { console.log(`  SKIP ${email} — no profile`); continue; }
  const userId = prof.id;
  const filePath = `${userId}/audit-resume.pdf`;

  const { error: upErr } = await admin.storage
    .from('resumes')
    .upload(filePath, pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) { console.log(`  FAIL upload ${email}: ${upErr.message}`); continue; }

  const { data: rows } = await admin.from('resumes').select('id').eq('user_id', userId).limit(1);
  if (rows?.length) {
    const { error } = await admin.from('resumes').update({
      file_name: 'audit-resume.pdf',
      file_url: filePath,
      file_path: filePath,
      file_size: pdf.length,
      extracted_text: null,
      text_hash: null,
      extraction_metadata: null,
    }).eq('id', rows[0].id);
    if (error) { console.log(`  FAIL update ${email}: ${error.message}`); continue; }
    console.log(`  OK ${email} -> ${filePath} (resume ${rows[0].id})`);
  } else {
    const { error } = await admin.from('resumes').insert({
      user_id: userId,
      file_name: 'audit-resume.pdf',
      file_url: filePath,
      file_path: filePath,
      file_size: pdf.length,
    });
    if (error) { console.log(`  FAIL insert ${email}: ${error.message}`); continue; }
    console.log(`  OK ${email} -> ${filePath} (new row)`);
  }
}
