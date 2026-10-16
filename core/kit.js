/* 3d-animation · 骨架（kit）
   一只「圆身子 + 两只手（或翅膀、鳍）+ 两只脚 + 一张脸」的角色：角色文件（<名字>-model.js）只写形状、颜色、花纹，导出 SPEC；
   这里把它搭成 three.js 模型 —— 层级、眼睛和嘴、手的轴、两种皮（毛 / 软胶）、apply(pose)。
   文件里没有动画：调用方每一帧问 motion.js 要姿势，交给 apply。不 import three：THREE 从外面传进来，网页和 App 用同一份。
   来历：Elio 雪鸮（owl-model.js）→ r1 粉色毛绒怪 / r3 同款软胶 / r2 软胶企鹅（2026-10 手搭、逐张对过原图的那一套）。 */

/* 姿势字段。左右是画面上的左右。
   yaw 整只转身 · roll 整只左右歪 · dy 离地多高 · sq 压扁（<1）/ 拉长（>1）
   look 转头 · nod 点头（正的往下）· tilt 歪头 · gx gy 眼睛在脸上挪
   blink 闭眼 0–1 · smile 笑（眼睛变弯、嘴变大）· mouth 嘴多大 · eye 眼睛多大 · white 眼睛高光多大
   fl fr 左 / 右手往外张、往上抬 · ll lr 左 / 右手往前（负的往前）· seed 毛轻轻抖一下（定格帧图每格换一个） */
export const POSE0 = { yaw: 0, roll: 0, dy: 0, sq: 1, look: 0, nod: 0, tilt: 0, gx: 0, gy: 0,
  blink: 0, smile: 0, mouth: 1, fl: 0, fr: 0, ll: 0, lr: 0, seed: 0, eye: 1, white: 1.4 };

/* 机位和画框：每只都放进同一个画框 —— 下面方的那一块是它站着，上面多出 0.375 是跳起来的头顶空间 */
export const CAMERA = { pos: [0, 0.52, 8.0], at: [0, 0.27, 0], fov: 20, tall: 1.375 };

/* 毛的参数：fine 给大的（实时那只），small 给小的帧图（毛粗一点、乱一点，缩小了还看得出是毛） */
export const FUR_PARAMS = {
  fine: { length: 0.055, density: 120, thickness: 1.0, mess: 0.20, curl: 0.08 },
  small: { length: 0.095, density: 36, thickness: 1.0, mess: 0.34, curl: 0.10 },
};

/* 光和皮的默认值（r1 / r3 那一份）。角色在 SPEC.look 里只写跟这里不一样的 */
const LOOK = {
  L: [-0.45, 0.62, 0.64],              // 一盏从左上前方来的大柔光，跟着镜头走
  ao: 0.14,                            // 底下自己挡自己有多暗
  eyeRim: 0,                           // 眼珠下沿那圈很淡的反光（软胶企鹅 0.16）
  fur: { wrap: 1.25, dark: [0.82, 0.74, 0.72], lit: [1.08, 1.06, 1.03], root: 0.86, droop: 0.20,
         rimPow: 2.6, rimMix: 0.6, rim: [0.12, 0.50] },
  vinyl: { wrap: 1.25, dark: [0.82, 0.74, 0.72], lit: [1.06, 1.05, 1.03], push: 0.6,
           specCol: [1, 0.98, 0.96], specPow: 10, spec: 0.12, rimMix: 0.5, rimPow: 3, rim: 0.05 },
};
/* 眼睛、嘴离面多高：有毛要浮在毛尖上；软胶贴着面 */
const LIFT = { fur: { eye: 0.05, lid: 0.06, arc: 0.06, mouth: 0.055 },
               vinyl: { eye: 0.012, lid: 0.014, arc: 0.014, mouth: 0.014 } };
const FACE = { GLINT: { dx: 0.053, dy: 0.068, r: 0.18 }, eyeCol: '#0c0d10', hiCol: '#ffffff' };

const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = a => `vec3(${a.map(f).join(', ')})`;

/* ── 着色器 ──────────────────────────────────────────────────────
   角色的 glsl 里要有：自己的 uniform 声明 ＋ vec3 alb(vec3 p, out float ao)（p 是零件自己坐标里的点，ao 是软胶用的接缝影）；
   要压纹（只改法线）就再写 #define BUMP 和 vec3 bump(vec3 N, vec3 p, vec3 X)。uPart 是零件号，角色自己定。 */
const COMMON = /* glsl */`
  uniform float uLen, uDensity, uThick, uMess, uCurl, uShells, uSeed, uPart, uLenK, uGloss;
  float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  vec3 h33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  float lenK(vec3 p){ return uPart > .5 ? uLenK : 1.; }
`;
/* 毛：同一个零件画 uShells 层（InstancedMesh），每层沿法线往外推一点，按细胞噪声丢掉不在毛上的点（套壳毛） */
const furVS = k => COMMON + /* glsl */`
  varying vec3 vP, vN0, vN, vV, vW; varying float vH;
  void main(){
    float h = float(gl_InstanceID) / max(uShells - 1., 1.);
    vec3 p = position + normal * (h * uLen * lenK(position));
    vec4 wp = modelMatrix * vec4(p, 1.);
    wp.y -= h * h * uLen * ${f(k.droop)};                     // 毛尖往下坠一点（按世界的「下」）
    vec4 mv = viewMatrix * wp;
    vP = position; vN0 = normal; vH = h; vW = (modelMatrix * vec4(position, 1.)).xyz;
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const furFS = (k, L, alb) => COMMON + alb + /* glsl */`
  uniform vec3 uFloor; uniform float uAO;
  varying vec3 vP, vN0, vN, vV, vW; varying float vH;
  float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main(){
    float h = vH;
    vec3 N = normalize(vN), V = normalize(vV);
    float id = .5;
    if (h > .0001) {
      float tip = uLen * uDensity;
      vec3 q = vP * uDensity;
      vec3 m = vec3(vnoise(vP * 7. + uSeed), vnoise(vP * 7. + uSeed + 11.3), vnoise(vP * 7. + uSeed + 23.7)) - .5;
      vec3 m2 = h33(floor(vP * uDensity * .45) + uSeed) - .5;
      q += (m * 2.2 + m2 * 1.1) * (uMess * h * h * tip);
      vec3 n0 = normalize(vN0);
      float sg = n0.z >= 0. ? 1. : -1., ka = -1. / (sg + n0.z), kb = n0.x * n0.y * ka;
      vec3 t1 = vec3(1. + sg * n0.x * n0.x * ka, sg * kb, -sg * n0.x), t2 = vec3(kb, sg + n0.y * n0.y * ka, -n0.y);
      float ang = h * 9.42 + 6.283 * h13(floor(vP * uDensity * .45));
      q += (t1 * cos(ang) + t2 * sin(ang)) * (uCurl * h * tip * .9);
      vec3 ip = floor(q), fp = fract(q); float md = 9.; vec3 cell = ip;
      for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 r = g + h33(ip + g) - fp; float d = dot(r, r);
        if (d < md) { md = d; cell = ip + g; }
      }
      id = h13(cell + 7.7);
      float hmax = 1. - (.22 + .55 * uMess) * h13(cell + 3.1);
      float rad = uThick * .62 * (1. - .70 * h / hmax);
      if (h > hmax || sqrt(md) > rad) discard;
    }
    float ao_; vec3 a = alb(vP, ao_);                       // 毛自己有根部暗，接缝影只给软胶用
    a *= 1. + (id - .5) * .10;
    vec3 L = normalize(${v3(L)});
    float wrap = pow(clamp(dot(N, L) * .5 + .5, 0., 1.), ${f(k.wrap)});
    vec3 col = a * mix(${v3(k.dark)}, ${v3(k.lit)}, wrap);    // 暗面偏暖偏深，不是灰
    col *= mix(${f(k.root)}, 1., smoothstep(0., .85, h));                     // 毛根暗、毛尖亮
    col *= mix(1. - uAO, 1., smoothstep(uFloor.x, uFloor.y, vW.y));  // 底下自己挡自己
    float rim = pow(1. - clamp(dot(N, V), 0., 1.), ${f(k.rimPow)});
    col += mix(a, vec3(1.), ${f(k.rimMix)}) * rim * mix(${f(k.rim[0])}, ${f(k.rim[1])}, h);            // 逆光那一圈绒
    gl_FragColor = vec4(min(col, vec3(1.)), 1.);
  }
`;
/* 软胶：一层、哑光、很宽很淡的亮。push：面往外推几成毛长（同一份形状做有毛 / 没毛两只时，轮廓一样大） */
const vinylVS = k => COMMON + /* glsl */`
  varying vec3 vP, vN, vV, vW, vX;
  void main(){
    vec4 wp = modelMatrix * vec4(${k.push ? `position + normal * (uLen * ${f(k.push)} * lenK(position))` : 'position'}, 1.);
    vec4 mv = viewMatrix * wp;
    vP = position; vW = wp.xyz;
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    vX = normalize(normalMatrix * vec3(1., 0., 0.));      // 零件自己的 x 在画面里朝哪（压竖纹要用）
    gl_Position = projectionMatrix * mv;
  }
`;
const vinylFS = (k, L, alb) => COMMON + alb + /* glsl */`
  uniform vec3 uFloor; uniform float uAO;
  varying vec3 vP, vN, vV, vW, vX;
  void main(){
    vec3 N = normalize(vN), V = normalize(vV);
#ifdef BUMP
    N = bump(N, vP, vX);
#endif
    float ao; vec3 a = alb(vP, ao);
    vec3 L = normalize(${v3(L)});
    float wrap = pow(clamp(dot(N, L) * .5 + .5, 0., 1.), ${f(k.wrap)});
    vec3 col = a * mix(${v3(k.dark)}, ${v3(k.lit)}, wrap) * ao;
    col *= mix(1. - uAO, 1., smoothstep(uFloor.x, uFloor.y, vW.y));
    vec3 Hh = normalize(L + V);
    col += ${v3(k.specCol)} * pow(clamp(dot(N, Hh), 0., 1.), ${f(k.specPow)}) * ${f(k.spec)} * uGloss;
    col += mix(a, vec3(1.), ${f(k.rimMix)}) * pow(1. - clamp(dot(N, V), 0., 1.), ${f(k.rimPow)}) * ${f(k.rim)};
    gl_FragColor = vec4(min(col, vec3(1.)), 1.);
  }
`;
const EYE_VS = /* glsl */`
  uniform mat4 uToBody; varying vec3 vN, vP, vB, vV;
  void main(){ vP = position; vB = (uToBody * vec4(position, 1.)).xyz; vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }
`;
/* 眼睛：黑珠子 ＋ 画上去的白点（右上，两只眼一样） */
const eyeFS = (L, rim) => /* glsl */`
  uniform vec3 uCol, uHi, uDot; varying vec3 vN, vP, vB, vV;
  void main(){
    vec3 N = normalize(vN), L = normalize(${v3(L)});
    float d = uDot.z > 0. && vP.z > 0. ? 1. - smoothstep(uDot.z * .86, uDot.z, distance(vB.xy, uDot.xy)) : 0.;
    vec3 col = uCol * mix(.75, 1.6, clamp(dot(N, L) * .5 + .5, 0., 1.));
    ${rim ? `col += vec3(${f(rim)}) * pow(1. - clamp(dot(N, normalize(vV)), 0., 1.), 2.) * smoothstep(.1, -.6, N.y);` : ''}
    gl_FragColor = vec4(mix(col, uHi, d), 1.);
  }
`;
const INK_VS = /* glsl */`
  varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const inkFS = L => /* glsl */`
  uniform vec3 uCol; varying vec3 vN;
  void main(){ float l = clamp(dot(normalize(vN), normalize(${v3(L)})) * .5 + .5, 0., 1.); gl_FragColor = vec4(uCol * mix(.8, 1.4, l), 1.); }
`;

/* 搭一只。opt：skin 'fur' | 'vinyl'（不给就用 SPEC.skin）、detail 网格细到几、shells 毛几层 */
/** @param {any} THREE @param {any} SPEC @param {{ skin?: 'fur' | 'vinyl', detail?: number, shells?: number }} [opt] */
export function buildAvatar(THREE, SPEC, opt = {}) {
  const skin = opt.skin ?? SPEC.skin ?? 'vinyl', fur = skin === 'fur';
  const detail = opt.detail ?? SPEC.detail ?? 48;
  const { K, FLOOR, GROUND } = SPEC.frame;
  const look = { ...LOOK, ...SPEC.look, fur: { ...LOOK.fur, ...SPEC.look?.fur }, vinyl: { ...LOOK.vinyl, ...SPEC.look?.vinyl } };
  const lift = { ...LIFT[skin], ...SPEC.lift?.[skin] };
  const face = { ...FACE, ...SPEC.face };
  const { EYE, GLINT, MOUTH } = face;
  const body = SPEC.body;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const hex = h => new THREE.Color(h).convertLinearToSRGB();
  const uval = v => (typeof v === 'string' ? hex(v) : Array.isArray(v)
    ? (v.length === 4 ? new THREE.Vector4(...v) : new THREE.Vector3(...v)) : v);

  /* ── 几何工具 ── */
  const _a = V3(), _b = V3(), _c = V3(), _t1 = V3(), _t2 = V3(), _d = V3();
  /* 形状函数 fn(d, out)：单位球上的方向 d → 表面上的点；法线按两个切向的差分叉乘 */
  function normalOf(fn, d, out) {
    const e = 2e-3;
    _t1.set(0, 1, 0).cross(d); if (_t1.lengthSq() < 1e-6) _t1.set(1, 0, 0); _t1.normalize();
    _t2.copy(d).cross(_t1);
    fn(d, _a); fn(_d.copy(d).addScaledVector(_t1, e).normalize(), _b); fn(_d.copy(d).addScaledVector(_t2, e).normalize(), _c);
    return out.copy(_b.sub(_a)).cross(_c.sub(_a)).normalize();
  }
  /* 一颗：二十面体细分成球，每个点按形状函数挪过去 */
  function blob(fn, det) {
    const g = new THREE.IcosahedronGeometry(1, det);
    const pos = g.attributes.position, nor = g.attributes.normal, d = V3(), p = V3(), n = V3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize(); normalOf(fn, d, n); fn(d, p);
      pos.setXYZ(i, p.x, p.y, p.z); nor.setXYZ(i, n.x, n.y, n.z);
    }
    g.deleteAttribute('uv'); return g;
  }
  /* 一圈（围巾、腰带、项圈）：fn(u, v, out)，u 绕身子一圈、v 绕截面一圈 */
  function ring(fn, nu, nv) {
    const pos = [], nor = [], idx = [], p = V3(), a = V3(), b = V3(), n = V3(), e = 1e-3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = i / nu * 2 * Math.PI, v = j / nv * 2 * Math.PI;
      fn(u, v, p); fn(u + e, v, a); fn(u, v + e, b);
      n.copy(a.sub(p)).cross(b.sub(p)).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const k = i * (nv + 1) + j, k2 = k + nv + 1;
      idx.push(k, k2, k + 1, k2, k2 + 1, k + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx); return g;
  }
  const ell = (rx, ry, rz, shape) => (d, out) => { out.set(d.x * rx, d.y * ry, d.z * rz); return shape ? shape(d, out) : out; };
  const sgnPow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
  /* 平滑的 max：两段面接上不出折痕 */
  const smax = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h); };
  /* 脸上的东西贴在身子表面：给正面的 (x, y) 找到那一点和它的法线 */
  const relax = SPEC.faceRelax ?? 0.7;
  function onFace(x, y) {
    const d = V3(x, y, 1).normalize(), p = V3();
    for (let i = 0; i < 30; i++) { body(d, p); d.x += (x - p.x) * 0.7; d.y += (y - p.y) * relax; d.z = Math.abs(d.z); d.normalize(); }
    return { p: body(d, V3()), n: normalOf(body, d, V3()) };
  }

  /* ── 材质 ── */
  const U = {
    uLen: { value: 0 }, uDensity: { value: 0 }, uThick: { value: 0 }, uMess: { value: 0 }, uCurl: { value: 0 },
    uShells: { value: opt.shells ?? 48 }, uSeed: { value: 0 },
  };
  for (const [k, v] of Object.entries({ ...SPEC.uniforms, ...SPEC.skins?.[skin]?.uniforms })) U[k] = { value: uval(v) };
  U.uFloor = { value: V3() }; U.uAO = { value: look.ao };
  const P = { ...(SPEC.fur?.fine ?? FUR_PARAMS.fine) };
  const VS = fur ? furVS(look.fur) : vinylVS(look.vinyl);
  const FS = fur ? furFS(look.fur, look.L, SPEC.glsl) : vinylFS(look.vinyl, look.L, SPEC.glsl);
  const mats = [], furs = [], geos = [];
  /* 一个零件：part 零件号（着色器里 uPart）；lenK 毛长几成；gloss 软胶亮几成 */
  function mesh(geo, part, o = {}) {
    geos.push(geo);
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, uPart: { value: part }, uLenK: { value: o.lenK ?? 1 }, uGloss: { value: o.gloss ?? 1 } },
      vertexShader: VS, fragmentShader: FS });
    mats.push(m);
    if (!fur) return new THREE.Mesh(geo, m);
    const im = new THREE.InstancedMesh(geo, m, U.uShells.value); im.frustumCulled = false; furs.push(im); return im;
  }

  /* ── 层级：root（转身、歪、离地、压扁）→ torso（缩 K，脚落在 FLOOR）→ head（转头 / 点头 / 歪头）
     身子、耳朵、围巾挂 head（跟着头转）；手、脚挂 torso（不跟着头转）。 */
  const root = new THREE.Group();
  const torso = new THREE.Group(); torso.scale.setScalar(K); torso.position.y = FLOOR - GROUND * K; root.add(torso);
  const head = new THREE.Group(); torso.add(head);
  /* 手：肩膀上一个轴（pivot），里面一层把手摆到垂下往外斜 rest 的样子，手本体挂在下面；左右镜像（+x 朝外） */
  const arms = [];
  function arm(s, A, m) {
    const pivot = new THREE.Group(); pivot.position.set(s * A.px, A.py, A.pz); pivot.rotation.order = 'XYZ';
    const rest = new THREE.Group(); rest.rotation.z = s * A.rest; pivot.add(rest);
    m.position.set(0, -A.len, 0); m.scale.x = s;
    rest.add(m); torso.add(pivot); arms[s < 0 ? 0 : 1] = pivot; return pivot;
  }
  SPEC.build({ THREE, V3, hex, head, torso, mesh, arm, blob, ring, ell, normalOf, onFace, sgnPow, smax, detail, skin });

  /* ── 眼睛、嘴 ── */
  const stick = (m, x, y, l) => {
    const { p, n } = onFace(x, y);
    m.position.copy(p).addScaledVector(n, l);
    m.quaternion.setFromUnitVectors(V3(0, 0, 1), n);
    head.add(m); return m;
  };
  const sph = new THREE.SphereGeometry(1, 40, 28); geos.push(sph);
  const eyeMat = () => { const m = new THREE.ShaderMaterial({ vertexShader: EYE_VS, fragmentShader: eyeFS(look.L, look.eyeRim),
    uniforms: { uCol: { value: hex(face.eyeCol) }, uHi: { value: hex(face.hiCol) }, uDot: { value: V3() }, uToBody: { value: new THREE.Matrix4() } } });
    mats.push(m); return m; };
  const inkMat = () => { const m = new THREE.ShaderMaterial({ vertexShader: INK_VS, fragmentShader: inkFS(look.L),
    uniforms: { uCol: { value: hex(face.eyeCol) } } }); mats.push(m); return m; };
  const eyes = [-1, 1].map(s => stick(new THREE.Mesh(sph, eyeMat()), s * EYE.x, EYE.y, lift.eye));
  const lidGeo = new THREE.TorusGeometry(1, 0.20, 10, 28, Math.PI * 0.7); lidGeo.rotateZ(-Math.PI / 2 - Math.PI * 0.35); geos.push(lidGeo);
  const lids = [-1, 1].map(s => stick(new THREE.Mesh(lidGeo, inkMat()), s * EYE.x, EYE.y + 0.07, lift.lid));   // 闭眼：一道往下弯的线
  const arcGeo = new THREE.TorusGeometry(1, 0.24, 10, 32, Math.PI); geos.push(arcGeo);
  const arcs = [-1, 1].map(s => stick(new THREE.Mesh(arcGeo, inkMat()), s * EYE.x, EYE.y - 0.05, lift.arc));   // 笑眼：往上拱的弧
  const mouthGeo = new THREE.TorusGeometry(MOUTH.R, MOUTH.tube, 8, 36, MOUTH.arc);
  mouthGeo.rotateZ(-Math.PI / 2 - MOUTH.arc / 2); mouthGeo.translate(0, MOUTH.R, 0); geos.push(mouthGeo);
  const mouth = stick(new THREE.Mesh(mouthGeo, inkMat()), 0, MOUTH.y, lift.mouth);

  let pose = { ...POSE0 };
  function apply(p) {
    pose = { ...POSE0, ...p };
    U.uLen.value = P.length; U.uDensity.value = P.density; U.uThick.value = P.thickness;
    U.uMess.value = P.mess; U.uCurl.value = P.curl; U.uSeed.value = pose.seed * 1.37;
    const s = pose.sq, w = 1 / Math.sqrt(s);
    root.scale.set(w, s, w); root.position.y = FLOOR * (1 - s) + pose.dy;
    root.rotation.set(0, pose.yaw, pose.roll);
    head.rotation.set(-pose.nod, pose.look, pose.tilt, 'YXZ');
    const open = 1 - 0.80 * pose.blink, shut = pose.blink > 0.8;
    eyes.forEach((e, i) => {
      const sx = i ? 1 : -1, { p, n } = onFace(sx * EYE.x + pose.gx, EYE.y + pose.gy);
      e.position.copy(p).addScaledVector(n, lift.eye); e.quaternion.setFromUnitVectors(V3(0, 0, 1), n);
      e.scale.set(EYE.rx * pose.eye, EYE.ry * pose.eye * open, EYE.rz * (0.4 + 0.6 * open));
      e.visible = !pose.smile && !shut;
      const k = (1 - 0.22 * (pose.white - 1)) * pose.eye, u = e.material.uniforms;
      e.updateMatrix(); u.uToBody.value.copy(e.matrix);
      u.uDot.value.set(p.x + GLINT.dx * k, p.y + GLINT.dy * k, pose.blink < 0.3 ? EYE.rx * GLINT.r * pose.white * pose.eye : 0);
    });
    const put = (m, i, dy, l) => { const { p, n } = onFace((i ? 1 : -1) * EYE.x + pose.gx, EYE.y + pose.gy + dy);
      m.position.copy(p).addScaledVector(n, l); m.quaternion.setFromUnitVectors(V3(0, 0, 1), n); };
    lids.forEach((l, i) => { l.visible = !pose.smile && shut; l.scale.setScalar(0.095 * pose.eye); if (l.visible) put(l, i, 0.07, lift.lid); });
    arcs.forEach((a, i) => { a.visible = !!pose.smile; a.scale.set(0.105 * pose.eye, 0.105 * pose.eye, 0.07); if (a.visible) put(a, i, -0.05, lift.arc); });
    const mk = pose.mouth * (pose.smile ? 1.22 : 1);
    mouth.scale.set(mk, mk * (pose.smile ? 1.25 : 1), 1);
    /* 手：先往外张（绕 z），再往前抬（绕 x）。画面左边那只是 -x */
    if (arms[0]) arms[0].rotation.set(-pose.ll, -0.25 * pose.ll, -pose.fl);
    if (arms[1]) arms[1].rotation.set(-pose.lr, 0.25 * pose.lr, pose.fr);
    U.uFloor.value.set(FLOOR + pose.dy, FLOOR + pose.dy + 0.9, 0);
    for (const m of furs) m.count = U.uShells.value;
  }
  apply({});

  return {
    root, P, U, apply, skin, fur, camera: CAMERA, get pose() { return pose; },
    /* 毛减到 n 层（慢的设备自己让一步）；软胶没有毛，什么都不做 */
    setShells(n) {
      if (!fur) return;
      U.uShells.value = n;
      for (const m of furs) if (m.instanceMatrix.count < n) {
        m.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16); m.count = n;
      } else m.count = n;
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}
