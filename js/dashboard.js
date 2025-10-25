import { db } from './config.js';
import { $, html, setView, toCurrency } from './utils.js';
import { collection, query, where, orderBy, limit, getDocs, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
      </div>
    </div>
  `;
  setView(root);
  loadCards(session);
  runAlerts(session);
}

async function loadCards(session){
  const uid = session?.uid;
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
