// Gedeelde logica voor outfit-codes en het tekenen van karakters via maplestory.io.
// Dit bestand wordt gebruikt door het programma, de overlay EN de website.
// Pas je iets aan? Kopieer het dan ook naar website/js/outfit.js.

export const MAPLE_API = {
  base: 'https://maplestory.io',
  region: 'GMS',
  version: '270', // wordt bij het opstarten bijgewerkt naar de nieuwste versie (zie resolveMapleVersion)
};

// maplestory.io kent geen "latest": we zoeken de nieuwste GMS-versie op.
// Node (het programma) kan de versielijst direct lezen. Browsers mogen dat niet (CORS),
// dus daar proberen we vanaf de huidige versie omhoog tot er een 404 komt.
export async function resolveMapleVersion() {
  const { base, region } = MAPLE_API;
  try {
    const res = await fetch(`${base}/api/wz`);
    const list = await res.json();
    const versions = list
      .filter((v) => v.region === region && v.isReady && v.hasImages && /^\d+$/.test(v.mapleVersionId))
      .map((v) => Number(v.mapleVersionId));
    if (versions.length) MAPLE_API.version = String(Math.max(...versions));
    return MAPLE_API.version;
  } catch {
    // waarschijnlijk een browser: zelf proberen
  }
  let v = Number(MAPLE_API.version);
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${base}/api/${region}/${v + 1}/item?overallCategoryFilter=Equip&count=1`);
      if (!res.ok) break;
      v++;
    } catch {
      break;
    }
  }
  MAPLE_API.version = String(v);
  return MAPLE_API.version;
}

// ---------- Item-soorten op basis van ID ----------
export const isSkin = (id) => id >= 2000 && id < 3000;
export const isFace = (id) => (id >= 20000 && id < 30000) || (id >= 50000 && id < 60000);
export const isHair = (id) => (id >= 30000 && id < 50000) || (id >= 60000 && id < 70000);
export const isWeaponOrShield = (id) =>
  (id >= 1090000 && id < 1100000) || (id >= 1200000 && id < 1800000);

// Welk slot hoort bij een equip-ID (gebruikt door de website om een code terug te laden)
export function slotForId(id) {
  if (isHair(id)) return 'hair';
  if (isFace(id)) return 'face';
  const g = Math.floor(id / 10000);
  const map = {
    100: 'hat', 101: 'faceAcc', 102: 'eyeAcc', 103: 'earrings',
    104: 'top', 105: 'overall', 106: 'bottom', 107: 'shoes',
    108: 'gloves', 109: 'shield', 110: 'cape', 135: 'shield',
  };
  if (map[g]) return map[g];
  if (id >= 1200000 && id < 1800000) return 'weapon';
  return null;
}

// ---------- Outfit-code ----------
// Formaat:  a.1jk.mbu.fk8...   (eerste teken: a = wapen tonen, b = wapen verbergen)
// Daarna: skin-ID en item-ID's in base36, gescheiden door punten.
const MAX_ITEMS = 16;

export function encodeOutfit(look) {
  const flag = look.showWeapon === false ? 'b' : 'a';
  const ids = [look.skin, ...look.items].map((n) => Number(n).toString(36));
  return [flag, ...ids].join('.');
}

export function decodeOutfit(code) {
  if (typeof code !== 'string') return null;
  const parts = code.trim().toLowerCase().split('.');
  if (parts.length < 2 || parts.length > MAX_ITEMS + 2) return null;
  const flag = parts[0];
  if (flag !== 'a' && flag !== 'b') return null;
  const nums = [];
  for (const p of parts.slice(1)) {
    if (!/^[0-9a-z]{1,6}$/.test(p)) return null;
    nums.push(parseInt(p, 36));
  }
  const [skin, ...rest] = nums;
  if (!isSkin(skin)) return null;
  const items = [];
  for (const id of rest) {
    if (!Number.isInteger(id) || id < 10000 || id > 9999999) return null;
    if (!items.includes(id)) items.push(id);
  }
  return { skin, items, showWeapon: flag === 'a' };
}

// ---------- Karakter-afbeelding ----------
export const ANIMATIONS = ['stand1', 'walk1', 'jump', 'sit', 'prone', 'alert'];

export const EMOTIONS = [
  'smile', 'wink', 'love', 'cheers', 'chu', 'glitter', 'shine', 'hum',
  'troubled', 'cry', 'angry', 'bewildered', 'stunned', 'vomit', 'oops',
  'pain', 'despair', 'blaze', 'bowing', 'hot', 'dam', 'qBlue', 'hit',
];

// maplestory.io verwacht een lijst JSON-objecten: lichaam (skin), hoofd (skin + 10000) en de items.
// Een gezichtsuitdrukking geef je mee als animationName op het gezicht.
function itemsPath(look, emotion) {
  const { region, version } = MAPLE_API;
  const obj = (itemId, extra) => JSON.stringify({ itemId, region, version, ...extra });
  const parts = [obj(look.skin), obj(look.skin + 10000)];
  for (const id of look.items) {
    if (look.showWeapon === false && isWeaponOrShield(id)) continue;
    parts.push(emotion && isFace(id) ? obj(id, { animationName: emotion }) : obj(id));
  }
  return encodeURIComponent(parts.join(','));
}

// Geanimeerde GIF van het karakter
export function characterGifUrl(look, animation = 'stand1', opts = {}) {
  const q = new URLSearchParams({ showears: 'false', resize: String(opts.scale || 1) });
  if (opts.flip) q.set('flipX', 'true');
  return `${MAPLE_API.base}/api/character/${itemsPath(look, opts.emotion)}/${animation}/animated?${q}`;
}

// Stilstaand plaatje (één frame)
export function characterPngUrl(look, animation = 'stand1', frame = 0, opts = {}) {
  const q = new URLSearchParams({ showears: 'false', resize: String(opts.scale || 1) });
  return `${MAPLE_API.base}/api/character/${itemsPath(look, opts.emotion)}/${animation}/${frame}?${q}`;
}

export function itemIconUrl(id) {
  const { base, region, version } = MAPLE_API;
  return `${base}/api/${region}/${version}/item/${id}/icon`;
}

// ---------- Beginner-presets (lokale assets) ----------
// Klassieke beginnerslook. De sprites hiervan worden één keer gedownload
// naar programma/public/assets/, zodat de overlay niet van maplestory.io afhangt.
export const PRESETS = {
  'beginner-m': {
    name: 'Beginner (man)',
    gender: 0,
    // huid, Buzz-kapsel, Motivated Look, White Undershirt, Blue Jean Shorts, Red Rubber Boots
    look: { skin: 2000, items: [30030, 20000, 1040002, 1060002, 1072001], showWeapon: true },
  },
  'beginner-f': {
    name: 'Beginner (vrouw)',
    gender: 1,
    // huid, Sammy-kapsel, Motivated Look, White Tubetop, Red Miniskirt, Red Rubber Boots
    look: { skin: 2000, items: [31000, 21000, 1041002, 1061002, 1072001], showWeapon: true },
  },
};

// stand1 = idle, walk1 = lopen; prone en alert zijn voor !prone en !dance
export const PRESET_ANIMATIONS = ['stand1', 'walk1', 'jump', 'sit', 'prone', 'alert'];

const FEMALE_HAIR_GROUPS = [31, 34, 37, 38, 41, 44, 47, 48];
export function genderOfLook(look) {
  const hair = look.items.find(isHair);
  return hair && FEMALE_HAIR_GROUPS.includes(Math.floor(hair / 1000)) ? 1 : 0;
}

export function presetForLook(look) {
  if (look.preset && PRESETS[look.preset]) return look.preset;
  return genderOfLook(look) === 1 ? 'beginner-f' : 'beginner-m';
}

// ---------- Standaard-look voor kijkers die nog niets hebben gekozen ----------
export function randomDefaultLook() {
  const key = Math.random() < 0.5 ? 'beginner-m' : 'beginner-f';
  return { ...PRESETS[key].look, items: [...PRESETS[key].look.items], preset: key, isDefault: true };
}
