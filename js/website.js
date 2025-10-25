import { db, storage } from './config.js';
import { $, html, setView, fileToDataURL, toCurrency } from './utils.js';
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

export async function renderCompanyPage(companyId, session){
  const coRef = doc(db,'companies', companyId);
  const s = await getDoc(coRef);
  const co = s.exists() ? s.data() : { name:'New Company', themeColor:'#1877f2' };
  // Allow edit if user is linked to this company and has admin role, or if superadmin
  const adminRoles = ['admin-supervisor','admin-manager','admin-president','admin-owner'];
  const canEdit = !!session && ((session.companyId === companyId && adminRoles.includes(session.role)) || session.role === 'superadmin');

  const root = html`
    <div class="card" style="border-color:${co.themeColor || '#1877f2'}">
      <div style="position:relative;">
        <img id="coverImg" src="${co.coverUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop'}" style="width:100%;height:220px;object-fit:cover;border-radius:8px;"/>
        ${canEdit ? `<input type="file" id="coverFile" style="position:absolute;right:12px;bottom:12px;background:#0008;color:#fff;border-radius:8px;padding:6px;"/>` : ''}
      </div>
  <div class="grid cols-3" id="infoGrid" style="margin-top:12px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;">
            ${co.logoUrl ? `<img src="${co.logoUrl}" alt="logo" style="width:42px;height:42px;border-radius:8px;object-fit:cover;"/>` : ''}
            <h2 style="margin:0;">${co.name || 'Untitled Company'}</h2>
          </div>
          <div>${co.description || 'Describe your company here...'}</div>
          <div style="margin-top:8px;">Owner: ${co.ownerName || '-'}</div>
          <div style="margin-top:8px;">Contact: ${co.email || ''} ${co.phone || ''}</div>
          <div style="margin-top:8px;">Theme Color: <input type="color" id="themeColor" value="${co.themeColor || '#1877f2'}" ${!canEdit?'disabled':''}/></div>
          ${canEdit ? `<div style="margin-top:8px;display:flex;gap:8px;">
            <a class="btn" href="#/admin/products?companyId=${companyId}">Add Product/Service</a>
            <a class="btn secondary" href="#/company/${companyId}/edit">Edit Company</a>
          </div>` : ''}
        </div>
        <div id="svcCol">
          <h3>Services</h3>
          <ul id="coServices"></ul>
        </div>
        <div id="prodCol">
          <h3>Products</h3>
          <ul id="coProducts"></ul>
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <div id="svcWrap" style="display:none;">
          <h3 style="margin:0;">Services</h3>
          <div class="grid cols-3" id="svcCards" style="margin-top:12px;"></div>
        </div>
        <div id="prdWrap" style="display:none;margin-top:12px;">
          <h3 style="margin:0;">Products</h3>
          <div class="grid cols-3" id="prdCards" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>
  `;
  setView(root);

  // list
  const all = await getDocs(query(collection(db,'products'), where('companyId','==',companyId)));
  const prods = []; const svcs = [];
  all.docs.forEach(d=>{ const x=d.data(); if (x.deleted) return; (x.kind==='service'? svcs: prods).push({ id:d.id, ...x }); });
    if (svcs.length){
      $('#coServices').innerHTML = svcs.map(x=>`<li>${x.name} - ${toCurrency(x.price || 0)}</li>`).join('');
    } else {
      const svcCol = $('#svcCol'); if (svcCol) svcCol.style.display = 'none';
    }
  if (prods.length){
    $('#coProducts').innerHTML = prods.map(x=>`<li>${x.name} - ${toCurrency(x.price || 0)}</li>`).join('');
  } else {
    // Hide the Products column and collapse grid to 2 cols to avoid empty space
    const prodCol = $('#prodCol');
    const grid = $('#infoGrid');
    if (prodCol) prodCol.style.display = 'none';
    if (grid){ grid.classList.remove('cols-3'); grid.classList.add('cols-2'); }
  }
    // Adjust grid columns based on which sections are visible
    const grid = $('#infoGrid');
    if (grid){
      grid.classList.remove('cols-1','cols-2','cols-3');
      const cols = 1 + (svcs.length?1:0) + (prods.length?1:0);
      grid.classList.add(`cols-${cols}`);
    }

  // Bottom card-style sections
  const svcWrap = $('#svcWrap'); const svcCards = $('#svcCards');
  const prdWrap = $('#prdWrap'); const prdCards = $('#prdCards');
  if (svcs.length){
    svcWrap.style.display = '';
    svcCards.innerHTML = svcs.map(s=>`<div class='card'>
      <div style='font-weight:600;'>${s.name}</div>
      ${s.description ? `<div class='muted' style='margin:6px 0;'>${(s.description||'').slice(0,100)}</div>` : ''}
      <div style='margin:8px 0;'>${toCurrency(s.price)}</div>
    </div>`).join('');
  }
  if (prods.length){
    prdWrap.style.display = '';
    prdCards.innerHTML = prods.map(p=>`<div class='card'>
      <div style='font-weight:600;'>${p.name}</div>
      ${p.brand ? `<div class='muted'>${p.brand}</div>` : ''}
      <div style='margin:8px 0;'>${toCurrency(p.price)}</div>
    </div>`).join('');
  }

  if (canEdit){
    $('#themeColor')?.addEventListener('input', async (e)=>{
      await updateDoc(coRef, { themeColor: e.target.value });
      e.target.style.outlineColor = e.target.value;
    });
    $('#coverFile')?.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0];
      if (!f) return;
      const dataUrl = await fileToDataURL(f);
      const r = ref(storage, `companies/${companyId}/cover.jpg`);
      await uploadString(r, dataUrl, 'data_url');
      const url = await getDownloadURL(r);
      await updateDoc(coRef, { coverUrl: url });
      $('#coverImg').src = url;
    });
  }
}

// Standalone Company Edit page
export async function renderCompanyEdit(companyId, session){
  const coRef = doc(db,'companies', companyId);
  const s = await getDoc(coRef);
  if (!s.exists()){
    return setView(html`<div class='card'>Company not found. <a class='btn' href='#/companies'>Back</a></div>`);
  }
  const co = s.data();
  const adminRoles = ['admin-supervisor','admin-manager','admin-president','admin-owner'];
  const canEdit = !!session && ((session.companyId === companyId && adminRoles.includes(session.role)) || session.role === 'superadmin');
  if (!canEdit){
    return setView(html`<div class='card'>You don't have permission to edit this company. <a class='btn' href='#/company/${companyId}'>Back</a></div>`);
  }
  const root = html`
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;'>
        <h3 style='margin:0;'>Edit Company</h3>
        <div style='display:flex;gap:8px;'>
          <a class='btn secondary' href='#/company/${companyId}'>Back to Company</a>
        </div>
      </div>
      <div style='position:relative;margin-top:8px;'>
        <img id='editCoverImg' src='${co.coverUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop'}' style='width:100%;height:220px;object-fit:cover;border-radius:8px;'/>
        <input type='file' id='editCoverFile' style='position:absolute;right:12px;bottom:12px;background:#0008;color:#fff;border-radius:8px;padding:6px;'/>
      </div>
      <form id='coEditForm' class='grid' style='gap:8px;margin-top:12px;'>
        <input class='input' name='name' placeholder='Company Name' value='${co.name||''}' required />
        <input class='input' name='ownerName' placeholder="Owner's Name" value='${co.ownerName||''}' />
        <input class='input' name='email' placeholder='Email' value='${co.email||''}' />
        <input class='input' name='phone' placeholder='Phone' value='${co.phone||''}' />
        <select class='input' name='offerType'>
          <option value='' ${!co.offerType?'selected':''}>Company Type (optional)</option>
          <option value='marketplace' ${co.offerType==='marketplace'?'selected':''}>Marketplace</option>
          <option value='service' ${co.offerType==='service'?'selected':''}>Service</option>
        </select>
        <textarea class='input' name='description' placeholder='Description'>${co.description||''}</textarea>
        <div>Theme Color: <input type='color' id='editThemeColor' value='${co.themeColor || '#1877f2'}' /></div>
        <div class='grid cols-3'>
          <div>
            <label style='font-size:12px;color:#a1a1a6;'>Update Logo</label>
            <input class='input' type='file' name='logoFile' accept='image/*' />
          </div>
          <div>
            <label style='font-size:12px;color:#a1a1a6;'>Business Permit (Photo)</label>
            <input class='input' type='file' name='permitFile' accept='image/*' />
          </div>
          <div>
            <label style='font-size:12px;color:#a1a1a6;'>DTI Certificate (Photo)</label>
            <input class='input' type='file' name='dtiFile' accept='image/*' />
          </div>
        </div>
        <div style='display:flex;gap:8px;'>
          <button class='btn' type='submit'>Save Changes</button>
          <a class='btn secondary' href='#/company/${companyId}'>Cancel</a>
        </div>
      </form>
    </div>
  `;
  setView(root);

  // Handlers
  document.getElementById('editThemeColor')?.addEventListener('input', async (e)=>{
    await updateDoc(coRef, { themeColor: e.target.value });
  });
  document.getElementById('editCoverFile')?.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await fileToDataURL(f);
    const r = ref(storage, `companies/${companyId}/cover.jpg`);
    await uploadString(r, dataUrl, 'data_url');
    const url = await getDownloadURL(r);
    await updateDoc(coRef, { coverUrl: url });
    document.getElementById('editCoverImg').src = url;
  });
  document.getElementById('coEditForm')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    const patch = {
      name: f.name.value,
      ownerName: f.ownerName.value,
      email: f.email.value,
      phone: f.phone.value,
      offerType: f.offerType.value || null,
      description: f.description.value,
      themeColor: document.getElementById('editThemeColor').value,
    };
    const uploads = {};
    const logo = f.logoFile.files?.[0];
    const permit = f.permitFile.files?.[0];
    const dti = f.dtiFile.files?.[0];
    try{
      if (logo){
        const du = await fileToDataURL(logo);
        const r = ref(storage, `companies/${companyId}/logo_${Date.now()}.jpg`);
        await uploadString(r, du, 'data_url');
        uploads.logoUrl = await getDownloadURL(r);
      }
      if (permit){
        const du = await fileToDataURL(permit);
        const r = ref(storage, `companies/${companyId}/business_permit_${Date.now()}.jpg`);
        await uploadString(r, du, 'data_url');
        uploads.businessPermitUrl = await getDownloadURL(r);
      }
      if (dti){
        const du = await fileToDataURL(dti);
        const r = ref(storage, `companies/${companyId}/dti_${Date.now()}.jpg`);
        await uploadString(r, du, 'data_url');
        uploads.dtiUrl = await getDownloadURL(r);
      }
    } catch(err){ console.error('Upload failed', err); }
    await updateDoc(coRef, { ...patch, ...uploads });
    alert('Company updated');
  });
}
