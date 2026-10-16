/* 例子 2：绿企鹅（r2，软胶，没毛）—— 跟粉色那只身体完全不一样的一只：一整颗蛋，脸和肚子是身子上画出来的白。
   零件：蛋形身子（绿头套 ＋ 白脸白肚子，两眼中间绿色往下一个尖）；两片鳍当手；两只粉脚各三颗脚趾；
   奶油色围巾一圈（前面几道横纹）＋ 右边垂一条（竖纹）；腮红一半被围巾挡住。
   坐标：量 r2-clean.jpg（2000×2000）时把身子半宽 570px 记作 1，中心 x = 993、y = 0 在图上 1000。x 右、y 上、z 朝你。 */

/* 形状 ─────────────────────────────────────────────────── */
/* 身子：蛋，最宽在 y = c（图上 1285）。上半 hw = A·√(1 − s^P)，下半 hw = A·(1 − s^M)^(1/M)（对图上 16 个高度拟合，误差 < 0.003） */
const BODY = { top: 1.137, c: -0.5, bot: -1.13, A: 1.03, P: 3.2, M: 2.4, rz: 0.92 };
function hwAt(y) {
  if (y >= BODY.c) { const s = Math.min(1, (y - BODY.c) / (BODY.top - BODY.c)); return BODY.A * Math.sqrt(Math.max(0, 1 - s ** BODY.P)); }
  const s = Math.min(1, (BODY.c - y) / (BODY.c - BODY.bot)); return BODY.A * Math.max(0, 1 - s ** BODY.M) ** (1 / BODY.M);
}
function body(d, out) {
  const y = BODY.c + (d.y >= 0 ? d.y * (BODY.top - BODY.c) : d.y * (BODY.c - BODY.bot)), h = Math.hypot(d.x, d.z);
  if (h < 1e-6) return out.set(0, y, 0);
  const k = hwAt(y) / h;
  return out.set(d.x * k, y, d.z * k * BODY.rz);
}
/* 白脸 ＋ 白肚子：正面一块，两侧到 |x| / hw = side（约 53°）；顶上是两个圆包，两眼中间绿色往下一个尖（尖在 y = tip） */
const FACE = { side: 0.80, tip: 0.449, lobe: 0.668, lx: 0.37, rx: 0.34 };
/* 鳍：肩膀上一个轴（藏在围巾底下），往外斜 rest 垂下来；扁的那面朝前 */
const ARM = { px: 0.88, py: -0.09, pz: 0.04, len: 0.33, rx: 0.175, ry: 0.38, rz: 0.10, rest: 0.74 };
/* 脚：各三颗脚趾，里面那颗最大（[往外偏多少, 半径]）；底下一块脚掌连着，大半藏在身子底下 */
const FOOT = { x: 0.50, z: 0.42 };
const TOES = [[-0.12, 0.105], [0.0, 0.10], [0.115, 0.09]];
const GROUND = -1.184;                 // 脚底在身子坐标里的高度（图上 1675）
const BLUSH = { x: 0.56, y: 0.06, rx: 0.13, ry: 0.10 };
/* 围巾那一圈：前面低、两侧和后面高；截面圆鼓鼓的扁方，前面下半截几道横纹 */
const SCARF = { side: 0.05, tilt: -0.25, h: 0.175, out: 0.09, push: 0.02, groove: 0.010, rows: 3 };
/* 右边垂下来那一条（只有一条）：从围巾底下出来，贴着肚子；竖纹 */
const TAIL = { x: 0.49, top: -0.25, bot: -0.81, hw: 0.21, t: 0.05, rib: 0.06 };

/* 花纹（着色器）──────────────────────────────────────────────
   uPart：0 身子、2 鳍、3 脚、5 围巾那一圈、6 垂下来那一条 */
const GLSL = /* glsl */`
  uniform vec3 uGreen, uWhite, uScarf, uFoot, uBlush;
  float hwAt(float y){
    if (y >= ${BODY.c.toFixed(3)}) { float s = clamp((y - ${BODY.c.toFixed(3)}) / ${(BODY.top - BODY.c).toFixed(3)}, 0., 1.);
      return ${BODY.A.toFixed(3)} * sqrt(max(0., 1. - pow(s, ${BODY.P.toFixed(2)}))); }
    float s = clamp((${BODY.c.toFixed(3)} - y) / ${(BODY.c - BODY.bot).toFixed(3)}, 0., 1.);
    return ${BODY.A.toFixed(3)} * pow(max(0., 1. - pow(s, ${BODY.M.toFixed(2)})), ${(1 / BODY.M).toFixed(4)});
  }
  /* 白那一块的「离边多远」（正的在白里面）：顶上那条线 ＋ 两侧那条线，拐角圆过去 */
  float faceD(vec3 p){
    float ax = abs(p.x), top;
    if (ax < ${FACE.lx}) top = ${FACE.tip} + ${(FACE.lobe - FACE.tip).toFixed(3)} * pow(sin(1.5708 * ax / ${FACE.lx}), 1.5);
    else { float u = (ax - ${FACE.lx}) / ${FACE.rx};                  // 过了圆包还接着往下掉，交给两侧那条线收（不然拐角留一道台阶）
      top = ${FACE.tip} + ${(FACE.lobe - FACE.tip).toFixed(3)} * sqrt(max(0., 1. - u * u)) - 3. * max(0., u - 1.); }
    float hw = hwAt(p.y);
    float side = p.z > 0. ? (${FACE.side} - ax / max(hw, .05)) * hw : -1.;
    float a = top - p.y, b = side, k = .04;
    float h = clamp(.5 + .5 * (b - a) / k, 0., 1.);
    return mix(b, a, h) - k * h * (1. - h);             // 平滑的 min
  }
  vec3 bodyAlb(vec3 p, out float ao){
    float d = faceD(p);
    float w = smoothstep(-.004, .004, d);
    vec3 c = mix(uGreen, uWhite, w);
    vec2 q = vec2(abs(p.x) - ${BLUSH.x}, p.y - ${BLUSH.y}) / vec2(${BLUSH.rx}, ${BLUSH.ry});
    c = mix(c, uBlush, .9 * w * (1. - smoothstep(.25, 1., length(q))));
    /* 绿的那层压在白的上面：白这边贴着边一道浅影，绿这边边口往下圆一点 */
    ao = d > 0. ? 1. - .10 * (1. - smoothstep(0., .05, d)) : 1. - .06 * (1. - smoothstep(0., .022, -d));
    /* 围巾和垂下来那一条在肚子上的影子（软的，往下落） */
    float u = atan(p.x, p.z / ${BODY.rz}), yb = ${SCARF.side} + ${SCARF.tilt} * cos(u) - ${SCARF.h};
    ao *= 1. - .16 * smoothstep(-.02, .0, yb - p.y) * (1. - smoothstep(0., .10, yb - p.y));
    vec2 tq = abs(p.xy - vec2(${TAIL.x} + .015, ${((TAIL.top + TAIL.bot) / 2 - 0.015).toFixed(3)})) - vec2(${TAIL.hw}, ${((TAIL.top - TAIL.bot) / 2).toFixed(3)});
    float td = length(max(tq, 0.)) + min(max(tq.x, tq.y), 0.);
    if (p.z > 0.) ao *= 1. - .18 * (1. - smoothstep(0., .07, td));
    return c;
  }
  vec3 alb(vec3 p, out float ao){
    ao = 1.;
    if (uPart < .5) return bodyAlb(p, ao);
    if (uPart < 2.5) return uGreen;
    if (uPart < 3.5) return uFoot;
    return uScarf;
  }
  /* 垂下来那一条的竖纹：只改法线（几何上是平的） */
#define BUMP
  vec3 bump(vec3 N, vec3 p, vec3 X){
    if (uPart > 5.5 && p.z > 0.) N = normalize(N - X * (.55 * sin(6.2832 * (p.x - ${TAIL.x}) / ${TAIL.rib})));
    return N;
  }
`;

export const SPEC = {
  name: 'penguin',
  skin: 'vinyl',
  frame: { K: 0.76, FLOOR: -0.83, GROUND },
  detail: 48,
  body,
  faceRelax: 0.4,
  face: {
    EYE: { x: 0.417, y: 0.214, rx: 0.127, ry: 0.142, rz: 0.07 },
    MOUTH: { y: 0.032, R: 0.14, arc: 2.36, tube: 0.0125 },   // 宽 0.26、深 0.087
  },
  /* 光：从更上面来一点；暗面偏黄 —— 原图绿的影子是更深的黄绿，不是灰。眼珠下沿一圈很淡的反光，看得出是鼓的 */
  look: { L: [-0.32, 0.70, 0.64], ao: 0.16, eyeRim: 0.16,
    vinyl: { wrap: 1.4, dark: [0.74, 0.75, 0.68], lit: [1.02, 1.02, 1.02], push: 0,
             specCol: [1, 1, 0.97], specPow: 8, spec: 0.10, rim: 0.03 } },
  skins: { vinyl: { ref: { image: 'r2.jpg', unit: 570 / 2000, cx: 993 / 2000, cy: 1000 / 2000 } } },
  uniforms: { uGreen: '#adc2a1', uWhite: '#ebe9de', uScarf: '#f4ecd4', uFoot: '#f3bba7', uBlush: '#f8b9a2' },
  glsl: GLSL,

  /* lenK：切成有毛时这个零件的毛长几成（围巾起绒、脚短毛）；软胶不用它 */
  build({ head, torso, mesh, arm, blob, ring, ell, sgnPow, smax, detail }) {
    const zOn = (x, y) => BODY.rz * Math.sqrt(Math.max(0, hwAt(y) ** 2 - x ** 2));
    head.add(mesh(blob(body, detail), 0));
    /* 围巾一圈：截面中心贴着身子表面（再往外推一点），截面是圆鼓鼓的扁方；前面下半截压几道横纹 */
    const scarfFn = (u, v, out) => {
      const yc = SCARF.side + SCARF.tilt * Math.cos(u), hw = hwAt(yc);
      const t = sgnPow(Math.sin(v), 0.8), front = Math.max(0, Math.cos(v));
      const groove = SCARF.groove * front ** 0.5 * (1 - Math.abs(Math.sin(Math.PI * SCARF.rows * (t + 1)))) ** 6 * (t < 0.2 ? 1 : 0);
      const r = SCARF.push + SCARF.out * sgnPow(Math.cos(v), 0.7) - groove;
      return out.set(Math.sin(u) * (hw + r), yc + SCARF.h * t, Math.cos(u) * (hw * BODY.rz + r));
    };
    head.add(mesh(ring(scarfFn, Math.max(96, detail * 3), 96), 5, { gloss: 0.7, lenK: 0.35 }));
    /* 垂下来那一条：一块圆角扁方，再弯过去贴着肚子；下面那截离开身子一点（布是垂着的） */
    const tailFn = (d, out) => {
      const hh = (TAIL.top - TAIL.bot) / 2;
      const lam = ((Math.abs(d.x) / TAIL.hw) ** 5 + (Math.abs(d.y) / hh) ** 5 + (Math.abs(d.z) / TAIL.t) ** 5) ** (-1 / 5);
      const lx = d.x * lam, ly = d.y * lam, lz = d.z * lam;
      const y = (TAIL.top + TAIL.bot) / 2 + ly, x = TAIL.x + lx;
      const z = smax(zOn(x, y), zOn(x, -0.5) - 0.4 * (-0.5 - y), 0.04) + TAIL.t + 0.012 + lz;
      return out.set(x, y, z);
    };
    head.add(mesh(blob(tailFn, Math.max(16, detail >> 1)), 6, { gloss: 0.7, lenK: 0.35 }));
    /* 鳍：末端稍宽一点 */
    const armShape = (d, out) => { const k = 1 + 0.12 * -d.y; out.x *= k; return out; };
    const armGeo = blob(ell(ARM.rx, ARM.ry, ARM.rz, armShape), Math.max(12, detail >> 2));
    for (const s of [-1, 1]) arm(s, ARM, mesh(armGeo, 2, { lenK: 0.9 }));
    /* 脚：脚掌一块（大半藏在身子底下）＋ 三颗脚趾，底都落在地上 */
    const soleGeo = blob(ell(0.21, 0.07, 0.21), Math.max(10, detail >> 2));
    const toeGeo = blob(ell(1, 0.85, 1.3), Math.max(8, detail >> 3));
    for (const s of [-1, 1]) {
      const so = mesh(soleGeo, 3, { gloss: 0.8, lenK: 0.5 }); so.position.set(s * FOOT.x, GROUND + 0.07, FOOT.z - 0.1); torso.add(so);
      for (const [dx, r] of TOES) {
        const t = mesh(toeGeo, 3, { gloss: 0.8, lenK: 0.5 });
        t.position.set(s * (FOOT.x + dx), GROUND + 0.85 * r, FOOT.z + 0.1 - Math.abs(dx) * 0.3); t.scale.setScalar(r); torso.add(t);
      }
    }
  },
};

/* 想：鳍抬到头侧、尖贴着脑袋（同粉色那只的「挠头」），头往那边歪、眼睛往上看。
     只有鳍的角度跟粉色那只不一样：企鹅头宽，照它的 fr 2.4 / lr −0.5 鳍整只埋进头里看不见（试过）；
     得多往前抬（lr −1.0）、少往上举（fr 2.2）才露在头侧。往前伸到脸颊那几种会被围巾吃掉，也试过。
   干活：同一份数。 */
export const KEY = {
  think: (sway = 0) => ({ fr: 2.2 + 0.08 * sway, lr: -1.0, gx: -0.03, gy: 0.065, tilt: -0.14 + 0.05 * sway, look: 0.08 + 0.05 * sway }),
  work: ph => { const s = Math.sin(ph * 2 * Math.PI), c = Math.cos(ph * 4 * Math.PI);
    return { nod: 0.05 + 0.05 * c, fl: 0.18 + 0.16 * s, fr: 0.18 - 0.16 * s, gy: -0.02, sq: 1 - 0.012 * c }; },
};
