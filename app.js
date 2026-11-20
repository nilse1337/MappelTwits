import { SITE } from './config.js';
import {
  MAPLE_API, F_EMOTES, encodeOutfit, decodeOutfit, slotForId,
  characterGifUrl, characterPngUrl, itemIconUrl, resolveMapleVersion,
} from './outfit.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ---------------- Settings ----------------
const SKINS = [
  { id: 2000, color: '#ffe0c4', name: 'Light' },
  { id: 2001, color: '#f1c18f', name: 'Tanned' },
  { id: 2002, color: '#a8704a', name: 'Dark' },
  { id: 2003, color: '#fff3ea', name: 'Pale' },
  { id: 2004, color: '#c9d7e8', name: 'Ashen' },
  { id: 2005, color: '#bfe3a8', name: 'Green' },
];
const HAIR_COLORS = ['#2b2b2b', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2e86de', '#8e44ad', '#8b5a2b'];
const HAIR_COLOR_NAMES = ['Black', 'Red', 'Orange', 'Blonde', 'Green', 'Blue', 'Purple', 'Brown'];
const EYE_COLORS = ['#2b2b2b', '#2e86de', '#c0392b', '#27ae60', '#a07040', '#2e5fd0', '#9b59b6', '#b08ad6', '#eeeeee'];
const EYE_COLOR_NAMES = ['Black', 'Blue', 'Red', 'Green', 'Hazel', 'Sapphire', 'Violet', 'Amethyst', 'White'];

// Fallback lists in case the maplestory.io item list does not load
const FALLBACK = {
  hair: { 0: [30000, 30020, 30030, 30040, 30050, 30110, 30130], 1: [31000, 31040, 31050, 31010, 31020, 31030, 31060] },
  face: { 0: [20000, 20001, 20002, 20003, 20004, 20005], 1: [21000, 21001, 21002, 21003, 21004, 21005] },
};

const SLOTS = [
  { key: 'hat', label: 'Hat', queries: [['Armor', 'Hat']] },
  { key: 'top', label: 'Top', queries: [['Armor', 'Top']] },
  { key: 'bottom', label: 'Bottom', queries: [['Armor', 'Bottom']] },
  { key: 'overall', label: 'Overall', queries: [['Armor', 'Overall']] },
  { key: 'shoes', label: 'Shoes', queries: [['Armor', 'Shoes']] },
  { key: 'gloves', label: 'Gloves', queries: [['Armor', 'Glove']] },
  { key: 'cape', label: 'Cape', queries: [['Armor', 'Cape']] },
  { key: 'faceAcc', label: 'Face accessory', queries: [['Accessory', 'Face Accessory']] },
  { key: 'eyeAcc', label: 'Eye accessory', queries: [['Accessory', 'Eye Decoration']] },
  { key: 'earrings', label: 'Earrings', queries: [['Accessory', 'Earrings']] },
  { key: 'weapon', label: 'Weapon', queries: [['One-Handed Weapon', null], ['Two-Handed Weapon', null]] },
  { key: 'shield', label: 'Shield', queries: [['Armor', 'Shield']] },
];

const PAGE = 60;
const EAGER_ICONS = 12; // item icons (cheap, static) preloaded per closed section; drawn hair/face thumbnails load when opened

// ---------------- State ----------------
const state = {
  gender: 0,
  skin: 2000,
  hair: 30030, hairColor: 0,
  face: 20000, faceColor: 0,
  slots: { top: 1040002, bottom: 1060002, shoes: 1072001 },
  showWeapon: true,
  anim: 'stand1',
  emotion: '',
};
const names = new Map(); // item id -> { name, isCash }, for the section summaries
const nameLookups = new Map();

// Name of an item that is not in a loaded list yet (e.g. the default outfit), fetched once
function lookupName(id, done) {
  if (names.has(id)) return done();
  if (!nameLookups.has(id)) {
    nameLookups.set(id, fetch(`${MAPLE_API.base}/api/${MAPLE_API.region}/${MAPLE_API.version}/item/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) names.set(id, { id, name: d.description?.name || '', isCash: !!d.metaInfo?.cash }); })
      .catch(() => {}));
  }
  nameLookups.get(id).then(done);
}

function currentLook() {
  return {
    skin: state.skin,
    items: [state.hair + state.hairColor, state.face + state.faceColor * 100, ...Object.values(state.slots)],
    showWeapon: state.showWeapon,
  };
}

function save() {
  try { localStorage.setItem('maplestream-look', encodeOutfit(currentLook())); } catch {}
}

function applyCode(code) {
  const look = decodeOutfit(code.replace(/^!outfit\s+/i, ''));
  if (!look) return false;
  state.skin = look.skin;
  state.showWeapon = look.showWeapon;
  state.slots = {};
  for (const id of look.items) {
    const slot = slotForId(id);
    if (slot === 'hair') {
      state.hairColor = id % 10;
      state.hair = id - state.hairColor;
      state.gender = [31, 34, 37, 38, 41, 44, 47, 48].includes(Math.floor(id / 1000)) ? 1 : 0;
    } else if (slot === 'face') {
      state.faceColor = Math.floor(id / 100) % 10;
      state.face = id - state.faceColor * 100;
    } else if (slot) {
      state.slots[slot] = id;
    }
  }
  return true;
}

// ---------------- maplestory.io item list ----------------
const listCache = new Map();
function fetchList(params) {
  const q = new URLSearchParams({ overallCategoryFilter: 'Equip', ...params });
  const url = `${MAPLE_API.base}/api/${MAPLE_API.region}/${MAPLE_API.version}/item?${q}`;
  if (!listCache.has(url)) {
    listCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then((d) => (Array.isArray(d) ? d : d.items || []).map((it) => ({
      id: it.id ?? it.itemId,
      name: it.name ?? '',
      gender: it.requiredGender,
      isCash: !!it.isCash,
    })).filter((it) => Number.isInteger(it.id))).catch((e) => { listCache.delete(url); throw e; }));
  }
  return listCache.get(url);
}

const genderOk = (it) => it.gender === undefined || it.gender === null || it.gender === 2 || it.gender === state.gender;

// Loads the sections one after another, so maplestory.io is not flooded at page load
const loadQueue = [];
let loadBusy = 0;
function enqueue(job) {
  return new Promise((resolve) => {
    loadQueue.push(async () => { try { await job(); } finally { resolve(); } });
    pump();
  });
}
function pump() {
  while (loadBusy < 3 && loadQueue.length) {
    const job = loadQueue.shift();
    loadBusy++;
    job().finally(() => { loadBusy--; pump(); });
  }
}

// ---------------- Preview ----------------
// maplestory.io draws every new combination live; some items take several seconds, a few never work.
const PREVIEW_TIMEOUT_MS = 25000;
let previewTimer;
let previewTimeout;
let lastGood = null;   // last state that was drawn successfully
let lastChange = '';   // description of the last change, for the error message
let keepError = false; // keep the 'undone' message visible until the next change

function snapshot() {
  return JSON.stringify({
    skin: state.skin, hair: state.hair, hairColor: state.hairColor, face: state.face, faceColor: state.faceColor,
    slots: state.slots, showWeapon: state.showWeapon, gender: state.gender,
  });
}

function restore(snap) {
  Object.assign(state, JSON.parse(snap));
  refreshAllSections();
}

function previewFailed(url) {
  const img = $('preview');
  if (img.dataset.url !== url) return;
  clearTimeout(previewTimeout);
  $('previewLoading').hidden = true;
  if (lastGood && lastGood !== snapshot()) {
    $('previewError').textContent = `${lastChange || 'That item'} can't be drawn by maplestory.io right now, so it was undone. Try another one.`;
    $('previewError').hidden = false;
    keepError = true;
    restore(lastGood);
    img.dataset.url = '';
    updatePreview();
  } else {
    $('previewError').textContent = 'maplestory.io is not responding. Please try again in a moment.';
    $('previewError').hidden = false;
  }
}

function updatePreview(change) {
  if (change !== undefined) { lastChange = change; keepError = false; }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const url = characterGifUrl(currentLook(), state.anim, { emotion: state.emotion || undefined });
    const img = $('preview');
    if (img.dataset.url === url) return;
    img.dataset.url = url;
    $('previewLoading').textContent = 'Drawing your character…';
    $('previewLoading').hidden = false;
    clearTimeout(previewTimeout);
    setTimeout(() => {
      if (img.dataset.url === url && !$('previewLoading').hidden) {
        $('previewLoading').textContent = 'New items can take a few seconds…';
      }
    }, 3000);
    previewTimeout = setTimeout(() => previewFailed(url), PREVIEW_TIMEOUT_MS);
    const snap = snapshot();
    const test = new Image();
    test.fetchPriority = 'high'; // the preview goes before everything else
    test.onload = () => {
      if (img.dataset.url !== url) return;
      clearTimeout(previewTimeout);
      img.src = url;
      $('previewLoading').hidden = true;
      if (!keepError) $('previewError').hidden = true;
      lastGood = snap;
    };
    test.onerror = () => previewFailed(url);
    test.src = url;
  }, 150);
  $('codeText').textContent = `!outfit ${encodeOutfit(currentLook())}`;
  save();
}

// ---------------- Collapsible sections ----------------
const sections = []; // { refresh() } for every section

function makeSection(title, opts = {}) {
  const d = el('details', 'section');
  const summary = el('summary', '', `<span class="sec-title"></span><span class="sec-current"></span><span class="sec-chev">▾</span>`);
  summary.querySelector('.sec-title').textContent = title;
  d.appendChild(summary);
  const body = el('div', 'sec-body');
  d.appendChild(body);
  $('sections').appendChild(d);
  // open one section at a time (keeps the page tidy); clicking it again closes it
  d.addEventListener('toggle', () => {
    if (d.open && !opts.multi) sections.forEach((s) => s.details !== d && (s.details.open = false));
  });
  return { details: d, body, current: summary.querySelector('.sec-current') };
}

function setCurrent(target, { icon, label, cash }) {
  target.innerHTML = '';
  if (icon) {
    const i = el('img', 'cur-icon');
    i.src = icon;
    i.alt = '';
    i.onerror = () => i.remove();
    target.appendChild(i);
  }
  const s = el('span');
  s.textContent = label;
  target.appendChild(s);
  if (cash) target.appendChild(el('span', 'cash-badge small', ''));
}

function swatchRow(list, getActive, onPick, labels) {
  const row = el('div', 'swatches');
  const render = () => {
    row.innerHTML = '';
    list.forEach((item, i) => {
      const b = el('button', 'swatch' + (i === getActive() ? ' active' : ''));
      b.style.background = item.color || item;
      b.title = labels ? labels[i] : item.name;
      b.onclick = () => { onPick(i); render(); };
      row.appendChild(b);
    });
  };
  render();
  return { row, render };
}

// Start drawing the preview for a tile when the mouse rests on it, so a click shows it (almost) instantly
function hoverPrefetch(tile, lookFn) {
  let timer;
  tile.addEventListener('pointerenter', () => {
    timer = setTimeout(() => {
      const img = new Image();
      img.fetchPriority = 'high';
      img.src = characterGifUrl(lookFn(), state.anim, { emotion: state.emotion || undefined });
    }, 120);
  });
  tile.addEventListener('pointerleave', () => clearTimeout(timer));
}

function makeTile(it, imgUrl, eager, onPick) {
  const t = el('button', 'tile' + (it.isCash ? ' cash' : ''));
  t.dataset.id = it.id;
  t.title = (it.name ? `${it.name} (${it.id})` : String(it.id)) + (it.isCash ? ' · NX' : '');
  const img = el('img');
  img.alt = '';
  img.loading = eager ? 'eager' : 'lazy';
  img.src = imgUrl;
  // closed sections don't load their images by themselves, so warm the browser cache for the first icons
  if (eager) { const pre = new Image(); pre.fetchPriority = 'low'; pre.src = imgUrl; }
  t.appendChild(img);
  if (it.name !== undefined) {
    const lab = el('span', 'label');
    lab.textContent = it.name;
    t.appendChild(lab);
  }
  t.onclick = onPick;
  return { t, img };
}

// ---- Body: gender + skin ----
function bodySection() {
  const s = makeSection('Body');
  s.body.appendChild(el('h4', '', 'Gender'));
  const chips = el('div', 'chips');
  const genders = [['Male', 0], ['Female', 1]];
  for (const [label, g] of genders) {
    const b = el('button', 'chip');
    b.textContent = label;
    b.onclick = () => {
      state.gender = g;
      // matching default hair and face
      state.hair = g ? 31000 : 30030;
      state.face = g ? 21000 : 20000;
      if (state.slots.top) state.slots.top = g ? 1041002 : 1040002;
      if (state.slots.bottom) state.slots.bottom = g ? 1061002 : 1060002;
      refreshAllSections(true);
      updatePreview('That look');
    };
    chips.appendChild(b);
  }
  s.body.appendChild(chips);
  s.body.appendChild(el('h4', '', 'Skin'));
  const skins = swatchRow(SKINS, () => SKINS.findIndex((x) => x.id === state.skin), (i) => {
    state.skin = SKINS[i].id;
    refreshAllSections();
    updatePreview('That skin');
  });
  s.body.appendChild(skins.row);
  sections.push({
    details: s.details,
    refresh() {
      chips.querySelectorAll('.chip').forEach((b, i) => b.classList.toggle('active', genders[i][1] === state.gender));
      skins.render();
      const skin = SKINS.find((x) => x.id === state.skin);
      setCurrent(s.current, { label: `${state.gender ? 'Female' : 'Male'} · ${skin ? skin.name : 'Skin ' + state.skin}` });
    },
  });
}

// ---- Hair / Face ----
function lookSection(kind) {
  const isHair = kind === 'hair';
  const s = makeSection(isHair ? 'Hair' : 'Face');
  const colors = isHair ? HAIR_COLORS : EYE_COLORS;
  const colorNames = isHair ? HAIR_COLOR_NAMES : EYE_COLOR_NAMES;
  const colorKey = isHair ? 'hairColor' : 'faceColor';
  s.body.appendChild(el('h4', '', isHair ? 'Hair colour' : 'Eye colour'));
  const sw = swatchRow(colors, () => state[colorKey], (i) => {
    state[colorKey] = i;
    refreshAllSections();
    updatePreview(isHair ? 'That hair colour' : 'That eye colour');
  }, colorNames);
  s.body.appendChild(sw.row);
  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = isHair ? 'Search a hairstyle…' : 'Search a face…';
  const grid = el('div', 'grid looks');
  const more = el('button', 'more', 'Load more');
  more.hidden = true;
  s.body.append(search, grid, more);

  const isBase = isHair ? (id) => id % 10 === 0 : (id) => Math.floor(id / 100) % 10 === 0;
  const thumbUrl = (id) => characterPngUrl({
    skin: state.skin,
    items: isHair ? [id + state.hairColor, state.face + state.faceColor * 100] : [state.hair + state.hairColor, id + state.faceColor * 100],
  }, 'stand1', 0);

  let start = 0;
  let token = 0;
  let shown = 0;
  const seen = new Set();

  function addTiles(items) {
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      names.set(it.id, it);
      const { t } = makeTile({ ...it, name: undefined }, thumbUrl(it.id), false, () => {
        state[kind] = it.id;
        refreshAllSections();
        updatePreview(isHair ? 'That hairstyle' : 'That face');
      });
      t.title = (it.name || String(it.id)) + (it.isCash ? ' · NX' : '');
      hoverPrefetch(t, () => ({ ...currentLook(), items: currentLook().items.map((x) => (slotForId(x) === kind ? it.id + (isHair ? state.hairColor : state.faceColor * 100) : x)) }));
      grid.appendChild(t);
    }
    markActive();
  }

  async function load(reset) {
    const my = ++token;
    if (reset) { start = 0; shown = 0; grid.innerHTML = ''; seen.clear(); }
    more.hidden = true;
    try {
      let found = 0;
      let tries = 0;
      while (found < 24 && tries < 4) {
        const params = { categoryFilter: 'Character', subCategoryFilter: isHair ? 'Hair' : 'Face', startPosition: start, count: 400 };
        if (search.value.trim()) params.searchFor = search.value.trim();
        const list = await fetchList(params);
        if (my !== token) return;
        start += list.length;
        const items = list.filter((it) => isBase(it.id) && genderOk(it));
        addTiles(items);
        found += items.length;
        tries++;
        if (list.length < 400) { refreshCurrent(); return; }
      }
      more.hidden = false;
      if (!grid.children.length) throw new Error('empty');
    } catch {
      if (my !== token) return;
      if (!grid.children.length && !search.value.trim()) addTiles(FALLBACK[kind][state.gender].map((id) => ({ id })));
    }
    refreshCurrent();
  }

  function markActive() {
    grid.querySelectorAll('.tile').forEach((t) => t.classList.toggle('active', Number(t.dataset.id) === state[kind]));
  }

  function refreshCurrent() {
    const info = names.get(state[kind]);
    if (!info) lookupName(state[kind], () => names.has(state[kind]) && refreshCurrent());
    setCurrent(s.current, {
      label: `${info?.name || (isHair ? 'Hair ' : 'Face ') + state[kind]} · ${colorNames[state[colorKey]]}`,
      cash: info?.isCash,
    });
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(true), 350);
  });
  more.onclick = () => load(false);

  sections.push({
    details: s.details,
    load: () => enqueue(() => load(true)),
    reloadOnGender: true,
    refresh() {
      sw.render();
      markActive();
      refreshCurrent();
      // only redraw the thumbnails when something they show has changed
      const key = isHair ? `${state.skin}|${state.hairColor}|${state.face}|${state.faceColor}` : `${state.skin}|${state.hair}|${state.hairColor}|${state.faceColor}`;
      if (key !== this.thumbKey) {
        if (this.thumbKey) grid.querySelectorAll('.tile').forEach((t) => (t.querySelector('img').src = thumbUrl(Number(t.dataset.id))));
        this.thumbKey = key;
      }
    },
  });
}

// ---- Equipment slots ----
function slotSection(slot) {
  const s = makeSection(slot.label);
  const top = el('div', 'row');
  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search by name…';
  const none = el('button', 'btn ghost small', 'Wear nothing');
  top.append(search, none);
  s.body.appendChild(top);
  if (slot.key === 'weapon') {
    const lab = el('label', 'check', '<input type="checkbox"> Show my weapon and shield on stream');
    const box = lab.querySelector('input');
    box.checked = state.showWeapon;
    box.onchange = () => { state.showWeapon = box.checked; refreshAllSections(); updatePreview('Showing the weapon'); };
    s.body.appendChild(lab);
    s.weaponBox = box;
  }
  const grid = el('div', 'grid items');
  const status = el('p', 'hint');
  const more = el('button', 'more', 'Load more');
  more.hidden = true;
  s.body.append(grid, status, more);

  let start = 0;
  let token = 0;
  let shown = 0;

  function pick(it) {
    const id = it?.id ?? null;
    if (id == null) delete state.slots[slot.key];
    else state.slots[slot.key] = id;
    // an overall replaces top + bottom, and the other way round
    if (id != null && slot.key === 'overall') { delete state.slots.top; delete state.slots.bottom; }
    if (id != null && (slot.key === 'top' || slot.key === 'bottom')) delete state.slots.overall;
    refreshAllSections();
    updatePreview(id == null ? '' : (it.name || `Item ${id}`));
  }
  none.onclick = () => pick(null);

  async function load(reset) {
    const my = ++token;
    if (reset) { start = 0; shown = 0; grid.innerHTML = ''; }
    more.hidden = true;
    status.textContent = 'Loading…';
    try {
      const q = search.value.trim();
      const lists = await Promise.all(slot.queries.map(([cat, sub]) => {
        const params = { categoryFilter: cat, startPosition: start, count: PAGE };
        if (sub) params.subCategoryFilter = sub;
        if (q) params.searchFor = q;
        return fetchList(params);
      }));
      if (my !== token) return;
      start += PAGE;
      for (const it of lists.flat().filter(genderOk)) {
        names.set(it.id, it);
        const { t, img } = makeTile(it, itemIconUrl(it.id), shown++ < EAGER_ICONS, () => pick(it));
        hoverPrefetch(t, () => {
          const slots = { ...state.slots, [slot.key]: it.id };
          if (slot.key === 'overall') { delete slots.top; delete slots.bottom; }
          if (slot.key === 'top' || slot.key === 'bottom') delete slots.overall;
          return { skin: state.skin, items: [state.hair + state.hairColor, state.face + state.faceColor * 100, ...Object.values(slots)], showWeapon: state.showWeapon };
        });
        // Some items (e.g. cash weapons) have no icon: show the item on a small character instead
        img.onerror = () => {
          if (img.dataset.fallback) { t.classList.add('noimg'); return; }
          img.dataset.fallback = '1';
          img.src = characterPngUrl({ skin: state.skin, items: [it.id], showWeapon: true }, 'stand1', 0);
        };
        grid.appendChild(t);
      }
      more.hidden = !lists.some((l) => l.length === PAGE);
      status.textContent = grid.children.length ? '' : 'Nothing found.';
      markActive();
      refreshCurrent();
    } catch {
      if (my !== token) return;
      status.textContent = 'The item list from maplestory.io is not loading. Please try again later.';
    }
  }

  function markActive() {
    grid.querySelectorAll('.tile').forEach((t) => t.classList.toggle('active', Number(t.dataset.id) === state.slots[slot.key]));
  }

  function refreshCurrent() {
    const id = state.slots[slot.key];
    if (!id) return setCurrent(s.current, { label: 'None' });
    const info = names.get(id);
    setCurrent(s.current, { icon: itemIconUrl(id), label: info?.name || `Item ${id}`, cash: info?.isCash });
    if (!info) lookupName(id, () => names.has(id) && state.slots[slot.key] === id && refreshCurrent());
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(true), 350);
  });
  more.onclick = () => load(false);

  sections.push({
    details: s.details,
    load: () => enqueue(() => load(true)),
    reloadOnGender: true,
    refresh() {
      if (s.weaponBox) s.weaponBox.checked = state.showWeapon;
      markActive();
      refreshCurrent();
    },
  });
}

// ---- Load an existing code ----
function codeSection() {
  const s = makeSection('Load an existing code');
  s.body.innerHTML = `
    <div class="row"><input class="search" type="text" placeholder="!outfit a.1jk.mbu…"><button class="btn ghost">Load</button></div>
    <p class="hint"></p>`;
  const input = s.body.querySelector('input');
  const msg = s.body.querySelector('.hint');
  s.body.querySelector('button').onclick = () => {
    const ok = applyCode(input.value.trim());
    msg.textContent = ok ? 'Loaded!' : 'That code is not valid.';
    if (ok) { refreshAllSections(true); updatePreview('That code'); }
  };
  setCurrent(s.current, { label: 'Paste a code from chat' });
  sections.push({ details: s.details, refresh() {} });
}

function refreshAllSections(reloadLists = false) {
  for (const sec of sections) {
    sec.refresh();
    if (reloadLists && sec.reloadOnGender) sec.load();
  }
}

// ---------------- Preview controls & code ----------------
document.querySelectorAll('#animButtons .chip').forEach((b) => {
  b.onclick = () => {
    state.anim = b.dataset.anim;
    document.querySelectorAll('#animButtons .chip').forEach((x) => x.classList.toggle('active', x === b));
    updatePreview('That pose');
  };
});

for (const [key, e] of Object.entries(F_EMOTES)) {
  const o = document.createElement('option');
  o.value = e;
  o.textContent = `${key.toUpperCase()} (${e})`;
  $('emoteSelect').appendChild(o);
}
$('emoteSelect').onchange = (e) => { state.emotion = e.target.value; updatePreview('That emote'); };

$('copyCode').onclick = async () => {
  try { await navigator.clipboard.writeText($('codeText').textContent); } catch {}
  $('copyCode').textContent = 'Copied!';
  setTimeout(() => ($('copyCode').textContent = 'Copy'), 1500);
};

// ---------------- Navigation ----------------
document.querySelectorAll('.nav-btn[data-page]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.nav-btn[data-page]').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${b.dataset.page}`));
  };
});

// ---------------- Commands page ----------------
const COMMAND_GROUPS = [
  { title: 'Moves', items: [
    ['!jump', 'Jump'], ['!sit', 'Sit on a random chair (until !move)'], ['!move', 'Stand up and walk around again'], ['!prone', 'Lie down'],
    ['!dance', 'Dance'],
  ] },
  { title: 'Emotes', items: Object.entries(F_EMOTES).map(([k, e], i) => [`!${k}`, i < 7 ? e : `${e} (bonus)`]) },
  { title: 'Your character', items: [
    ['!outfit CODE', 'Set your character with the code from this site'],
    ['!outfit', 'Link to this site with your current character'],
    ['!help', 'List of commands'],
  ] },
  { title: 'For the streamer and moderators', items: [
    ['!dance all', 'Everyone on screen dances, in step', true],
    ['!panic', 'Everyone runs around in panic for 10 seconds, even seated characters', true],
    ['!size NAME 1.5', 'Change the size of one character (0.25 to 5, or "reset")', true],
    ['!refresh', 'Fully reload the overlay, e.g. when a character does not update', true],
  ] },
];

function renderCommands() {
  const list = $('commandList');
  for (const g of COMMAND_GROUPS) {
    const sec = el('div', 'cmd-group', '<h3></h3><div class="cmd-list"></div>');
    sec.querySelector('h3').textContent = g.title;
    for (const [cmd, desc, mod] of g.items) {
      const row = el('div', 'cmd', `<div><b></b>${mod ? '<span class="badge">mods</span>' : ''}<br><span></span></div><button class="btn ghost small">Copy</button>`);
      row.querySelector('b').textContent = cmd;
      row.querySelector('span:last-of-type').textContent = desc;
      row.querySelector('button').onclick = async (ev) => {
        try { await navigator.clipboard.writeText(cmd.replace(' CODE', '')); } catch {}
        ev.target.textContent = 'Copied!';
        setTimeout(() => (ev.target.textContent = 'Copy'), 1500);
      };
      sec.querySelector('.cmd-list').appendChild(row);
    }
    list.appendChild(sec);
  }
}

// ---------------- Start ----------------
document.title = `${SITE.title} — create your character`;
$('siteTitle').textContent = SITE.title;
$('streamLink').href = `https://twitch.tv/${SITE.twitchChannel}`;
$('streamLink').textContent = 'Go back to stream';

const urlCode = new URLSearchParams(location.search).get('code');
let stored = null;
try { stored = localStorage.getItem('maplestream-look'); } catch {}
if (urlCode) applyCode(urlCode);
else if (stored) applyCode(stored);

renderCommands();
bodySection();
lookSection('hair');
lookSection('face');
SLOTS.forEach(slotSection);
codeSection();
refreshAllSections();

await resolveMapleVersion();
updatePreview('That code');
// everything starts closed, but all lists already load in the background
for (const sec of sections) sec.load?.();
