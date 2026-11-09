import { motorIssues } from '../domain/state.js';

export function motorStatus(state, id) {
  if (state?.status !== 'active') return '';
  if (!state.motors[id].verdict) return 'pending';
  return motorIssues(state, id).length ? 'repair' : 'done';
}
export const motorStatusLabel = status => ({ pending: '상태 판단 필요', repair: '정비 진행 중', done: '점검·정비 완료' })[status] || '';
