const STATUS_STORAGE_KEY = 'dnd_ooh_site_statuses_v3';
const CART_STORAGE_KEY = 'dnd_ooh_cart_items_v3';

let cart = [];
let map, markersLayer;

// Storage Management
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
  showToast('All 122 site statuses and cart progress have been reset.');
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  cart = getStoredCart();
  initMap();
  populateTypeFilter();
  updateCartUI();
  renderApp();

  // Multi-Tab Listener
  window.addEventListener('storage', (e) => {
    if (e.key === STATUS_STORAGE_KEY || e.key === CART_STORAGE_KEY) {
      cart = getStoredCart();
      updateCartUI();
      renderApp();
    }
  });
});

function initMap() {
  map = L.map('map').setView([28.5775, 77.2950], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function populateTypeFilter() {
  const types = [...new Set(SITES_DATA.map(s => s.type))];
  const select = document.getElementById('filter-type');
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
}

function renderApp() {
  const storedStatuses = getStoredStatuses();
  const zone = document.getElementById('filter-zone').value;
  const type = document.getElementById('filter-type').value;
  const statusFilter = document.getElementById('filter-status').value;

  const filtered = SITES_DATA.filter(site => {
    const siteStatus = storedStatuses[site.id] || 'Available';
    const matchZone = zone === 'ALL' || site.zone === zone;
    const matchType = type === 'ALL' || site.type === type;
    const matchStatus = statusFilter === 'ALL' || siteStatus === statusFilter;
    return matchZone && matchType && matchStatus;
  });

  document.getElementById('site-count').textContent = `Showing ${filtered.length} of ${SITES_DATA.length} sites`;

  renderSiteList(filtered, storedStatuses);
  renderMapMarkers(filtered, storedStatuses);
}

function renderSiteList(sites, storedStatuses) {
  const container = document.getElementById('site-list');
  container.innerHTML = '';

  sites.forEach(site => {
    const status = storedStatuses[site.id] || 'Available';
    const isAvailable = status === 'Available';
    const inCart = cart.some(c => c.id === site.id);

    const card = document.createElement('div');
    card.className = `site-card ${!isAvailable ? 'locked' : ''}`;
    card.draggable = isAvailable;

    if (isAvailable) {
      card.ondragstart = (e) => handleDragStart(e, site.id);
    } else {
      card.onclick = () => {
        showToast(`Site ${site.id} is ${status} and cannot be added.`, 'error');
      };
    }

    let badgeClass = 'badge-available';
    if (status === 'Reserved') badgeClass = 'badge-reserved';
    if (status === 'Owned') badgeClass = 'badge-owned';

    const gmapsUrl = `https://www.google.com/maps?q=${site.lat},${site.lng}`;

    card.innerHTML = `
      <div class="site-card-header">
        <span class="site-id">#${site.sNo} · ${site.id}</span>
        <span class="badge ${badgeClass}">${status}</span>
      </div>
      <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 4px;">${site.location}</div>
      <div class="site-meta">
        <span>Type: <strong>${site.type}</strong></span>
        <span>Area: <strong>${site.area} sq.ft</strong></span>
        <span>Zone: <strong>${site.zone}</strong></span>
        <span>Lit: <strong>${site.lit}</strong></span>
      </div>
      <div class="site-actions">
        <a href="${gmapsUrl}" target="_self" style="font-size: 0.75rem; color: #0284c7; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 2px;" onclick="event.stopPropagation();">
          <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> Google Maps
        </a>
        <button class="btn-add" ${!isAvailable || inCart ? 'disabled' : ''} onclick="event.stopPropagation(); addToCart('${site.id}')">
          ${inCart ? 'In Cart' : isAvailable ? '<i data-lucide="plus"></i> Add' : '<i data-lucide="lock"></i> Locked'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

function renderMapMarkers(sites, storedStatuses) {
  markersLayer.clearLayers();

  sites.forEach(site => {
    const status = storedStatuses[site.id] || 'Available';
    let markerColor = '#16a34a'; // Available
    if (status === 'Reserved') markerColor = '#d97706'; // Reserved
    if (status === 'Owned') markerColor = '#dc2626'; // Owned

    const customIcon = L.divIcon({
      className: 'custom-pin',
      html: `<div style="background-color: ${markerColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;"></div>`,
      iconSize: [16, 16]
    });

    const marker = L.marker([site.lat, site.lng], { icon: customIcon });

    const gmapsUrl = `https://www.google.com/maps?q=${site.lat},${site.lng}`;
    const mapTilePreview = `https://a.tile.openstreetmap.org/15/${long2tile(site.lng, 15)}/${lat2tile(site.lat, 15)}.png`;

    const popupContent = `
      <div>
        <img class="hover-card-img" src="${mapTilePreview}" alt="Site Location Preview" onError="this.style.display='none'"/>
        <div class="hover-card-body">
          <div class="hover-card-title">#${site.sNo} · ${site.id}</div>
          <div class="hover-card-loc">${site.location}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom: 6px;">
            Status: <strong style="color:${markerColor}">${status}</strong> | ${site.type}
          </div>
          <a href="${gmapsUrl}" target="_self" class="btn-gmaps">
            Open in Google Maps ↗
          </a>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, {
      autoClose: false,
      closeOnClick: false,
      closeButton: true
    });

    markersLayer.addLayer(marker);
  });
}

// Convert Lat/Lng to Tile Coordinates
function long2tile(lon, zoom) { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
function lat2tile(lat, zoom) { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }

// Drag & Drop / Cart Logic
function handleDragStart(e, siteId) {
  const storedStatuses = getStoredStatuses();
  const status = storedStatuses[siteId] || 'Available';
  if (status !== 'Available') {
    e.preventDefault();
    showToast(`Site ${siteId} is ${status} and cannot be moved.`, 'error');
    return;
  }
  e.dataTransfer.setData('text/plain', siteId);
}

function allowDrop(e) { e.preventDefault(); }

function handleDrop(e) {
  e.preventDefault();
  const siteId = e.dataTransfer.getData('text/plain');
  if (siteId) addToCart(siteId);
}

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
  if (site) {
    cart.push(site);
    saveCartToStorage();
    updateCartUI();
    renderApp();
    showToast(`Added ${site.id} to cart.`);
  }
}

function removeFromCart(siteId) {
  cart = cart.filter(item => item.id !== siteId);
  saveCartToStorage();
  updateCartUI();
  renderApp();
}

function updateCartUI() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartBadge = document.getElementById('cart-badge');
  const cartTotalArea = document.getElementById('cart-total-area');
  const btnCheckout = document.getElementById('btn-checkout');

  cartBadge.textContent = `${cart.length} Sites`;
  
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">Drag available sites here, or click '+ Add' on site cards</div>`;
    cartTotalArea.textContent = '0 sq.ft';
    btnCheckout.disabled = true;
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
      <div>
        <strong>#${item.sNo} · ${item.id}</strong>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${item.type} | ${item.area} sq.ft</div>
      </div>
      <button style="background:none; border:none; color:#ef4444; cursor:pointer;" onclick="removeFromCart('${item.id}')">
        <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
      </button>
    `;
    cartItemsContainer.appendChild(el);
  });

  cartTotalArea.textContent = `${totalArea.toLocaleString()} sq.ft`;
  lucide.createIcons();
}

// Checkout Modal
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
  cart.forEach(item => {
    setSiteStatus(item.id, targetStatus);
  });

  showToast(`Processed ${cart.length} sites as [${targetStatus}].`);
  cart = [];
  saveCartToStorage();
  updateCartUI();
  closeCheckoutModal();
  renderApp();
}

function applyFilters() { renderApp(); }

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-triangle' : 'check-circle'}"></i> ${message}`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => toast.remove(), 3500);
}