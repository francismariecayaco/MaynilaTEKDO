import { $, html, setView } from './utils.js';

// Minimal safe dashboard implementation to fix duplicate/import errors introduced earlier.
// This keeps the app runnable; we'll re-add the richer cards/branches UI next.

export function renderDashboard(session){
  const root = html`
    <div class="card">
      <h3>Dashboard</h3>
      <p>Welcome, ${session?.email || 'user'}.</p>
      ${session?.role === 'superadmin' ? `<p><a href="#/admin/branches" class="btn">Manage Branches</a></p>` : ''}
    </div>
  `;
  setView(root);
}


import { db } from './config.js';
import { $, html, setView, toCurrency, buildCompanySlug } from './utils.js';
import { collection, query, where, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export function renderDashboard(session){
  const root = html`
    <div class="grid cols-3">
      <div class="card">
        <h3>Sales (7d)</h3>
        <canvas id="chartSales"></canvas>
      </div>
      <div class="card">
        <h3>Top Products</h3>
        <ul id="topProducts"></ul>
      </div>
      <div class="card">
        <h3>Counts</h3>
        <div id="counts" class="grid cols-2"></div>
      </div>
    </div>
    <div class="card">
      <h3>Quick Actions</h3>
      <div class="grid cols-4">
        <button class="btn" onclick="location.hash='#/admin/pos'">New Sale</button>
        <button class="btn" onclick="location.hash='#/admin/products'">Add Product</button>
        <button class="btn" onclick="location.hash='#/admin/inventory'">Receive Stock</button>
        <button class="btn" onclick="location.hash='#/admin/users'">Invite User</button>
        ${session.role==='superadmin' ? `<button class="btn" onclick="location.hash='#/admin/branches'">Manage Branches</button>` : ''}
      </div>
    </div>
    ${session.role==='superadmin' ? `<div class='card'>
        <h3>Branches by Company</h3>
        <table class='table'><thead><tr><th>Company</th><th>Branches</th><th>Count</th><th></th></tr></thead>
          <tbody id='branchesByCompany'></tbody></table>
      </div>` : ''}
  `;
  setView(root);
  loadCards(session);
  runAlerts(session);
  if (session.role === 'superadmin'){ loadBranchesPerCompany(session); }
}

async function loadCards(session){
  const companyId = session?.companyId;
  try {
    const ordersQ = companyId
      ? query(collection(db,'sales'), where('companyId','==',companyId), limit(100))
      : query(collection(db,'sales'), limit(100));
    const snap = await getDocs(ordersQ);
    const docs = snap.docs.sort((a,b)=>{
      const da = a.data().createdAt?.seconds ? a.data().createdAt.seconds*1000 : a.data().createdAt || 0;
      const dbb = b.data().createdAt?.seconds ? b.data().createdAt.seconds*1000 : b.data().createdAt || 0;
      return dbb - da;
    });
    const daily = {};
    let total = 0;
    docs.forEach(doc=>{
      const o = doc.data();
      const d = new Date(o.createdAt?.seconds ? o.createdAt.seconds*1000 : o.createdAt);
      const key = d.toISOString().slice(0,10);
      daily[key] = (daily[key]||0)+ (o.total || 0);
      total += (o.total||0);
    });
    drawSalesChart(daily);

    // counts
    $('#counts').innerHTML = `
      <div><div class="badge">7d Total</div><div style="font-size:1.4rem;margin-top:6px;">${toCurrency(total)}</div></div>
      <div><div class="badge">Orders</div><div style="font-size:1.4rem;margin-top:6px;">${snap.size}</div></div>
    `;
  } catch(err){ console.error(err); }
}

async function loadBranchesPerCompany(session){
  try {
    const host = document.getElementById('branchesByCompany');
    if (!host) return;
    host.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
    const cs = await getDocs(query(collection(db,'companies'), limit(500)));
    const companies = cs.docs.filter(d=> !d.data().deleted).sort((a,b)=> (a.data().name||'').localeCompare(b.data().name||''));
    if (!companies.length){ host.innerHTML = '<tr><td colspan="4">No companies found.</td></tr>'; return; }

    host.innerHTML = companies.map(c=>{
      const cid = c.id; const data = c.data(); const cname = data.name || cid; const slug = buildCompanySlug(data.name, cid) || cid;
      return `<tr data-cid='${cid}'><td style='font-weight:600;'>${escapeHtml(cname)}</td><td id='branches-cell-${cid}'><button class='btn small' data-expand='${cid}'>Show branches</button></td><td id='branches-count-${cid}'>-</td><td><a class='btn secondary' href='#/company/${slug}'>Open</a> <a class='btn' href='#/admin/branches'>Manage</a></td></tr>`;
    }).join('');

    const cache = {};
    host.addEventListener('click', async (e)=>{
      const cid = e.target && e.target.getAttribute && e.target.getAttribute('data-expand');
      if (!cid) return;
      await toggleCompanyBranches(cid);
    });

    async function toggleCompanyBranches(cid){
      const cell = document.getElementById(`branches-cell-${cid}`);
      const countEl = document.getElementById(`branches-count-${cid}`);
      if (!cell) return;
      if (cell.dataset.expanded === '1'){
        cell.innerHTML = `<button class='btn small' data-expand='${cid}'>Show branches</button>`;
        cell.dataset.expanded = '0';
        return;
      }
      cell.innerHTML = `<span class='muted'>Loading…</span>`;
      try {
        let names;
        if (cache[cid]) names = cache[cid];
        else {
          const bs = await getDocs(query(collection(db,'branches'), where('companyId','==', cid), limit(500)));
          const bdocs = bs.docs.sort((a,b)=> (a.data().name||'').localeCompare(b.data().name||''));
          names = bdocs.map(bd=> ({ name: bd.data().name || bd.id, code: bd.data().code||'', address: bd.data().address||'' }));
          cache[cid] = names;
        }
        if (!names.length){
          cell.innerHTML = `<span class="muted">No branches</span> <button class="btn small" data-expand="${cid}">Collapse</button>`;
          if (countEl) { countEl.textContent = '0'; }
        } else {
          const listHtml = '<ul style="margin:0;padding-left:16px;">' + names.map(n=> '<li>' + escapeHtml(n.name) + (n.code? ' — '+escapeHtml(n.code): '') + (n.address? ' <span class="muted">(' + escapeHtml(n.address) + ')</span>': '') + '</li>').join('') + '</ul> <button class="btn small" data-expand="' + cid + '">Collapse</button>';
          cell.innerHTML = listHtml;
          if (countEl) { countEl.textContent = String(names.length); }
        }
        cell.dataset.expanded = '1';
      } catch(err){
        cell.innerHTML = `<span class='muted'>Failed to load</span> <button class='btn small' data-expand='${cid}'>Retry</button>`;
        console.error(err);
      }
    }

    function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  } catch(err){
    const host = document.getElementById('branchesByCompany'); if (!host) return; host.innerHTML = '<tr><td colspan="4">Failed to load branches by company</td></tr>';
    console.error(err);
  }
}

function drawSalesChart(daily){
  const ctx = document.getElementById('chartSales');
  const labels = Object.keys(daily).sort();
  const data = labels.map(k=> daily[k]);
  if (!ctx) return;
  new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Sales', data, borderColor:'#1877f2', backgroundColor:'rgba(24,119,242,.2)' }]}, options:{ plugins:{ legend:{ display:false }}, scales:{ x:{ grid:{ color:'#2d2d30' }}, y:{ grid:{ color:'#2d2d30' }}} }});
}

async function runAlerts(session){
  try {
    const list = document.getElementById('notifList');
    if (!session?.companyId) return;
    const lowQ = await getDocs(query(collection(db,'inventoryBatches'), where('companyId','==',session.companyId)));
    const items = [];
    const now = new Date();
    const soon = new Date(now.getTime()+ 7*24*3600*1000);
    lowQ.forEach(d=>{
      const b = d.data();
      if ((b.remain||0) <= 5) items.push({ level:'warning', text:`Low stock for ${b.productId} (remain ${b.remain})` });
      if (b.expDate && new Date(b.expDate) <= soon) items.push({ level:'danger', text:`Expiring soon ${b.productId} (exp ${b.expDate})` });
    });
    list.innerHTML = items.map(i=>`<li><span class='badge ${i.level==='danger'?'danger':'warning'}'>${i.level}</span> ${i.text}</li>`).join('') || '<li>No alerts</li>';
  } catch(err){ console.error(err); }
}

function drawSalesChart(daily){
  const ctx = document.getElementById('chartSales');
  const labels = Object.keys(daily).sort();
  const data = labels.map(k=> daily[k]);
  if (!ctx) return;
  new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Sales', data, borderColor:'#1877f2', backgroundColor:'rgba(24,119,242,.2)' }]}, options:{ plugins:{ legend:{ display:false }}, scales:{ x:{ grid:{ color:'#2d2d30' }}, y:{ grid:{ color:'#2d2d30' }}} }});
}

async function runAlerts(session){
  try {
    const list = document.getElementById('notifList');
    if (!session?.companyId) return;
    // Low stock: remain <= 5
    const lowQ = await getDocs(query(collection(db,'inventoryBatches'), where('companyId','==',session.companyId)));
    const items = [];
    const now = new Date();
    const soon = new Date(now.getTime()+ 7*24*3600*1000);
    lowQ.forEach(d=>{
      const b = d.data();
      if ((b.remain||0) <= 5) items.push({ level:'warning', text:`Low stock for ${b.productId} (remain ${b.remain})` });
      if (b.expDate && new Date(b.expDate) <= soon) items.push({ level:'danger', text:`Expiring soon ${b.productId} (exp ${b.expDate})` });
    });
    list.innerHTML = items.map(i=>`<li><span class='badge ${i.level==='danger'?'danger':'warning'}'>${i.level}</span> ${i.text}</li>`).join('') || '<li>No alerts</li>';
  } catch(err){ console.error(err); }
}

function drawSalesChart(daily){
  const ctx = document.getElementById('chartSales');
  const labels = Object.keys(daily).sort();
  const data = labels.map(k=> daily[k]);
  if (!ctx) return;
  new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Sales', data, borderColor:'#1877f2', backgroundColor:'rgba(24,119,242,.2)' }]}, options:{ plugins:{ legend:{ display:false }}, scales:{ x:{ grid:{ color:'#2d2d30' }}, y:{ grid:{ color:'#2d2d30' }}} }});
}

async function runAlerts(session){
  try {
    const list = document.getElementById('notifList');
    if (!session?.companyId) return;
    // Low stock: remain <= 5
    const lowQ = await getDocs(query(collection(db,'inventoryBatches'), where('companyId','==',session.companyId)));
    const items = [];
    const now = new Date();
    const soon = new Date(now.getTime()+ 7*24*3600*1000);
    lowQ.forEach(d=>{
      const b = d.data();
      if ((b.remain||0) <= 5) items.push({ level:'warning', text:`Low stock for ${b.productId} (remain ${b.remain})` });
      if (b.expDate && new Date(b.expDate) <= soon) items.push({ level:'danger', text:`Expiring soon ${b.productId} (exp ${b.expDate})` });
    });
    list.innerHTML = items.map(i=>`<li><span class='badge ${i.level==='danger'?'danger':'warning'}'>${i.level}</span> ${i.text}</li>`).join('') || '<li>No alerts</li>';
  } catch(err){ console.error(err); }

function drawSalesChart(daily){
  const ctx = document.getElementById('chartSales');
  const labels = Object.keys(daily).sort();
  const data = labels.map(k=> daily[k]);
  if (!ctx) return;
  new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Sales', data, borderColor:'#1877f2', backgroundColor:'rgba(24,119,242,.2)' }]}, options:{ plugins:{ legend:{ display:false }}, scales:{ x:{ grid:{ color:'#2d2d30' }}, y:{ grid:{ color:'#2d2d30' }}} }});
}

async function runAlerts(session){
  try {
    const list = document.getElementById('notifList');
    if (!session?.companyId) return;
    // Low stock: remain <= 5
    const lowQ = await getDocs(query(collection(db,'inventoryBatches'), where('companyId','==',session.companyId)));
    const items = [];
    const now = new Date();
    const soon = new Date(now.getTime()+ 7*24*3600*1000);
    lowQ.forEach(d=>{
      const b = d.data();
      if ((b.remain||0) <= 5) items.push({ level:'warning', text:`Low stock for ${b.productId} (remain ${b.remain})` });
      if (b.expDate && new Date(b.expDate) <= soon) items.push({ level:'danger', text:`Expiring soon ${b.productId} (exp ${b.expDate})` });
    });
    list.innerHTML = items.map(i=>`<li><span class='badge ${i.level==='danger'?'danger':'warning'}'>${i.level}</span> ${i.text}</li>`).join('') || '<li>No alerts</li>';
  } catch(err){ console.error(err); }
}
