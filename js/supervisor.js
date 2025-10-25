import { db } from './config.js';
import { html, setView, toCurrency, fmtDate } from './utils.js';
import { collection, query, where, getDocs, limit, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Admin Supervisor dashboard
export async function renderSupervisorDashboard(session){
  if (!session){
    // Lightweight inline login hint
    setView(html`<div class='card'>Please login to access the Supervisor dashboard.</div>`);
    return;
  }

  const root = html`
    <div class='grid' style='gap:12px;'>
      <div class='grid cols-4'>
        <div class='card'><div class='muted' style='font-size:12px;'>Today's Sales</div><div id='kpiSales' style='font-size:22px;font-weight:700;'>₱0.00</div></div>
        <div class='card'><div class='muted' style='font-size:12px;'>Open Orders</div><div id='kpiOpen' style='font-size:22px;font-weight:700;'>0</div></div>
        <div class='card'><div class='muted' style='font-size:12px;'>Low Stock</div><div id='kpiLow' style='font-size:22px;font-weight:700;'>0</div></div>
        <div class='card'><div class='muted' style='font-size:12px;'>Staff On Duty</div><div id='kpiStaff' style='font-size:22px;font-weight:700;'>0</div></div>
      </div>

      <div class='grid cols-3'>
        <div class='card'>
          <h3 style='margin-top:0;'>Branch Filter</h3>
          <div class='grid cols-2' style='gap:8px;align-items:end;'>
            <div>
              <label class='muted' style='font-size:12px;'>Branch</label>
              <select id='svBranch' class='input'><option value=''>All branches</option></select>
            </div>
            <div>
              <button id='svRefresh' class='btn'>Refresh</button>
            </div>
          </div>
        </div>
        <div class='card'>
          <h3 style='margin-top:0;'>Notifications</h3>
          <div id='svNotes' class='muted'>No notifications.</div>
        </div>
        <div class='card'>
          <h3 style='margin-top:0;'>Approvals</h3>
          <div id='svApprovals' class='muted'>Nothing to approve.</div>
        </div>
      </div>

      <div class='grid cols-2'>
        <div class='card'>
          <h3 style='margin-top:0;'>Recent Transactions</h3>
          <table class='table'>
            <thead><tr><th>Date</th><th>Order</th><th>Total</th></tr></thead>
            <tbody id='svRecent'></tbody>
          </table>
        </div>
        <div class='card'>
          <h3 style='margin-top:0;'>Top Products</h3>
          <div id='svTopProducts' class='muted'>No data.</div>
        </div>
      </div>

      <div class='grid cols-2'>
        <div class='card'>
          <h3 style='margin-top:0;'>Inventory</h3>
          <table class='table'>
            <thead><tr><th>Product</th><th class='hide-sm'>SKU</th><th>Stock</th></tr></thead>
            <tbody id='svInventory'></tbody>
          </table>
        </div>
        <div class='card'>
          <h3 style='margin-top:0;'>Announcements</h3>
          <div class='muted'>No announcements.</div>
        </div>
      </div>
    </div>`;

  setView(root);

  // Populate branches for current company
  (async ()=>{
    try {
      const sel = document.getElementById('svBranch');
      if (!sel) return;
      let qy;
      if (session.companyId) qy = query(collection(db,'branches'), where('companyId','==', session.companyId), limit(500));
      else qy = query(collection(db,'branches'), limit(200));
      const snap = await getDocs(qy);
      sel.innerHTML = `<option value=''>All branches</option>` + snap.docs.map(d=>`<option value='${d.id}'>${d.data().name||d.id}</option>`).join('');
    } catch(_){ /* ignore */ }
  })();

  // Bind Refresh button
  document.getElementById('svRefresh')?.addEventListener('click', loadData);

  // Initial load
  await loadData();

  async function loadData(){
    // Reset placeholders
    set('#kpiSales', toCurrency(0));
    set('#kpiOpen', '0');
    set('#kpiLow', '0');
    set('#kpiStaff', '0');
    set('#svRecent', `<tr><td colspan='3'>Loading…</td></tr>`);
    set('#svInventory', `<tr><td colspan='3'>Loading…</td></tr>`);

    const branchId = document.getElementById('svBranch')?.value || '';

    // Load recent orders (best-effort)
    try {
      const parts = [collection(db,'orders')];
      if (session.companyId) parts.push(where('companyId','==', session.companyId));
      if (branchId) parts.push(where('branchId','==', branchId));
      parts.push(orderBy('createdAt','desc'));
      parts.push(limit(20));
      const snap = await getDocs(query.apply(null, parts));
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      const totalToday = rows
        .filter(r=> isToday(r.createdAt))
        .reduce((a,r)=> a + (r.total || 0), 0);
      set('#kpiSales', toCurrency(totalToday));
      set('#kpiOpen', String(rows.filter(r=> (r.status||'open')==='open').length));
      set('#svRecent', rows.map(r=> `<tr><td>${fmtDate(r.createdAt)}</td><td>${r.id.slice(0,6)}</td><td>${toCurrency(r.total||0)}</td></tr>`).join('') || `<tr><td colspan='3' class='muted'>No transactions.</td></tr>`);
    } catch(_){
      set('#svRecent', `<tr><td colspan='3' class='muted'>No permission or no data.</td></tr>`);
    }

    // Load basic inventory (products list)
    try {
      const parts2 = [collection(db,'products')];
      if (session.companyId) parts2.push(where('companyId','==', session.companyId));
      if (branchId) parts2.push(where('branchId','==', branchId));
      parts2.push(limit(100));
      const snap2 = await getDocs(query.apply(null, parts2));
      const rows2 = snap2.docs.map(d=>({ id:d.id, ...d.data() }));
      set('#svInventory', rows2.map(p=> `<tr><td>${p.name||p.id}</td><td class='hide-sm'>${p.sku||''}</td><td>${p.stock ?? '-'}</td></tr>`).join('') || `<tr><td colspan='3' class='muted'>No products.</td></tr>`);
      set('#kpiLow', String(rows2.filter(p=> typeof p.stock==='number' && p.stock<= (p.reorderLevel||0)).length));
    } catch(_){
      set('#svInventory', `<tr><td colspan='3' class='muted'>No permission or no data.</td></tr>`);
    }

    // Staff on duty (best-effort; counts recent "in" records today)
    try {
      const parts3 = [collection(db,'attendance')];
      if (session.companyId) parts3.push(where('companyId','==', session.companyId));
      parts3.push(limit(500));
      const snap3 = await getDocs(query.apply(null, parts3));
      const recs = snap3.docs.map(d=> d.data());
      const uidsToday = new Set(recs.filter(r=> isToday(r.at) && r.action==='in').map(r=> r.uid));
      set('#kpiStaff', String(uidsToday.size));
    } catch(_){ /* ignore */ }

    // Top products (placeholder)
    set('#svTopProducts', `<div class='muted'>Coming soon.</div>`);
  }

  function set(sel, val){ const el = document.querySelector(sel); if (el) el.innerHTML = String(val); }
  function isToday(d){ try { const dt = (d?.seconds? new Date(d.seconds*1000): new Date(d)); const t = new Date(); return dt.toDateString() === t.toDateString(); } catch { return false; } }
}
