import { storage } from './config.js';
import { ref as storageRef, listAll, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { showModal } from './utils.js';
import { doc, getDoc, updateDoc, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './config.js';
// No Firebase Auth here — this module uses the app-level session in localStorage.

// Show a modal listing files under a company prefix and allow deletion.
export async function showCompanyUploads(companyId){
  // Use the application's session stored in localStorage instead of Firebase Auth.
    // The session key used elsewhere in the app is 'cp.session.v1'.
    const SESSION_KEY = 'cp.session.v1';
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!session){
      showModal({ title: 'Not signed in', content: `<div class="card">You must be signed in to the app to view uploads. Please sign in using the app's login form.</div>` });
      return;
    }
    // Allowed roles for company-level asset management
    const allowedRoles = new Set(['superadmin','admin-owner','admin-president','admin-manager','admin-supervisor']);
    const isAllowed = session.role === 'superadmin' || (session.companyId === companyId && allowedRoles.has(session.role));
    if (!isAllowed){
      showModal({ title: 'Permission denied', content: `<div class="card">You do not have permission to manage uploads for this company.</div>` });
      return;
    }

  // Sign-in modal helper — prompts for email/password and signs in via Firebase Auth.

  const prefix = `companies/${companyId}`;
  const rootRef = storageRef(storage, prefix + '/');
  // Build placeholder content
  const content = `<div id="uploadsList" style="min-width:480px;min-height:120px;">
    <div class="muted">Loading files…</div>
  </div>`;
  const { el, close } = showModal({ title: 'Company uploaded files', content });

  // Helper to refresh list
  async function refresh(){
    const host = el.querySelector('#uploadsList');
    if (!host) return;
    host.innerHTML = `<div class="muted">Loading files…</div>`;
    try {
      // listAll on the prefix -- may paginate for very large sets
      const res = await listAll(rootRef);
      if (!res.items || res.items.length === 0){ host.innerHTML = `<div class='card'>No files found.</div>`; return; }
      const parts = await Promise.all(res.items.map(async (it)=>{
        try { const url = await getDownloadURL(it); return { path: it.fullPath, name: it.name, url }; }
        catch(e){ return { path: it.fullPath, name: it.name, url: '' }; }
      }));
      host.innerHTML = parts.map(p=> `
        <div class='card' style='display:flex;gap:12px;align-items:center;margin-bottom:8px;'>
          <div style='width:72px;height:72px;flex:0 0 72px;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden;background:#f5f5f5;'>
            ${p.url ? `<img src='${p.url}' alt='${p.name}' style='width:100%;height:100%;object-fit:cover;'/>` : '<div class="muted">No preview</div>'}
          </div>
          <div style='flex:1;'>
            <div style='font-weight:600;'>${p.name}</div>
            <div class='muted' style='font-size:12px;'>${p.path}</div>
          </div>
          <div style='display:flex;gap:8px;'>
            <button class='btn danger' data-delete-path='${p.path}'>Delete</button>
            <a class='btn secondary' href='${p.url}' target='_blank' rel='noopener'>Open</a>
          </div>
        </div>
      `).join('');
    } catch(err){ host.innerHTML = `<div class='card'>Failed to list files. ${err.message || String(err)}</div>`; }
  }

  // Delete handler
  el.addEventListener('click', async (ev)=>{
    const del = ev.target.getAttribute && ev.target.getAttribute('data-delete-path');
    if (!del) return;
    if (!confirm('Delete this file permanently?')) return;
    try {
      const refDel = storageRef(storage, del);
      await deleteObject(refDel);
      // Attempt to clean up company metadata if it references this URL
      try {
        const coRef = doc(db, 'companies', companyId);
        const snap = await getDoc(coRef);
        if (snap.exists()){
          const data = snap.data();
          const updates = {};
          // Common fields to check
          ['logoUrl','coverUrl','businessPermitUrl','dtiUrl'].forEach(fld=>{
            if (data[fld] && typeof data[fld] === 'string' && data[fld].includes(del.split('/').slice(-1)[0])){
              updates[fld] = deleteField();
            }
          });
          if (Object.keys(updates).length) await updateDoc(coRef, updates);
        }
      } catch(_){ /* ignore metadata cleanup errors */ }
      // remove card from DOM
      const card = ev.target.closest('.card'); if (card) card.remove();
    } catch(err){ alert('Delete failed: '+(err.message||String(err))); }
  });

  // initial load
  refresh();
}

export default { showCompanyUploads };
