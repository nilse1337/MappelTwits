// Animated MapleStory background: endless sky and ground, with snails, pigs and slimes walking around.
// All images come from maplestory.io (Map/Back/grassySoil, Map/Tile/grassySoil and the mob sprites).

const MOBS = {
  snail:     { move: 'snail-move.gif',     stand: 'snail-stand.gif',     speed: 14, weight: 3 },
  blueSnail: { move: 'blueSnail-move.gif', stand: 'blueSnail-stand.gif', speed: 16, weight: 2 },
  redSnail:  { move: 'redSnail-move.gif',  stand: 'redSnail-stand.gif',  speed: 18, weight: 2 },
  pig:       { move: 'pig-move.gif',       stand: 'pig-stand.gif',       speed: 42, weight: 3 },
  slime:     { move: 'slime-move.gif',     stand: 'slime-stand.gif',     speed: 34, weight: 3 },
};
const GROUND_SCALE = 0.8;                     // ground image is 220px tall, grass line at 40px
const FOOTHOLD = (220 - 40) * GROUND_SCALE;   // distance from the bottom of the page to the grass line

const world = document.getElementById('world');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);

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
    this.el = document.createElement('img');
    this.el.className = 'mob';
    this.el.alt = '';
    this.el.style.bottom = `${FOOTHOLD - 2}px`;
    world.appendChild(this.el);
    this.x = rand(0, window.innerWidth);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.setMode(Math.random() < 0.7 ? 'move' : 'stand');
  }

  setMode(mode) {
    this.mode = mode;
    this.until = performance.now() + (mode === 'move' ? rand(3000, 9000) : rand(1500, 4000));
    if (mode === 'move' && Math.random() < 0.4) this.dir *= -1;
    this.el.src = `img/mobs/${this.def[mode]}`;
  }

  update(dt, t) {
    if (t > this.until) this.setMode(this.mode === 'move' ? 'stand' : 'move');
    if (this.mode === 'move' && !reduceMotion) {
      this.x += this.dir * this.def.speed * dt;
      const w = window.innerWidth;
      if (this.x < 20) { this.x = 20; this.dir = 1; }
      if (this.x > w - 20) { this.x = w - 20; this.dir = -1; }
    }
    // MapleStory mobs face left; mirror them when walking right
    this.el.style.transform = `translateX(-50%) scaleX(${this.dir === 1 ? -1 : 1})`;
    this.el.style.left = `${this.x}px`;
  }
}

if (world) {
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
