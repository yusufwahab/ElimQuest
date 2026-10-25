import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { questionInputSchema, type QuestionInput } from '@elimquest/contracts';
import type { Queryable } from './db/db';
import { HttpError, many } from './repo/util';

export const IMPORT_LIMITS = { maxBytes: 2 * 1024 * 1024, adminRows: 1000, packRows: 200 };
export const TEMPLATE_HEADERS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation', 'category', 'level', 'reference'] as const;

export function templateCsv(): string {
  const ex = ['How many surahs are in the Qur’an?', '110', '114', '120', '124', 'B', 'The Qur’an has 114 surahs.', 'quran', '1', ''];
  return `${TEMPLATE_HEADERS.join(',')}\n${ex.map((x) => `"${x}"`).join(',')}\n`;
}

export interface ParsedRow {
  row: number;
  ok: boolean;
  errors: string[];
  duplicate: boolean;
  preview: { text: string; level?: number; category?: string };
  input?: QuestionInput;
}

async function readRawRows(buf: Buffer, fileName: string): Promise<Record<string, string>[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsm') || lower.endsWith('.xlsb') || lower.endsWith('.xls')) throw new HttpError(415, 'Macro-enabled and legacy workbooks are not accepted. Use .xlsx or .csv.', 'bad_file');
  if (lower.endsWith('.csv')) {
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    return parsed.data;
  }
  if (lower.endsWith('.xlsx')) {
    if (buf.subarray(0, 2).toString('latin1') !== 'PK') throw new HttpError(415, 'That file is not a valid .xlsx workbook', 'bad_file');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.value ?? '').trim().toLowerCase(); });
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const rec: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const v = cell.value as any;
        // Formulas are never evaluated: take the cached result as plain text only.
        const text = v && typeof v === 'object' ? (v.result ?? v.text ?? '') : v;
        if (headers[col]) rec[headers[col]!] = String(text ?? '');
      });
      if (Object.values(rec).some((x) => x.trim())) rows.push(rec);
    });
    return rows;
  }
  throw new HttpError(415, 'Upload a .csv or .xlsx file', 'bad_file');
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Parse + validate. Nothing is written here: this powers the preview step. */
export async function parseImport(q: Queryable, buf: Buffer, fileName: string, kind: 'admin' | 'pack'): Promise<{ rows: ParsedRow[]; summary: Record<string, number> }> {
  if (buf.length > IMPORT_LIMITS.maxBytes) throw new HttpError(413, `File is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB`, 'too_big');
  const raw = await readRawRows(buf, fileName);
  const maxRows = kind === 'admin' ? IMPORT_LIMITS.adminRows : IMPORT_LIMITS.packRows;
  if (raw.length > maxRows) throw new HttpError(413, `Too many rows (maximum ${maxRows})`, 'too_many_rows');
  if (!raw.length) throw new HttpError(400, 'The file has no data rows', 'empty');
  const cats = await many<{ id: string; slug: string; name: string }>(q, 'select id, slug, name from categories');
  const custom = cats.find((c) => c.slug === 'custom');
  const existing = new Set((await many<{ text: string }>(q, "select qv.text from question_versions qv join questions qu on qu.id=qv.question_id where qu.scope='platform'")).map((r) => norm(r.text)));
  const seen = new Set<string>();
  const rows: ParsedRow[] = [];
  raw.forEach((r, i) => {
    const errors: string[] = [];
    const text = (r.question ?? '').trim();
    const options = [r.option_a, r.option_b, r.option_c, r.option_d].map((x) => (x ?? '').trim());
    const letter = (r.correct ?? '').trim().toUpperCase();
    const correctIndex = 'ABCD'.indexOf(letter);
    if (letter.length !== 1 || correctIndex < 0) errors.push('“correct” must be A, B, C or D');
    const catKey = (r.category ?? '').trim().toLowerCase();
    let cat = cats.find((c) => c.slug === catKey || c.name.toLowerCase() === catKey);
    if (!cat && kind === 'pack') cat = custom;
    if (!cat) errors.push(`Unknown category “${r.category ?? ''}” (use a category name or slug)`);
    const level = Number(r.level);
    if (!Number.isInteger(level) || level < 1 || level > 10) errors.push('level must be a whole number from 1 to 10');
    let input: QuestionInput | undefined;
    if (!errors.length) {
      const parsed = questionInputSchema.safeParse({
        text, options, correctIndex, explanation: (r.explanation ?? '').trim(), categoryId: cat!.id, level, reference: (r.reference ?? '').trim(),
        provenance: kind === 'admin' ? `Imported from ${fileName}` : 'Host-provided', licence: '',
      });
      if (!parsed.success) for (const is of parsed.error.issues) errors.push(`${is.path.join('.') || 'row'}: ${is.message}`);
      else input = parsed.data;
    }
    const key = norm(text);
    const duplicate = !!key && (existing.has(key) || seen.has(key));
    if (key) seen.add(key);
    rows.push({ row: i + 2, ok: errors.length === 0, errors, duplicate, preview: { text: text.slice(0, 120), level: Number.isFinite(level) ? level : undefined, category: cat?.name }, input });
  });
  const summary = { total: rows.length, valid: rows.filter((r) => r.ok && !r.duplicate).length, invalid: rows.filter((r) => !r.ok).length, duplicates: rows.filter((r) => r.duplicate).length };
  return { rows, summary };
}
