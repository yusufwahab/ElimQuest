import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { parseLevel } from '@elimquest/game-core';
import { questionInputSchema, type QuestionInput } from '@elimquest/contracts';
import type { Queryable } from './db/db';
import { HttpError, many } from './repo/util';

export const IMPORT_LIMITS = { maxBytes: 2 * 1024 * 1024, adminRows: 1000, packRows: 200 };
export const TEMPLATE_HEADERS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation', 'category', 'level', 'reference'] as const;

export function templateCsv(): string {
  const ex = ['How many surahs are in the Qur’an?', '110', '114', '120', '124', 'B', 'The Qur’an has 114 surahs.', 'quran', 'Beginner', ''];
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

/** Friendly column names (as used in review workbooks) → the importer's column names. */
const HEADER_ALIASES: Record<string, string> = {
  'question id': 'id', 'question text': 'question', 'option a': 'option_a', 'option b': 'option_b', 'option c': 'option_c', 'option d': 'option_d',
  'correct answer': 'correct', 'topic': 'category', 'difficulty band': 'level', 'difficulty': 'level', 'qur’an reference': 'reference', "qur'an reference": 'reference', 'source': 'reference',
};

/**
 * Some generators (e.g. the Open XML SDK) write prefixed XML (<x:worksheet>) and Excel "tables" in ways ExcelJS cannot load.
 * Rewrite to plain XML and drop table parts (formatting only) so the cell data reads normally.
 */
async function normaliseWorkbook(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name]!;
    if (f.dir) continue;
    if (/^xl\/tables\//.test(name)) { zip.remove(name); continue; }
    if (!/\.(xml|rels)$/.test(name)) continue;
    let t = (await f.async('string')).replace(/^\uFEFF/, '');
    if (/xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/.test(t)) t = t.replace(/<(\/?)x:/g, '<$1').replace(/xmlns:x=/g, 'xmlns=');
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) t = t.replace(/<tableParts[\s\S]*?<\/tableParts>|<tableParts[^>]*\/>/g, '');
    if (/^xl\/worksheets\/_rels\//.test(name)) t = t.replace(/<Relationship\b[^>]*\/tables\/[^>]*\/>|<Relationship\b[^>]*relationships\/table"[^>]*\/>/g, '');
    zip.file(name, t);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function readRawRows(buf: Buffer, fileName: string): Promise<Record<string, string>[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsm') || lower.endsWith('.xlsb') || lower.endsWith('.xls')) throw new HttpError(415, 'Macro-enabled and legacy workbooks are not accepted. Use .xlsx or .csv.', 'bad_file');
  if (lower.endsWith('.csv')) {
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => { const k = h.trim().toLowerCase(); return HEADER_ALIASES[k] ?? k; } });
    return parsed.data;
  }
  if (lower.endsWith('.xlsx')) {
    if (buf.subarray(0, 2).toString('latin1') !== 'PK') throw new HttpError(415, 'That file is not a valid .xlsx workbook', 'bad_file');
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load((await normaliseWorkbook(buf)) as any); }
    catch (e) { console.error('[import] xlsx load failed', (e as Error)?.message); throw new HttpError(400, 'Could not read that workbook. Re-save it as .xlsx (or export to .csv) and try again.', 'bad_file'); }
    const cellText = (cell: ExcelJS.Cell): string => {
      const v = cell.value as any;
      if (v == null) return '';
      if (typeof v !== 'object') return String(v);
      if (v instanceof Date) return v.toISOString();
      // Formulas are never evaluated: take the cached result as plain text only.
      const rich = (x: any): string => Array.isArray(x?.richText) ? x.richText.map((t: { text?: string }) => t.text ?? '').join('') : '';
      if (rich(v)) return rich(v);
      const inner = v.result ?? v.text ?? '';
      return typeof inner === 'object' ? rich(inner) : String(inner);
    };
    // Find the sheet and header row: a workbook may start with an instructions sheet or title rows above the headers.
    const headerOf = (ws: ExcelJS.Worksheet) => {
      for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
        const h: string[] = [];
        ws.getRow(r).eachCell((c, col) => { h[col] = HEADER_ALIASES[cellText(c).trim().toLowerCase()] ?? cellText(c).trim().toLowerCase(); });
        if (h.includes('question') && h.includes('correct')) return { r, h };
      }
      return null;
    };
    const found = wb.worksheets.map((ws) => ({ ws, hd: headerOf(ws) })).find((x) => x.hd);
    if (!found) return [];
    const { ws, hd } = found as { ws: ExcelJS.Worksheet; hd: { r: number; h: string[] } };
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, n) => {
      if (n <= hd.r) return;
      const rec: Record<string, string> = {};
      row.eachCell((cell, col) => { if (hd.h[col]) rec[hd.h[col]!] = cellText(cell); });
      if (Object.values(rec).some((x) => x.trim())) rows.push(rec);
    });
    // Review workbooks keep the source on a second sheet, keyed by "Question ID".
    if (rows.some((r) => r.id) && !rows.some((r) => r.reference)) {
      const refs = new Map<string, string>();
      for (const other of wb.worksheets) {
        if (other === ws) continue;
        let hr = 0; const oh: string[] = [];
        for (let r = 1; r <= Math.min(other.rowCount, 15) && !hr; r++) { const t: string[] = []; other.getRow(r).eachCell((c, col) => { t[col] = cellText(c).trim().toLowerCase(); }); if (t.includes('question id')) { hr = r; t.forEach((x, i) => { oh[i] = x; }); } }
        if (!hr) continue;
        const idCol = oh.indexOf('question id'), refCol = oh.findIndex((x) => x && /reference/.test(x));
        if (refCol < 0) continue;
        other.eachRow((row, n) => { if (n > hr) { const id = cellText(row.getCell(idCol)).trim(), ref = cellText(row.getCell(refCol)).trim(); if (id && ref) refs.set(id, ref); } });
      }
      for (const r of rows) if (r.id && refs.has(r.id)) r.reference = refs.get(r.id)!;
    }
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
    const parsed = parseLevel(r.level);
    const level = parsed ?? NaN;
    if (parsed === null) errors.push('level must be Beginner, Intermediate, Advanced, Scholar (or a number from 1 to 10)');
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
