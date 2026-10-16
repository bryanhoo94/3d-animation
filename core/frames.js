import { O3K } from './motion.js';

/* 3d-animation · 帧图（小尺寸用）：同一个模型摆好姿势一格一格渲染出来，拼成一张图；页面 / App 一秒 12 格硬切着播。
   小的地方（底栏图标、头像、列表里、登录页）放帧图，不跑 3D：省电、不卡，跟实时那只是同一只、同一套动作。
   格子（CELLS）只出不重复的姿势；动作（SEQ）是「哪一格停几格」的列表，同一格可以反复用。来历：Elio 雪鸮的帧图（build.py OWL_*）。 */
export const FPS = 12;

/* 内置动作的格子。K：模型的 KEY（想、干活每只不一样） */
const BASE = K => [
  ['front', {}],
  ['blink1', { blink: 0.6 }], ['blink2', { blink: 1 }],
  /* 左右看：只转头（眼睛和嘴长在头上一起转），顺带歪一点；手和脚不动 */
  ['l1', { look: -0.28, tilt: 0.03 }], ['l2', { look: -0.55, tilt: 0.06 }],
  ['r1', { look: 0.28, tilt: -0.03 }], ['r2', { look: 0.55, tilt: -0.06 }],
  ['t1', { yaw: 0.45 }], ['t2', { yaw: 1.2 }], ['t3', { yaw: 1.95 }], ['t4', { yaw: 2.7 }],
  ['back', { yaw: Math.PI }],
  /* 跳起来笑：蹲 → 蹦 → 最高点（左右歪着抖、手张开）→ 落 → 压扁 → 笑着站 */
  ['j1', { sq: 0.86 }], ['j2', { sq: 1.08, dy: 0.26, fl: 0.3, fr: 0.3 }],
  ['j3', { dy: 0.58, sq: 1.04, smile: 1, fl: 0.5, fr: 0.5 }], ['j4', { dy: 0.62, smile: 1, roll: 0.06, fl: 0.5, fr: 0.5 }],
  ['j5', { dy: 0.60, smile: 1, roll: -0.06, fl: 0.5, fr: 0.5 }],
  ['j6', { dy: 0.26, sq: 1.06, smile: 1, fl: 0.3, fr: 0.3 }], ['j7', { sq: 0.88, smile: 1 }], ['j8', { smile: 1 }],
  /* 想：头往左、正、往右歪 */
  ['th1', K.think(-1)], ['th2', K.think(0)], ['th3', K.think(1)],
  /* 干活：点头 ＋ 两只手错开着拍，一圈四格 */
  ['w1', K.work(0)], ['w2', K.work(0.25)], ['w3', K.work(0.5)], ['w4', K.work(0.75)],
  /* 平时偶尔扑一下手 */
  ['f1', { fl: 0.32, fr: 0.32 }],
];

const BLINK = [['blink1', 1], ['blink2', 3], ['blink1', 1]];
const BLINK2 = [...BLINK, ['front', 2], ...BLINK];                      // 连眨两下
const LOOK = [['l1', 1], ['l2', 9], ['l1', 1], ['front', 3], ['r1', 1], ['r2', 9], ['r1', 1]];
const JUMP = [['j1', 1], ['j2', 1], ['j3', 1], ['j4', 1], ['j5', 1], ['j4', 1], ['j5', 1], ['j6', 1], ['j7', 1], ['j8', 3]];   // 12 格 ＝ 1 秒
const TURN = [['t1', 1], ['t2', 1], ['t3', 1], ['t4', 1]];
/* 平时 384 格 ＝ 32 秒一圈：第 6 秒左右看一眼，第 22 秒跳起来笑一次；眨眼隔 4–6 秒一次 */
const IDLE = [['front', 36], ...BLINK, ['front', 31], ...LOOK, ['front', 11], ...BLINK,
  ['front', 43], ...BLINK2, ['front', 10], ['f1', 3], ['front', 11],
  ['front', 36], ...BLINK, ['front', 31], ...JUMP, ['front', 24], ...BLINK,
  ['front', 43], ...BLINK, ['front', 31]];
const SEQ = {
  idle: IDLE,
  think: [['th2', 3], ['th1', 15], ['th2', 3], ['th3', 15]],           // 3 秒一圈慢慢歪头
  work: [['w1', 2], ['w2', 2], ['w3', 2], ['w4', 2]],                  // 8 格一圈
  done: JUMP,
  enter: [['back', 6], ...[...TURN].reverse(), ['front', 3], ...JUMP],  // 打开时：背对着、转过来、跳起来笑
};

/* 整套帧图的格子和动作。ACTIONS：模型文件里新加的动作 —— 写了 frames 就照它的；没写就按动作自己采样：
   loop 一圈（period 秒，默认 2）采 cells 格（默认 6），每格停一样久；once 每 2 格采一格。 */
export function sheet(KEY, ACTIONS = {}) {
  const cells = BASE(KEY), seq = { ...SEQ }, kinds = { idle: 'loop', think: 'loop', work: 'loop', done: 'once', enter: 'once' };
  for (const [name, a] of Object.entries(ACTIONS)) {
    if (a.kind === 'idle' || !a.label) continue;
    kinds[name] = a.kind;
    if (a.frames) { cells.push(...a.frames.cells); seq[name] = a.frames.seq; continue; }
    const s = [];
    if (a.kind === 'loop') {
      const period = a.period ?? 2, n = a.cells ?? 6, hold = Math.max(1, Math.round(period * FPS / n));
      for (let i = 0; i < n; i++) { const c = `${name}${i}`; cells.push([c, a.target(i * period / n, KEY, O3K)]); s.push([c, hold]); }
    } else {
      const n = Math.max(1, Math.round(a.dur * FPS / 2));
      for (let i = 0; i < n; i++) { const c = `${name}${i}`; cells.push([c, a.play(i * 2 / FPS, KEY, O3K)]); s.push([c, 2]); }
    }
    seq[name] = s;
  }
  const names = cells.map(c => c[0]);
  const index = Object.fromEntries(Object.entries(seq).map(([k, v]) => [k, v.map(([c, n]) => {
    const i = names.indexOf(c); if (i < 0) throw new Error(`帧图：${k} 用到的格子 ${c} 不存在`); return [i, n]; })]));
  return { fps: FPS, cells, seq: index, kinds };
}
