/**
 * Fall-through reader for archived inline columns (Phase 42 L5 DB-STO-01).
 *
 * Gzip strategy: native Web Streams DecompressionStream('gzip') — available in
 * Deno 1.37+ / Deno 2+ (Supabase Edge Runtime, verified). Zero new dependencies.
 * Fallback if runtime < 1.37: https://deno.land/x/compress@v0.4.5/mod.ts
 */

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createLogger } from './logger.ts';

const log = createLogger('_shared/archive-reader');

async function gunzipBlob(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(out);
}

/**
 * Reads an inline column value with archive fallback.
 *
 * - If the inline column is non-NULL: returns it as T (no Storage call).
 * - If inline is NULL and archive_path is set: downloads from ai-archives Storage,
 *   gunzips, JSON.parses, returns as T.
 * - If both are NULL (or row missing): returns null.
 *
 * Never throws. Returns null and logs a warning on any Storage/parse error.
 * The SupabaseClient must have service-role credentials (bypasses RLS).
 */
export async function readWithArchiveFallback<T = unknown>(
  client: SupabaseClient,
  table: string,
  rowId: string,
  inlineColumn: string,
  archivePathColumn: string,
): Promise<T | null> {
  const { data, error } = await (client as any)
    .from(table)
    .select(`${inlineColumn}, ${archivePathColumn}`)
    .eq('id', rowId)
    .maybeSingle();

  if (error) {
    log.warn('archive-reader-db-error', { table, rowId, error: error.message });
    return null;
  }
  if (!data) return null;

  const inline = data[inlineColumn];
  if (inline !== null && inline !== undefined) return inline as T;

  const archivePath: string | null = data[archivePathColumn] ?? null;
  if (!archivePath) return null;

  try {
    const { data: blob, error: dlErr } = await (client as any).storage
      .from('ai-archives')
      .download(archivePath);

    if (dlErr || !blob) {
      log.warn('archive-reader-download-failed', { table, rowId, archivePath, error: dlErr?.message });
      return null;
    }

    const text = await gunzipBlob(blob as Blob);
    return JSON.parse(text) as T;
  } catch (err) {
    log.warn('archive-reader-parse-failed', { table, rowId, archivePath, error: String(err) });
    return null;
  }
}
