import { db } from './config.js';
import { $, html, setView, toCurrency } from './utils.js';
import { collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Public marketplace (products only)
export async function renderMarketplace(){
  const root = html`<div class="grid cols-3" id="market"></div>`;
  setView(root);
  const snap = await getDocs(query(collection(db,'products'), where('kind','==','product'), limit(60)));
  const docs = snap.docs.sort((a,b)=>{
    const da = a.data().createdAt?.seconds ? a.data().createdAt.seconds*1000 : a.data().createdAt || 0;
    const dbb = b.data().createdAt?.seconds ? b.data().createdAt.seconds*1000 : b.data().createdAt || 0;
    return dbb - da;
  }).filter(d=> !d.data().deleted);
  const m = $('#market');
  m.innerHTML = docs.map(d=>{
    const p = d.data();
    return `<div class='card'>
      <div style='font-weight:600; margin-bottom:4px;'>${p.name}</div>
      <div class='muted' style='margin-bottom:6px;'>${p.brand||''}</div>
      <div style='margin:8px 0; font-weight:600;'>${toCurrency(p.price)}</div>
      <div>
        <button class='btn' data-add-to-cart data-id='${d.id}' data-name='${p.name||''}' data-price='${p.price||0}'>Add to Cart</button>
      </div>
    </div>`;
  }).join('') || '<div class="card">No products yet.</div>';

  // optional: page can listen for clicks to add to cart if POS route uses a global handler
}
