/* 3d-animation · 动作（motion）
   不碰 DOM、不碰 three：网页和 App 每一帧问它要一个姿势（pose），交给模型的 apply。
   节奏常量是 Elio 雪鸮那一套（实时 3D 猫头鹰），一个没改；新动作只用这里的常量和 ω 跟踪器，不另起曲线。 */

export const O3K = {
  w: 18,            // 每个姿势通道追目标的速度：x += (目标 − x)·(1 − e^(−ω·dt))，约 170ms 到 95%
  jump: 1.0,        // 跳一下多久
  smile: 1.25,      // 跳 ＋ 笑着站一会儿，到这里才算完
  blink: 0.18,      // 眨眼：闭 60、停 60、睁 60ms；隔 2.5–6s 一次，15% 连眨两下
  breath: 3.4,      // 呼吸一圈（只压扁 ±0.8%）
  sway: 3.2,        // 想的时候歪头一圈
  flap: 0.62,       // 干活时手拍一下
  look: 0.42, nod: 0.18, gaze: 0.03,   // 跟着鼠标 / 手指看：头最多转多少、点多少，眼睛在脸上挪多少
  idleGlance: 6,    // 鼠标 / 手指多久没动，就改成自己隔 9–15s 左右看一眼
};
/* 这些通道平滑地追目标；其余（blink、smile、dy、sq…）直接摆 */
export const SMOOTH = ['yaw', 'look', 'nod', 'tilt', 'gx', 'gy', 'fl', 'fr', 'll', 'lr'];
export const INTRO = 2.08;   // 开场：背对着 0.5s → 转过来 0.33s → 停 0.25s → 跳起来笑

/* 跳起来笑（u：开跳后几秒）：蹲 → 抛物线（最高 0.62）→ 落地压扁一次 → 回正；笑着站到 O3K.smile。不二次回弹。 */
export function jump(u) {
  const o = { smile: u > 0.16 && u < O3K.smile ? 1 : 0 };
  if (u < 0.12) o.sq = 1 - 0.14 * Math.sin(u / 0.12 * Math.PI / 2);
  else if (u < 0.78) {
    const k = (u - 0.12) / 0.66;
    o.dy = 0.62 * 4 * k * (1 - k);
    o.sq = k < 0.2 ? 0.86 + 0.22 * (k / 0.2) : 1.08 - 0.08 * Math.min(1, (k - 0.2) / 0.3);
    o.fl = o.fr = 0.5 * Math.sin(k * Math.PI);
    o.roll = 0.06 * Math.sin(k * 4 * Math.PI) * Math.sin(k * Math.PI);
  } else if (u < 0.88) o.sq = 1 - 0.12 * Math.sin((u - 0.78) / 0.10 * Math.PI);
  return o;
}

/* 动作表：按钮、App 的 state、帧图都从这里来。三种：
   idle  平时：呼吸、眨眼、头和眼睛跟着鼠标 / 手指，没人动就隔一阵自己左右看一眼、偶尔扑一下手
   loop  一直做到换走：target(t, KEY, O3K) 给目标姿势（SMOOTH 里的通道平滑地追过去，其余直接摆）；still(KEY) 是减动效时停在哪一格
   once  做一次就回到平时：play(u, KEY, O3K) 直接摆（不平滑），dur 秒做完；back 秒后按钮回到「平时」
   每只自己的姿势细节（手举多高才不埋进头里）放在模型文件的 KEY；新动作写在模型文件的 ACTIONS（见 references/motions.md）。 */
export const ACTIONS = {
  idle: { label: '平时', kind: 'idle' },
  think: { label: '想', kind: 'loop', target: (t, K) => K.think(Math.sin(t * 2 * Math.PI / O3K.sway)), still: K => K.think(0) },
  work: { label: '干活', kind: 'loop', target: (t, K) => K.work((t / O3K.flap) % 1), still: K => K.work(0.25) },
  done: { label: '好了', kind: 'once', play: u => jump(u), dur: O3K.smile, back: 1.3 },
};

/* 一只的动作状态。KEY、ACTIONS 来自模型文件；random 可以换成定种子的（测试、出帧图）。
   用法：m.start(t) 演开场 → 每一帧 pose = m.pose(t, dt, gaze)；按钮 m.set(name, t)；点它 m.poke(t)。t 是秒。 */
/** @param {{ POSE0: Record<string, number>, KEY: any, ACTIONS?: Record<string, any>, random?: () => number }} opt */
export function createMotion({ POSE0, KEY, ACTIONS: extra = {}, random = Math.random }) {
  /** @type {Record<string, any>} */
  const A = { ...ACTIONS, ...extra };
  let st = 'idle', once = null, H0 = { mode: '', t: -99 };
  const cur = {};
  let blinkAt = 0, blinkT = -9, glanceAt = 0, glance = 0, glanceT = -9, flickAt = 0, flickT = -9;
  const arm = t => { blinkAt = t + 1.5 + random() * 2; glanceAt = t + 9; flickAt = t + 14 + random() * 8; };
  arm(0);
  const self = {
    actions: A,
    get state() { return st; },
    /* 开场：intro=false 就不演（小的那只、App 里列表头像） */
    start(t, intro = true) { arm(t); H0 = intro ? { mode: 'in', t } : { mode: '', t: -99 }; },
    /* 换动作。返回几秒后该把按钮放回「平时」（once 才有），调用方自己计时 */
    set(name, t) {
      const a = A[name]; if (!a) return 0;
      if (a.kind === 'once') { once = { a, t }; st = 'idle'; return a.back ?? a.dur; }
      st = name; return 0;
    },
    /* 开场、正在跳的时候点它不理 */
    busy(t) { return t - H0.t < (H0.mode === 'in' ? INTRO : O3K.smile) || once != null; },
    poke(t) { if (self.busy(t)) return false; H0 = { mode: 'poke', t }; return true; },
    /* 减动效 / 太慢停下时停在哪一格 */
    still(name = st) { const a = A[name]; return { ...POSE0, ...(a?.still ? a.still(KEY) : {}) }; },
    /* gaze：{ dx, dy（−1–1，右、下为正）, t（最后一次动的时间）} 或 null */
    pose(t, dt, gaze) {
      const tgt = { ...POSE0 };
      let direct = {};
      const e = t - H0.t;
      if (H0.mode === 'in' && e < INTRO) {
        if (e < 0.5) direct.yaw = Math.PI;
        else if (e < 0.83) { const k = (e - 0.5) / 0.33; direct.yaw = Math.PI * Math.pow(1 - k, 3); }
        else if (e >= 1.08) direct = jump(e - 1.08);
        cur.yaw = direct.yaw || 0;
      } else if (H0.mode === 'poke' && e < O3K.smile) direct = jump(e);
      const a = A[st];
      if (a?.kind === 'loop') Object.assign(tgt, a.target(t, KEY, O3K));
      else {
        direct.sq ??= 1 + 0.008 * Math.sin(t * 2 * Math.PI / O3K.breath);
        if (gaze && t - gaze.t < O3K.idleGlance) {
          Object.assign(tgt, { look: O3K.look * gaze.dx, nod: -O3K.nod * gaze.dy, gx: O3K.gaze * gaze.dx, gy: -O3K.gaze * gaze.dy });
        } else {
          if (t > glanceAt) { glanceT = t; glance = glance > 0 ? -1 : 1; glanceAt = t + 9 + random() * 6; }
          if (t - glanceT < 1.5) Object.assign(tgt, { look: 0.45 * glance, tilt: -0.05 * glance, gx: 0.02 * glance });
        }
        if (t > flickAt) { flickT = t; flickAt = t + 14 + random() * 8; }
        if (t - flickT < 0.35) tgt.fl = tgt.fr = 0.32 * Math.sin((t - flickT) / 0.35 * Math.PI);
      }
      if (once) { const u = t - once.t; if (u > once.a.dur) once = null; else direct = once.a.play(u, KEY, O3K); }
      if (t > blinkAt) { blinkT = t; blinkAt = t + (random() < 0.15 ? 0.32 : 2.5 + random() * 3.5); }
      const b = (t - blinkT) / O3K.blink;
      const blink = b < 0 || b > 1 ? 0 : b < 1 / 3 ? b * 3 : b < 2 / 3 ? 1 : (1 - b) * 3;
      const k = dt ? 1 - Math.exp(-O3K.w * dt) : 1;
      for (const c of SMOOTH) { const v = cur[c] ?? tgt[c]; cur[c] = v + (tgt[c] - v) * k; }
      const out = { ...tgt, ...cur, ...direct, blink: direct.smile ? 0 : (direct.blink ?? blink) };
      for (const c of ['fl', 'fr']) if (direct[c] != null) out[c] = Math.max(cur[c], direct[c]);
      return out;
    },
  };
  return self;
}
