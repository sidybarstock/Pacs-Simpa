/*
 * Front‑end behaviour scripts for PACS/SIMPA site.
 * Implements navigation toggling, animated KPIs, product cart management and shop filters.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Helper selectors
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // --- Navigation mobile ---
  const nav = $('#site-nav');
  const navBtn = $('#navToggle');
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      navBtn.setAttribute('aria-expanded', String(open));
    });
  }
  // Close mobile nav when clicking a link
  $$('#site-nav a').forEach(a => {
    a.addEventListener('click', () => {
      nav?.classList.remove('open');
      navBtn?.setAttribute('aria-expanded', 'false');
    });
  });

  // --- KPI demo animation ---
  const animateNumber = (el, to, dur=1200) => {
    const start = performance.now();
    const from = 0;
    const step = now => {
      const p = Math.min(1, (now - start)/dur);
      el.textContent = Math.round(from + (to-from)*p).toLocaleString('fr-FR');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const k1 = $('#kpi1');
  if (k1) animateNumber(k1, 324);
  const k2 = $('#kpi2');
  if (k2) animateNumber(k2, 48);
  const k3 = $('#kpi3');
  if (k3) animateNumber(k3, 19);

  // --- Shop cart ---
  const CART_KEY = 'pacs_cart';
  const cart = {
    items: [],
    load(){
      try{
        this.items = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      }catch{
        this.items = [];
      }
      this.updateUI();
    },
    save(){
      localStorage.setItem(CART_KEY, JSON.stringify(this.items));
      this.updateUI();
    },
    add(product){
      const key = product.id + (product.variant ? ':'+product.variant : '');
      const found = this.items.find(i => i.key === key);
      if(found){ found.qty += 1; }
      else { this.items.push({ key, ...product, qty:1 }); }
      this.save();
    },
    inc(key){ const it = this.items.find(i=>i.key===key); if(it){ it.qty++; this.save(); } },
    dec(key){ const it = this.items.find(i=>i.key===key); if(it && it.qty > 1){ it.qty--; this.save(); } else { this.remove(key); } },
    remove(key){ this.items = this.items.filter(i=>i.key!==key); this.save(); },
    clear(){ this.items=[]; this.save(); },
    total(){ return this.items.reduce((s,i)=> s + i.price*i.qty, 0); },
    updateUI(){
      // Update cart count
      const count = this.items.reduce((s,i)=>s+i.qty,0);
      const countEl = $('#cartCount');
      if (countEl) countEl.textContent = String(count);
      // Render cart items list
      const list = $('#cartItems');
      if (!list) return;
      list.innerHTML = '';
      if(this.items.length === 0){
        list.innerHTML = '<p class="muted" style="padding:1rem;">Votre panier est vide.</p>';
      } else {
        this.items.forEach(i => {
          const row = document.createElement('div');
          row.className = 'cart-item';
          row.innerHTML = `
            <img src="${i.img}" alt="${i.name}" style="width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid rgba(2,6,23,.1)"/>
            <div>
              <div style="font-weight:700">${i.name}${i.variant? ' · '+i.variant:''}</div>
              <div class="muted">${i.price.toLocaleString('fr-FR', { style:'currency', currency:'EUR' })}</div>
            </div>
            <div style="text-align:right;">
              <div class="qty">
                <button aria-label="Diminuer" data-act="dec" data-key="${i.key}">−</button>
                <span aria-live="polite">${i.qty}</span>
                <button aria-label="Augmenter" data-act="inc" data-key="${i.key}">+</button>
              </div>
              <button class="btn btn-ghost" style="margin-top:6px; padding:.35rem .6rem; font-size:.8rem;" data-act="rm" data-key="${i.key}">Retirer</button>
            </div>`;
          list.appendChild(row);
        });
      }
      // Update total
      const totalEl = $('#cartTotal');
      if (totalEl) totalEl.textContent = this.total().toLocaleString('fr-FR', { style:'currency', currency:'EUR' });
    }
  };
  // Add to cart events
  $$('#productGrid .product').forEach(card => {
    card.querySelector('.add-to-cart')?.addEventListener('click', () => {
      const id = card.dataset.id;
      const name = card.dataset.name;
      const price = parseFloat(card.dataset.price);
      const img = card.dataset.img;
      const select = card.querySelector('select');
      const variant = select ? select.value : '';
      cart.add({ id, name, price, img, variant });
      openDrawer();
    });
  });
  // Drawer controls
  const drawer = $('#cartDrawer');
  const openBtn = $('#openCart');
  const closeBtn = $('#closeCart');
  const openDrawer = () => { drawer.classList.add('open'); drawer.focus?.(); };
  const closeDrawer = () => { drawer.classList.remove('open'); };
  openBtn?.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  drawer?.addEventListener('click', (e)=>{ if(e.target === drawer) closeDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
  // Cart item actions
  $('#cartItems')?.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if(!t) return;
    const act = t.dataset.act; const key = t.dataset.key;
    if(!act) return;
    if(act === 'inc') cart.inc(key);
    if(act === 'dec') cart.dec(key);
    if(act === 'rm') cart.remove(key);
  });
  // Clear cart
  $('#clearCart')?.addEventListener('click', ()=>{ cart.clear(); });
  // Checkout by email
  $('#checkoutEmail')?.addEventListener('click', () => {
    if(cart.items.length === 0) {
      alert('Votre panier est vide.');
      return;
    }
    const lines = cart.items.map(i => `- ${i.name}${i.variant? ' ('+i.variant+')':''} x${i.qty} — ${(i.price*i.qty).toLocaleString('fr-FR', { style:'currency', currency:'EUR' })}`).join('%0D%0A');
    const total = cart.total().toLocaleString('fr-FR', { style:'currency', currency:'EUR' });
    const body = `Bonjour,%0D%0A%0D%0AJe souhaite commander les articles suivants :%0D%0A${lines}%0D%0A%0D%0ATotal : ${total}%0D%0A%0D%0ANom : %0D%0AAdresse de livraison : %0D%0ATéléphone : %0D%0AMode de paiement préféré : %0D%0A%0D%0AMerci !`;
    const mailto = `mailto:contact@pacs-simpa.org?subject=Commande%20Shop%20Solidaire&body=${body}`;
    window.location.href = mailto;
  });
  // Shop filters
  const filterButtons = $$('#shopFilters button');
  const products = $$('#productGrid .product');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-ghost');
      });
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-ghost');
      const cat = btn.getAttribute('data-filter');
      products.forEach(p => {
        const pCat = p.getAttribute('data-cat') || 'merch';
        p.style.display = (cat === 'all' || cat === pCat) ? 'flex' : 'none';
      });
    });
  });
  // Load cart on start
  cart.load();
});