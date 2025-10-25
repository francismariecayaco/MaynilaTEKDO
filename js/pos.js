// Lightweight POS/cart utilities used across the app
// Provides: renderPOSRoute(session), bindGlobalCartClicks(), getCartCount(), replaceCartFromItems(items)

import { db, nowTs } from './config.js';
import { $, html, setView, toCurrency } from './utils.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CART_KEY = 'cp.cart.v1';

function readCart(){
	try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch(_){ return []; }
}
function writeCart(items){
	try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch(_){ }
	// notify listeners (badge, etc.)
	window.dispatchEvent(new CustomEvent('cart:updated'));
}

export function getCartCount(){
	const items = readCart();
	return items.reduce((a,i)=> a + (parseFloat(i.qty||0)||0), 0);
}

export function replaceCartFromItems(items){
	writeCart((items||[]).map(i=>({ id:i.id||i.productId||'', name:i.name||i.title||'', price: Number(i.price||0), qty: Number(i.qty||0) })));
}

function addToCart(item, qty=1){
	const items = readCart();
	const id = String(item.id||item.productId||'');
	if (!id) return;
	const idx = items.findIndex(x=> String(x.id)===id);
	if (idx>=0){ items[idx].qty = Number(items[idx].qty||0) + Number(qty||1); }
	else { items.push({ id, name: item.name||item.title||id, price: Number(item.price||0), qty: Number(qty||1) }); }
	writeCart(items);
}

function setQty(id, qty){
	const items = readCart();
	const idx = items.findIndex(x=> String(x.id)===String(id));
	if (idx>=0){ items[idx].qty = Math.max(0, Number(qty||0)); }
	writeCart(items.filter(x=> (x.qty||0) > 0));
}

function clearCart(){ writeCart([]); }

export function bindGlobalCartClicks(){
	if (document._cartClicksBound) return; document._cartClicksBound = true;
	document.addEventListener('click', (e)=>{
		const t = e.target.closest('[data-add-to-cart]');
		if (t){
			e.preventDefault();
			const payload = {
				id: t.getAttribute('data-id') || t.dataset.id,
				name: t.getAttribute('data-name') || t.dataset.name,
				price: parseFloat(t.getAttribute('data-price') || t.dataset.price || '0')
			};
			const qty = parseFloat(t.getAttribute('data-qty') || t.dataset.qty || '1') || 1;
			addToCart(payload, qty);
		}
	});
}

function renderCartTable(){
	const body = document.getElementById('cartBody');
	const totalEl = document.getElementById('cartTotal');
	if (!body || !totalEl) return; // view not mounted yet
	const items = readCart();
	body.innerHTML = items.map(i=>`<tr>
		<td>${i.name||i.id}</td>
		<td style="text-align:right;">${toCurrency(i.price||0)}</td>
		<td style="width:120px;"><input type="number" min="0" step="1" value="${i.qty||0}" data-qty-for="${i.id}" class="input small" style="width:100px;"/></td>
		<td style="text-align:right;">${toCurrency((i.price||0)*(i.qty||0))}</td>
		<td><button class="btn secondary" data-remove="${i.id}">Remove</button></td>
	</tr>`).join('') || '<tr><td colspan="5">Cart is empty</td></tr>';
	const total = items.reduce((a,i)=> a + (Number(i.price||0)*Number(i.qty||0)), 0);
	totalEl.textContent = toCurrency(total);
}

export function renderPOSRoute(session){
	// Basic POS view focused on the cart. Products can be added via global [data-add-to-cart]
	const root = html`
		<div id="posView" class="grid cols-2">
			<div class="card" style="grid-column: span 2;">
				<h3>Cart</h3>
				<table class="table">
					<thead><tr><th>Item</th><th style="text-align:right;">Price</th><th>Qty</th><th style="text-align:right;">Subtotal</th><th></th></tr></thead>
					<tbody id="cartBody"></tbody>
					<tfoot><tr><td colspan="3" style="text-align:right;">Total</td><td style="text-align:right;"><strong id="cartTotal">0</strong></td><td></td></tr></tfoot>
				</table>
				<div style="display:flex;gap:8px;justify-content:flex-end;">
					<button class="btn secondary" id="btnClear">Clear</button>
					<button class="btn" id="btnCheckout">Checkout</button>
				</div>
			</div>
		</div>
	`;
	setView(root);
	renderCartTable();

	const container = document.getElementById('posView');
	if (!container) return;

	container.addEventListener('input', (e)=>{
		const id = e.target.getAttribute?.('data-qty-for');
		if (id){ setQty(id, parseFloat(e.target.value||'0')||0); renderCartTable(); }
	});
	container.addEventListener('click', (e)=>{
		const rem = e.target.getAttribute?.('data-remove');
		if (rem){ setQty(rem, 0); renderCartTable(); }
	});
	container.querySelector('#btnClear')?.addEventListener('click', ()=>{ clearCart(); renderCartTable(); });
	container.querySelector('#btnCheckout')?.addEventListener('click', async ()=>{
		const items = readCart();
		if (!items.length){ alert('Cart is empty'); return; }
		const order = {
			uid: session?.uid||'',
			companyId: session?.companyId||'',
			items,
			total: items.reduce((a,i)=> a + (Number(i.price||0)*Number(i.qty||0)), 0),
			status: 'open',
			createdAt: nowTs()
		};
		try {
			await addDoc(collection(db,'orders'), order);
			clearCart();
			renderCartTable();
			alert('Order saved');
		} catch(err){
			console.error(err);
			alert('Failed to save order (check permissions).');
		}
	});
}

