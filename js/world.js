// Animated MapleStory background: endless sky and ground, with snails, pigs and slimes walking around.
// All images come from the game data on maplestory.io (Map/Back/grassySoil, Map/Tile/grassySoil, Mob/*).
// Mobs are drawn from sprite sheets built from the original frames, aligned on their foot point (origin),
// so they walk exactly on the foothold of the ground tiles.

const MOBS = {
  snail:     { speed: 14, weight: 3 },
  blueSnail: { speed: 16, weight: 2 },
  redSnail:  { speed: 18, weight: 2 },
  pig:       { speed: 42, weight: 3 },
  slime:     { speed: 34, weight: 3 },
};

// Ground image: 220px tall. In the game data the foothold of the grass tile (grassySoil/enH0) lies 25px above
// the tile origin, i.e. 15px from the top of our ground image. The ground is shown at 80% size.
const GROUND_SCALE = 0.8;
const GROUND_HEIGHT = 220;
const FOOTHOLD_FROM_TOP = 15;
const FOOTHOLD = Math.round((GROUND_HEIGHT - FOOTHOLD_FROM_TOP) * GROUND_SCALE); // px from the bottom of the page

const world = document.getElementById('world');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
let SHEETS = {};

function pickKind() {
  const kinds = Object.entries(MOBS);
  let r = Math.random() * kinds.reduce((n, [, m]) => n + m.weight, 0);
  for (const [k, m] of kinds) if ((r -= m.weight) < 0) return k;
  return kinds[0][0];
}

class Mob {
  constructor() {
    this.kind = pickKind();
    this.def = MOBS[this.kind];
    this.el = document.createElement('div');
    this.el.className = 'mob';
    this.el.style.bottom = `${FOOTHOLD}px`;
    world.appendChild(this.el);
    this.x = rand(30, window.innerWidth - 30);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.setMode(Math.random() < 0.7 ? 'move' : 'stand');
  }

  setMode(mode) {
    this.mode = mode;
    this.until = performance.now() + (mode === 'move' ? rand(3000, 9000) : rand(1500, 4000));
    if (mode === 'move' && Math.random() < 0.4) this.dir *= -1;
    this.sheet = SHEETS[`${this.kind}-${mode}`];
    this.frame = 0;
    this.frameUntil = performance.now() + this.sheet.delays[0];
    const s = this.el.style;
    s.width = `${this.sheet.w}px`;
    s.height = `${this.sheet.h}px`;
    s.backgroundImage = `url(img/mobs/${this.kind}-${mode}.png)`;
    s.backgroundPosition = '0 0';
    s.transformOrigin = `${this.sheet.originX}px 100%`; // mirror around the feet
  }

  update(dt, t) {
    if (t > this.until) this.setMode(this.mode === 'move' ? 'stand' : 'move');

    // next animation frame, with the original delays from the game
    if (!reduceMotion && t > this.frameUntil) {
      this.frame = (this.frame + 1) % this.sheet.frames;
      this.frameUntil = t + this.sheet.delays[this.frame];
      this.el.style.backgroundPosition = `${-this.frame * this.sheet.w}px 0`;
    }

    if (this.mode === 'move' && !reduceMotion) {
      this.x += this.dir * this.def.speed * dt;
      const w = window.innerWidth;
      if (this.x < 30) { this.x = 30; this.dir = 1; }
      if (this.x > w - 30) { this.x = w - 30; this.dir = -1; }
    }
    // MapleStory mobs face left; mirror them when walking right
    this.el.style.transform = this.dir === 1 ? 'scaleX(-1)' : 'none';
    this.el.style.left = `${Math.round(this.x - this.sheet.originX)}px`;
  }
}

async function start() {
  if (!world) return;
  try {
    SHEETS = await (await fetch('img/mobs/mobs.json')).json();
  } catch {
    return; // no mobs, the sky and ground still show
  }
  const count = Math.max(4, Math.min(14, Math.round(window.innerWidth / 160)));
  const mobs = Array.from({ length: count }, () => new Mob());
  let last = performance.now();
  const loop = (t) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    for (const m of mobs) m.update(dt, t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

start();
