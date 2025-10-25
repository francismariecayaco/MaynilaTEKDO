import { db, nowTs } from './config.js';
import { $, html, setView, toCurrency } from './utils.js';
import { navigate } from './routing.js';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

function getSession(){
  try { return JSON.parse(localStorage.getItem('cp.session.v1')||'null'); }
  catch(_){ return null; }
}

export function renderProducts(ctx){
  const session = getSession();
  if (!session) return navigate('#/login');
  const urlCompanyId = ctx?.query?.companyId || '';
  const root = html`
    <div>
      <div class="card">
        <h3>Add / Update Product</h3>
        <form id="prodForm" class="grid" style="gap:8px;">
          <input type="hidden" name="_id" id="prodId" />
          <input class="input" name="name" placeholder="Name" required />
          <input class="input" name="brand" placeholder="Brand" />
          <select class="input" name="kind" id="prodKind">
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
          <div id="typeWrap">
            <select class="input" name="type" id="prodType">
              <option value="wet">Wet goods</option>
              <option value="dry">Dry goods</option>
              <option value="gadget">Gadgets</option>
              <option value="appliance">Appliances</option>
              <option value="clothes">Clothes</option>
            </select>
          </div>
          <input class="input" type="number" step="0.01" name="price" placeholder="Price" />
          ${session?.companyId || urlCompanyId ? '' : `<div id="companyPicker"></div>`}
          ${urlCompanyId ? `<div class='muted'>Target company: <code>${urlCompanyId}</code></div>` : ''}
          <textarea class="input" name="description" placeholder="Description"></textarea>
          <div style="display:flex;gap:8px;">
            <button class="btn" id="prodSubmit" type="submit">Save</button>
            <button class="btn secondary" id="prodCancel" type="button" style="display:none;">Cancel</button>
          </div>
        </form>
      </div>
      <div class="card" style="margin-top:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Products</h3>
          <div id="prodFilters" class="grid" style="grid-auto-flow:column;gap:6px;">
            <button class="btn secondary" data-f="all">All</button>
            <button class="btn secondary" data-f="product">Products</button>
            <button class="btn secondary" data-f="service">Services</button>
          </div>
        </div>
        <table class="table" id="prodTable"><thead><tr><th>Name</th><th>Kind</th><th>Type</th><th>Price</th><th></th></tr></thead><tbody></tbody></table>
      </div>
    </div>
  `;
  setView(root);
  const tbody = $('#prodTable tbody');
  let currentFilter = 'all';
  loadProducts(tbody, currentFilter, session);
  $('#prodFilters').addEventListener('click', (e)=>{
    const f = e.target.getAttribute('data-f');
    if (!f) return; currentFilter = f; loadProducts(tbody, currentFilter, session);
  });
  const kindSel = document.getElementById('prodKind');
  const typeWrap = document.getElementById('typeWrap');
  const toggleType = ()=>{ typeWrap.style.display = (kindSel.value==='service') ? 'none' : ''; };
  kindSel.addEventListener('change', toggleType); toggleType();
  // superadmin company picker
  const cp = document.getElementById('companyPicker');
  if (cp && session.role === 'superadmin' && !urlCompanyId && !session.companyId){
    cp.innerHTML = `<div class='grid' style='gap:6px;'>
      <select class='input' id='companySelect'>
        <option value=''>Select Company (required)</option>
      </select>
      <div class='muted'>Tip: Open from a company via "Add Product/Service" to auto-select it.</div>
    </div>`;
    (async ()=>{
      try{
        const cs = await getDocs(query(collection(db,'companies')));
        const sel = document.getElementById('companySelect');
        cs.docs.filter(d=>!d.data().deleted).forEach(d=>{
          const c = d.data(); const opt = document.createElement('option');
          opt.value = d.id; opt.textContent = c.name || d.id; sel.appendChild(opt);
        });
      }catch(err){ console.error('Load companies failed', err); }
    })();
  }

  const form = document.getElementById('prodForm');
  const btnSubmit = document.getElementById('prodSubmit');
  const btnCancel = document.getElementById('prodCancel');
  const table = document.getElementById('prodTable');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    const targetCompanyId = session.companyId || urlCompanyId || (document.getElementById('companySelect')?.value?.trim()||'');
    if (!targetCompanyId && session.role === 'superadmin'){
      alert('For superadmin, select a Company or open from a company page.');
      return;
    }
    const docData = {
      name: f.name.value, brand: f.brand.value, type: (f.kind.value==='service' ? '' : f.type.value), kind: f.kind.value,
      price: parseFloat(f.price.value || '0'), description: f.description.value,
      companyId: targetCompanyId, createdAt: nowTs(), createdBy: session.uid
    };
    const editId = document.getElementById('prodId').value;
    if (editId){
      const { createdAt, createdBy, ...rest } = docData;
      await updateDoc(doc(db,'products', editId), { ...rest, updatedAt: nowTs() });
    } else {
      await addDoc(collection(db,'products'), docData);
    }
    resetForm();
    loadProducts(tbody, currentFilter, session);
  });

  btnCancel.addEventListener('click', ()=> resetForm());

  function resetForm(){
    form.reset();
    document.getElementById('prodId').value = '';
    btnSubmit.textContent = 'Save';
    btnCancel.style.display = 'none';
    toggleType();
  }

  // row actions: edit/delete
  table.addEventListener('click', async (e)=>{
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-del');
    if (editId){
      const snap = await getDoc(doc(db,'products', editId));
      if (!snap.exists()) return alert('Item not found');
      const p = snap.data();
      const f = document.getElementById('prodForm');
      f.name.value = p.name||'';
      f.brand.value = p.brand||'';
      f.kind.value = p.kind||'product';
      document.getElementById('prodKind').value = p.kind||'product';
      toggleType();
      if ((p.kind||'product') === 'product'){
        f.type.value = p.type||'wet';
      }
      f.price.value = p.price||'';
      f.description.value = p.description||'';
      document.getElementById('prodId').value = editId;
      btnSubmit.textContent = 'Update';
      btnCancel.style.display = '';
    }
    if (delId){
      if (!confirm('Delete this item?')) return;
      try{
        await updateDoc(doc(db,'products', delId), { deleted: true, deletedAt: nowTs(), deletedBy: session.uid });
        loadProducts(tbody, currentFilter, session);
      } catch(err){
        alert('Failed to delete. Check Firestore rules.');
        console.error(err);
      }
    }
  });
}

async function loadProducts(tbody, filter='all', session){
  const q = session?.companyId ? query(collection(db,'products'), where('companyId','==',session.companyId), limit(200))
                               : query(collection(db,'products'), limit(200));
  const snap = await getDocs(q);
  const docs = snap.docs.sort((a,b)=>{
    const da = a.data().createdAt?.seconds ? a.data().createdAt.seconds*1000 : a.data().createdAt || 0;
    const dbb = b.data().createdAt?.seconds ? b.data().createdAt.seconds*1000 : b.data().createdAt || 0;
    return dbb - da;
  }).filter(d=> !d.data().deleted);
  const filtered = filter==='all' ? docs : docs.filter(d=> (d.data().kind||'product') === filter);
  tbody.innerHTML = filtered.map(d=>{
    const p = d.data();
    const inventoryLink = (p.kind||'product') === 'product' ? `<a href='#/admin/inventory?productId=${d.id}'>Inventory</a>` : '';
    return `<tr>
      <td>${p.name}</td>
      <td>${p.kind||'product'}</td>
      <td>${p.type||''}</td>
      <td>${toCurrency(p.price)}</td>
      <td style='display:flex;gap:6px;'>
        ${inventoryLink}
        <button class='btn secondary' data-edit='${d.id}'>Edit</button>
        <button class='btn danger' data-del='${d.id}'>Delete</button>
      </td>
    </tr>`;
  }).join('');
}
