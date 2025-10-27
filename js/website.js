import { db, storage } from './config.js';
import { $, html, setView, fileToDataURL, toCurrency, toSlug, buildCompanySlug } from './utils.js';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showCompanyUploads } from './uploads_ui.js';
import { ref, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { uploadFile } from './storage.js';

export async function renderCompanyPage(identifier, session){
  const resolved = await resolveCompany(identifier);
  if (!resolved.snap){
    return setView(html`<div class='card'>
      <h3>Company not found</h3>
      <p>The company you are trying to view may have been removed or the link is outdated.</p>
      <div style='margin-top:12px;'><a class='btn' href='#/companies'>Back to companies</a></div>
    </div>`);
  }

  const coRef = doc(db, 'companies', resolved.id);
  const co = resolved.snap.data();
  const adminRoles = ['admin-supervisor','admin-manager','admin-president','admin-owner'];
  const canEdit = !!session && ((session.companyId === resolved.id && adminRoles.includes(session.role)) || session.role === 'superadmin');
  const offerType = (co.offerType || '').toLowerCase();
  document.body?.classList?.remove('storefront-mode');

  if (offerType === 'marketplace'){
    document.body?.classList?.add('storefront-mode');
    await renderMarketplaceStorefront({ companyId: resolved.id, co, canEdit, slug: resolved.slug });
    return;
  }

  if (offerType === 'service'){
    document.body?.classList?.add('storefront-mode');
    await renderServiceShowcase({ companyId: resolved.id, co, canEdit, slug: resolved.slug });
    return;
  }

  await renderClassicCompanyProfile({ companyId: resolved.id, co, canEdit, coRef });
}

async function renderMarketplaceStorefront({ companyId, co, canEdit, slug }){
  const productsSnap = await getDocs(query(collection(db, 'products'), where('companyId', '==', companyId)));
  const catalog = productsSnap.docs.map(d => ({ id: d.id, ...d.data() || {} })).filter(item => !item.deleted);
  const products = catalog.filter(item => (item.kind || 'product') !== 'service');
  const services = catalog.filter(item => (item.kind || '') === 'service');

  const accent = co.themeColor || '#1877f2';
  const primaryProduct = products[0];
  const heroImageRaw = primaryProduct ? resolveProductImage(primaryProduct, co.coverUrl) : co.coverUrl;
  const heroImage = escapeAttr(heroImageRaw || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80');
  const heroTitle = escapeHtml(co.marketTitle || co.name || 'Marketplace');
  const heroSubtitle = escapeHtml(co.marketSubtitle || co.description || 'Discover curated picks from this storefront.');
  const currentYear = new Date().getFullYear();

  const root = html`
    <div class="marketplace-shell" style="--accent:${accent}">
      <header class="marketplace-header">
        <div class="marketplace-container marketplace-header-inner">
          <div class="marketplace-brand">
            ${co.logoUrl ? `<img class="marketplace-logo" src="${escapeAttr(co.logoUrl)}" alt="${escapeAttr(co.name || 'Logo')}" />`
                          : `<div class="marketplace-logo placeholder">${escapeHtml(getInitials(co.name || 'Store'))}</div>`}
            <div>
              <div class="marketplace-name">${escapeHtml(co.name || 'Marketplace')}</div>
              <div class="marketplace-tag">Marketplace Storefront</div>
            </div>
          </div>
          <div class="marketplace-actions">
            <input id="storeSearch" type="search" placeholder="Search products..." aria-label="Search products" />
          </div>
        </div>
      </header>

      <section class="marketplace-hero" id="store-hero">
        <div class="marketplace-container marketplace-hero-inner">
          <div class="marketplace-hero-copy">
            <span class="marketplace-kicker">Featured Collection</span>
            <h1>${heroTitle}</h1>
            <p>${heroSubtitle}</p>
            <div class="marketplace-hero-actions">
              <a class="btn" href="#store-products">Shop the collection</a>
              ${services.length ? '<a class="btn secondary" href="#store-services">Book a service</a>' : ''}
            </div>
          </div>
          <div class="marketplace-hero-media">
            <img src="${heroImage}" alt="${heroTitle} hero banner" loading="lazy" />
          </div>
        </div>
      </section>

      <div class="marketplace-body marketplace-container">
        <aside class="marketplace-sidebar">
          <div class="marketplace-sidebar-card">
            <h4>Explore</h4>
            <nav class="marketplace-sidebar-nav">
              <a href="#store-products">Shop</a>
              ${services.length ? '<a href="#store-services">Services</a>' : ''}
              <a href="#store-about">About</a>
              <a href="#store-faq">FAQ</a>
              <a href="#store-contact">Contact</a>
            </nav>
          </div>
          <div class="marketplace-sidebar-card">
            <h4>Store Info</h4>
            <ul class="marketplace-sidebar-info">
              <li><span>Owner</span><strong>${escapeHtml(co.ownerName || 'Not specified')}</strong></li>
              <li><span>Email</span><strong>${escapeHtml(co.email || '—')}</strong></li>
              <li><span>Phone</span><strong>${escapeHtml(co.phone || '—')}</strong></li>
            </ul>
            ${canEdit ? `<div class="marketplace-sidebar-actions">
                <a class="btn secondary" href="#/company/${companyId}/edit">Edit store</a>
                <a class="btn" href="#/admin/products?companyId=${companyId}">Manage catalog</a>
                <button class="btn" id="btnUploads">Uploaded files</button>
              </div>` : ''}
          </div>
        </aside>
        <div class="marketplace-main">
          <section class="market-section" id="store-products">
            <div class="market-section-head">
              <div>
                <h2>Products</h2>
                <p class="market-section-sub">${products.length ? `${products.length} product${products.length > 1 ? 's' : ''} available` : 'No products yet'}</p>
              </div>
              <div id="storeCategoryPills" class="market-pill-stack"></div>
            </div>
            <div class="market-grid" id="storeProductGrid"></div>
          </section>

          ${services.length ? `
            <section class="market-section" id="store-services">
              <div class="market-section-head">
                <div>
                  <h2>Services</h2>
                  <p class="market-section-sub">${services.length} option${services.length > 1 ? 's' : ''} available</p>
                </div>
              </div>
              <div class="market-grid market-grid--services" id="storeServiceGrid"></div>
            </section>
          ` : ''}

          <section class="market-section market-section--alt" id="store-about">
            <div class="market-about">
              <div>
                <h2>About ${escapeHtml(co.name || 'our store')}</h2>
                <p>${escapeHtml(co.description || 'We curate standout items from local makers and trusted suppliers.')}</p>
              </div>
              <div class="market-details">
                <div><span>Owner</span><strong>${escapeHtml(co.ownerName || 'Not specified')}</strong></div>
                <div><span>Email</span><strong>${escapeHtml(co.email || '—')}</strong></div>
                <div><span>Phone</span><strong>${escapeHtml(co.phone || '—')}</strong></div>
              </div>
            </div>
          </section>

          <section class="market-section" id="store-faq">
            <h2>FAQ</h2>
            <div class="market-faq">
              <details>
                <summary>How do I place an order?</summary>
                <p>Add items to your bag using the buttons below each product, then open the cart to review and checkout.</p>
              </details>
              <details>
                <summary>What payment methods are accepted?</summary>
                <p>We support the same payment options configured in the POS module for this company.</p>
              </details>
              <details>
                <summary>Can I pick up my order?</summary>
                <p>Coordinate directly with the store using the contact information below for pickup or delivery arrangements.</p>
              </details>
            </div>
          </section>

          <section class="market-section market-section--alt" id="store-contact">
            <h2>Contact</h2>
            <div class="market-contact">
              <div>
                <strong>Email</strong>
                <p>${escapeHtml(co.email || 'hello@example.com')}</p>
              </div>
              <div>
                <strong>Phone</strong>
                <p>${escapeHtml(co.phone || '—')}</p>
              </div>
              <div>
                <strong>Need support?</strong>
                <p>Chat with us via the messenger icon or send a message through the customer portal.</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer class="market-footer">
        <div class="marketplace-container marketplace-footer-inner">
          <div>${escapeHtml(co.name || 'Marketplace')} © ${currentYear}</div>
          <div>Powered by MaynilaTEKDO POS</div>
        </div>
      </footer>
    </div>
  `;
  setView(root);

  const productGrid = $('#storeProductGrid');
  const serviceGrid = $('#storeServiceGrid');
  const pillWrap = $('#storeCategoryPills');
  const searchInput = $('#storeSearch');
  const topSellerIds = products.slice(0, 3).map(p => p.id);

  const categories = [];
  products.forEach(item => {
    const label = (item.brand || item.type || '').trim();
    if (!label) return;
    const value = label.toLowerCase();
    if (!categories.some(entry => entry.value === value)){
      categories.push({ value, label });
    }
  });

  let activeCategory = 'all';
  let activeSearch = '';

  if (pillWrap){
    const pillMarkup = ['all', ...categories.map(c => c.value)]
      .slice(0, 7)
      .map(value => {
        const label = value === 'all' ? 'All' : categories.find(c => c.value === value)?.label || value;
        return `<button class="market-pill${value === 'all' ? ' active' : ''}" data-cat="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
      }).join('');
    pillWrap.innerHTML = pillMarkup;
    pillWrap.addEventListener('click', (e)=>{
      const cat = e.target?.getAttribute?.('data-cat');
      if (!cat) return;
      activeCategory = cat;
      pillWrap.querySelectorAll('.market-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-cat') === cat);
      });
      renderProductCards();
    });
  }

  if (searchInput){
    searchInput.addEventListener('input', ()=>{
      activeSearch = (searchInput.value || '').toLowerCase();
      renderProductCards();
    });
  }

  function renderProductCards(){
    if (!productGrid) return;
    let list = [...products];
    if (activeCategory !== 'all'){
      list = list.filter(item => (item.brand || '').toLowerCase() === activeCategory || (item.type || '').toLowerCase() === activeCategory);
    }
    if (activeSearch){
      list = list.filter(item => {
        const haystack = `${item.name || ''} ${item.brand || ''} ${item.description || ''}`.toLowerCase();
        return haystack.includes(activeSearch);
      });
    }
    if (!list.length){
      productGrid.innerHTML = `<div class='market-empty'>No products match your filters just yet.</div>`;
      return;
    }
    productGrid.innerHTML = list.map(item => {
      const desc = truncateText(item.description, 26);
      const image = escapeAttr(resolveProductImage(item, heroImage));
      const isTopSeller = topSellerIds.includes(item.id);
      return `
        <article class="market-card">
          <div class="market-card-media">
            <img src="${image}" alt="${escapeAttr(item.name || 'Product')}" loading="lazy" />
            ${isTopSeller ? '<span class="market-pill market-pill--tag">Top Sellers</span>' : ''}
          </div>
          <div class="market-card-body">
            <h3>${escapeHtml(item.name || 'Product')}</h3>
            ${item.brand ? `<p class="market-card-sub">${escapeHtml(item.brand)}</p>` : ''}
            ${desc ? `<p class="market-card-desc">${escapeHtml(desc)}</p>` : ''}
            <div class="market-card-footer">
              <span class="market-card-price">${toCurrency(item.price || 0)}</span>
              <button class="btn" data-add-to-cart data-id="${escapeAttr(item.id)}" data-name="${escapeAttr(item.name || '')}" data-price="${item.price || 0}">Add to bag</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderServiceCards(){
    if (!serviceGrid) return;
    if (!services.length){
      serviceGrid.innerHTML = `<div class='market-empty'>Services coming soon.</div>`;
      return;
    }
    serviceGrid.innerHTML = services.map(item => {
      const desc = truncateText(item.description, 32);
      return `
        <article class="market-service">
          <div>
            <h3>${escapeHtml(item.name || 'Service')}</h3>
            ${item.brand ? `<p class="market-card-sub">${escapeHtml(item.brand)}</p>` : ''}
            ${desc ? `<p class="market-card-desc">${escapeHtml(desc)}</p>` : ''}
          </div>
          <div class="market-service-footer">
            <span class="market-card-price">${toCurrency(item.price || 0)}</span>
            <a class="btn secondary" href="#/services">Book</a>
          </div>
        </article>
      `;
    }).join('');
  }

  renderProductCards();
  renderServiceCards();
}

async function renderServiceShowcase({ companyId, co, canEdit, slug }){
  const svcSnap = await getDocs(query(collection(db, 'products'), where('companyId', '==', companyId)));
  const all = svcSnap.docs.map(d => ({ id: d.id, ...d.data() || {} })).filter(item => !item.deleted);
  const services = all.filter(item => (item.kind || 'service') === 'service');
  const testimonials = Array.isArray(co.testimonials) ? co.testimonials.slice(0, 3) : [];
  const accent = co.themeColor || '#111827';
  const heroImage = escapeAttr(co.coverUrl || 'https://images.unsplash.com/photo-1523419409543-0c1df022bdd1?auto=format&fit=crop&w=1400&q=80');
  const heroTitle = escapeHtml(co.heroTitle || co.marketTitle || co.name || 'Bringing clarity to your space');
  const heroSubtitle = escapeHtml(co.heroSubtitle || 'Revitalize your space today');
  const heroCta = escapeHtml(co.heroCtaLabel || 'Book Now');
  const currentYear = new Date().getFullYear();

  const root = html`
    <div class="service-shell" style="--accent:${accent}">
      <header class="service-header">
        <div class="service-container service-header-inner">
          <div class="service-brand">
            ${co.logoUrl ? `<img class="service-logo" src="${escapeAttr(co.logoUrl)}" alt="${escapeAttr(co.name || 'Logo')}" />`
                          : `<div class="service-logo placeholder">${escapeHtml(getInitials(co.name || 'Service'))}</div>`}
            <div>
              <div class="service-name">${escapeHtml(co.name || 'Service Studio')}</div>
              <div class="service-tag">${escapeHtml(co.serviceTagline || 'Professional services tailored for you')}</div>
            </div>
          </div>
          <nav class="service-nav">
            <a href="#home">Home</a>
            <a href="#services">Services</a>
            <a href="#about">About</a>
            ${testimonials.length ? '<a href="#testimonials">Reviews</a>' : ''}
            <a href="#contact">Contact</a>
          </nav>
          ${canEdit ? `<div class="service-actions">
            <a class="btn secondary" href="#/company/${companyId}/edit">Edit site</a>
            <a class="btn" href="#/admin/products?companyId=${companyId}">Manage services</a>
            <button class="btn" id="btnUploadsSvc">Uploaded files</button>
          </div>` : ''}
        </div>
      </header>

      <section class="service-hero" id="home" style="background-image:url('${heroImage}')">
        <div class="service-hero-overlay"></div>
        <div class="service-container service-hero-inner">
          <span class="service-kicker">${escapeHtml(co.heroKicker || 'Revitalize your space today')}</span>
          <h1>${heroTitle}</h1>
          <p>${heroSubtitle}</p>
          <div class="service-hero-actions">
            <a class="btn" href="#contact">${heroCta}</a>
            ${services.length ? '<a class="btn secondary" href="#services">View Services</a>' : ''}
          </div>
        </div>
      </section>

      <main class="service-main service-container">
        <section class="service-section" id="services">
          <div class="service-section-head">
            <div>
              <h2>Our Services</h2>
              <p class="service-section-sub">${services.length ? 'Professionally curated offerings ready when you are.' : 'Services will appear here once added.'}</p>
            </div>
          </div>
          <div class="service-grid" id="serviceCards"></div>
        </section>

        <section class="service-section service-section--alt" id="about">
          <div class="service-about">
            <div>
              <h2>About ${escapeHtml(co.name || 'our team')}</h2>
              <p>${escapeHtml(co.about || co.description || 'We deliver thoughtful, detail-oriented work so your space feels refreshed and inviting.')}</p>
            </div>
            <div class="service-stats">
              <div>
                <span>Experience</span>
                <strong>${escapeHtml(co.yearsExperience || '5+ years')}</strong>
              </div>
              <div>
                <span>Service Area</span>
                <strong>${escapeHtml(co.serviceArea || 'Metro wide')}</strong>
              </div>
              <div>
                <span>Bookings</span>
                <strong>${escapeHtml(co.completedJobs || '100+')}</strong>
              </div>
            </div>
          </div>
        </section>

        ${testimonials.length ? `
        <section class="service-section" id="testimonials">
          <div class="service-section-head">
            <div>
              <h2>Client Stories</h2>
              <p class="service-section-sub">Hear from customers who trust ${escapeHtml(co.name || 'our team')}.</p>
            </div>
          </div>
          <div class="service-testimonials">
            ${testimonials.map(t => `<article class="service-testimonial">
              <p>${escapeHtml(t.quote || '')}</p>
              <div class="service-testimonial-footer">
                <strong>${escapeHtml(t.name || 'Satisfied Client')}</strong>
                ${t.role ? `<span>${escapeHtml(t.role)}</span>` : ''}
              </div>
            </article>`).join('')}
          </div>
        </section>` : ''}

        <section class="service-section service-section--alt" id="contact">
          <div class="service-contact">
            <div>
              <h2>Ready to get started?</h2>
              <p>Reach out and we’ll prepare a personalized service estimate.</p>
            </div>
            <div class="service-contact-grid">
              <div>
                <span>Email</span>
                <strong>${escapeHtml(co.email || 'hello@example.com')}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>${escapeHtml(co.phone || '—')}</strong>
              </div>
              <div>
                <span>Address</span>
                <strong>${escapeHtml(co.address || 'Available upon request')}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer class="service-footer">
        <div class="service-container service-footer-inner">
          <div>${escapeHtml(co.name || 'Service Studio')} © ${currentYear}</div>
          <div>Powered by MaynilaTEKDO POS</div>
        </div>
      </footer>
    </div>
  `;
  setView(root);

  const serviceHost = $('#serviceCards');
  if (serviceHost){
    if (!services.length){
      serviceHost.innerHTML = `<div class='service-empty'>Services coming soon. Check back shortly.</div>`;
    } else {
      serviceHost.innerHTML = services.map(item => {
        const desc = truncateText(item.description, 30);
        return `<article class="service-card">
          <div class="service-card-body">
            <h3>${escapeHtml(item.name || 'Service')}</h3>
            ${item.duration ? `<p class="service-card-meta">${escapeHtml(item.duration)}</p>` : ''}
            ${desc ? `<p class="service-card-desc">${escapeHtml(desc)}</p>` : ''}
          </div>
          <div class="service-card-footer">
            <span class="service-card-price">${toCurrency(item.price || 0)}</span>
            <button class="btn" data-add-to-cart data-id="${escapeAttr(item.id)}" data-name="${escapeAttr(item.name || '')}" data-price="${item.price || 0}">Book</button>
          </div>
        </article>`;
      }).join('');
    }
  }
}

async function renderClassicCompanyProfile({ companyId, co, canEdit, coRef }){
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
          <div style="margin-top:8px;">Theme Color: <input type="color" id="themeColor" value="${co.themeColor || '#1877f2'}" ${!canEdit ? 'disabled' : ''}/></div>
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

  const all = await getDocs(query(collection(db, 'products'), where('companyId', '==', companyId)));
  const prods = [];
  const svcs = [];
  all.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (data.deleted) return;
    if ((data.kind || 'product') === 'service') svcs.push({ id: docSnap.id, ...data });
    else prods.push({ id: docSnap.id, ...data });
  });

  if (svcs.length){
    $('#coServices').innerHTML = svcs.map(x => `<li>${x.name} - ${toCurrency(x.price || 0)}</li>`).join('');
  } else {
    const svcCol = $('#svcCol');
    if (svcCol) svcCol.style.display = 'none';
  }

  if (prods.length){
    $('#coProducts').innerHTML = prods.map(x => `<li>${x.name} - ${toCurrency(x.price || 0)}</li>`).join('');
  } else {
    const prodCol = $('#prodCol');
    const grid = $('#infoGrid');
    if (prodCol) prodCol.style.display = 'none';
    if (grid){
      grid.classList.remove('cols-3');
      grid.classList.add('cols-2');
    }
  }

  const grid = $('#infoGrid');
  if (grid){
    grid.classList.remove('cols-1', 'cols-2', 'cols-3');
    const cols = 1 + (svcs.length ? 1 : 0) + (prods.length ? 1 : 0);
    grid.classList.add(`cols-${Math.max(cols, 1)}`);
  }

  const svcWrap = $('#svcWrap');
  const svcCards = $('#svcCards');
  const prdWrap = $('#prdWrap');
  const prdCards = $('#prdCards');

  if (svcs.length){
    svcWrap.style.display = '';
    svcCards.innerHTML = svcs.map(s => `<div class='card'>
      <div style='font-weight:600;'>${s.name}</div>
      ${s.description ? `<div class='muted' style='margin:6px 0;'>${(s.description || '').slice(0, 100)}</div>` : ''}
      <div style='margin:8px 0;'>${toCurrency(s.price)}</div>
    </div>`).join('');
  }

  if (prods.length){
    prdWrap.style.display = '';
    prdCards.innerHTML = prods.map(p => `<div class='card'>
      <div style='font-weight:600;'>${p.name}</div>
      ${p.brand ? `<div class='muted'>${p.brand}</div>` : ''}
      <div style='margin:8px 0;'>${toCurrency(p.price)}</div>
    </div>`).join('');
  }

  if (canEdit){
    $('#themeColor')?.addEventListener('input', async (e) => {
      await updateDoc(coRef, { themeColor: e.target.value });
      e.target.style.outlineColor = e.target.value;
    });
    $('#coverFile')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
        if (!file) return;
        // Use app session (localStorage) for permission checks
        const SESSION_KEY = 'cp.session.v1';
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (!session){ alert('Please sign in to the app to upload files.'); return; }
        const allowedRoles = new Set(['superadmin','admin-owner','admin-president','admin-manager','admin-supervisor']);
        if (!(session.role === 'superadmin' || (session.companyId === companyId && allowedRoles.has(session.role)))){
          alert('You do not have permission to upload files for this company.');
          return;
        }

        try {
          const res = await uploadFile(file, `companies/${companyId}/cover_`);
          const url = res.url;
          await updateDoc(coRef, { coverUrl: url });
          $('#coverImg').src = url;
        } catch(err){ console.error('Upload failed', err); alert('Upload failed: '+(err.message||err)); }
    });
    // Show uploads modal (company assets)
    document.getElementById('btnUploads')?.addEventListener('click', ()=> showCompanyUploads(companyId));
  }
}

export async function renderCompanyEdit(companyId, session){
  const coRef = doc(db, 'companies', companyId);
  const snap = await getDoc(coRef);
  document.body?.classList?.remove('storefront-mode');
  if (!snap.exists()){
    return setView(html`<div class='card'>Company not found. <a class='btn' href='#/companies'>Back</a></div>`);
  }

  const co = snap.data();
  const slug = buildCompanySlug(co.name, companyId) || companyId;
  const adminRoles = ['admin-supervisor','admin-manager','admin-president','admin-owner'];
  const canEdit = !!session && ((session.companyId === companyId && adminRoles.includes(session.role)) || session.role === 'superadmin');
  if (!canEdit){
    return setView(html`<div class='card'>You don't have permission to edit this company. <a class='btn' href='#/company/${slug}'>Back</a></div>`);
  }

  const root = html`
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;'>
        <h3 style='margin:0;'>Edit Company</h3>
        <div style='display:flex;gap:8px;'>
          <button class='btn' id='btnUploadsEdit'>Uploaded files</button>
          <a class='btn secondary' href='#/company/${slug}'>Back to Company</a>
        </div>
      </div>
      <div style='position:relative;margin-top:8px;'>
        <img id='editCoverImg' src='${co.coverUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop'}' style='width:100%;height:220px;object-fit:cover;border-radius:8px;'/>
        <input type='file' id='editCoverFile' style='position:absolute;right:12px;bottom:12px;background:#0008;color:#fff;border-radius:8px;padding:6px;'/>
      </div>
      <form id='coEditForm' class='grid' style='gap:8px;margin-top:12px;'>
        <input class='input' name='name' placeholder='Company Name' value='${co.name || ''}' required />
        <input class='input' name='ownerName' placeholder="Owner's Name" value='${co.ownerName || ''}' />
        <input class='input' name='email' placeholder='Email' value='${co.email || ''}' />
        <input class='input' name='phone' placeholder='Phone' value='${co.phone || ''}' />
        <select class='input' name='offerType'>
          <option value='' ${!co.offerType ? 'selected' : ''}>Company Type (optional)</option>
          <option value='marketplace' ${co.offerType === 'marketplace' ? 'selected' : ''}>Marketplace</option>
          <option value='service' ${co.offerType === 'service' ? 'selected' : ''}>Service</option>
        </select>
        <textarea class='input' name='description' placeholder='Description'>${co.description || ''}</textarea>
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
          <a class='btn secondary' href='#/company/${slug}'>Cancel</a>
        </div>
      </form>
    </div>
  `;
  setView(root);

  document.getElementById('editThemeColor')?.addEventListener('input', async (e) => {
    await updateDoc(coRef, { themeColor: e.target.value });
  });

  document.getElementById('editCoverFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Use app session (localStorage) for permission checks
    const SESSION_KEY = 'cp.session.v1';
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!session){ alert('Please sign in to the app to upload files.'); return; }
    const allowedRoles = new Set(['superadmin','admin-owner','admin-president','admin-manager','admin-supervisor']);
    if (!(session.role === 'superadmin' || (session.companyId === companyId && allowedRoles.has(session.role)))){
      alert('You do not have permission to upload files for this company.');
      return;
    }

    try {
      const res = await uploadFile(file, `companies/${companyId}/cover_`);
      const url = res.url;
      await updateDoc(coRef, { coverUrl: url });
      document.getElementById('editCoverImg').src = url;
    } catch(err){ console.error('Upload failed', err); alert('Upload failed: '+(err.message||err)); }
  });

  document.getElementById('coEditForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const ownerName = form.ownerName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const offerType = form.offerType.value || null;
    const description = form.description.value.trim();
    const themeColor = document.getElementById('editThemeColor').value;
    const baseSlug = buildCompanySlug(name, companyId) || companyId;
    const slugValue = await ensureUniqueCompanySlug(baseSlug, companyId);
    const patch = {
      name,
      ownerName,
      email,
      phone,
      offerType,
      description,
      themeColor,
      slug: slugValue,
    };

    const uploads = {};
    const logo = form.logoFile.files?.[0];
    const permit = form.permitFile.files?.[0];
    const dti = form.dtiFile.files?.[0];

    try {
      // Use app session (localStorage) for permission checks
      const SESSION_KEY = 'cp.session.v1';
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session){ alert('Please sign in to the app to upload files.'); return; }
      const allowedRoles = new Set(['superadmin','admin-owner','admin-president','admin-manager','admin-supervisor']);
      if (!(session.role === 'superadmin' || (session.companyId === companyId && allowedRoles.has(session.role)))){
        alert('You do not have permission to upload files for this company.');
        return;
      }

      if (logo){
        const res = await uploadFile(logo, `companies/${companyId}/logo_`);
        uploads.logoUrl = res.url;
      }
      if (permit){
        const res = await uploadFile(permit, `companies/${companyId}/business_permit_`);
        uploads.businessPermitUrl = res.url;
      }
      if (dti){
        const res = await uploadFile(dti, `companies/${companyId}/dti_`);
        uploads.dtiUrl = res.url;
      }
    } catch (err){
      console.error('Upload failed', err);
    }

    await updateDoc(coRef, { ...patch, ...uploads });
    alert('Company updated');
  });
    // Show uploads modal (company assets) from edit page as well
    document.getElementById('btnUploadsEdit')?.addEventListener('click', ()=> showCompanyUploads(companyId));
}

export async function ensureUniqueCompanySlug(desiredSlug, companyId){
  const cleaned = toSlug(desiredSlug) || buildCompanySlug('', companyId) || companyId;
  const base = cleaned.toLowerCase();
  let attempt = base;
  let counter = 1;
  while (true){
    try {
      const snap = await getDocs(query(collection(db, 'companies'), where('slug', '==', attempt), limit(1)));
      if (snap.empty || snap.docs[0].id === companyId){
        return attempt;
      }
      counter += 1;
      attempt = `${base}-${counter}`;
    } catch(err){
      console.warn('Slug collision check failed', err);
      return attempt;
    }
  }
}

async function resolveCompany(identifier){
  const raw = decodeURIComponent(identifier || '').trim();
  if (!raw){
    return { id: null, snap: null, slug: '' };
  }

  try {
    const directRef = doc(db, 'companies', raw);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists() && !directSnap.data()?.deleted){
      const co = directSnap.data();
      const existingSlug = toSlug(co.slug) || buildCompanySlug(co.name, directSnap.id) || directSnap.id;
      return { id: directSnap.id, snap: directSnap, slug: existingSlug };
    }
  } catch(err){ console.warn('Failed to load company by id', err); }

  const slugCandidate = toSlug(raw);
  if (!slugCandidate){
    return { id: null, snap: null, slug: raw };
  }

  try {
    const slugQuery = await getDocs(query(collection(db, 'companies'), where('slug', '==', slugCandidate), limit(1)));
    if (!slugQuery.empty){
      const match = slugQuery.docs[0];
      if (!match.data()?.deleted){
  const co = match.data();
  const existingSlug = toSlug(co.slug) || buildCompanySlug(co.name, match.id) || slugCandidate;
  return { id: match.id, snap: match, slug: existingSlug };
      }
    }
  } catch(err){ console.warn('Slug lookup failed', err); }

  try {
    const all = await getDocs(query(collection(db, 'companies'), limit(500)));
    for (const docSnap of all.docs){
  const data = docSnap.data();
      if (data.deleted) continue;
  const slug = toSlug(data.slug) || buildCompanySlug(data.name, docSnap.id) || docSnap.id;
      if (slug === slugCandidate){
        return { id: docSnap.id, snap: docSnap, slug };
      }
    }
  } catch(err){ console.warn('Fallback company scan failed', err); }

  return { id: null, snap: null, slug: slugCandidate };
}

function escapeHtml(value = ''){
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value = ''){
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function getInitials(value = ''){
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || 'MK';
}

function resolveProductImage(item = {}, fallback){
  if (item.imageUrl) return item.imageUrl;
  if (item.photoUrl) return item.photoUrl;
  if (Array.isArray(item.images) && item.images.length) return item.images[0];
  if (fallback) return fallback;
  const key = encodeURIComponent(item.name || 'product');
  return `https://source.unsplash.com/featured/?${key}`;
}

function truncateText(text, words = 24){
  if (!text) return '';
  const parts = String(text).trim().split(/\s+/);
  if (parts.length <= words) return parts.join(' ');
  return parts.slice(0, words).join(' ') + '…';
}
