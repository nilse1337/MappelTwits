// Shared logic for outfit codes and drawing characters via maplestory.io.
// This file is used by the program, the overlay AND the website.
// Changed something? Copy it to website/js/outfit.js as well.

export const MAPLE_API = {
  base: 'https://maplestory.io',
  region: 'GMS',
  version: '270', // updated to the newest version at startup (see resolveMapleVersion)
};

// maplestory.io has no "latest": we look up the newest GMS version.
// Node (the program) can read the version list directly. Browsers are not allowed to (CORS),
// so there we count up from the current version until we get a 404.
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
    // probably a browser: probe ourselves
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

// ---------- Item types based on ID ----------
export const isSkin = (id) => id >= 2000 && id < 3000;
export const isFace = (id) => (id >= 20000 && id < 30000) || (id >= 50000 && id < 60000);
export const isHair = (id) => (id >= 30000 && id < 50000) || (id >= 60000 && id < 70000);
export const isWeaponOrShield = (id) =>
  (id >= 1090000 && id < 1100000) || (id >= 1200000 && id < 1800000);

// Which slot an equip ID belongs to (used by the website to load a code back)
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
// Format:  a.1jk.mbu.fk8...   (first character: a = show weapon, b = hide weapon)
// Then: skin ID and item IDs in base36, separated by dots.
// A chosen chair (ID 3010000-3019999) is just one more ID in the list; it is taken out
// of the items again when the code is read, so it is only used for !sit.
const MAX_ITEMS = 16;
export const isChair = (id) => id >= 3010000 && id < 3020000;
// A chat ring (ID 1110000-1119999) works the same way: it only changes the chat balloon.
export const isRing = (id) => id >= 1110000 && id < 1120000;

export function encodeOutfit(look) {
  const flag = look.showWeapon === false ? 'b' : 'a';
  const ids = [look.skin, ...look.items.filter((id) => !isChair(id) && !isRing(id)), ...(look.chair ? [look.chair] : []), ...(look.ring ? [look.ring] : [])].map((n) => Number(n).toString(36));
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
  let chair = null;
  let ring = null;
  for (const id of rest) {
    if (!Number.isInteger(id) || id < 10000 || id > 9999999) return null;
    if (isChair(id)) chair = id;
    else if (isRing(id)) ring = id;
    else if (!items.includes(id)) items.push(id);
  }
  const look = { skin, items, showWeapon: flag === 'a' };
  if (chair) look.chair = chair;
  if (ring) look.ring = ring;
  return look;
}

// ---------- Character image ----------
export const ANIMATIONS = ['stand1', 'walk1', 'jump', 'sit', 'prone', 'alert'];

// MapleStory emotes on the F keys. F1-F7 are the standard in-game expressions,
// F8-F12 are bonus ones (in the game normally only via cash items).
export const F_EMOTES = {
  f1: 'hit', f2: 'smile', f3: 'troubled', f4: 'cry', f5: 'angry', f6: 'bewildered', f7: 'stunned',
  f8: 'love', f9: 'wink', f10: 'glitter', f11: 'cheers', f12: 'vomit',
};

// Chairs that !sit picks from at random (all tested with male and female)
export const CHAIRS = [
  [3010000, 'The Relaxer'], [3010001, 'Sky-blue Wooden Chair'], [3010002, 'Green Chair'], [3010003, 'Red Chair'],
  [3010007, 'Pink Seal Cushion'], [3010009, 'Red Round Chair'], [3010012, 'Warrior Throne'], [3010013, 'Pink Beach Chair'],
  [3010014, 'Moon Star Chair'], [3010018, 'Palm Tree Beach Chair'], [3010019, 'Kadomatsu'], [3010020, 'Kotatsu'],
  [3010021, 'Wooden Tub'], [3010023, 'Brown Polar Bear Chair'], [3010024, 'Pink Teddy Chair'], [3010025, 'Under the Maple Tree'],
  [3010036, 'Maple Tree Chair'], [3010041, 'Skull Throne'], [3010043, 'Halloween Broomstick Chair'], [3010045, 'Ice Chair'],
  [3010046, 'Dragon Chair (Inferno)'], [3010049, 'Igloo'], [3010053, 'Rabbit Sofa'], [3010055, 'Mochi Ice Cream Chair'],
].map(([id, name]) => ({ id, name }));

export const randomChair = () => CHAIRS[Math.floor(Math.random() * CHAIRS.length)].id;

export const EMOTIONS = [
  'smile', 'wink', 'love', 'cheers', 'chu', 'glitter', 'shine', 'hum',
  'troubled', 'cry', 'angry', 'bewildered', 'stunned', 'vomit', 'oops',
  'pain', 'despair', 'blaze', 'bowing', 'hot', 'dam', 'qBlue', 'hit',
];

// maplestory.io expects a list of JSON objects: body (skin), head (skin + 10000) and the items.
// A facial expression is passed as animationName on the face.
function itemsPath(look, emotion, chair) {
  const { region, version } = MAPLE_API;
  const obj = (itemId, extra) => JSON.stringify({ itemId, region, version, ...extra });
  const parts = [obj(look.skin), obj(look.skin + 10000)];
  for (const id of look.items) {
    if (look.showWeapon === false && isWeaponOrShield(id)) continue;
    if (isChair(id) || isRing(id)) continue; // a chair is only drawn when sitting (passed separately)
    parts.push(emotion && isFace(id) ? obj(id, { animationName: emotion }) : obj(id));
  }
  if (chair) parts.push(obj(chair)); // maplestory.io then draws the character on the chair
  return encodeURIComponent(parts.join(','));
}

// Animated GIF of the character
export function characterGifUrl(look, animation = 'stand1', opts = {}) {
  const q = new URLSearchParams({ showears: 'false', resize: String(opts.scale || 1) });
  if (opts.flip) q.set('flipX', 'true');
  return `${MAPLE_API.base}/api/character/${itemsPath(look, opts.emotion, opts.chair)}/${animation}/animated?${q}`;
}

// Still image (one frame)
export function characterPngUrl(look, animation = 'stand1', frame = 0, opts = {}) {
  const q = new URLSearchParams({ showears: 'false', resize: String(opts.scale || 1) });
  return `${MAPLE_API.base}/api/character/${itemsPath(look, opts.emotion)}/${animation}/${frame}?${q}`;
}

export function itemIconUrl(id) {
  const { base, region, version } = MAPLE_API;
  return `${base}/api/${region}/${version}/item/${id}/icon`;
}

// ---------- Beginner presets (local assets) ----------
// Classic beginner look. Its sprites are downloaded once
// to programma/public/assets/, so the overlay does not depend on maplestory.io.
export const PRESETS = {
  'beginner-m': {
    name: 'Beginner (male)',
    gender: 0,
    // skin, Buzz hair, Motivated Look, White Undershirt, Blue Jean Shorts, Red Rubber Boots
    look: { skin: 2000, items: [30030, 20000, 1040002, 1060002, 1072001], showWeapon: true },
  },
  'beginner-f': {
    name: 'Beginner (female)',
    gender: 1,
    // skin, Sammy hair, Motivated Look, White Tubetop, Red Miniskirt, Red Rubber Boots
    look: { skin: 2000, items: [31000, 21000, 1041002, 1061002, 1072001], showWeapon: true },
  },
};

// stand1 = idle, walk1 = walking; prone and alert are for !prone and !dance
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

// ---------- Default look for viewers who have not picked anything yet ----------
export function randomDefaultLook() {
  const key = Math.random() < 0.5 ? 'beginner-m' : 'beginner-f';
  return { ...PRESETS[key].look, items: [...PRESETS[key].look.items], preset: key, isDefault: true };
}
