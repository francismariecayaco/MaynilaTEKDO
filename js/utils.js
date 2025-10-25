// Generic utilities
export const $ = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
export const html = (strings, ...values) => {
  const out = strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
  const t = document.createElement('template');
  t.innerHTML = out.trim();
  return t.content;
};
export const setView = (node) => {
  const v = document.getElementById('routeView');
  v.innerHTML = '';
  v.appendChild(node);
};

export function toSlug(value=''){
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .trim();
}

export function buildCompanySlug(name, fallback=''){
  const primary = toSlug(name);
  if (primary) return primary;
  if (fallback) return toSlug(fallback) || fallback;
  return '';
}

// Hashing with Web Crypto (demo only; consider stronger hashing in production)
export async function sha256(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function genSalt(len=16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
export async function hashPassword(pw, salt) { return sha256(`${salt}:${pw}`); }

export function toCurrency(n, currency='PHP') {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(n || 0);
}
export function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleString();
}

export function requireRole(session, roles) {
  return session && roles.includes(session.role);
}

export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// Lightweight modal utility used across the app
// Usage: const { el, close } = showModal({ title, content, actions:[{id,label,class}] })
export function showModal({ title = '', content = '', actions = [], onClose } = {}){
  // Backdrop
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.35)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';

  // Dialog
  const dlg = document.createElement('div');
  dlg.style.background = '#fff';
  dlg.style.borderRadius = '10px';
  dlg.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
  dlg.style.width = 'min(720px, 92vw)';
  dlg.style.maxHeight = '85vh';
  dlg.style.overflow = 'auto';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '12px 16px';
  header.style.borderBottom = '1px solid #efefef';
  header.innerHTML = `<div style="font-weight:600;">${title || ''}</div><button data-close style="border:none;background:transparent;font-size:22px;line-height:1;cursor:pointer">×</button>`;

  const body = document.createElement('div');
  body.style.padding = '12px 16px';
  body.innerHTML = content || '';

  const footer = document.createElement('div');
  footer.style.display = actions.length ? 'flex' : 'none';
  footer.style.justifyContent = 'flex-end';
  footer.style.gap = '8px';
  footer.style.padding = '12px 16px';
  footer.style.borderTop = actions.length ? '1px solid #efefef' : 'none';
  footer.innerHTML = actions.map(a=>`<button class="btn ${a.class||''}" data-action="${a.id}">${a.label||a.id}</button>`).join('');

  dlg.appendChild(header);
  dlg.appendChild(body);
  dlg.appendChild(footer);
  overlay.appendChild(dlg);
  document.body.appendChild(overlay);

  function close(){
    try { overlay.remove(); } catch {}
    try { if (typeof onClose === 'function') onClose(); } catch {}
  }

  // Close handlers
  overlay.addEventListener('click', (e)=>{
    if (e.target === overlay) close();
  });
  overlay.addEventListener('click', (e)=>{
    const isClose = e.target.closest('[data-close]');
    if (isClose) close();
  });

  return { el: overlay, close };
}
