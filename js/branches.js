import { db, nowTs } from './config.js';
import { $, html, setView } from './utils.js';
import { collection, query, where, limit, getDocs, addDoc, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function renderBranches(session){
  if (!session){ location.hash = '#/login'; return; }
  const root = html`
    <div class='grid cols-2'>
      <div class='card'>
        <h3>Create / Edit Branch</h3>
        <form id='brForm' class='grid' style='gap:8px;'>
          <input type='hidden' id='brId' />
          <input class='input' name='name' placeholder='Branch name' required />
          <input class='input' name='code' placeholder='Code' />
          <input class='input' name='address' placeholder='Address' />
          ${session.role==='superadmin' && !session.companyId ? `<input class='input' name='companyId' placeholder='Company ID (required for superadmin)' />` : ''}
          <div style='display:flex;gap:8px;'>
            <button class='btn' type='submit' id='brSubmit'>Save</button>
            <button class='btn secondary' type='button' id='brCancel' style='display:none;'>Cancel</button>
          </div>
        </form>
      </div>
      <div class='card'>
        <h3>Branches</h3>
        <table class='table'><thead><tr><th>Name</th><th>Code</th><th>Address</th><th></th></tr></thead><tbody id='brBody'></tbody></table>
      </div>
    </div>
  `;
  setView(root);

  const tbody = document.getElementById('brBody');
  const form = document.getElementById('brForm');
  const btnCancel = document.getElementById('brCancel');
  const btnSubmit = document.getElementById('brSubmit');

  async function loadBranches(){
    let qy;
    if (session.companyId){ qy = query(collection(db,'branches'), where('companyId','==', session.companyId), limit(500)); }
    else if (session.role==='superadmin'){ qy = query(collection(db,'branches'), limit(500)); }
    else { qy = query(collection(db,'branches'), where('companyId','==','__none__'), limit(1)); }
    try {
      const snap = await getDocs(qy);
      const docs = snap.docs.sort((a,b)=>{ const aN=(a.data().name||'').toLowerCase(); const bN=(b.data().name||'').toLowerCase(); return aN.localeCompare(bN); });
      tbody.innerHTML = docs.map(d=>{ const b=d.data(); return `<tr>
        <td>${b.name||''}</td>
        <td>${b.code||''}</td>
        <td>${b.address||''}</td>
        <td><button class='btn secondary' data-edit='${d.id}'>Edit</button></td>
      </tr>`; }).join('') || '<tr><td colspan="4">No branches</td></tr>';
    } catch(err){ tbody.innerHTML = '<tr><td colspan="4">Failed to load</td></tr>'; }
  }

  function resetForm(){ form.reset(); document.getElementById('brId').value=''; btnSubmit.textContent='Save'; btnCancel.style.display='none'; }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target; const editId = document.getElementById('brId').value;
    const companyId = session.companyId || f.companyId?.value?.trim() || '';
    if (!companyId){ alert('Company ID is required'); return; }
    const payload = { name:f.name.value, code:f.code.value, address:f.address.value, companyId };
    if (editId){ await updateDoc(doc(db,'branches', editId), { ...payload, updatedAt: nowTs() }); }
    else { await addDoc(collection(db,'branches'), { ...payload, createdAt: nowTs() }); }
    resetForm(); loadBranches();
  });
  btnCancel.addEventListener('click', resetForm);

  tbody.addEventListener('click', async (e)=>{
    const id = e.target.getAttribute('data-edit'); if (!id) return;
    try {
      // Best-effort; we only need to populate from the table row
      const row = e.target.closest('tr');
      document.getElementById('brId').value = id;
      form.name.value = row.children[0].textContent || '';
      form.code.value = row.children[1].textContent || '';
      form.address.value = row.children[2].textContent || '';
      btnSubmit.textContent = 'Update';
      btnCancel.style.display = '';
    } catch(_){ }
  });

  loadBranches();
}
