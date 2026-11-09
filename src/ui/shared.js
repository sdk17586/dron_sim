export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (name, cls = '') => {
  const paths = {
    rotor: '<circle cx="6" cy="6" r="4"/><circle cx="18" cy="6" r="4"/><circle cx="6" cy="18" r="4"/><circle cx="18" cy="18" r="4"/><path d="m6 6 12 12M18 6 6 18"/><rect x="9" y="8" width="6" height="8" rx="2"/>',
    tool: '<path d="m14 6 4 4M4 20l9-9M15 3a6 6 0 0 0-6 8L3 17a3 3 0 0 0 4 4l6-6a6 6 0 0 0 8-6l-4 3-5-5z"/>',
    chart: '<path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    reset: '<path d="M4 10a8 8 0 1 1 0 5M4 4v6h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    battery: '<rect x="3" y="6" width="17" height="12" rx="2"/><path d="M23 10v4M7 10h7v4H7z"/>',
    power: '<path d="M12 2v10M7 5a9 9 0 1 0 10 0"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
};
export const button = (text, action, cls = 'button', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
