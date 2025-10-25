import { db } from './config.js';
import { $, html, setView, toCurrency } from './utils.js';
import { collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Public services listing
export async function renderServices(){
  const root = html`<div class="grid cols-3" id="svc"></div>`;
  setView(root);
  const snap = await getDocs(query(collection(db,'products'), where('kind','==','service'), limit(60)));
  const docs = snap.docs.sort((a,b)=>{
    const da = a.data().createdAt?.seconds ? a.data().createdAt.seconds*1000 : a.data().createdAt || 0;
    const dbb = b.data().createdAt?.seconds ? b.data().createdAt.seconds*1000 : b.data().createdAt || 0;
    return dbb - da;
  }).filter(d=> !d.data().deleted);
  const v = $('#svc');
  v.innerHTML = docs.map(d=>{
    const p = d.data();
    return `<div class='card'>
      <div style='font-weight:600; margin-bottom:4px;'>${p.name}</div>
      <div class='muted' style='margin-bottom:6px;'>${p.category||''}</div>
      <div style='margin:8px 0; font-weight:600;'>${toCurrency(p.price)}</div>
      <div>
        <button class='btn' data-ask='${d.id}'>View</button>
      </div>
    </div>`;
  }).join('') || '<div class="card">No services yet.</div>';
}
