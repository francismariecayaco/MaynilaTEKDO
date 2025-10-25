import { db, storage, nowTs, uid } from './config.js';
import { $, $$, html, setView, genSalt, hashPassword, toCurrency, fmtDate, fileToDataURL, buildCompanySlug } from './utils.js';
import { addRoute, onRoute, navigate } from './routing.js';
import { renderMarketplace } from './market.js';
import { renderServices } from './service.js';
import { renderPOSRoute, bindGlobalCartClicks, getCartCount, replaceCartFromItems } from './pos.js';
import { showModal, html as h } from './utils.js';
import { renderProducts } from './product.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { renderDashboard } from './dashboard_clean.js';
import { renderCompanyPage, renderCompanyEdit, ensureUniqueCompanySlug } from './website.js';
import { renderBranches } from './branches.js';

// SESSION
const SESSION_KEY = 'cp.session.v1';
export let session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
function saveSession(){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); updateNav(); }
function clearSession(){ session = null; saveSession(); }

function updateNav(){
  const loginBtn = $('#loginBtn');
  const avatar = $('#navAvatar');
  const adminLinks = $('#adminLinks');
  if (session){
    loginBtn.textContent = 'Logout';
    loginBtn.onclick = ()=>{ clearSession(); navigate('#/login'); };
    avatar.textContent = (session.firstName?.[0]||'?') + (session.lastName?.[0]||'');
    avatar.title = 'Open profile';
    avatar.style.cursor = 'pointer';
    if (!avatar._profileBound){
      avatar._profileBound = true;
      avatar.addEventListener('click', ()=> openProfileModal());
    }
    // Show admin links only for non-customer roles
    if (session.role && session.role !== 'customer') adminLinks?.classList.remove('hidden');
    else adminLinks?.classList.add('hidden');
    // Hide company creation link for non-superadmin roles
    const createCo = document.getElementById('linkCreateCompany');
    if (createCo){
      if (session.role !== 'superadmin') createCo.style.display = 'none';
      else createCo.style.display = '';
    }
  } else {
    loginBtn.textContent = 'Login';
    loginBtn.onclick = ()=> navigate('#/login');
    avatar.textContent = '';
    adminLinks?.classList.add('hidden');
  }
  updateCartBadge();
}
updateNav();

// Bind Cart modal
bindCartModal();
// Bind global search in topbar
bindGlobalSearch();

function bindCartModal(){
  const btn = document.getElementById('cartBtn');
  if (!btn || btn._cartBound) return; btn._cartBound = true;
  btn.addEventListener('click', async (e)=>{
    e.preventDefault(); e.stopPropagation();
    // Open local Draft Orders modal instead of online Open Orders
    await openDraftsModal();
  });
}

// AUTH without Firebase Auth (demo)
async function registerUser(form){
  const username = form.username.value.trim().toLowerCase();
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  // Registration via public form always creates a Customer account
  const role = 'customer';
  const firstName = form.firstName.value; const lastName = form.lastName.value;
  // check existing (username and email)
  const existsU = await getDocs(query(collection(db,'users'), where('username','==',username), limit(1)));
  if (!existsU.empty) throw new Error('Username already taken');
  const existsE = await getDocs(query(collection(db,'users'), where('email','==',email), limit(1)));
  if (!existsE.empty) throw new Error('Email already registered');
  const salt = genSalt(); const passHash = await hashPassword(password, salt);
  const userDoc = {
    username, email, salt, passHash, role,
    firstName, lastName,
    createdAt: nowTs(),
    companyId: form.companyId?.value || '',
    profile: {
      middleName: '', mobile:'', birthday:'', address:'', maritalStatus:'', gender:'', facebook:''
    }
  };
  const refDoc = await addDoc(collection(db,'users'), userDoc);
  session = { uid: refDoc.id, username, email, role, firstName, lastName, companyId: userDoc.companyId };
  saveSession();
  return refDoc.id;
}

async function loginUser(form){
  const ident = (form.username?.value || form.identity?.value || '').trim().toLowerCase();
  const password = form.password.value;

  // Try username first, then email
  let snap = await getDocs(query(collection(db,'users'), where('username','==',ident), limit(1)));
  if (snap.empty) {
    snap = await getDocs(query(collection(db,'users'), where('email','==',ident), limit(1)));
  }
  if (snap.empty) throw new Error('Invalid credentials');

  const d = snap.docs[0];
  const u = d.data();

  // Migration path: if plaintext password exists and matches, convert to salt/passHash
  if ((!u.salt || !u.passHash) && typeof u.password === 'string'){
    if (u.password === password){
      const salt = genSalt();
      const passHash = await hashPassword(password, salt);
      try { await updateDoc(doc(db,'users', d.id), { salt, passHash, password: null }); } catch(e){ /* ignore */ }
      u.salt = salt; u.passHash = passHash;
    }
  }

  if (!u.salt || !u.passHash){
    throw new Error('Invalid credentials');
  }

  const hash = await hashPassword(password, u.salt);
  if (hash !== u.passHash) throw new Error('Invalid credentials');

  session = { uid: d.id, username: u.username, email: u.email, role: u.role, firstName: u.firstName, lastName: u.lastName, companyId: u.companyId||'' };
  saveSession();
}

function renderLogin(){
  const root = html`
    <div class="grid cols-2">
      <div class="card">
        <h3>Login</h3>
        <form id="loginForm" class="grid" style="gap:8px;">
          <input class="input" name="username" placeholder="Username or Email" required autocomplete="username" />
          <input class="input" type="password" name="password" placeholder="Password" required autocomplete="current-password" />
          <button class="btn" type="submit">Login</button>
        </form>
      </div>
      <div class="card">
        <h3>Register</h3>
        <form id="regForm" class="grid" style="gap:8px;">
          <div class="grid cols-2">
            <input class="input" name="firstName" placeholder="First name" required autocomplete="given-name" />
            <input class="input" name="lastName" placeholder="Last name" required autocomplete="family-name" />
          </div>
          <input class="input" name="username" placeholder="Username" required autocomplete="username" />
          <input class="input" type="email" name="email" placeholder="Email" required autocomplete="email" />
          <input class="input" type="password" name="password" placeholder="Password" required autocomplete="new-password" />
          
          <button class="btn" type="submit">Create account</button>
        </form>
      </div>
    </div>
  `;
  setView(root);
  $('#loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    try{ await loginUser(e.target); navigate('#/dashboard'); }
    catch(err){ alert(err.message); }
  });
  $('#regForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    try{ await registerUser(e.target); navigate('#/dashboard'); }
    catch(err){ alert(err.message); }
  });
}

// marketplace/services/products moved to modules

// inventory moved to inventory.js

// POS logic moved to pos.js; bind global add-to-cart clicks once
bindGlobalCartClicks();

function updateCartBadge(){
  const el = document.getElementById('cartBadge');
  if (!el) return;
  const c = getCartCount();
  el.textContent = String(c);
  el.style.display = c > 0 ? 'inline-block' : 'none';
}
window.addEventListener('cart:updated', updateCartBadge);
// initial badge update
updateCartBadge();

// Clear right sidebar on non-cart pages to avoid lingering POS cart.
// Keep it for POS, Marketplace, and Services.
window.addEventListener('route:changed', (e)=>{
  const p = (e.detail?.path || '').toLowerCase();
  const keep = p === '/admin/pos' || p === '/marketplace' || p === '/services' || p === '/admin/inventory' || p === '/customer';
  if (!keep){ const right = document.getElementById('rightSidebar'); if (right) right.innerHTML = ''; }
  // Ensure cart modal binding after route renders
  bindCartModal();
  // Ensure global search binding in case header was re-rendered
  bindGlobalSearch();
  // Highlight left nav active link
  try {
    const links = document.querySelectorAll('#leftSidebar a.nav-item');
    links.forEach(a=>{
      const href = (a.getAttribute('href')||'').replace(/^#/, '');
      a.classList.toggle('active', p === href || (href !== '/dashboard' && p.startsWith(href)));
    });
  } catch(_){ }
});

// Small cart summary card for customer landing
function renderCartSidebarCard(){
  const host = document.getElementById('rightSidebar');
  if (!host) return;
  host.innerHTML = `<div class='card' id='cartCard'>
    <h3 style='margin-top:0;'>Cart</h3>
    <div class='muted' id='cartCardSummary'>No items yet.</div>
    <div style='display:flex;gap:8px;margin-top:8px;'>
      <a class='btn' href='#/admin/pos'>Open POS</a>
      <button class='btn secondary' id='cartCardDrafts'>Drafts</button>
    </div>
  </div>`;
  function refresh(){
    let items=[]; try{ items=JSON.parse(localStorage.getItem('cp.cart.v1')||'[]'); }catch{}
    const total = items.reduce((a,i)=> a + (Number(i.price||0)*Number(i.qty||0)), 0);
    const count = items.reduce((a,i)=> a + (Number(i.qty||0)), 0);
    const el = document.getElementById('cartCardSummary');
    if (el) el.textContent = count ? `${count} item(s) • Total: ${toCurrency(total)}` : 'No items yet.';
  }
  refresh();
  window.addEventListener('cart:updated', refresh, { once:false });
  document.getElementById('cartCardDrafts')?.addEventListener('click', openDraftsModal);
}

// Guest dashboard: Services + Marketplace
async function renderGuestDashboard(){
  const root = html`
    <div class='grid' style='gap:12px;'>
      <div class='card'>
        <h3 style='margin:0;'>Services</h3>
        <div id='homeSvc' class='grid cols-3' style='margin-top:12px;'></div>
      </div>
      <div class='card'>
        <h3 style='margin:0;'>Marketplace</h3>
        <div id='homeMarket' class='grid cols-3' style='margin-top:12px;'></div>
      </div>
    </div>`;
  setView(root);
  await Promise.all([
    (async ()=>{
      try {
        const snap = await getDocs(query(collection(db,'products'), where('kind','==','service'), limit(12)));
        const docs = snap.docs.filter(d=> !d.data().deleted);
        const el = document.getElementById('homeSvc'); if (!el) return;
        el.innerHTML = docs.map(d=>{ const p=d.data(); return `<div class='card'>
          <div style='font-weight:600;'>${p.name||d.id}</div>
          <div class='muted'>${p.category||''}</div>
          <div style='margin-top:8px;'>${toCurrency(p.price||0)}</div>
          <a class='btn secondary' href='#/services'>View</a>
        </div>`; }).join('') || '<div class="muted">No services yet.</div>';
      } catch(_){ const el=document.getElementById('homeSvc'); if (el) el.innerHTML = '<div class="muted">No permission or no data.</div>'; }
    })(),
    (async ()=>{
      try {
        const snap = await getDocs(query(collection(db,'products'), where('kind','==','product'), limit(12)));
        const docs = snap.docs.filter(d=> !d.data().deleted);
        const el = document.getElementById('homeMarket'); if (!el) return;
        el.innerHTML = docs.map(d=>{ const p=d.data(); return `<div class='card'>
          <div style='font-weight:600;'>${p.name||d.id}</div>
          <div class='muted'>${p.brand||''}</div>
          <div style='margin-top:8px;'>${toCurrency(p.price||0)}</div>
          <a class='btn secondary' href='#/marketplace'>View</a>
        </div>`; }).join('') || '<div class="muted">No products yet.</div>';
      } catch(_){ const el=document.getElementById('homeMarket'); if (el) el.innerHTML = '<div class="muted">No permission or no data.</div>'; }
    })()
  ]);
}

// Customer home: Services + Marketplace with Cart card
async function renderCustomerHome(){
  await renderGuestDashboard();
  renderCartSidebarCard();
}

// ATTENDANCE
function renderAttendance(){
  if (!session) return navigate('#/login');
  const root = html`
    <div class='card'>
      <h3>Attendance</h3>
      <div class='grid cols-3'>
        <button class='btn' id='btnIn'>Check In</button>
        <button class='btn secondary' id='btnOut'>Check Out</button>
        <button class='btn secondary' id='btnToday'>Refresh</button>
      </div>
      <table class='table' style='margin-top:12px;'>
        <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th></tr></thead>
        <tbody id='attBody'></tbody>
      </table>
    </div>
  `;
  setView(root);
  $('#btnIn').addEventListener('click', async ()=>{
    await addDoc(collection(db,'attendance'), { uid: session.uid, companyId: session.companyId||'', action:'in', at: nowTs() });
    loadToday();
  });
  $('#btnOut').addEventListener('click', async ()=>{
    await addDoc(collection(db,'attendance'), { uid: session.uid, companyId: session.companyId||'', action:'out', at: nowTs() });
    loadToday();
  });
  $('#btnToday').addEventListener('click', loadToday);
  async function loadToday(){
    const snap = await getDocs(query(collection(db,'attendance'), where('uid','==',session.uid), limit(100)));
    const rows = [];
    const byDay = {};
    snap.docs.sort((a,b)=>{
      const ta = a.data().at?.seconds ? a.data().at.seconds*1000 : a.data().at || 0;
      const tb = b.data().at?.seconds ? b.data().at.seconds*1000 : b.data().at || 0;
      return tb - ta;
    }).forEach(d=>{
      const a = d.data();
      const day = (a.at?.seconds? new Date(a.at.seconds*1000): new Date(a.at)).toISOString().slice(0,10);
      byDay[day] = byDay[day] || { in:null, out:null };
      if (a.action==='in' && !byDay[day].in) byDay[day].in = a.at;
      if (a.action==='out') byDay[day].out = byDay[day].out || a.at;
    });
    Object.entries(byDay).forEach(([day, rec])=>{
      const inT = rec.in ? fmtDate(rec.in) : '-';
      const outT = rec.out ? fmtDate(rec.out) : '-';
      let hours = 0; if (rec.in && rec.out){ hours = (new Date(rec.out) - new Date(rec.in)) / 36e5; }
      rows.push(`<tr><td>${day}</td><td>${inT}</td><td>${outT}</td><td>${hours.toFixed(2)}</td></tr>`);
    });
    $('#attBody').innerHTML = rows.join('');
  }
  loadToday();
}

// PAYROLL
function renderPayroll(){
  if (!session) return navigate('#/login');
  const root = html`
    <div class='card'>
      <h3>Payroll (basic)</h3>
      <form id='payForm' class='grid cols-4'>
        <div>
          <label class='muted' style='font-size:12px;'>User</label>
          <select class='input' id='payUser'>
            <option value=''>Select user</option>
          </select>
        </div>
        <input class='input' type='date' name='start' />
        <input class='input' type='date' name='end' />
        <input class='input' type='number' step='0.01' name='rate' placeholder='Rate per hour' />
        <button class='btn' type='submit'>Compute</button>
      </form>
      <div id='payResult' style='margin-top:12px;'></div>
    </div>
  `;
  setView(root);
  // Load users into the Payroll select (prefer same company; superadmin sees all)
  (async ()=>{
    const sel = document.getElementById('payUser'); if (!sel) return;
    let qy;
    if (session.role === 'superadmin') qy = query(collection(db,'users'), limit(500));
    else if (session.companyId) qy = query(collection(db,'users'), where('companyId','==',session.companyId), limit(500));
    else qy = query(collection(db,'users'), limit(200));
    try {
      const userSnap = await getDocs(qy);
      const docs = userSnap.docs.sort((a,b)=>{
        const an = `${a.data().firstName||''} ${a.data().lastName||''}`.trim().toLowerCase();
        const bn = `${b.data().firstName||''} ${b.data().lastName||''}`.trim().toLowerCase();
        return an.localeCompare(bn);
      });
      sel.innerHTML = `<option value=''>Select user</option>` + docs.map(d=>{
        const u = d.data();
        const name = `${u.firstName||''} ${u.lastName||''}`.trim() || (u.username||d.id);
        const extra = u.username ? ` (${u.username})` : '';
        return `<option value='${d.id}'>${name}${extra}</option>`;
      }).join('');
      // preselect current session user if present in options
      if (session.uid && [...sel.options].some(o=>o.value===session.uid)) sel.value = session.uid;
    } catch(_){ /* ignore */ }
  })();
  document.getElementById('payForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    const uidX = document.getElementById('payUser')?.value || '';
    if (!uidX){ alert('Please select a user'); return; }
    const start = f.start.value ? new Date(f.start.value) : new Date(0);
    const end = f.end.value ? new Date(f.end.value) : new Date(8640000000000000);
    const rate = parseFloat(f.rate.value||'0') || 0;

    const attSnap = await getDocs(query(collection(db,'attendance'), where('uid','==',uidX)));
    let hours = 0; let lastIn = null;
    attSnap.docs.sort((a,b)=>{
      const ta = a.data().at?.seconds ? a.data().at.seconds*1000 : a.data().at || 0;
      const tb = b.data().at?.seconds ? b.data().at.seconds*1000 : b.data().at || 0;
      return ta - tb; // ascending for pairing
    }).forEach(d=>{
      const a = d.data();
      const tval = a.at?.seconds ? a.at.seconds*1000 : a.at;
      const t = new Date(tval);
      if (t < start || t > end) return;
      if (a.action==='in') lastIn = t;
      if (a.action==='out' && lastIn){ hours += (t - lastIn)/36e5; lastIn = null; }
    });
    const gross = hours * rate;
    document.getElementById('payResult').innerHTML = `<div class='card'>Hours: ${hours.toFixed(2)} | Rate: ${toCurrency(rate)} | Gross: <strong>${toCurrency(gross)}</strong></div>`;
  });
}
function renderUsers(){
  if (!session) return navigate('#/login');
  const root = html`
    <div class='grid cols-2'>
      <div class='card'>
        <h3>Create User</h3>
        <form id='uForm' class='grid' style='gap:8px;'>
          <input class='input' name='firstName' placeholder='First name' required />
          <input class='input' name='lastName' placeholder='Last name' required />
          <input class='input' name='username' placeholder='Username' required />
          <input class='input' type='email' name='email' placeholder='Email' required />
          <input class='input' type='password' name='password' placeholder='Temp password' required />
          <div>
            <label class='muted' style='font-size:12px;'>Company</label>
            <select class='input' id='uCompanyId'>
              <option value=''>Select company</option>
            </select>
          </div>
          <div>
            <label class='muted' style='font-size:12px;'>Branch (optional)</label>
            <select class='input' id='uBranchId'>
              <option value=''>All / None</option>
            </select>
          </div>
          <div>
            <label class='muted' style='font-size:12px;'>Role</label>
            <select class='input' id='uRole'></select>
          </div>
          <button class='btn' type='submit'>Create</button>
        </form>
      </div>
      <div class='card'>
        <h3>Users</h3>
        <table class='table'><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th class='hide-sm'>Company</th></tr></thead><tbody id='uBody'></tbody></table>
      </div>
    </div>
  `;
  setView(root);
  // Load companies into select
  async function loadBranchesForCompany(cid){
    try{
      const bsel = document.getElementById('uBranchId'); if (!bsel) return;
      if (!cid){ bsel.innerHTML = `<option value=''>All / None</option>`; return; }
      const bs = await getDocs(query(collection(db,'branches'), where('companyId','==',cid), limit(500)));
      bsel.innerHTML = `<option value=''>All / None</option>` + bs.docs.map(d=>`<option value='${d.id}'>${d.data().name||d.id}</option>`).join('');
    } catch(_){ /* ignore */ }
  }
  (async ()=>{
    try {
      const sel = document.getElementById('uCompanyId');
      if (!sel) return;
      const snap = await getDocs(query(collection(db,'companies'), limit(500)));
      const docs = snap.docs.filter(d=> !d.data().deleted).sort((a,b)=>{
        const na = (a.data().name||'').toLowerCase(); const nb = (b.data().name||'').toLowerCase();
        return na.localeCompare(nb);
      });
      sel.innerHTML = `<option value=''>Select company</option>` + docs.map(d=>`<option value='${d.id}'>${d.data().name||d.id}</option>`).join('');
      if (session.companyId){ sel.value = session.companyId; }
      // Non-superadmins are constrained to their own company
      if (session.role !== 'superadmin'){
        sel.disabled = true; // enforce same company
        await loadBranchesForCompany(session.companyId||'');
      } else {
        await loadBranchesForCompany(sel.value||'');
        sel.addEventListener('change', ()=> loadBranchesForCompany(sel.value||''));
      }
    } catch(_){}
  })();
  // Populate roles based on current session's role capabilities
  (function(){
    const roleSel = document.getElementById('uRole'); if (!roleSel) return;
    let roles = [];
    if (session.role === 'superadmin'){
      roles = [
        {v:'customer', t:'Customer'},
        {v:'staff', t:'Staff'},
        {v:'admin-supervisor', t:'Admin Supervisor'},
        {v:'admin-manager', t:'Admin Manager'},
        {v:'admin-president', t:'Admin President'},
        {v:'admin-owner', t:'Admin Owner'}
      ];
    } else if (session.role === 'admin-owner'){
      // Owner can create staff/supervisor/manager/president within the same company; cannot create owner
      roles = [
        {v:'customer', t:'Customer'},
        {v:'staff', t:'Staff'},
        {v:'admin-supervisor', t:'Admin Supervisor'},
        {v:'admin-manager', t:'Admin Manager'},
        {v:'admin-president', t:'Admin President'}
      ];
    } else if (session.role === 'admin-president'){
      // President can create staff/supervisor/manager; cannot create president/owner
      roles = [
        {v:'customer', t:'Customer'},
        {v:'staff', t:'Staff'},
        {v:'admin-supervisor', t:'Admin Supervisor'},
        {v:'admin-manager', t:'Admin Manager'}
      ];
    } else if (session.role === 'admin-manager'){
      // Manager can create staff/supervisor; cannot create manager/president/owner
      roles = [
        {v:'customer', t:'Customer'},
        {v:'staff', t:'Staff'},
        {v:'admin-supervisor', t:'Admin Supervisor'}
      ];
    } else if (session.role === 'admin-supervisor'){
      // Supervisor can create staff; cannot create manager/president/owner
      roles = [
        {v:'customer', t:'Customer'},
        {v:'staff', t:'Staff'}
      ];
    } else if (session.role === 'staff'){
      // Staff can only create customers
      roles = [
        {v:'customer', t:'Customer'}
      ];
    } else {
      // Default fallback: customers only
      roles = [ {v:'customer', t:'Customer'} ];
    }
    roleSel.innerHTML = roles.map(r=>`<option value='${r.v}'>${r.t}</option>`).join('');
  })();
  $('#uForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target; const salt = genSalt(); const passHash = await hashPassword(f.password.value, salt);
  const chosenCompanyId = document.getElementById('uCompanyId')?.value || '';
    const companyId = chosenCompanyId || session.companyId || '';
  const branchId = document.getElementById('uBranchId')?.value || '';
    const roleSel = document.getElementById('uRole');
    const role = roleSel?.value || 'customer';
    // Enforce capability: admin-owner cannot create admin-owner; non-superadmin cannot elevate beyond allowed list
    const allowedByRole = (function(){
      if (session.role === 'superadmin') return new Set(['customer','staff','admin-supervisor','admin-manager','admin-president','admin-owner']);
      if (session.role === 'admin-owner') return new Set(['customer','staff','admin-supervisor','admin-manager','admin-president']);
      if (session.role === 'admin-president') return new Set(['customer','staff','admin-supervisor','admin-manager']);
      if (session.role === 'admin-manager') return new Set(['customer','staff','admin-supervisor']);
      if (session.role === 'admin-supervisor') return new Set(['customer','staff']);
      if (session.role === 'staff') return new Set(['customer']);
      return new Set(['customer']);
    })();
    if (!allowedByRole.has(role)){
      alert('You do not have permission to create users with role: '+role);
      return;
    }
    await addDoc(collection(db,'users'), { firstName:f.firstName.value, lastName:f.lastName.value, username:f.username.value.trim().toLowerCase(), email:f.email.value.trim().toLowerCase(), role, salt, passHash, companyId, branchId, createdAt: nowTs() });
    f.reset(); loadUsers();
  });
  loadUsers();
  async function loadUsers(){
    const snap = await getDocs(session.companyId ? query(collection(db,'users'), where('companyId','==',session.companyId)) : query(collection(db,'users'), limit(100)));
    // Attempt to map company names for display (best-effort)
    let companyNames = new Map();
    try {
      const cs = await getDocs(query(collection(db,'companies'), limit(500)));
      companyNames = new Map(cs.docs.map(cd=> [cd.id, cd.data().name||cd.id]));
    } catch(_){ }
    const canEditRoles = ['superadmin','admin-owner','admin-president'].includes(session.role);
    const allowedByRole = (function(){
      if (session.role === 'superadmin') return new Set(['customer','staff','admin-supervisor','admin-manager','admin-president','admin-owner']);
      if (session.role === 'admin-owner') return new Set(['customer','staff','admin-supervisor','admin-manager','admin-president']);
      if (session.role === 'admin-president') return new Set(['customer','staff','admin-supervisor','admin-manager']);
      return new Set();
    })();
    $('#uBody').innerHTML = snap.docs.map(d=>{ const u=d.data(); const co = companyNames.get(u.companyId)||u.companyId||''; const roleCell = canEditRoles && (session.role==='superadmin' || u.companyId===session.companyId) ? `<select data-role-for='${d.id}' class='input small'>${[...allowedByRole].map(r=>`<option value='${r}' ${u.role===r?'selected':''}>${r}</option>`).join('')}</select>` : u.role; return `<tr data-user='${d.id}' data-cid='${u.companyId||''}'><td>${u.firstName} ${u.lastName}</td><td>${u.username||''}</td><td>${u.email||''}</td><td>${roleCell}</td><td class='hide-sm'>${co}</td></tr>`; }).join('');
    // Inline role change handler
    document.getElementById('uBody')?.addEventListener('change', async (e)=>{
      const uid = e.target.getAttribute?.('data-role-for');
      if (!uid) return;
      const newRole = e.target.value;
      if (!allowedByRole.has(newRole)){ alert('Not allowed to set role: '+newRole); e.preventDefault(); return; }
      // Ensure same-company unless superadmin
      const row = e.target.closest('tr'); const cid = row?.getAttribute('data-cid');
      if (session.role!=='superadmin' && cid !== (session.companyId||'')){ alert('You can only change roles within your company.'); return; }
      try { await updateDoc(doc(db,'users', uid), { role: newRole }); e.target.blur(); }
      catch(_){ alert('Failed to update role. Check permissions.'); }
    }, { once: true });
  }
}

// ADMIN WEBSITE EDITOR shortcut
function renderWebsiteEditor(){
  if (!session?.companyId) {
    // If no company is linked to this account, show the companies list so the user can pick one.
    return navigate('#/companies');
  }
  return renderCompanyPage(session.companyId, session);
}

// CREATE COMPANY (superadmin)
function renderCreateCompany(){
  if (!session) return navigate('#/login');
  if (session.role !== 'superadmin'){
    const root = html`<div class='card'>You do not have permission to create a company. Please contact a superadmin.</div>`;
    setView(root);
    return;
  }
  const root = html`
    <div class='card'>
      <h3>Create Company</h3>
      <form id='coForm' class='grid' style='gap:8px;'>
        <input class='input' name='name' placeholder='Company Name' required />
        <input class='input' name='ownerName' placeholder="Company Owner's Name" required />
        <input class='input' name='email' placeholder='Email' />
        <input class='input' name='phone' placeholder='Phone' />
        <select class='input' name='offerType' required>
          <option value='marketplace'>Marketplace (sells products)</option>
          <option value='service'>Service (offers services)</option>
        </select>
        <textarea class='input' name='description' placeholder='Description'></textarea>
        <div class='grid cols-3'>
          <div>
            <label style='font-size:12px;color:#a1a1a6;'>Company Logo</label>
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
        <button class='btn' type='submit'>Create</button>
      </form>
    </div>
    <div class='card' style='margin-top:16px;'>
      <h3 style='margin:0;'>Companies</h3>
      <div class='grid cols-3' id='coListCreate' style='margin-top:12px;'></div>
    </div>
  `;
  setView(root);
  $('#coForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    // create base doc first
  const base = { name:f.name.value, ownerName: f.ownerName.value, email:f.email.value, phone:f.phone.value, offerType: f.offerType.value, description:f.description.value, themeColor:'#1877f2', createdAt: nowTs(), ownerUid: session.uid };
    const docRef = await addDoc(collection(db,'companies'), base);

    // upload optional files
    const updates = {};
    const logo = f.logoFile.files?.[0];
    const permit = f.permitFile.files?.[0];
    const dti = f.dtiFile.files?.[0];
    try {
      if (logo){
        const dataUrl = await fileToDataURL(logo);
        const r = ref(storage, `companies/${docRef.id}/logo_${Date.now()}.jpg`);
        await uploadString(r, dataUrl, 'data_url');
        updates.logoUrl = await getDownloadURL(r);
      }
      if (permit){
        const dataUrl = await fileToDataURL(permit);
        const r = ref(storage, `companies/${docRef.id}/business_permit_${Date.now()}.jpg`);
        await uploadString(r, dataUrl, 'data_url');
        updates.businessPermitUrl = await getDownloadURL(r);
      }
      if (dti){
        const dataUrl = await fileToDataURL(dti);
        const r = ref(storage, `companies/${docRef.id}/dti_${Date.now()}.jpg`);
        await uploadString(r, dataUrl, 'data_url');
        updates.dtiUrl = await getDownloadURL(r);
      }
      if (Object.keys(updates).length){ await updateDoc(doc(db,'companies', docRef.id), updates); }
    } catch(err){ console.error('Upload failed', err); }
    alert('Company created: '+docRef.id);
    try { f.reset(); } catch(_){}
    await loadCompaniesForCreate();
  });

  async function loadCompaniesForCreate(){
    let qy;
    if (session.role === 'superadmin'){
      qy = query(collection(db,'companies'));
    } else if (session.companyId){
      qy = query(collection(db,'companies'), where('__name__','==', session.companyId));
    } else {
      qy = query(collection(db,'companies'), where('ownerUid','==', session.uid));
    }
    const snap = await getDocs(qy);
    const docs = snap.docs.sort((a,b)=>{
      const da = a.data().createdAt?.seconds ? a.data().createdAt.seconds*1000 : a.data().createdAt || 0;
      const dbb = b.data().createdAt?.seconds ? b.data().createdAt.seconds*1000 : b.data().createdAt || 0;
      return dbb - da;
    }).filter(d=> !d.data().deleted);
    const el = document.getElementById('coListCreate');
    if (!el) return;
    el.innerHTML = docs.map(d=>{
      const c = d.data();
      const cover = c.coverUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop';
      const canDelete = session.role==='superadmin' || c.ownerUid===session.uid;
      const slug = buildCompanySlug(c.name, d.id) || d.id;
      return `<div class='card'>
        <img src='${cover}' style='width:100%;height:120px;object-fit:cover;border-radius:8px;' alt='cover'/>
        <div style='margin-top:8px;'>
          <div style='display:flex;align-items:center;gap:8px;'>
            ${c.logoUrl ? `<img src='${c.logoUrl}' style='width:28px;height:28px;border-radius:6px;object-fit:cover;' alt='logo'/>` : ''}
            <div style='font-weight:600;'>${c.name||'Untitled'}</div>
          </div>
          ${c.ownerName ? `<div style='color:#a1a1a6;font-size:12px;margin:6px 0;'>Owner: ${c.ownerName}</div>` : ''}
          ${c.offerType ? `<div style='margin:6px 0;'><span class='badge ${c.offerType==='service'?'success':'warning'}'>${c.offerType}</span></div>` : ''}
          <div style='display:flex;gap:8px;'>
            <a class='btn' href='#/company/${slug}'>Update</a>
            ${canDelete ? `<button class='btn danger' data-del='${d.id}'>Delete</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="card">No companies.</div>';

    el.addEventListener('click', async (e)=>{
      const id = e.target.getAttribute('data-del');
      if (id){
        if (!confirm('Delete this company? This action cannot be undone.')) return;
        try {
          await updateDoc(doc(db,'companies', id), { deleted: true, deletedAt: nowTs(), deletedBy: session.uid });
          await loadCompaniesForCreate();
        } catch(err){
          alert('Failed to delete. Check Firestore rules.');
          console.error(err);
        }
      }
    });
  }
  loadCompaniesForCreate();
}

// COMPANIES LIST
async function renderCompaniesList(){
  const root = html`
    <div class='card'>
      <h3 style='margin:0;'>Companies</h3>
      <div class='grid cols-3' id='coList' style='margin-top:12px;'></div>
    </div>
  `;
  setView(root);
  const snap = await getDocs(query(collection(db,'companies')));
  const docs = snap.docs.sort((a,b)=>{ 
    const da = a.data().createdAt?.seconds ? a.data().createdAt.seconds*1000 : a.data().createdAt || 0;
    const dbb = b.data().createdAt?.seconds ? b.data().createdAt.seconds*1000 : b.data().createdAt || 0;
    return dbb - da;
  }).filter(d=> !d.data().deleted);
  $('#coList').innerHTML = docs.map(d=>{
    const c = d.data();
    const cover = c.coverUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop';
    const slug = buildCompanySlug(c.name, d.id) || d.id;
    return `<div class='card' data-open='${slug}' data-id='${d.id}' style='cursor:pointer;'>
      <img src='${cover}' style='width:100%;height:120px;object-fit:cover;border-radius:8px;' alt='cover'/>
      <div style='margin-top:8px;'>
        <div style='display:flex;align-items:center;gap:8px;'>
          ${c.logoUrl ? `<img src='${c.logoUrl}' style='width:28px;height:28px;border-radius:6px;object-fit:cover;' alt='logo'/>` : ''}
          <div style='font-weight:600;'>${c.name||'Untitled'}</div>
        </div>
        <div style='color:#a1a1a6;font-size:13px; margin:6px 0;'>${(c.description||'').slice(0,120)}</div>
        ${c.offerType ? `<div style='margin:6px 0;'><span class='badge ${c.offerType==='service'?'success':'warning'}'>${c.offerType}</span></div>` : ''}
        ${c.ownerName ? `<div style='color:#a1a1a6;font-size:12px;margin-bottom:6px;'>Owner: ${c.ownerName}</div>` : ''}
        <div style='display:flex;gap:8px;'>
          <a class='btn' href='#/company/${slug}'>Open</a>
          ${session?.role==='superadmin' ? `<button class='btn secondary' data-manage='${d.id}' data-slug='${slug}'>Manage</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="card">No companies yet.</div>';

  // Optional manage click
  document.getElementById('coList')?.addEventListener('click', (e)=>{
    const manageId = e.target.getAttribute('data-manage');
    const manageSlug = e.target.getAttribute('data-slug');
    if (manageId){
      navigate(`#/company/${manageSlug || manageId}`);
      return;
    }
    const card = e.target.closest('[data-open]');
    if (card){ navigate(`#/company/${card.getAttribute('data-open')}`); }
  });
}

// GLOBAL SEARCH
function bindGlobalSearch(){
  const input = document.getElementById('globalSearch');
  if (!input || input._bound) return; input._bound = true;
  input.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){
      e.preventDefault();
      const q = (input.value || '').trim();
      navigate(q ? `#/search?q=${encodeURIComponent(q)}` : '#/search');
    }
  });
}

async function renderSearchPage(ctx){
  const q = (ctx?.query?.q || '').trim();
  const root = html`
    <div class='grid' style='gap:12px;'>
      <div class='card'>
        <h3 style='margin:0;'>Search${q? `: “${q}”`: ''}</h3>
        <div class='muted' style='margin-top:6px;'>Showing results from Services, Marketplace, and Companies.</div>
      </div>
      <div class='card'>
        <h3 style='margin-top:0;'>Services</h3>
        <div id='searchServices' class='grid cols-3' style='margin-top:12px;'></div>
      </div>
      <div class='card'>
        <h3 style='margin-top:0;'>Marketplace</h3>
        <div id='searchProducts' class='grid cols-3' style='margin-top:12px;'></div>
      </div>
      <div class='card'>
        <h3 style='margin-top:0;'>Companies</h3>
        <div id='searchCompanies' class='grid cols-3' style='margin-top:12px;'></div>
      </div>
    </div>`;
  setView(root);
  // Prefill the top search box if present
  try { const input = document.getElementById('globalSearch'); if (input) input.value = q; } catch(_){ }

  const needle = q.toLowerCase();

  // Load products/services (client-side filter)
  try {
    const snap = await getDocs(query(collection(db,'products'), limit(300)));
    const docs = snap.docs.filter(d=> !d.data().deleted);
    const matches = (r)=>{
      if (!needle) return true;
      const p = r || {}; const s = `${p.name||''} ${p.brand||''} ${p.category||''}`.toLowerCase();
      return s.includes(needle);
    };
    const services = docs.filter(d=> (d.data().kind||'')==='service' && matches(d.data())).slice(0,24);
    const products = docs.filter(d=> (d.data().kind||'')==='product' && matches(d.data())).slice(0,24);
    const svcEl = document.getElementById('searchServices');
    const proEl = document.getElementById('searchProducts');
    if (svcEl){ svcEl.innerHTML = services.map(d=>{ const p=d.data(); return `<div class='card'>
      <div style='font-weight:600; margin-bottom:4px;'>${p.name||d.id}</div>
      <div class='muted' style='margin-bottom:6px;'>${p.category||''}</div>
      <div style='margin:8px 0; font-weight:600;'>${toCurrency(p.price||0)}</div>
      <div><a class='btn secondary' href='#/services'>View</a></div>
    </div>`; }).join('') || `<div class='muted'>No matching services.</div>`; }
    if (proEl){ proEl.innerHTML = products.map(d=>{ const p=d.data(); return `<div class='card'>
      <div style='font-weight:600; margin-bottom:4px;'>${p.name||d.id}</div>
      <div class='muted' style='margin-bottom:6px;'>${p.brand||''}</div>
      <div style='margin:8px 0; font-weight:600;'>${toCurrency(p.price||0)}</div>
      <div><button class='btn' data-add-to-cart data-id='${d.id}' data-name='${(p.name||'')}' data-price='${p.price||0}'>Add to Cart</button></div>
    </div>`; }).join('') || `<div class='muted'>No matching products.</div>`; }
  } catch(_){ }

  // Load companies
  try {
    const cs = await getDocs(query(collection(db,'companies'), limit(300)));
    const docs = cs.docs.filter(d=> !d.data().deleted);
    const matches = (c)=>{
      if (!needle) return true;
      const s = `${c.name||''} ${c.description||''} ${c.ownerName||''}`.toLowerCase();
      return s.includes(needle);
    };
    const results = docs.filter(d=> matches(d.data())).slice(0,24);
    const el = document.getElementById('searchCompanies');
    if (el){ el.innerHTML = results.map(d=>{ const c=d.data(); const cover=c.coverUrl||'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop'; const slug=buildCompanySlug(c.name, d.id)||d.id; return `<div class='card'>
      <div style='display:flex;align-items:center;gap:8px;'>
        ${c.logoUrl ? `<img src='${c.logoUrl}' style='width:28px;height:28px;border-radius:6px;object-fit:cover;' alt='logo'/>` : ''}
        <div style='font-weight:600;'>${c.name||d.id}</div>
      </div>
      <div class='muted' style='margin-top:6px;'>${(c.description||'').slice(0,100)}</div>
      <div style='margin-top:8px;'><a class='btn secondary' href='#/company/${slug}'>Open</a></div>
    </div>`; }).join('') || `<div class='muted'>No matching companies.</div>`; }
  } catch(_){ }
}
// ROUTES
addRoute('/login', ()=> renderLogin());
addRoute('/dashboard', async ()=> {
  if (!session) return renderGuestDashboard();
  if (session.role === 'admin-owner') { const m = await import('./owner.js'); return m.renderOwnerDashboard ? m.renderOwnerDashboard(session) : setView(html`<div class='card'>Owner dashboard module is not available.</div>`); }
  if (session.role === 'admin-president') { const m = await import('./president.js'); return m.renderPresidentDashboard ? m.renderPresidentDashboard(session) : setView(html`<div class='card'>President dashboard module is not available.</div>`); }
  if (session.role === 'admin-manager') { const m = await import('./manager.js'); return m.renderManagerDashboard ? m.renderManagerDashboard(session) : setView(html`<div class='card'>Manager dashboard module is not available.</div>`); }
  if (session.role === 'admin-supervisor') { const m = await import('./supervisor.js'); return m.renderSupervisorDashboard ? m.renderSupervisorDashboard(session) : setView(html`<div class='card'>Supervisor dashboard module is not available.</div>`); }
  if (session.role === 'staff') { const m = await import('./staff.js'); return m.renderStaffDashboard ? m.renderStaffDashboard(session) : setView(html`<div class='card'>Staff dashboard module is not available.</div>`); }
  // End-user default view is Companies
  if (session.role === 'customer') { return navigate('#/customer'); }
  if (session.role === 'superadmin') { return navigate('#/superadmin'); }
  return renderDashboard(session);
});
addRoute('/admin/president', async ()=> { const m = await import('./president.js'); return m.renderPresidentDashboard ? m.renderPresidentDashboard(session) : setView(html`<div class='card'>President dashboard module is not available.</div>`); });
addRoute('/admin/manager', async ()=> { const m = await import('./manager.js'); return m.renderManagerDashboard ? m.renderManagerDashboard(session) : setView(html`<div class='card'>Manager dashboard module is not available.</div>`); });
addRoute('/admin/supervisor', async ()=> { const m = await import('./supervisor.js'); return m.renderSupervisorDashboard ? m.renderSupervisorDashboard(session) : setView(html`<div class='card'>Supervisor dashboard module is not available.</div>`); });
addRoute('/admin/staff', async ()=> { const m = await import('./staff.js'); return m.renderStaffDashboard ? m.renderStaffDashboard(session) : setView(html`<div class='card'>Staff dashboard module is not available.</div>`); });
addRoute('/customer', async ()=> { return renderCustomerHome(); });
// Role-specific dashboard routes
addRoute('/staff', async ()=> { const m = await import('./staff.js'); return m.renderStaffDashboard ? m.renderStaffDashboard(session) : setView(html`<div class='card'>Staff dashboard module is not available.</div>`); });
addRoute('/supervisor', async ()=> { const m = await import('./supervisor.js'); return m.renderSupervisorDashboard ? m.renderSupervisorDashboard(session) : setView(html`<div class='card'>Supervisor dashboard module is not available.</div>`); });
addRoute('/manager', async ()=> { const m = await import('./manager.js'); return m.renderManagerDashboard ? m.renderManagerDashboard(session) : setView(html`<div class='card'>Manager dashboard module is not available.</div>`); });
addRoute('/president', async ()=> { const m = await import('./president.js'); return m.renderPresidentDashboard ? m.renderPresidentDashboard(session) : setView(html`<div class='card'>President dashboard module is not available.</div>`); });
addRoute('/owner', async ()=> { const m = await import('./owner.js'); return m.renderOwnerDashboard ? m.renderOwnerDashboard(session) : setView(html`<div class='card'>Owner dashboard module is not available.</div>`); });
addRoute('/superadmin', ()=> renderDashboard(session));
addRoute('/admin/owner', async ()=> { const m = await import('./owner.js'); return m.renderOwnerDashboard(session); });
addRoute('/marketplace', ()=> renderMarketplace());
addRoute('/services', ()=> renderServices());
// Route alias: /service -> /services
addRoute('/service', ()=> navigate('#/services'));
addRoute('/search', (ctx)=> renderSearchPage(ctx));
addRoute('/admin/products', (ctx)=> renderProducts(ctx));
addRoute('/admin/inventory', async (ctx)=> {
  try { const m = await import('./inventory.js'); return m.renderInventory(ctx); }
  catch(e){ setView(html`<div class='card'>Inventory module is not available.</div>`); }
});
addRoute('/admin/pos', ()=> renderPOSRoute(session));
addRoute('/admin/attendance', ()=> renderAttendance());
addRoute('/admin/payroll', ()=> renderPayroll());
addRoute('/admin/users', ()=> renderUsers());
addRoute('/admin/branches', ()=> renderBranches(session));
// Backwards-compatible alias: allow '#/branches' to still work
addRoute('/branches', ()=> navigate('#/admin/branches'));
addRoute('/admin/website', ()=> renderWebsiteEditor());
addRoute('/admin/sales', async ()=> {
  try { const m = await import('./sales.js'); return m.renderSales(session); }
  catch(e){ setView(html`<div class='card'>Sales module is not available.</div>`); }
});
addRoute('/company/new', ()=> renderCreateCompany());
addRoute('/company/:id', ({params})=> renderCompanyPage(params.id, session));
addRoute('/company/:id/edit', ({params})=> renderCompanyEdit(params.id, session));
addRoute('/companies', ()=> renderCompaniesList());

// Initialize route on load (in case scripts loaded after hashchange)
onRoute();

async function openProfileModal(){
  if (!session) { navigate('#/login'); return; }
  // Fetch latest user doc
  let userData = {};
  try {
    const ds = await getDoc(doc(db,'users', session.uid));
    if (ds.exists()) userData = ds.data();
  } catch(_){ }
  const content = `
    <form id='profForm' class='grid' style='gap:8px;'>
      <div class='grid cols-2'>
        <input class='input' name='firstName' placeholder='First name' value='${userData.firstName||''}' />
        <input class='input' name='lastName' placeholder='Last name' value='${userData.lastName||''}' />
      </div>
      <div class='grid cols-2'>
        <input class='input' type='email' name='email' placeholder='Email' value='${userData.email||''}' />
        <input class='input' name='mobile' placeholder='Mobile' value='${userData.profile?.mobile||''}' />
      </div>
      <div class='grid cols-2'>
        <input class='input' type='date' name='birthday' value='${userData.profile?.birthday||''}' />
        <input class='input' name='facebook' placeholder='Facebook URL' value='${userData.profile?.facebook||''}' />
      </div>
      <input class='input' name='address' placeholder='Home address' value='${userData.profile?.address||''}' />
      <div class='grid cols-2'>
        <select class='input' name='maritalStatus'>
          ${['','Single','Married','Separated','Widowed'].map(v=>`<option value='${v}' ${userData.profile?.maritalStatus===v? 'selected':''}>${v||'Marital status'}</option>`).join('')}
        </select>
        <select class='input' name='gender'>
          ${['','Male','Female','Other'].map(v=>`<option value='${v}' ${userData.profile?.gender===v? 'selected':''}>${v||'Gender'}</option>`).join('')}
        </select>
      </div>
      <div style='display:flex;gap:8px;justify-content:flex-end;'>
        <button class='btn' type='submit'>Save</button>
      </div>
    </form>`;
  const { el, close } = showModal({ title: 'My Profile', content });
  el.addEventListener('submit', async (e)=>{
    if (e.target.id !== 'profForm') return;
    e.preventDefault();
    const f = e.target;
    try {
      const upd = {
        firstName: f.firstName.value,
        lastName: f.lastName.value,
        email: f.email.value,
        profile: {
          ...(userData.profile||{}),
          mobile: f.mobile.value,
          birthday: f.birthday.value,
          address: f.address.value,
          maritalStatus: f.maritalStatus.value,
          gender: f.gender.value,
          facebook: f.facebook.value
        }
      };
      await updateDoc(doc(db,'users', session.uid), upd);
      // update session cache and nav initials
      session.firstName = upd.firstName; session.lastName = upd.lastName; session.email = upd.email;
      saveSession(); updateNav();
      close();
    } catch(err){
      alert('Failed to save profile');
      console.error(err);
    }
  });
}

async function openDraftsModal(){
  const DRAFTS_KEY = 'cp.openOrdersDrafts.v1';
  let drafts = [];
  try { drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch(_) { drafts = []; }
  const body = `<div>
    ${drafts.length ? drafts.map(d=>{
      const itemsCount = (d.items||[]).reduce((a,i)=> a + (i.qty||0), 0);
      const when = d.at ? new Date(d.at).toLocaleString() : '';
      return `<div class='card' style='margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;'>
        <div>
          <div style='font-weight:600;'>Draft ${String(d.id||'').slice(0,12)}</div>
          <div class='muted'>Items: ${itemsCount} • Saved: ${when}</div>
        </div>
        <div style='display:flex;gap:8px;'>
          <button class='btn' data-load-draft='${d.id}'>Load</button>
          <button class='btn secondary' data-delete-draft='${d.id}'>Delete</button>
        </div>
      </div>`; }).join('') : `<div class='card'>No local drafts.</div>`}
  </div>`;
  const { el, close } = showModal({ title: 'Draft Orders', content: body });
  el.addEventListener('click', (e)=>{
    const loadId = e.target.getAttribute?.('data-load-draft');
    const delId = e.target.getAttribute?.('data-delete-draft');
    if (loadId){
      // Load draft into POS cart
      try {
        const idx = drafts.findIndex(x=> String(x.id) === String(loadId));
        if (idx>=0){
          const items = drafts[idx].items || [];
          replaceCartFromItems(items);
          close();
          navigate('#/admin/pos');
        }
      } catch(_){ }
    }
    if (delId){
      try {
        drafts = drafts.filter(x=> String(x.id) !== String(delId));
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
        e.target.closest('.card')?.remove();
      } catch(_){ }
    }
  });
}

async function openOrdersModal(){
  if (!session) { navigate('#/login'); return; }

  const COMPANY_PREF_KEY = 'cp.sales.companyId.v1';

  async function showCompanyPicker(message){
    // Minimal picker that saves selection then reloads modal
    const snap = await getDocs(query(collection(db,'companies'), limit(500)));
    const docs = snap.docs.filter(d=> !d.data().deleted).sort((a,b)=> (a.data().name||'').localeCompare(b.data().name||''));
    const opts = docs.map(d=>`<option value="${d.id}">${d.data().name||d.id}</option>`).join('');
    const { el, close } = showModal({
      title: 'Open Orders',
      content: `<div class='card'>
        <div style='margin-bottom:8px;'>${message||'Select a company to view its open orders.'}</div>
        <div class='grid cols-3' style='gap:8px;align-items:end;'>
          <div style='grid-column: span 2;'>
            <label class='muted' style='font-size:12px;'>Company</label>
            <select id='openOrdersCompany' class='input'>${opts}</select>
          </div>
          <div>
            <button class='btn' id='openOrdersContinue'>Continue</button>
          </div>
        </div>
      </div>`
    });
    el.addEventListener('click', async (e)=>{
      if (e.target.id === 'openOrdersContinue'){
        const val = el.querySelector('#openOrdersCompany')?.value || '';
        if (!val) return;
        try { localStorage.setItem(COMPANY_PREF_KEY, val); } catch(_){ }
        close();
        await openOrdersModal();
      }
    });
  }

  // Determine company scope
  const selectedCompanyId = session.companyId || (localStorage.getItem(COMPANY_PREF_KEY) || '');
  if (!session.companyId && session.role === 'superadmin' && !selectedCompanyId){
    // Ask superadmin to pick a company to satisfy Firestore rules that likely require company scoping
    await showCompanyPicker("You're a superadmin. Pick a company to view its open orders.");
    return;
  }

  // Load open orders (scoped by company if available)
  let rows = [];
  try {
    let parts = [collection(db,'orders'), where('status','==','open')];
    if (selectedCompanyId){ parts.push(where('companyId','==', selectedCompanyId)); }
    parts.push(limit(200));
    const qy = query.apply(null, parts);
    const snap = await getDocs(qy);
    rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=>{ const ta=a.createdAt?.seconds? a.createdAt.seconds*1000:a.createdAt||0; const tb=b.createdAt?.seconds? b.createdAt.seconds*1000:b.createdAt||0; return tb - ta; });
  } catch(err){
    // Fallback to user-owned scope, include companyId if known
    try {
      const fallbackUid = session?.uid || '';
      let parts2 = [collection(db,'orders'), where('status','==','open'), where('uid','==', fallbackUid)];
      if (selectedCompanyId) parts2.push(where('companyId','==', selectedCompanyId));
      parts2.push(limit(200));
      const snap2 = await getDocs(query.apply(null, parts2));
      rows = snap2.docs.map(d=>({ id:d.id, ...d.data() }))
        .sort((a,b)=>{ const ta=a.createdAt?.seconds? a.createdAt.seconds*1000:a.createdAt||0; const tb=b.createdAt?.seconds? b.createdAt.seconds*1000:b.createdAt||0; return tb - ta; });
    } catch(err2){
      // As a last resort, if superadmin and no company selected, prompt picker; else show permission message
      if (session.role==='superadmin'){
        const { el } = showModal({
          title:'Open Orders',
          content:`<div class='card'>You don\'t have permission to view open orders. You may need to select a company to scope your view.</div>`,
          actions:[{ id:'pick-company', label:'Select Company', class:'secondary' }]
        });
        el.addEventListener('click', async (e)=>{
          const act = e.target.getAttribute?.('data-action');
          if (act==='pick-company'){ el.remove(); await showCompanyPicker(); }
        });
        return;
      } else {
        showModal({ title:'Open Orders', content:`<div class='card'>You don\'t have permission to view open orders. Please sign in or ask an admin for access.</div>` });
        return;
      }
    }
  }
  const body = `<div>
    ${rows.length ? rows.map(r=>{
      const itemsCount = (r.items||[]).reduce((a,i)=> a + (i.qty||0), 0);
      return `<div class='card' style='margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;'>
        <div>
          <div style='font-weight:600;'>Order ${r.id.slice(0,6)}</div>
          <div class='muted'>Items: ${itemsCount} • Total: ${toCurrency(r.total||0)}</div>
        </div>
        <div style='display:flex;gap:8px;'>
          <button class='btn' data-load-order='${r.id}'>Load</button>
          <button class='btn secondary' data-delete-order='${r.id}'>Delete</button>
        </div>
      </div>`; }).join('') : `<div class='card'>No open orders.</div>`}
  </div>`;
  const actions = (session.role==='superadmin' && !session.companyId) ? [{ id:'change-company', label:'Change Company', class:'secondary' }] : [];
  const { el, close } = showModal({ title: 'Open Orders', content: body, actions });
  el.addEventListener('click', async (e)=>{
    const loadId = e.target.getAttribute?.('data-load-order');
    const delId = e.target.getAttribute?.('data-delete-order');
    const action = e.target.getAttribute?.('data-action');
    if (loadId){
      const ds = await getDoc(doc(db,'orders', loadId));
      if (ds.exists()){ const data = ds.data(); replaceCartFromItems(data.items||[]); close(); navigate('#/admin/pos'); }
    }
    if (delId){
      try { await deleteDoc(doc(db,'orders', delId)); e.target.closest('.card')?.remove(); } catch(_){ alert('Failed to delete'); }
    }
    if (action==='change-company'){
      close();
      await showCompanyPicker('Pick a different company to view its open orders.');
    }
  });
}
