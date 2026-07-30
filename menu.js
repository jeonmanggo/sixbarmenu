let DATA = null;
let activeKey = null;
let detailMap = {}; // idx -> cocktail, for the currently open detail card

const ICON_COUPE = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 13c0 14 8 19 18 19s18-5 18-19"/><line x1="13" y1="13" x2="51" y2="13"/><line x1="32" y1="32" x2="32" y2="48"/><line x1="21" y1="48" x2="43" y2="48"/></svg>`;
const ICON_ROCKS = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16h28l-3 34a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4z"/><rect x="24" y="24" width="8" height="8" rx="1.5"/><rect x="33" y="29" width="7" height="7" rx="1.5"/></svg>`;
const ICON_TIKI = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 15c-2 0-3 2-3 5l2 28c0 4 3 6 7 6h18c4 0 7-2 7-6l2-28c0-3-1-5-3-5z"/><circle cx="26" cy="27" r="1.8" fill="currentColor" stroke="none"/><circle cx="38" cy="27" r="1.8" fill="currentColor" stroke="none"/><path d="M24 37c3 4 13 4 16 0"/><path d="M47 25c6 0 8 6 4 10-2 2-5 1-5-1"/></svg>`;

function glassIcon(sheetKey, ice) {
  if (sheetKey === '티키') return ICON_TIKI;
  if (ice === 'o') return ICON_ROCKS;
  return ICON_COUPE;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function simplifyIngredient(s) {
  return s
    .replace(/\([^)]*\)/g, '')
    .replace(/[\d.]+\s*(oz|ml|tp|tsp|tbsp|dash|드랍|대쉬|방울)?\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function simpleIngredients(c) {
  const list = (c.ingredients_list && c.ingredients_list.length)
    ? c.ingredients_list
    : (c.recipe || '').split(',');
  return list.map(simplifyIngredient).filter(Boolean).join(' · ');
}

function imageCandidates(name) {
  return ['jpg', 'jpeg', 'png', 'webp'].map((ext) => `images/${encodeURIComponent(name)}.${ext}`);
}

function mountThumb(container, cocktail, sheetKey) {
  if (!container) return;
  const candidates = imageCandidates(cocktail.name);
  let idx = 0;
  const img = new Image();
  img.alt = cocktail.name;

  function tryNext() {
    if (idx >= candidates.length) {
      container.innerHTML = glassIcon(sheetKey, cocktail.ice);
      return;
    }
    img.src = candidates[idx++];
  }
  img.addEventListener('error', tryNext);
  img.addEventListener('load', () => {
    container.innerHTML = '';
    container.appendChild(img);
  });
  tryNext();
}

// ---------------- order log (localStorage, per-device/guest) ----------------
const ORDERS_KEY = 'sixbar_orders';

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}
function saveOrders(list) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
}
function hasOrdered(name) {
  return getOrders().some((o) => o.name === name);
}
function addOrder(name) {
  const list = getOrders();
  if (list.some((o) => o.name === name)) return;
  list.push({ name, time: new Date().toLocaleString('ko-KR', { hour12: false }) });
  saveOrders(list);
  updateOrdersCount();
}
function removeOrder(name) {
  saveOrders(getOrders().filter((o) => o.name !== name));
  updateOrdersCount();
}
function updateOrdersCount() {
  document.getElementById('myOrdersCount').textContent = getOrders().length;
}

// ---------------- data load / render ----------------
fetch('data.json')
  .then((r) => r.json())
  .then((data) => { DATA = data; init(); })
  .catch((err) => {
    document.getElementById('mMain').innerHTML =
      `<p style="padding:40px;color:#a13030;">메뉴를 불러올 수 없어요. 잠시 후 다시 시도해주세요.</p>`;
  });

function init() {
  renderTabs();
  setActiveTab(DATA.sheets[0].key);
  updateOrdersCount();
  bindStaticEvents();
}

function renderTabs() {
  const nav = document.getElementById('mTabs');
  nav.innerHTML = DATA.sheets.map((s) =>
    `<button class="m-tab" data-key="${s.key}">${s.emoji} ${escapeHTML(s.label)}</button>`
  ).join('');
  nav.querySelectorAll('.m-tab').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.key));
  });
}

function setActiveTab(key) {
  activeKey = key;
  document.body.setAttribute('data-mcat', key);
  document.querySelectorAll('.m-tab').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  renderGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getSheet() {
  return DATA.sheets.find((s) => s.key === activeKey);
}

function renderGrid() {
  const sheet = getSheet();
  const main = document.getElementById('mMain');
  const groups = [];
  sheet.cocktails.forEach((c) => {
    if (!groups.includes(c.group)) groups.push(c.group);
  });

  detailMap = {};
  let counter = 0;

  main.innerHTML = groups.map((g) => {
    const items = sheet.cocktails.filter((c) => c.group === g);
    return `
      <h2 class="m-group-title">${escapeHTML(g)}</h2>
      <div class="m-grid">
        ${items.map((c) => {
          const idx = counter++;
          detailMap[idx] = c;
          const ordered = hasOrdered(c.name);
          return `
            <article class="m-card" data-idx="${idx}">
              <div class="m-card-thumb"></div>
              <p class="m-card-base">${escapeHTML(c.base || '')}</p>
              <h3 class="m-card-name">${escapeHTML(c.name)}</h3>
              <p class="m-card-ing">${escapeHTML(simpleIngredients(c))}</p>
              ${ordered ? '<span class="m-card-ordered">✓ 마셨어요</span>' : ''}
            </article>`;
        }).join('')}
      </div>`;
  }).join('');

  main.querySelectorAll('.m-card').forEach((card) => {
    const idx = Number(card.dataset.idx);
    const c = detailMap[idx];
    mountThumb(card.querySelector('.m-card-thumb'), c, sheet.key);
    card.addEventListener('click', () => openDetail(c, sheet.key));
  });
}

function openDetail(c, sheetKey) {
  document.getElementById('mDetailBase').textContent = c.base || '';
  document.getElementById('mDetailName').textContent = c.name;
  document.getElementById('mDetailStory').textContent = c.story || c.feature || '';
  document.getElementById('mDetailIngredients').textContent = simpleIngredients(c);
  mountThumb(document.getElementById('mDetailThumb'), c, sheetKey);

  const btn = document.getElementById('mOrderBtn');
  function refreshBtn() {
    const done = hasOrdered(c.name);
    btn.textContent = done ? '✓ 마셨어요 (취소하려면 다시 탭)' : '이거 시켰어요';
    btn.classList.toggle('ordered', done);
  }
  refreshBtn();
  btn.onclick = () => {
    if (hasOrdered(c.name)) {
      removeOrder(c.name);
    } else {
      addOrder(c.name);
    }
    refreshBtn();
    renderGrid();
  };

  document.getElementById('mModalBackdrop').classList.add('open');
}

function closeDetail() {
  document.getElementById('mModalBackdrop').classList.remove('open');
}

function renderMyOrders() {
  const list = getOrders();
  const ul = document.getElementById('myOrdersList');
  document.getElementById('myOrdersEmpty').hidden = list.length > 0;
  ul.innerHTML = list.slice().reverse().map((o) => `
    <li><span class="ord-name">${escapeHTML(o.name)}</span><span class="ord-time">${escapeHTML(o.time)}</span></li>
  `).join('');
}

function bindStaticEvents() {
  document.getElementById('mModalClose').addEventListener('click', closeDetail);
  document.getElementById('mModalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'mModalBackdrop') closeDetail();
  });

  document.getElementById('myOrdersBtn').addEventListener('click', () => {
    renderMyOrders();
    document.getElementById('myOrdersBackdrop').classList.add('open');
  });
  document.getElementById('myOrdersClose').addEventListener('click', () => {
    document.getElementById('myOrdersBackdrop').classList.remove('open');
  });
  document.getElementById('myOrdersBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'myOrdersBackdrop') document.getElementById('myOrdersBackdrop').classList.remove('open');
  });
  document.getElementById('myOrdersClear').addEventListener('click', () => {
    if (confirm('내가 마신 칵테일 목록을 모두 비울까요?')) {
      saveOrders([]);
      updateOrdersCount();
      renderMyOrders();
      renderGrid();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetail();
      document.getElementById('myOrdersBackdrop').classList.remove('open');
    }
  });
}
