export const STORAGE_KEY = 'aerolab.results.v1';
export const MAX_RECORDS = 500;
const textField = (v, max = 80) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);
const validTime = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function normalizeRecord(r) {
  if (!r || r.schemaVersion !== 1 || !textField(r.attemptId) || !textField(r.session, 40) || !textField(r.trainee, 40)
    || !textField(r.scenarioId) || !textField(r.contentVersion) || !textField(r.profileVersion)
    || !['guided', 'independent'].includes(r.mode) || !['completed', 'abandoned'].includes(r.status)
    || !validTime(r.startedAt) || !validTime(r.endedAt) || Date.parse(r.endedAt) < Date.parse(r.startedAt)
    || !Number.isSafeInteger(r.durationSeconds) || r.durationSeconds < 0 || r.durationSeconds > 604800
    || !Number.isSafeInteger(r.hints) || r.hints < 0 || r.hints > 100000
    || !Array.isArray(r.errors) || r.errors.length > 1000 || !Array.isArray(r.events) || r.events.length > 200) {
    throw new Error('지원하지 않는 형식이거나 필수 값이 잘못된 결과입니다.');
  }
  const errors = r.errors.map(e => {
    if (!textField(e.code) || !textField(e.message, 2000)) throw new Error('실수 기록 형식이 잘못되었습니다.');
    return { code: e.code, message: e.message };
  });
  const events = r.events.map(e => {
    if (!['action', 'error', 'hint'].includes(e.type) || !textField(e.code)
      || typeof e.motor !== 'string' || e.motor.length > 40 || !Number.isSafeInteger(e.revision) || e.revision < 0) throw new Error('행동 기록 형식이 잘못되었습니다.');
    return { type: e.type, code: e.code, motor: e.motor, revision: e.revision };
  });
  return { schemaVersion: 1, attemptId: r.attemptId, session: r.session, trainee: r.trainee,
    scenarioId: r.scenarioId, contentVersion: r.contentVersion, profileVersion: r.profileVersion,
    mode: r.mode, startedAt: r.startedAt, endedAt: r.endedAt, durationSeconds: r.durationSeconds,
    status: r.status, hints: r.hints, errors, events };
}
export function mergeRecords(existing, incoming) {
  const records = existing.map(normalizeRecord), map = new Map(records.map(r => [r.attemptId, JSON.stringify(r)]));
  let added = 0, duplicate = 0, conflict = 0;
  for (const item of incoming) {
    const r = normalizeRecord(item), serialized = JSON.stringify(r);
    if (map.has(r.attemptId)) {
      if (map.get(r.attemptId) === serialized) duplicate++; else conflict++;
    } else { records.push(r); map.set(r.attemptId, serialized); added++; }
  }
  if (records.length > MAX_RECORDS) throw new Error('결과 저장 한도는 500건입니다. 파일로 백업한 뒤 불필요한 결과를 삭제하세요.');
  return { records, added, duplicate, conflict };
}
export class ResultRepository {
  constructor(storage) { this.storage = storage; }
  load() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return { records: [], error: null, raw: null };
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.records) || data.records.length > MAX_RECORDS) throw new Error('저장 형식 또는 버전이 맞지 않습니다.');
      const records = data.records.map(normalizeRecord);
      if (new Set(records.map(r => r.attemptId)).size !== records.length) throw new Error('중복된 시도 ID가 저장되어 있습니다.');
      return { records, error: null, raw };
    } catch (e) {
      let raw = null;
      try { raw = this.storage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
      return { records: [], raw, error: `저장 결과를 읽을 수 없습니다. 기존 데이터는 덮어쓰지 않습니다. ${e.message}` };
    }
  }
  write(records) {
    const current = this.load();
    if (current.error) throw new Error(current.error);
    if (records.length > MAX_RECORDS) throw new Error('최대 500건까지 보관할 수 있습니다.');
    const normalized = records.map(normalizeRecord);
    if (new Set(normalized.map(r => r.attemptId)).size !== normalized.length) throw new Error('시도 ID가 중복되었습니다.');
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records: normalized })); }
    catch { throw new Error('브라우저에 저장하지 못했습니다. 결과를 CSV로 내보내 보관하세요.'); }
    return normalized;
  }
  add(record) {
    const current = this.load();
    if (current.error) throw new Error(current.error);
    const merged = mergeRecords(current.records, [record]);
    if (merged.conflict) throw new Error('같은 시도 ID에 다른 결과가 있습니다. 덮어쓰지 않았습니다.');
    this.write(merged.records); return merged;
  }
  remove(ids) {
    const current = this.load();
    if (current.error) throw new Error(current.error);
    return this.write(current.records.filter(r => !ids.includes(r.attemptId)));
  }
  resetCorruptData() { this.storage.removeItem(STORAGE_KEY); }
}
