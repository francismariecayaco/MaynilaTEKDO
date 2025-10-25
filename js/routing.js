import { setView, html } from './utils.js';

// Router configuration and state
const routes = [];
let notFoundHandler = null;
const routerOptions = { scrollTop: true, showLoading: false, loadingContent: null };

function pathToRegex(path) {
  const keys = [];
  const regex = path
    .replace(/\//g,'\\/')
    .replace(/:(\w+)/g, (_,k)=>{ keys.push(k); return '([^/]+)'; });
  // Case-insensitive and allow optional trailing slash
  return { regex: new RegExp(`^${regex}\/?$`, 'i'), keys };
}

export function addRoute(path, render) {
  const { regex, keys } = pathToRegex(path);
  routes.push({ path, regex, keys, render });
}

export function setNotFound(handler){ notFoundHandler = handler; }
export function configureRouter(opts={}){ Object.assign(routerOptions, opts); }

export function navigate(hash) {
  if (hash) {
    const h = hash.startsWith('#') ? hash : `#${hash}`;
    window.location.hash = h;
  } else {
    onRoute();
  }
}

export async function onRoute() {
  const raw = window.location.hash.slice(1) || '/dashboard';
  const [hRaw, qstr] = raw.split('?');
  // normalize path: remove trailing slashes except root
  const h = hRaw.replace(/\/+$/,'') || '/';
  const query = {};
  if (qstr){
    for (const part of qstr.split('&')){
      if (!part) continue;
      const [k,v] = part.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent((v||'').replace(/\+/g,' '));
    }
  }
  for (const r of routes) {
    const m = h.match(r.regex);
    if (m) {
      // Optional loading placeholder before render
      if (routerOptions.showLoading){
        const lc = typeof routerOptions.loadingContent === 'function' ? routerOptions.loadingContent() : routerOptions.loadingContent;
        setView(lc || html`<div class="card">Loading…</div>`);
      }
      const params = {};
      r.keys.forEach((k,i)=> params[k] = decodeURIComponent(m[i+1]));
      const result = r.render({ params, query, path: h });
      // If renderer is async, wait before post-effects
      if (result && typeof result.then === 'function') { try { await result; } catch(_){} }
      if (routerOptions.scrollTop) { try { window.scrollTo({ top:0, left:0, behavior:'instant' }); } catch { window.scrollTo(0,0); } }
      return;
    }
  }
  // Not found
  if (typeof notFoundHandler === 'function') {
    const maybe = notFoundHandler({ path: raw });
    if (maybe && typeof maybe.then === 'function') { try { await maybe; } catch {} }
  } else {
    setView(html`<div class="card"><h3>Not Found</h3><p>No route for <code>${raw}</code></p></div>`);
  }
  if (routerOptions.scrollTop) { try { window.scrollTo({ top:0, left:0, behavior:'instant' }); } catch { window.scrollTo(0,0); } }
}

window.addEventListener('hashchange', onRoute);
window.addEventListener('load', onRoute);

// quick link binding on topbar buttons
addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-link]');
  if (btn) { navigate(btn.getAttribute('data-link')); }
});
