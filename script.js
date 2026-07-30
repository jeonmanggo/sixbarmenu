let DATA = null;
let activeTabKey = null;
let currentList = []; // cocktails currently rendered, each tagged with ._sheet
const state = { search: '', ice: 'all', alc: 'all' };

const LIGHT = ['하', '약', '중약', '중하'];
const STRONG = ['중상', '상'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

const ICON_COUPE = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 13c0 14 8 19 18 19s18-5 18-19"/><line x1="13" y1="13" x2="51" y2="13"/><line x1="32" y1="32" x2="32" y2="48"/><line x1="21" y1="48" x2="43" y2="48"/></svg>`;
const ICON_ROCKS = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16h28l-3 34a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4z"/><rect x="24" y="24" width="8" height="8" rx="1.5"/><rect x="33" y="29" width="7" height="7" rx="1.5"/></svg>`;
const ICON_TIKI = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 15c-2 0-3 2-3 5l2 28c0 4 3 6 7 6h18c4 0 7-2 7-6l2-28c0-3-1-5-3-5z"/><circle cx="26" cy="27" r="1.8" fill="currentColor" stroke="none"/><circle cx="38" cy="27" r="1.8" fill="currentColor" stroke="none"/><path d="M24 37c3 4 13 4 16 0"/><path d="M47 25c6 0 8 6 4 10-2 2-5 1-5-1"/></svg>`;

function glassIcon(sheetKey, ice) {
  if (sheetKey === '티키') return ICON_TIKI;
  if (ice === 'o') return ICON_ROCKS;
  return ICON_COUPE;
}

function bucketAlcohol(raw) {
  if (!raw) return 'medium';
  if (LIGHT.includes(raw)) return 'light';
  if (STRONG.includes(raw)) return 'strong';
  return 'medium';
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function slug(s) {
  return encodeURIComponent(s).replace(/%/g, '');
}

function imageCandidates(name) {
  return IMAGE_EXTS.map((ext) => `images/${encodeURIComponent(name)}.${ext}`);
}

// tries each local image candidate in order; falls back to a drawn glass icon
function mountThumb(container, cocktail, sheetKey) {
  if (!container) return;
  const candidates = imageCandidates(cocktail.name);
  let idx = 0;
  const img = new Image();
  img.alt = cocktail.name;
  img.className = 'thumb-img';

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

fetch('data.json')
  .then((r) => r.json())
  .then((data) => { DATA = data; init(); })
  .catch((err) => {
    document.getElementById('main').innerHTML =
      `<p style="padding:40px;color:#a13030;">data.json을 불러올 수 없습니다. 로컬 서버(예: python3 -m http.server)로 이 폴더를 열어주세요.<br>${err}</p>`;
  });

function init() {
  document.getElementById('statTotal').textContent = DATA.total;
  renderHeroStats();
  renderTabs();
  setActiveTab(DATA.sheets[0].key);
  bindStaticEvents();
}

function renderHeroStats() {
  const wrap = document.getElementById('heroStats');
  wrap.innerHTML = DATA.sheets.map((s) => `
    <div class="hero-stat">
      <span class="hero-stat-num">${s.count}</span>
      <span class="hero-stat-label">${s.emoji} ${escapeHTML(s.label)}</span>
    </div>`).join('');
}

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = DATA.sheets.map((s) => `
    <button class="tab" data-key="${s.key}">${s.emoji} ${escapeHTML(s.label)}</button>
  `).join('');
  nav.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.key));
  });
}

function setActiveTab(key) {
  activeTabKey = key;
  document.body.setAttribute('data-cat', key);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  state.search = '';
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getSheet() {
  return DATA.sheets.find((s) => s.key === activeTabKey);
}

function isSearching() {
  return state.search.trim().length > 0;
}

function allCocktailsFlat() {
  return DATA.sheets.flatMap((s) => s.cocktails.map((c) => ({ ...c, _sheet: s })));
}

function applyFilters(list) {
  const q = state.search.trim().toLowerCase();
  return list.filter((c) => {
    if (state.ice !== 'all' && c.ice !== state.ice) return false;
    if (state.alc !== 'all' && bucketAlcohol(c.alcohol) !== state.alc) return false;
    if (q) {
      const haystack = `${c.name} ${c.base || ''} ${c.feature || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function firstAppearanceOrder(list, keyFn) {
  const seen = new Set();
  const order = [];
  list.forEach((item) => {
    const k = keyFn(item);
    if (!seen.has(k)) { seen.add(k); order.push(k); }
  });
  return order;
}

function render() {
  if (isSearching()) {
    // search spans every category, not just the active tab
    currentList = applyFilters(allCocktailsFlat());
    renderByCategory(currentList);
  } else {
    const sheet = getSheet();
    currentList = applyFilters(sheet.cocktails).map((c) => ({ ...c, _sheet: sheet }));
    renderBySpiritGroup(currentList);
  }
  document.getElementById('emptyState').hidden = currentList.length > 0;
  bindCardEvents();
}

function renderBySpiritGroup(list) {
  const groupOrder = firstAppearanceOrder(list, (c) => c.group);
  renderGroupIndex(groupOrder.map((g) => ({ id: g, label: g })));
  renderSections(groupOrder.map((g) => ({
    id: g,
    title: g,
    items: list.filter((c) => c.group === g),
  })));
}

function renderByCategory(list) {
  const sheetsByKey = Object.fromEntries(DATA.sheets.map((s) => [s.key, s]));
  const keyOrder = firstAppearanceOrder(list, (c) => c._sheet.key);
  renderGroupIndex(keyOrder.map((k) => ({
    id: k,
    label: `${sheetsByKey[k].emoji} ${sheetsByKey[k].label}`,
  })));
  renderSections(keyOrder.map((k) => ({
    id: k,
    title: `${sheetsByKey[k].emoji} ${sheetsByKey[k].label}`,
    items: list.filter((c) => c._sheet.key === k),
  })));
}

function renderGroupIndex(entries) {
  const nav = document.getElementById('groupIndex');
  if (entries.length <= 1) {
    nav.innerHTML = '';
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  nav.innerHTML = entries.map((e) =>
    `<a href="#grp-${slug(e.id)}" class="group-pill">${escapeHTML(e.label)}</a>`
  ).join('');
}

function cardHTML(c, idx) {
  const iceLabel = c.ice === 'o' ? '얼음 있음' : c.ice === 'x' ? '얼음 없음' : '';
  return `
    <article class="cocktail-card" data-idx="${idx}" tabindex="0">
      <div class="card-thumb"></div>
      <p class="card-base">${escapeHTML(c.base || '')}</p>
      <h3 class="card-name">${escapeHTML(c.name)}</h3>
      <p class="card-feature">${escapeHTML(c.feature || '레시피를 눌러 자세히 보기')}</p>
      <div class="card-badges">
        ${c.ice ? `<span class="badge badge-ice badge-ice-${c.ice}">${iceLabel}</span>` : ''}
        ${c.alcohol ? `<span class="badge badge-alc badge-alc-${bucketAlcohol(c.alcohol)}">${escapeHTML(c.alcohol)}</span>` : ''}
      </div>
    </article>`;
}

function renderSections(sections) {
  const main = document.getElementById('main');
  if (sections.length === 0 || sections.every((s) => s.items.length === 0)) {
    main.innerHTML = '';
    return;
  }
  main.innerHTML = sections.map((sec) => `
    <section class="group-section" id="grp-${slug(sec.id)}">
      <h2 class="group-title"><span class="group-marker">▪</span> ${escapeHTML(sec.title)} <span class="group-count">${sec.items.length}종</span></h2>
      <div class="card-grid">
        ${sec.items.map((c) => cardHTML(c, currentList.indexOf(c))).join('')}
      </div>
    </section>`).join('');
}

function bindCardEvents() {
  document.querySelectorAll('.cocktail-card').forEach((card) => {
    const idx = Number(card.dataset.idx);
    const cocktail = currentList[idx];
    if (!cocktail) return;

    mountThumb(card.querySelector('.card-thumb'), cocktail, cocktail._sheet.key);

    const open = () => openTicket(cocktail, cocktail._sheet);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function openTicket(c, sheet) {
  document.getElementById('ticketBase').textContent = c.base || '';
  document.getElementById('ticketName').textContent = c.name;
  document.getElementById('pageNumber').textContent = String(c.page || 1).padStart(3, '0');

  mountThumb(document.getElementById('ticketThumb'), c, sheet.key);

  const badges = [];
  if (c.ice) badges.push(`<span class="badge badge-ice badge-ice-${c.ice}">${c.ice === 'o' ? '얼음 있음' : '얼음 없음'}</span>`);
  if (c.alcohol) badges.push(`<span class="badge badge-alc badge-alc-${bucketAlcohol(c.alcohol)}">${escapeHTML(c.alcohol)}</span>`);
  document.getElementById('ticketBadges').innerHTML = badges.join('');

  document.getElementById('ticketStory').textContent = c.story || c.feature || '';

  document.getElementById('ticketGlass').textContent = c.glass_type || '';

  const ingredients = c.ingredients_list && c.ingredients_list.length
    ? c.ingredients_list
    : (c.recipe || '').split(',').map((s) => s.trim()).filter(Boolean);
  document.getElementById('ticketIngredients').innerHTML =
    ingredients.length ? ingredients.map((l) => `<li>${escapeHTML(l)}</li>`).join('') : '<li>정보 없음</li>';

  const directions = c.directions && c.directions.length ? c.directions : [c.recipe || ''];
  document.getElementById('ticketDirections').innerHTML =
    directions.map((d) => `<li>${escapeHTML(d)}</li>`).join('');

  const tipEl = document.getElementById('ticketTip');
  tipEl.textContent = c.tip ? `※ ${c.tip}` : '';
  tipEl.hidden = !c.tip;

  const photoUrl = c.link || `https://www.google.com/search?q=${encodeURIComponent(c.name + ' cocktail')}&tbm=isch`;
  document.getElementById('ticketPhoto').href = photoUrl;
  document.getElementById('ticketHintName').textContent = c.name;

  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.add('open');
  backdrop.scrollTop = 0; // always open scrolled to the top of the ticket
}

function closeTicket() {
  document.getElementById('modalBackdrop').classList.remove('open');
}

function bindStaticEvents() {
  document.getElementById('ticketClose').addEventListener('click', closeTicket);
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeTicket();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTicket();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
  });

  document.getElementById('iceFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.ice = btn.dataset.val;
    [...e.currentTarget.children].forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });

  document.getElementById('alcFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.alc = btn.dataset.val;
    [...e.currentTarget.children].forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });

  document.getElementById('randomBtn').addEventListener('click', () => {
    const all = allCocktailsFlat();
    if (!all.length) return;
    const pick = all[Math.floor(Math.random() * all.length)];
    setActiveTab(pick._sheet.key);
    setTimeout(() => openTicket(pick, pick._sheet), 80);
  });

  document.getElementById('qrOpenBtn').addEventListener('click', openQrModal);
  document.getElementById('qrClose').addEventListener('click', closeQrModal);
  document.getElementById('qrBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'qrBackdrop') closeQrModal();
  });
}

function openQrModal() {
  const menuUrl = `${window.location.origin}/menu.html`;
  document.getElementById('qrUrl').textContent = menuUrl;

  const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  document.getElementById('qrWarn').hidden = !isLocalhost;

  const canvas = document.getElementById('qrCanvas');
  canvas.innerHTML = '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(menuUrl);
    qr.make();
    canvas.innerHTML = qr.createSvgTag(6, 8);
  } catch (e) {
    canvas.innerHTML = '<p style="color:#a13030;font-size:.8rem;">QR코드를 만들 수 없어요.</p>';
  }

  document.getElementById('qrBackdrop').classList.add('open');
}

function closeQrModal() {
  document.getElementById('qrBackdrop').classList.remove('open');
}
