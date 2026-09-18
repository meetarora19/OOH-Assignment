/* =========================================================================
   DND OOH Inventory Manager
   -------------------------------------------------------------------------
   Core interaction (per the reference spec):
     1. Sites are shown as picture pins on a map.
     2. A pin is DRAGGED and DROPPED onto the cart panel to select it
        (no click needed).
     3. The cart shows the site's name and coordinates.
     4. A "Remove" button takes it back out (and the pin reappears on map).

   Drag-and-drop is implemented with Pointer Events rather than the native
   HTML5 DnD API. Native HTML5 drag is unreliable on Leaflet markers (the
   marker DOM is repositioned with CSS transforms, which fights the
   browser's built-in drag-image handling) and it does not work on touch
   devices at all. A small custom pointer-drag system (see `makeDraggable`
   below) is used instead, so the exact same code drags both a map pin and
   a sidebar card, on desktop AND touch, with a floating "ghost" chip that
   follows the pointer and a highlighted drop zone.

   Every draggable pin/card is ALSO a single tap/click target (per the
   brief's evaluation note that this should feel like shopping, not like
   filling in a form) — tapping a card pans the map to it and opens its
   popup, and the popup itself offers one-tap "Add to cart" and "Open in
   Google Maps" buttons. So there are exactly two ways to add a site
   (drag, or the popup/quick-add button) — not three or four.
   ========================================================================= */

'use strict';

const STATUS_STORAGE_KEY = 'dnd_ooh_site_statuses_v5';
const CART_STORAGE_KEY = 'dnd_ooh_cart_items_v5';
const HOWTO_SEEN_KEY = 'dnd_ooh_howto_seen_v1';
const DRAG_THRESHOLD_PX = 6; // pointer must move this far before a tap becomes a drag

let cart = [];
let map, markersLayer;
let markerById = new Map();     // siteId -> Leaflet marker
let renderPosById = new Map();  // siteId -> {lat, lng} used ONLY for on-map placement of near-duplicate pins

/* -------------------------------------------------------------------- */
/* Storage helpers                                                       */
/* -------------------------------------------------------------------- */

function getStoredStatuses() {
  const stored = localStorage.getItem(STATUS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function setSiteStatus(siteId, status) {
  const statuses = getStoredStatuses();
  statuses[siteId] = status;
  localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statuses));
}

function getStoredCart() {
  const stored = localStorage.getItem(CART_STORAGE_KEY);
  if (!stored) return [];
  const cartIds = JSON.parse(stored);
  return SITES_DATA.filter(s => cartIds.includes(s.id));
}

function saveCartToStorage() {
  const cartIds = cart.map(item => item.id);
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartIds));
}

function resetAllStatuses() {
  localStorage.removeItem(STATUS_STORAGE_KEY);
  localStorage.removeItem(CART_STORAGE_KEY);
  cart = [];
  updateCartUI();
  renderApp();
  showToast('All site statuses and cart progress have been reset.');
}

/* -------------------------------------------------------------------- */
/* App initialisation                                                    */
/* -------------------------------------------------------------------- */

window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  cart = getStoredCart();
  computeRenderPositions();
  initMap();
  populateTypeFilter();
  updateCartUI();
  renderApp();

  if (!sessionStorage.getItem(HOWTO_SEEN_KEY)) {
    setTimeout(showHowItWorks, 500);
    sessionStorage.setItem(HOWTO_SEEN_KEY, '1');
  }

  // Keep multiple browser tabs in sync (progress is only ever local/in-memory-backed).
  window.addEventListener('storage', (e) => {
    if (e.key === STATUS_STORAGE_KEY || e.key === CART_STORAGE_KEY) {
      cart = getStoredCart();
      updateCartUI();
      renderApp();
    }
  });
});

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([28.5775, 77.2950], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function populateTypeFilter() {
  const types = [...new Set(SITES_DATA.map(s => s.type))].sort();
  const select = document.getElementById('filter-type');
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
}

function showHowItWorks() {
  showToast('Drag a pin (or a card) onto the cart to add it — or tap a site to see its "Add to cart" button.', 'success', 5000);
}

/* -------------------------------------------------------------------- */
/* Edge case: sites that share near-identical coordinates                */
/* -------------------------------------------------------------------- */
/* Several DND kiosks/gantries sit within a few metres of each other, so
   pins can render fully on top of one another making them impossible to
   grab individually. We group sites whose coordinates round to the same
   ~11m grid cell and nudge each one outward in a small circle around the
   group's centre FOR DISPLAY ONLY. The site's real lat/lng (used in the
   cart, popups, and the Google Maps link) is never altered. */
function computeRenderPositions() {
  const groups = new Map();
  SITES_DATA.forEach(site => {
    const key = `${site.lat.toFixed(4)},${site.lng.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(site);
  });

  const OFFSET_DEG = 0.00025; // ~25-28m at this latitude — enough to separate pins visually
  groups.forEach(group => {
    if (group.length === 1) {
      renderPosById.set(group[0].id, { lat: group[0].lat, lng: group[0].lng });
      return;
    }
    group.forEach((site, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      renderPosById.set(site.id, {
        lat: site.lat + OFFSET_DEG * Math.sin(angle),
        lng: site.lng + OFFSET_DEG * Math.cos(angle),
        clustered: true
      });
    });
  });
}

/* -------------------------------------------------------------------- */
/* Rendering                                                              */
/* -------------------------------------------------------------------- */

function renderApp() {
  const storedStatuses = getStoredStatuses();
  const zone = document.getElementById('filter-zone').value;
  const type = document.getElementById('filter-type').value;
  const statusFilter = document.getElementById('filter-status').value;
  const query = document.getElementById('search-input').value.trim().toLowerCase();

  const filtered = SITES_DATA.filter(site => {
    const siteStatus = storedStatuses[site.id] || 'Available';
    const matchZone = zone === 'ALL' || site.zone === zone;
    const matchType = type === 'ALL' || site.type === type;
    const matchStatus = statusFilter === 'ALL' || siteStatus === statusFilter;
    const matchQuery = !query ||
      site.id.toLowerCase().includes(query) ||
      site.location.toLowerCase().includes(query);
    return matchZone && matchType && matchStatus && matchQuery;
  });

  document.getElementById('site-count').textContent = `Showing ${filtered.length} of ${SITES_DATA.length} sites`;
  document.getElementById('search-clear').style.display = query ? 'flex' : 'none';
  document.getElementById('map-empty-state').style.display = filtered.length === 0 ? 'flex' : 'none';

  renderSiteList(filtered, storedStatuses);
  renderMapMarkers(filtered, storedStatuses);
}

function renderSiteList(sites, storedStatuses) {
  const container = document.getElementById('site-list');
  container.innerHTML = '';

  if (sites.length === 0) {
    container.innerHTML = `
      <div class="list-empty">
        <i data-lucide="search-x"></i>
        <p>No sites match your search or filters.</p>
        <button class="btn-secondary" onclick="clearAllFilters()">Clear filters</button>
      </div>`;
    lucide.createIcons();
    return;
  }

  sites.forEach(site => {
    const status = storedStatuses[site.id] || 'Available';
    const isAvailable = status === 'Available';
    const inCart = cart.some(c => c.id === site.id);
    const canAdd = isAvailable && !inCart;

    let badgeClass = 'badge-available';
    if (status === 'Reserved') badgeClass = 'badge-reserved';
    if (status === 'Owned') badgeClass = 'badge-owned';

    const card = document.createElement('div');
    card.className = `site-card ${!isAvailable ? 'locked' : ''} ${canAdd ? 'draggable' : ''}`;
    card.id = `site-card-${cssEscape(site.id)}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label',
      `${site.id}, ${site.location}, ${status}${canAdd ? '. Drag onto the cart, or press Enter to add.' : ''}`);

    card.innerHTML = `
      <div class="site-card-header">
        <span class="site-id">#${site.sNo} · ${site.id}</span>
        <span class="badge ${badgeClass}">${inCart ? 'In cart' : status}</span>
        ${canAdd ? `<button class="btn-quick-add" title="Add to cart" aria-label="Add ${site.id} to cart"><i data-lucide="plus"></i></button>` : ''}
        ${!isAvailable ? `<i class="lock-icon" data-lucide="lock" title="${status}"></i>` : ''}
      </div>
      <div class="site-location">${site.location}</div>
      <div class="site-meta-line">${site.type} · ${site.area} sq.ft · ${site.zone} · ${site.lit}</div>
    `;

    container.appendChild(card);

    // Tap/click (no meaningful pointer movement) → pan the map to this
    // site and open its popup, where "Add to cart" and "Open in Google
    // Maps" both live. Keeps the card itself uncluttered.
    const activateCard = () => {
      focusSiteOnMap(site.id);
      if (!isAvailable) showToast(`Site ${site.id} is ${status} and cannot be added.`, 'error');
    };

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-quick-add')) return; // handled separately below
      activateCard();
    });

    card.querySelector('.btn-quick-add')?.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(site.id);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (canAdd) addToCart(site.id); else activateCard();
      }
    });

    if (canAdd) {
      makeDraggable(card, site, { label: site.id });
    }
  });
  lucide.createIcons();
}

/* Builds a teardrop "picture pin" divIcon, colour-coded by status. */
function buildPinIcon(color, { inCart = false, clustered = false } = {}) {
  const opacity = inCart ? 0.35 : 1;
  return L.divIcon({
    className: 'ooh-pin-wrapper',
    html: `
      <svg class="ooh-pin ${clustered ? 'ooh-pin-clustered' : ''}" width="30" height="40" viewBox="0 0 30 40"
           style="opacity:${opacity}" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
        <circle cx="15" cy="15" r="6" fill="white"/>
      </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36]
  });
}

function renderMapMarkers(sites, storedStatuses) {
  markersLayer.clearLayers();
  markerById.clear();

  sites.forEach(site => {
    const status = storedStatuses[site.id] || 'Available';
    const inCart = cart.some(c => c.id === site.id);
    const canAdd = status === 'Available' && !inCart;

    let color = '#16a34a';               // Available
    if (status === 'Reserved') color = '#d97706';
    if (status === 'Owned') color = '#dc2626';
    if (inCart) color = '#64748b';        // already selected -> greyed on map

    const pos = renderPosById.get(site.id) || { lat: site.lat, lng: site.lng };
    const icon = buildPinIcon(color, { inCart, clustered: !!pos.clustered });
    const marker = L.marker([pos.lat, pos.lng], {
      icon,
      draggable: false,   // Leaflet's own (mouse-only) dragging stays off — see makeDraggable()
      keyboard: true,
      alt: `${site.id} pin`
    });

    const gmapsUrl = `https://www.google.com/maps?q=${site.lat},${site.lng}`;

    const popupContent = `
      <div>
        <div class="hover-card-body">
          <div class="hover-card-title">#${site.sNo} · ${site.id}</div>
          <div class="hover-card-loc">${site.location}</div>
          <div class="hover-card-coords">${site.lat.toFixed(6)}, ${site.lng.toFixed(6)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin: 4px 0 8px;">
            Status: <strong style="color:${color}">${inCart ? 'In cart' : status}</strong> · ${site.type}
          </div>
          ${canAdd ? `<button class="btn-gmaps popup-add-btn" onclick="addToCart('${site.id}')"><i data-lucide="shopping-cart"></i> Add to cart</button>` : ''}
          <a href="${gmapsUrl}" target="_blank" rel="noopener" class="btn-gmaps btn-gmaps-secondary">Open in Google Maps ↗</a>
          ${canAdd ? `<div class="popup-hint">or drag this pin onto the cart</div>` : ''}
        </div>
      </div>
    `;
    marker.bindPopup(popupContent, { autoClose: false, closeOnClick: false, closeButton: true });
    marker.on('popupopen', () => lucide.createIcons());

    // --- Core interaction: the pin itself is draggable straight onto the
    // cart, via the shared pointer-drag system (see makeDraggable). A tap
    // that doesn't turn into a drag falls through to Leaflet's own click
    // handling and opens the popup as normal.
    marker.on('add', () => {
      const el = marker.getElement();
      if (!el) return;
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label',
        `${site.id}, ${site.location}, ${canAdd ? 'draggable, drag to cart to add, or press Enter' : status}`);

      if (canAdd) {
        el.classList.add('pin-draggable');
        makeDraggable(el, site, { label: site.id, isPin: true });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            addToCart(site.id);
          }
        });
      }
    });

    markerById.set(site.id, marker);
    markersLayer.addLayer(marker);
  });
}

function focusSiteOnMap(siteId) {
  const site = SITES_DATA.find(s => s.id === siteId);
  const marker = markerById.get(siteId);
  if (!site || !marker) return;
  map.flyTo([site.lat, site.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  setTimeout(() => marker.openPopup(), 350);
  if (window.innerWidth <= 820) toggleSidebar(false);
}

/* -------------------------------------------------------------------- */
/* Shared pointer-based drag system (works for both pins and cards,      */
/* on mouse, touch and pen — replaces the native HTML5 DnD API).         */
/* -------------------------------------------------------------------- */

let activeDrag = null; // { siteId, sourceEl, isPin, pointerId }

function makeDraggable(sourceEl, site, { label, isPin = false } = {}) {
  sourceEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
    const startX = e.clientX, startY = e.clientY;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        beginDrag(site, sourceEl, isPin, label);
      }
      updateDragGhost(moveEvent.clientX, moveEvent.clientY);
      updateDropZoneHighlight(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);

      if (dragging) {
        endDrag(site, upEvent.clientX, upEvent.clientY);
        // Swallow the synthetic click Leaflet/the browser fires right
        // after a drag ends, so a completed drag doesn't also pop the
        // marker's popup open or re-trigger the card's click handler.
        const swallow = (clickEvent) => { clickEvent.stopPropagation(); clickEvent.preventDefault(); };
        sourceEl.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => sourceEl.removeEventListener('click', swallow, { capture: true }), 0);
      }
    };

    const onCancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragging) cancelDrag(sourceEl, isPin);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}

function beginDrag(site, sourceEl, isPin, label) {
  activeDrag = { site, sourceEl, isPin };
  sourceEl.classList.add('dragging-source');
  if (isPin && map) map.dragging.disable();
  const ghost = document.getElementById('drag-ghost');
  document.getElementById('drag-ghost-label').textContent = label;
  ghost.classList.add('visible');
  document.body.classList.add('drag-active');
}

function updateDragGhost(x, y) {
  const ghost = document.getElementById('drag-ghost');
  ghost.style.transform = `translate(${x}px, ${y}px)`;
}

function updateDropZoneHighlight(x, y) {
  const dock = document.getElementById('cart-dock');
  const over = pointInRect(x, y, dock.getBoundingClientRect());
  dock.classList.toggle('drag-over', over);
}

function endDrag(site, x, y) {
  const dock = document.getElementById('cart-dock');
  const droppedOnCart = pointInRect(x, y, dock.getBoundingClientRect());

  cleanupDrag();

  if (droppedOnCart) {
    addToCart(site.id);
  } else {
    showToast('Drop the pin onto the cart panel to add it.', 'error');
  }
}

function cancelDrag(sourceEl, isPin) {
  cleanupDrag();
}

function cleanupDrag() {
  if (activeDrag) activeDrag.sourceEl.classList.remove('dragging-source');
  if (activeDrag?.isPin && map) map.dragging.enable();
  document.getElementById('cart-dock').classList.remove('drag-over');
  document.getElementById('drag-ghost').classList.remove('visible');
  document.body.classList.remove('drag-active');
  activeDrag = null;
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/* -------------------------------------------------------------------- */
/* Cart logic                                                            */
/* -------------------------------------------------------------------- */

function addToCart(siteId) {
  const storedStatuses = getStoredStatuses();
  const status = storedStatuses[siteId] || 'Available';

  if (status !== 'Available') {
    showToast(`Site ${siteId} is ${status} and cannot be added to cart.`, 'error');
    return;
  }
  if (cart.some(item => item.id === siteId)) {
    showToast(`Site ${siteId} is already in your cart.`);
    return;
  }

  const site = SITES_DATA.find(s => s.id === siteId);
  if (!site) return;

  cart.push(site);
  saveCartToStorage();
  updateCartUI();
  renderApp();
  markerById.get(siteId)?.closePopup();
  showToast(`Added ${site.id} to cart.`);
}

function removeFromCart(siteId) {
  const site = cart.find(item => item.id === siteId);
  cart = cart.filter(item => item.id !== siteId);
  saveCartToStorage();
  updateCartUI();
  renderApp(); // site's pin reappears on the map, per spec
  if (site) showToast(`Removed ${site.id} — its pin is back on the map.`);
}

function updateCartUI() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartBadge = document.getElementById('cart-badge');
  const cartTotalArea = document.getElementById('cart-total-area');
  const btnCheckout = document.getElementById('btn-checkout');

  cartBadge.textContent = `${cart.length} Site${cart.length === 1 ? '' : 's'}`;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <i data-lucide="package-open"></i>
        Drag a pin or card here — or tap the + on a site
      </div>`;
    cartTotalArea.textContent = '0 sq.ft';
    btnCheckout.disabled = true;
    lucide.createIcons();
    return;
  }

  btnCheckout.disabled = false;
  let totalArea = 0;
  cartItemsContainer.innerHTML = '';

  cart.forEach(item => {
    totalArea += item.area;
    const el = document.createElement('div');
    el.className = 'cart-item';
    el.innerHTML = `
      <div class="cart-item-info">
        <strong>${item.location}</strong>
        <div class="cart-item-code">${item.id}</div>
        <div class="cart-item-coords">${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}</div>
      </div>
      <button class="btn-remove" onclick="removeFromCart('${item.id}')" aria-label="Remove ${item.id} from cart">
        <i data-lucide="x"></i> Remove
      </button>
    `;
    cartItemsContainer.appendChild(el);
  });

  cartTotalArea.textContent = `${totalArea.toLocaleString()} sq.ft`;
  lucide.createIcons();
}

/* -------------------------------------------------------------------- */
/* Checkout modal (extra: reserve / own workflow beyond the core spec)   */
/* -------------------------------------------------------------------- */

function openCheckoutModal() {
  if (cart.length === 0) return;

  const tableBody = document.getElementById('checkout-table-body');
  tableBody.innerHTML = '';
  let totalPrice = 0;

  cart.forEach(item => {
    const estRate = item.area * 150;
    totalPrice += estRate;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>#${item.sNo}</td>
      <td><strong>${item.id}</strong></td>
      <td>${item.type}</td>
      <td>${item.zone}</td>
      <td>${item.area} sq.ft</td>
      <td>₹${estRate.toLocaleString()}</td>
    `;
    tableBody.appendChild(row);
  });

  document.getElementById('modal-site-count').textContent = cart.length;
  document.getElementById('modal-total-price').textContent = `₹${totalPrice.toLocaleString()}/mo`;
  document.getElementById('checkout-modal').style.display = 'flex';
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').style.display = 'none';
}

function processCheckout(targetStatus) {
  cart.forEach(item => setSiteStatus(item.id, targetStatus));
  showToast(`Processed ${cart.length} site${cart.length === 1 ? '' : 's'} as [${targetStatus}].`);
  cart = [];
  saveCartToStorage();
  updateCartUI();
  closeCheckoutModal();
  renderApp();
}

/* -------------------------------------------------------------------- */
/* Filters / search / sidebar (mobile)                                   */
/* -------------------------------------------------------------------- */

function applyFilters() { renderApp(); }

function clearSearch() {
  document.getElementById('search-input').value = '';
  renderApp();
  document.getElementById('search-input').focus();
}

function clearAllFilters() {
  document.getElementById('filter-zone').value = 'ALL';
  document.getElementById('filter-type').value = 'ALL';
  document.getElementById('filter-status').value = 'ALL';
  clearSearch();
}

function toggleSidebar(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-open-btn').style.display = open ? 'none' : 'flex';
}

/* -------------------------------------------------------------------- */
/* Utilities                                                              */
/* -------------------------------------------------------------------- */

function cssEscape(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-triangle' : 'check-circle'}"></i> ${message}`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => toast.remove(), duration);
}