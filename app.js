import { SITE } from './config.js';
import {
  MAPLE_API, EMOTIONS, encodeOutfit, decodeOutfit, slotForId,
  characterGifUrl, characterPngUrl, itemIconUrl, resolveMapleVersion,
} from './outfit.js';

const $ = (id) => document.getElementById(id);

// ---------------- Instellingen ----------------
const SKINS = [
  { id: 2000, color: '#ffe0c4', name: 'Licht' },
  { id: 2001, color: '#f1c18f', name: 'Gebruind' },
  { id: 2002, color: '#a8704a', name: 'Donker' },
  { id: 2003, color: '#fff3ea', name: 'Bleek' },
  { id: 2004, color: '#c9d7e8', name: 'Grijsblauw' },
  { id: 2005, color: '#bfe3a8', name: 'Groen' },
];
const HAIR_COLORS = ['#2b2b2b', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2e86de', '#8e44ad', '#8b5a2b'];
const HAIR_COLOR_NAMES = ['Zwart', 'Rood', 'Oranje', 'Blond', 'Groen', 'Blauw', 'Paars', 'Bruin'];
const EYE_COLORS = ['#2b2b2b', '#2e86de', '#c0392b', '#27ae60', '#a07040', '#2e5fd0', '#9b59b6', '#b08ad6', '#eeeeee'];
const EYE_COLOR_NAMES = ['Zwart', 'Blauw', 'Rood', 'Groen', 'Hazelnoot', 'Saffier', 'Violet', 'Amethist', 'Wit'];

// Reserve-lijsten als de item-lijst van maplestory.io niet laadt
const FALLBACK = {
  hair: { 0: [30000, 30020, 30030, 30040, 30050, 30110, 30130], 1: [31000, 31040, 31050, 31010, 31020, 31030, 31060] },
  face: { 0: [20000, 20001, 20002, 20003, 20004, 20005], 1: [21000, 21001, 21002, 21003, 21004, 21005] },
};

const SLOTS = [
  { key: 'hat', label: 'Hoed', queries: [['Armor', 'Hat']] },
  { key: 'top', label: 'Shirt', queries: [['Armor', 'Top']] },
  { key: 'bottom', label: 'Broek/rok', queries: [['Armor', 'Bottom']] },
  { key: 'overall', label: 'Overall', queries: [['Armor', 'Overall']] },
  { key: 'shoes', label: 'Schoenen', queries: [['Armor', 'Shoes']] },
  { key: 'gloves', label: 'Handschoenen', queries: [['Armor', 'Glove']] },
  { key: 'cape', label: 'Cape', queries: [['Armor', 'Cape']] },
  { key: 'faceAcc', label: 'Gezicht-acc.', queries: [['Accessory', 'Face Accessory']] },
  { key: 'eyeAcc', label: 'Bril', queries: [['Accessory', 'Eye Decoration']] },
  { key: 'earrings', label: 'Oorbellen', queries: [['Accessory', 'Earrings']] },
  { key: 'weapon', label: 'Wapen', queries: [['One-Handed Weapon', null], ['Two-Handed Weapon', null]] },
  { key: 'shield', label: 'Schild', queries: [['Armor', 'Shield']] },
];

const PAGE = 60;

// ---------------- Toestand ----------------
const state = {
  gender: 0,
  skin: 2000,
  hair: 30030, hairColor: 0,
  face: 20000, faceColor: 0,
  slots: { top: 1040002, bottom: 1060002, shoes: 1072001 },
  showWeapon: true,
  anim: 'stand1',
  emotion: '',
  activeSlot: 'hat',
};

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

// ---------------- maplestory.io item-lijst ----------------
const listCache = new Map();
async function fetchItems(category, sub, search, start) {
  const q = new URLSearchParams({ overallCategoryFilter: 'Equip', categoryFilter: category, startPosition: start, count: PAGE });
  if (sub) q.set('subCategoryFilter', sub);
  if (search) q.set('searchFor', search);
  const url = `${MAPLE_API.base}/api/${MAPLE_API.region}/${MAPLE_API.version}/item?${q}`;
  if (!listCache.has(url)) {
    listCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then((d) => (Array.isArray(d) ? d : d.items || d.Items || []).map((it) => ({
      id: it.id ?? it.itemId ?? it.Id,
      name: it.name ?? it.Name ?? '',
      gender: it.requiredGender ?? it.RequiredGender,
    })).filter((it) => Number.isInteger(it.id))).catch((e) => { listCache.delete(url); throw e; }));
  }
  return listCache.get(url);
}

const genderOk = (it) => it.gender === undefined || it.gender === null || it.gender === 2 || it.gender === state.gender;

// ---------------- Voorbeeld ----------------
let previewTimer;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const url = characterGifUrl(currentLook(), state.anim, { emotion: state.emotion || undefined });
    const img = $('preview');
    if (img.dataset.url === url) return;
    img.dataset.url = url;
    $('previewLoading').hidden = false;
    $('previewError').hidden = true;
    const test = new Image();
    test.onload = () => { if (img.dataset.url === url) { img.src = url; $('previewLoading').hidden = true; } };
    test.onerror = () => { if (img.dataset.url === url) { $('previewLoading').hidden = true; $('previewError').hidden = false; } };
    test.src = url;
  }, 150);
  updateCode();
  save();
}

function updateCode() {
  $('codeText').textContent = `!outfit ${encodeOutfit(currentLook())}`;
}

// ---------------- Stap 1: uiterlijk ----------------
function renderSwatches(el, list, active, onPick, names) {
  el.innerHTML = '';
  list.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === active ? ' active' : '');
    b.style.background = item.color || item;
    b.title = names ? names[i] : item.name;
    b.onclick = () => onPick(i);
    el.appendChild(b);
  });
}

function renderLookSwatches() {
  renderSwatches($('skinSwatches'), SKINS, SKINS.findIndex((s) => s.id === state.skin), (i) => {
    state.skin = SKINS[i].id; renderLookSwatches(); refreshLookThumbs(); updatePreview();
  });
  renderSwatches($('hairColors'), HAIR_COLORS, state.hairColor, (i) => {
    state.hairColor = i; renderLookSwatches(); refreshLookThumbs(); updatePreview();
  }, HAIR_COLOR_NAMES);
  renderSwatches($('faceColors'), EYE_COLORS, state.faceColor, (i) => {
    state.faceColor = i; renderLookSwatches(); refreshLookThumbs(); updatePreview();
  }, EYE_COLOR_NAMES);
  document.querySelectorAll('#genderButtons .chip').forEach((b) => b.classList.toggle('active', Number(b.dataset.gender) === state.gender));
}

// Een lijst (haar of gezicht) met "meer laden" en zoeken
function makeLookList(kind) {
  const grid = $(kind + 'Grid');
  const more = $(kind + 'More');
  const search = $(kind + 'Search');
  let start = 0;
  let token = 0;
  const seen = new Set();

  const isBase = kind === 'hair' ? (id) => id % 10 === 0 : (id) => Math.floor(id / 100) % 10 === 0;

  function thumbUrl(id) {
    const look = kind === 'hair'
      ? { skin: state.skin, items: [id + state.hairColor, state.face + state.faceColor * 100] }
      : { skin: state.skin, items: [state.hair + state.hairColor, id + state.faceColor * 100] };
    return characterPngUrl(look, 'stand1', 0);
  }

  function addTiles(items) {
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const t = document.createElement('button');
      t.className = 'tile' + (state[kind] === it.id ? ' active' : '');
      t.dataset.id = it.id;
      t.title = it.name || String(it.id);
      t.innerHTML = `<img loading="lazy" alt="">`;
      t.querySelector('img').src = thumbUrl(it.id);
      t.onclick = () => {
        state[kind] = it.id;
        grid.querySelectorAll('.tile').forEach((x) => x.classList.toggle('active', x === t));
        if (kind === 'hair') faceList.refresh(); else hairList.refresh();
        updatePreview();
      };
      grid.appendChild(t);
    }
  }

  async function load(reset) {
    const my = ++token;
    if (reset) { start = 0; grid.innerHTML = ''; seen.clear(); }
    more.hidden = true;
    try {
      // Haar en gezichten hebben veel kleurvarianten, dus we halen een grotere pagina op
      let found = 0;
      let tries = 0;
      while (found < 24 && tries < 4) {
        const res = await fetchItemsBig(kind === 'hair' ? 'Hair' : 'Face', search.value.trim(), start);
        if (my !== token) return;
        start += res.count;
        const items = res.items.filter((it) => isBase(it.id) && genderOk(it));
        addTiles(items);
        found += items.length;
        tries++;
        if (res.count < res.requested) { more.hidden = true; return; }
      }
      more.hidden = false;
      if (!grid.children.length) throw new Error('leeg');
    } catch {
      if (my !== token) return;
      if (!grid.children.length && !search.value.trim()) {
        addTiles(FALLBACK[kind][state.gender].map((id) => ({ id })));
      }
    }
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(true), 350);
  });
  more.onclick = () => load(false);

  return {
    load,
    refresh() {
      grid.querySelectorAll('.tile').forEach((t) => {
        t.querySelector('img').src = thumbUrl(Number(t.dataset.id));
        t.classList.toggle('active', Number(t.dataset.id) === state[kind]);
      });
    },
  };
}

async function fetchItemsBig(sub, search, start) {
  const requested = 400;
  const q = new URLSearchParams({ overallCategoryFilter: 'Equip', categoryFilter: 'Character', subCategoryFilter: sub, startPosition: start, count: requested });
  if (search) q.set('searchFor', search);
  const url = `${MAPLE_API.base}/api/${MAPLE_API.region}/${MAPLE_API.version}/item?${q}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const raw = Array.isArray(d) ? d : d.items || [];
  return {
    requested,
    count: raw.length,
    items: raw.map((it) => ({ id: it.id ?? it.itemId, name: it.name ?? '', gender: it.requiredGender })).filter((it) => Number.isInteger(it.id)),
  };
}

const hairList = makeLookList('hair');
const faceList = makeLookList('face');

function refreshLookThumbs() {
  hairList.refresh();
  faceList.refresh();
}

document.querySelectorAll('#genderButtons .chip').forEach((b) => {
  b.onclick = () => {
    state.gender = Number(b.dataset.gender);
    // passend standaard-haar en -gezicht
    state.hair = state.gender ? 31000 : 30030;
    state.face = state.gender ? 21000 : 20000;
    if (state.slots.top) state.slots.top = state.gender ? 1041002 : 1040002;
    if (state.slots.bottom) state.slots.bottom = state.gender ? 1061002 : 1060002;
    renderLookSwatches();
    hairList.load(true);
    faceList.load(true);
    renderSlotButtons();
    updatePreview();
  };
});

// ---------------- Stap 2: outfit ----------------
function renderSlotButtons() {
  const el = $('slotButtons');
  el.innerHTML = '';
  for (const s of SLOTS) {
    const b = document.createElement('button');
    b.className = 'slot-btn' + (s.key === state.activeSlot ? ' active' : '');
    const id = state.slots[s.key];
    b.innerHTML = (id ? `<img src="${itemIconUrl(id)}" alt="">` : '<span class="empty"></span>') + `<span>${s.label}</span>`;
    b.onclick = () => { state.activeSlot = s.key; renderSlotButtons(); loadSlotItems(true); };
    el.appendChild(b);
  }
}

let itemStart = 0;
let itemToken = 0;
async function loadSlotItems(reset) {
  const slot = SLOTS.find((s) => s.key === state.activeSlot);
  const grid = $('itemGrid');
  const my = ++itemToken;
  if (reset) { itemStart = 0; grid.innerHTML = ''; }
  $('slotTitle').textContent = slot.label;
  $('itemMore').hidden = true;
  $('itemStatus').textContent = 'Laden…';
  try {
    const search = $('itemSearch').value.trim();
    const lists = await Promise.all(slot.queries.map(([cat, sub]) => fetchItems(cat, sub, search, itemStart)));
    if (my !== itemToken) return;
    itemStart += PAGE;
    const items = lists.flat().filter(genderOk);
    for (const it of items) {
      const t = document.createElement('button');
      t.className = 'tile' + (state.slots[slot.key] === it.id ? ' active' : '');
      t.title = it.name ? `${it.name} (${it.id})` : String(it.id);
      t.innerHTML = `<img loading="lazy" src="${itemIconUrl(it.id)}" alt=""><span class="label"></span>`;
      t.querySelector('.label').textContent = it.name;
      t.onclick = () => selectItem(slot.key, it.id);
      grid.appendChild(t);
    }
    const anyFull = lists.some((l) => l.length === PAGE);
    $('itemMore').hidden = !anyFull;
    $('itemStatus').textContent = grid.children.length ? '' : 'Niets gevonden.';
  } catch {
    if (my !== itemToken) return;
    $('itemStatus').textContent = 'De itemlijst van maplestory.io laadt niet. Probeer het later opnieuw.';
  }
}

function selectItem(slot, id) {
  if (id == null) delete state.slots[slot];
  else state.slots[slot] = id;
  // overall vervangt shirt + broek, en andersom
  if (id != null && slot === 'overall') { delete state.slots.top; delete state.slots.bottom; }
  if (id != null && (slot === 'top' || slot === 'bottom')) delete state.slots.overall;
  renderSlotButtons();
  document.querySelectorAll('#itemGrid .tile').forEach((t) => t.classList.toggle('active', t.title.endsWith(`(${id})`) || t.title === String(id)));
  updatePreview();
}

let itemSearchTimer;
$('itemSearch').addEventListener('input', () => {
  clearTimeout(itemSearchTimer);
  itemSearchTimer = setTimeout(() => loadSlotItems(true), 350);
});
$('itemMore').onclick = () => loadSlotItems(false);
$('slotClear').onclick = () => selectItem(state.activeSlot, null);
$('showWeapon').onchange = (e) => { state.showWeapon = e.target.checked; updatePreview(); };

// ---------------- Stap 3: code ----------------
$('copyCode').onclick = async () => {
  try { await navigator.clipboard.writeText($('codeText').textContent); } catch {}
  $('copyCode').textContent = 'Gekopieerd!';
  setTimeout(() => ($('copyCode').textContent = 'Kopieer'), 1500);
};

$('loadCode').onclick = () => {
  const ok = applyCode($('loadCodeInput').value.trim());
  $('loadCodeMsg').textContent = ok ? 'Geladen!' : 'Die code klopt niet.';
  if (ok) rerenderAll();
};

// ---------------- Navigatie ----------------
function gotoStep(n) {
  document.querySelectorAll('.step-tab').forEach((t) => t.classList.toggle('active', t.dataset.step === String(n)));
  document.querySelectorAll('.step').forEach((s) => s.classList.toggle('active', s.id === `step-${n}`));
  if (n === 2 && !$('itemGrid').children.length) loadSlotItems(true);
}
document.querySelectorAll('.step-tab').forEach((t) => (t.onclick = () => gotoStep(Number(t.dataset.step))));
document.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => gotoStep(Number(b.dataset.goto))));

document.querySelectorAll('.nav-btn[data-page]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.nav-btn[data-page]').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${b.dataset.page}`));
  };
});

document.querySelectorAll('#animButtons .chip').forEach((b) => {
  b.onclick = () => {
    state.anim = b.dataset.anim;
    document.querySelectorAll('#animButtons .chip').forEach((x) => x.classList.toggle('active', x === b));
    updatePreview();
  };
});

for (const e of EMOTIONS) {
  const o = document.createElement('option');
  o.value = o.textContent = e;
  $('emoteSelect').appendChild(o);
}
$('emoteSelect').onchange = (e) => { state.emotion = e.target.value; updatePreview(); };

// ---------------- Commands-pagina ----------------
const COMMAND_GROUPS = [
  { title: 'Bewegen', items: [
    ['!jump', 'Springen'], ['!sit', 'Gaan zitten'], ['!prone', 'Gaan liggen'],
    ['!dance', 'Dansen'], ['!emote smile', 'Gezichtsuitdrukking (bv. smile, wink, love, cry, angry)'],
  ] },
  { title: 'Je karakter', items: [
    ['!outfit CODE', 'Je karakter instellen met de code van deze site'],
    ['!outfit', 'Link naar deze site met je huidige karakter'],
    ['!help', 'Lijst met commando\'s'],
  ] },
  { title: 'Voor de streamer en moderators', items: [
    ['!dance all', 'Iedereen in beeld danst tegelijk', true],
  ] },
];

function renderCommands() {
  const el = $('commandList');
  for (const g of COMMAND_GROUPS) {
    const sec = document.createElement('div');
    sec.className = 'cmd-group';
    sec.innerHTML = `<h3></h3><div class="cmd-list"></div>`;
    sec.querySelector('h3').textContent = g.title;
    for (const [cmd, desc, mod] of g.items) {
      const row = document.createElement('div');
      row.className = 'cmd';
      row.innerHTML = `<div><b></b>${mod ? '<span class="badge">mods</span>' : ''}<br><span></span></div><button class="btn ghost small">Kopieer</button>`;
      row.querySelector('b').textContent = cmd;
      row.querySelector('span:last-of-type').textContent = desc;
      row.querySelector('button').onclick = async (ev) => {
        try { await navigator.clipboard.writeText(cmd.replace(' CODE', '')); } catch {}
        ev.target.textContent = 'Gekopieerd!';
        setTimeout(() => (ev.target.textContent = 'Kopieer'), 1500);
      };
      sec.querySelector('.cmd-list').appendChild(row);
    }
    el.appendChild(sec);
  }
}

// ---------------- Start ----------------
function rerenderAll() {
  $('showWeapon').checked = state.showWeapon;
  renderLookSwatches();
  hairList.load(true);
  faceList.load(true);
  renderSlotButtons();
  if ($('itemGrid').children.length) loadSlotItems(true);
  updatePreview();
}

document.title = `${SITE.title} — maak je karakter`;
$('siteTitle').textContent = SITE.title;
$('streamLink').href = `https://twitch.tv/${SITE.twitchChannel}`;
$('streamLink').textContent = `Naar ${SITE.streamer}`;

const urlCode = new URLSearchParams(location.search).get('code');
let stored = null;
try { stored = localStorage.getItem('maplestream-look'); } catch {}
if (urlCode) applyCode(urlCode);
else if (stored) applyCode(stored);

renderCommands();
await resolveMapleVersion();
rerenderAll();
