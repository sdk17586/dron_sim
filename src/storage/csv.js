import { normalizeRecord, mergeRecords } from './result-repository.js';
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const COLUMNS = ['schemaVersion', 'attemptId', 'session', 'trainee', 'scenarioId', 'contentVersion', 'profileVersion', 'mode', 'startedAt', 'endedAt', 'durationSeconds', 'status', 'hints', 'errors', 'events'];
const protect = v => /^[=+\-@\t\r']/.test(v) || /^0\d/.test(v) ? `'${v}` : v;
const unprotect = v => v.startsWith("'") && (/^[=+\-@\t\r']/.test(v.slice(1)) || /^0\d/.test(v.slice(1))) ? v.slice(1) : v;
export function exportCSV(records) {
  const rows = records.map(normalizeRecord).map(r => COLUMNS.map(k => protect(typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]))));
  return '\ufeff' + [COLUMNS, ...rows].map(row => row.map(v => `"${v.replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
export function parseCSV(text) {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error('CSV는 5MB 이하만 가져올 수 있습니다.');
  text = text.replace(/^\ufeff/, '');
  const rows = []; let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"') {
      if (value || closed) throw new Error('CSV 따옴표 형식이 잘못되었습니다.');
      quoted = true;
    } else if (c === ',') { row.push(value); value = ''; closed = false; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value); if (row.some(v => v !== '')) rows.push(row);
      row = []; value = ''; closed = false;
    } else { if (closed) throw new Error('CSV 필드 구분자가 잘못되었습니다.'); value += c; }
  }
  if (quoted) throw new Error('닫히지 않은 CSV 따옴표가 있습니다.');
  row.push(value); if (row.some(v => v !== '')) rows.push(row);
  if (!rows.length || JSON.stringify(rows[0]) !== JSON.stringify(COLUMNS)) throw new Error('AEROLAB 결과 CSV의 열 이름과 순서가 맞지 않습니다.');
  if (rows.length > 501) throw new Error('한 번에 결과 500건까지 가져올 수 있습니다.');
  const records = [], invalid = [];
  rows.slice(1).forEach((values, i) => {
    try {
      if (values.length !== COLUMNS.length) throw new Error('열 개수가 맞지 않습니다.');
      const r = Object.fromEntries(COLUMNS.map((k, n) => [k, unprotect(values[n])]));
      for (const k of ['schemaVersion', 'durationSeconds', 'hints']) {
        if (!/^\d+$/.test(r[k])) throw new Error('숫자 값이 잘못되었습니다.');
        r[k] = Number(r[k]);
      }
      r.errors = JSON.parse(r.errors); r.events = JSON.parse(r.events);
      records.push(normalizeRecord(r));
    } catch (e) { invalid.push({ row: i + 2, message: e.message }); }
  });
  return { records, invalid };
}
export function previewImport(text, existing) {
  const parsed = parseCSV(text);
  return { ...mergeRecords(existing, parsed.records), invalid: parsed.invalid };
}
