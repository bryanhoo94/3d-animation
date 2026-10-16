/* 例子 1：粉色毛绒怪（r1，有毛）和它的软胶版（r3，没毛）—— 同一份形状，两种皮。
   r1 照 r1-clean.jpg 搭，r3 照 r3-clean.jpg（同一只、同一个姿势，量下来轮廓几乎一样），所以只多一份颜色和肚子形状。
   零件：一整颗身子（上半宽圆顶、下半更胖、底是平的）；两只圆耳朵；两只往外斜的短手（手心一颗奶油色肉垫）；
   两条短腿各三颗脚趾；肚子一块奶油色；脖子上一条针织围巾（一圈 ＋ 前面垂两条）。
   坐标：量原图（2000×2000）时把身子半宽 565px 记作 1，身子中心在 (1000, 965)。x 右、y 上、z 朝你。 */

/* 形状 ─────────────────────────────────────────────────── */
/* 身子：上半是雪鸮那个宽圆顶，下半更胖 —— 最宽在肚子那一截（y ≈ −0.25 到 −0.4），底是平的 */
const BODY = { rx: 1.0, ry: 1.10, rz: 0.95, bot: 1.10 };
const LOW = { c: -0.25, r: 0.85, n: 3.2 };
const hwLow = y => { const u = Math.min(1, Math.max(0, (LOW.c - y) / LOW.r));
  return Math.max(0, 1 - u ** LOW.n) ** (1 / LOW.n) * (1 + 0.05 * Math.sin(Math.PI * Math.min(1, -y)) ** 1.5); };
/* 某个高度上身子的半宽（x 方向；z 方向再乘 rz） */
function hwAt(y) {
  if (y < 0) return hwLow(y);
  const t = Math.min(1, (y / BODY.ry) ** (1 / 0.86));
  return Math.sqrt(1 - t * t) * (1 - 0.03 * t);
}
function body(d, out) {
  if (d.y >= 0) {
    const narrow = 1 - 0.03 * d.y;
    return out.set(d.x * BODY.rx * narrow, d.y ** 0.86 * BODY.ry, d.z * BODY.rz * narrow);
  }
  const y = d.y * BODY.bot, h = Math.hypot(d.x, d.z);
  if (h < 1e-6) return out.set(0, y, 0);
  const k = hwLow(y) / h;
  return out.set(d.x * k * BODY.rx, y, d.z * k * BODY.rz);
}
/* 耳朵：两只圆耳朵，一半埋在头顶两侧，往外歪一点 */
const EAR = { x: 0.645, y: 1.02, z: 0.03, rx: 0.16, ry: 0.20, rz: 0.12, tilt: 0.30 };
/* 手：肩膀上一个轴（藏在围巾底下），手垂下来往外斜 rest；手那头胖一点 */
const ARM = { px: 0.86, py: -0.08, pz: 0.10, len: 0.30, rx: 0.18, ry: 0.34, rz: 0.20, rest: 0.62 };
const PAD = { d: [-0.30, -0.62, 0.72], r: 0.105 };          // 手心那颗肉垫：在手的里侧、前面、靠末端
/* 腿：两截短短的，各三颗脚趾从前沿冒出来；中间那颗大一点 */
const LEG = { x: 0.45, y: -1.16, z: 0.10, rx: 0.30, ry: 0.20, rz: 0.30 };
const TOES = [[-0.18, 0.076], [0, 0.088], [0.18, 0.076]];
const TOE_Y = -1.27, TOE_Z = 0.36;
/* 围巾那一圈：前面低、两侧和后面高（往前倾 13°）；截面是一个圆鼓鼓的扁方 */
const SCARF = { side: 0.125, tilt: -0.25, h: 0.17, out: 0.07, push: 0.025, n: 40 };
/* 垂下来的两条：从围巾底下出来，盖在肚子两边；下面一截是罗纹收口 */
const TAIL = { x: 0.54, top: -0.12, bot: -1.13, hw: 0.20, t: 0.036, flare: 0.10, cuff: 0.19 };

/* 花纹（着色器）──────────────────────────────────────────────
   uPart：0 身子、1 耳朵、2 手、3 腿、4 脚趾 / 肉垫、5 围巾那一圈、6 垂下来那两条 */
const GLSL = /* glsl */`
  uniform vec3 uPink, uPinkL, uPinkD, uCream, uScarf, uStripe, uToe;
  uniform vec4 uBelly; uniform float uBellyE, uKnit;                   // 肚子：中心 y、半宽、半高、方的程度；边从哪开始虚；uKnit 毛线纹有多少
  float bellyN(vec3 p){ vec2 q = abs(p.xy - vec2(0., uBelly.x)) / uBelly.yz; return pow(pow(q.x, uBelly.w) + pow(q.y, uBelly.w), 1. / uBelly.w); }
  vec3 bodyAlb(vec3 p){
    float front = smoothstep(.05, .35, p.z);
    vec3 c = mix(uPink, uPinkL, smoothstep(.3, 1., p.y) * .5);          // 头顶那块更艳
    float bel = 1. - smoothstep(uBellyE, 1., bellyN(p));
    return mix(c, uCream, bel * front);
  }
  vec3 earAlb(vec3 p){
    vec3 d = p / vec3(.16, .20, .12);
    float inner = smoothstep(.10, .45, d.z) * (1. - smoothstep(.40, .75, length(d.xy)));
    return mix(uPink, uPinkD, inner * .8);
  }
  /* 针织：一列列竖着的 V（列跟着围巾走的方向排） */
  float knit(float u, float v){
    float col = fract(u), row = fract(v + abs(col - .5) * .9);
    return .90 + .10 * smoothstep(.15, .5, abs(row - .5)) - .05 * smoothstep(.36, .5, abs(col - .5));
  }
  vec3 scarfAlb(vec3 p){
    float a = atan(p.x, p.z) / 6.2832;                                   // 0 正前方，绕一圈是 1
    float s = fract(a * ${SCARF.n}. + .5 + .04 * sin(p.y * 40.));
    float stripe = 1. - smoothstep(.05, .10, abs(s - .5));
    vec3 c = mix(uScarf, uStripe, stripe * .9);
    return c * mix(1., knit(a * 180., p.y / .028), uKnit);
  }
  vec3 tailAlb(vec3 p){
    float y = p.y - ${TAIL.bot};                                         // 离下沿多高
    float cuff = 1. - step(${TAIL.cuff}, y);
    float s = fract((${TAIL.top} - p.y) / .125);
    float stripe = (1. - smoothstep(.07, .13, abs(s - .5))) * (1. - cuff);
    vec3 c = mix(uScarf, uStripe, stripe * .9);
    float rib = .88 + .12 * smoothstep(.0, .6, abs(sin(p.x * 90.)));      // 收口：竖的罗纹
    return c * mix(mix(1., knit(p.x / .03, p.y / .028), uKnit), rib, cuff);
  }
  vec3 alb(vec3 p, out float ao){
    ao = 1.;
    if (uPart < .5) {                                                    // 肚子那块是嵌进去的：边上一道浅影（软胶才看得见）
      ao = 1. - .10 * (1. - smoothstep(0., .08, abs(bellyN(p) - 1.))) * smoothstep(.05, .35, p.z);
      return bodyAlb(p);
    }
    if (uPart < 1.5) return earAlb(p);
    if (uPart < 3.5) return uPink;
    if (uPart < 4.5) return uToe;
    if (uPart < 5.5) return scarfAlb(p);
    return tailAlb(p);
  }
`;

export const SPEC = {
  name: 'pink',
  skin: 'fur',
  frame: { K: 0.76, FLOOR: -0.83, GROUND: -1.35 },    // K 整只缩多少（放进同一个画框一样高）；GROUND 脚底在身子坐标里多高
  detail: 56,
  body,
  faceRelax: 0.7,
  face: {
    EYE: { x: 0.407, y: 0.28, rx: 0.127, ry: 0.138, rz: 0.07 },
    MOUTH: { y: 0.135, R: 0.135, arc: 2.36, tube: 0.0155 },   // 宽 0.25、深 0.084
  },
  /* 没毛那只的面往外推了 0.6 根毛长（同一份形状两只轮廓一样大），眼睛嘴跟着毛那只的高度降 0.012 */
  lift: { vinyl: { eye: 0.038, lid: 0.048, arc: 0.048, mouth: 0.043 } },
  skins: {
    /* r1：珊瑚粉，奶油色偏暖；肚子椭圆 */
    fur: { ref: { image: 'r1.jpg', unit: 565 / 2000, cx: 1000 / 2000, cy: 965 / 2000 },
      uniforms: { uPink: '#e37e6c', uPinkL: '#ea7862', uPinkD: '#cc6352', uCream: '#f2e1c6', uScarf: '#f5e8d2',
        uStripe: '#e3846b', uToe: '#f1dcbd', uBelly: [-0.58, 0.40, 0.44, 2], uBellyE: 0.86, uKnit: 1 } },
    /* r3：糖果粉；肚子圆角方块；围巾是光的（没有毛线纹） */
    vinyl: { ref: { image: 'r3.jpg', unit: 565 / 2000, cx: 1000 / 2000, cy: 965 / 2000 },
      uniforms: { uPink: '#f8aa9d', uPinkL: '#fdb6a8', uPinkD: '#e86e64', uCream: '#f2dcb5', uScarf: '#fdeed3',
        uStripe: '#f6a093', uToe: '#fbe9d0', uBelly: [-0.63, 0.31, 0.36, 4], uBellyE: 0.97, uKnit: 0 } },
  },
  glsl: GLSL,

  build({ THREE, V3, head, torso, mesh, arm, blob, ring, ell, normalOf, sgnPow, detail }) {
    /* 身子前面那一点的 z（垂下来那两条贴着它） */
    const zOn = (x, y) => BODY.rz * Math.sqrt(Math.max(0, hwAt(y) ** 2 - (x / BODY.rx) ** 2));
    head.add(mesh(blob(body, detail), 0));
    const earGeo = blob(ell(EAR.rx, EAR.ry, EAR.rz), Math.max(8, detail >> 2));
    for (const s of [-1, 1]) {
      const e = mesh(earGeo, 1, { lenK: 0.8 });
      e.position.set(s * EAR.x, EAR.y, EAR.z); e.rotation.z = -s * EAR.tilt; head.add(e);
    }
    /* 围巾一圈：截面中心贴着身子表面（再往外推一点），截面是圆鼓鼓的扁方 */
    const scarfFn = (u, v, out) => {
      const yc = SCARF.side + SCARF.tilt * Math.cos(u), hw = hwAt(yc);
      const r = SCARF.push + SCARF.out * sgnPow(Math.cos(v), 0.7);
      return out.set(Math.sin(u) * (hw * BODY.rx + r), yc + SCARF.h * sgnPow(Math.sin(v), 0.8), Math.cos(u) * (hw * BODY.rz + r));
    };
    head.add(mesh(ring(scarfFn, Math.max(64, detail * 3), 24), 5, { lenK: 0.35 }));
    /* 垂下来那两条：一块圆角扁方（往外径向投到扁方上），再弯过去贴着肚子；下面那截离开身子一点（布是垂着的） */
    const tailFn = s => (d, out) => {
      const hh = (TAIL.top - TAIL.bot) / 2;
      const lam = ((Math.abs(d.x) / TAIL.hw) ** 5 + (Math.abs(d.y) / hh) ** 5 + (Math.abs(d.z) / TAIL.t) ** 5) ** (-1 / 5);
      const lx = d.x * lam, ly = d.y * lam, lz = d.z * lam;
      const y = (TAIL.top + TAIL.bot) / 2 + ly, k = (TAIL.top - y) / (2 * hh);
      const x = s * TAIL.x + lx * (1 + TAIL.flare * k);
      const z = Math.max(zOn(x, y), zOn(x, -0.5) - 0.4 * (-0.5 - y)) + TAIL.t + 0.012 + lz;
      return out.set(x, y, z);
    };
    for (const s of [-1, 1]) head.add(mesh(blob(tailFn(s), Math.max(16, detail >> 1)), 6, { lenK: 0.35 }));
    /* 手：连指手套那样，手那头胖一点、圆一点；手心一颗肉垫 */
    const armShape = (d, out) => { const k = 1 + 0.28 * -d.y; out.x *= k; out.z *= k; if (d.y < 0) out.y *= 0.88; return out; };
    const armFn = ell(ARM.rx, ARM.ry, ARM.rz, armShape);
    const armGeo = blob(armFn, Math.max(10, detail >> 2));
    const padGeo = blob(ell(1, 0.8, 0.55), Math.max(6, detail >> 3));
    const padAt = armFn(V3(...PAD.d).normalize(), V3()), padN = normalOf(armFn, V3(...PAD.d).normalize(), V3());
    for (const s of [-1, 1]) {
      const a = mesh(armGeo, 2, { lenK: 0.9 });
      const pad = mesh(padGeo, 4, { lenK: 0.5 });
      pad.position.copy(padAt).addScaledVector(padN, -0.02); pad.quaternion.setFromUnitVectors(V3(0, 0, 1), padN);
      pad.scale.setScalar(PAD.r); a.add(pad);
      arm(s, ARM, a);
    }
    /* 腿和脚趾 */
    const legGeo = blob(ell(LEG.rx, LEG.ry, LEG.rz), Math.max(10, detail >> 2));
    const toeGeo = blob(ell(1, 0.78, 1.0), Math.max(6, detail >> 3));
    for (const s of [-1, 1]) {
      const l = mesh(legGeo, 3, { lenK: 0.8 }); l.position.set(s * LEG.x, LEG.y, LEG.z); torso.add(l);
      for (const [dx, r] of TOES) {
        const t = mesh(toeGeo, 4, { lenK: 0.5 });
        t.position.set(s * LEG.x + dx, TOE_Y, TOE_Z - Math.abs(dx) * 0.35); t.scale.setScalar(r); torso.add(t);
      }
    }
  },
};

/* 每只自己的关键姿势（motion.js 的「想」「干活」从这里取）。
   想：画面右边那只手举起来贴着头侧（挠头），头往那边歪、眼睛往上看。
     手举起来以后 lr 要取负的才往前：正的会把手转到头后面，正面看不见（试过）。举到半空像在挥手，也试过。
   干活：点头 ＋ 两只手错开着拍（相位 ph 0–1）。 */
export const KEY = {
  think: (sway = 0) => ({ fr: 2.4 + 0.08 * sway, lr: -0.5, gx: -0.03, gy: 0.065, tilt: -0.14 + 0.05 * sway, look: 0.08 + 0.05 * sway }),
  work: ph => { const s = Math.sin(ph * 2 * Math.PI), c = Math.cos(ph * 4 * Math.PI);
    return { nod: 0.05 + 0.05 * c, fl: 0.18 + 0.16 * s, fr: 0.18 - 0.16 * s, gy: -0.02, sq: 1 - 0.012 * c }; },
};

/* 新加的动作（例子，照 references/motions.md 加的）：挥手 —— 画面右边那只手举到头侧外面左右摆，笑着、头往那边歪一点。
   fr 1.95 / lr −0.15 手贴着头，像在挠头（跟「想」分不出来，试过）；往下放到 1.75、往前转 −0.6，手心朝前露在头外面才像挥手。
   只用姿势字段和 O3K 的节奏（摆一下 = O.flap，跟干活拍手同一个快慢）；不碰形状。
   period / cells：出帧图时一圈采几格（4 格 × 停 2 格 ≈ 0.67 秒一圈）。 */
export const ACTIONS = {
  wave: { label: '挥手', kind: 'loop', period: 0.62, cells: 4,
    target: (t, K, O) => ({ fr: 1.75 + 0.22 * Math.sin(t * 2 * Math.PI / O.flap), lr: -0.6, tilt: -0.06, look: 0.06, smile: 1 }),
    still: () => ({ fr: 1.75, lr: -0.6, tilt: -0.06, look: 0.06, smile: 1 }) },
};
