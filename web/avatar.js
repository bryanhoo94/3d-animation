/* 3d-animation · 网页版：把一只（或并排几只）放进一块 canvas，自己跑动画。
   一块 canvas、一个渲染器；几只就左右分几格（同一个机位，吃同一份姿势，所以动作一帧一帧对得上）。
     const av = mountAvatar({ THREE, canvas, models: [buildAvatar(THREE, SPEC, { skin: 'fur' })], motion: createMotion({ POSE0, KEY, ACTIONS }) });
     av.set('think') · av.poke() · av.still(pose) · av.destroy()
   会自己做的：开场（背对着转过来再跳）· 点它跳 · 鼠标跟随（只认鼠标）· 看不见就不画（页签在后台、滚出屏幕）·
   触屏 30 帧 · 慢的设备自己让一步（毛减到 16 层、像素密度 1、30 帧，还慢就停在正面那一格）· 减动效：停在正面不动。 */
/* 不 import 任何东西：机位从模型上拿（kit 的 CAMERA），姿势字段由模型的 apply 自己补齐。和 kit.js、motion.js、模型文件放在同一个文件夹。 */

export function mountAvatar({ THREE, canvas: cv, models, motion, intro = true, onStop } = {}) {
  const n = models.length, CAMERA = models[0].camera, TALL = CAMERA.tall;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ren = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  ren.setClearColor(0, 0);
  const scenes = models.map(m => { const s = new THREE.Scene(); s.add(m.root); return s; });
  const cam = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, 30);
  cam.position.set(...CAMERA.pos); cam.lookAt(...CAMERA.at);
  let W = 0, H = 0, dprCap = 2;
  function fit() {                       // n 格，每格一个 1 : TALL 的画框
    const r = cv.getBoundingClientRect(), dpr = Math.min(dprCap, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr / n), h = Math.round(w * TALL);
    if (w === W && h === H && cv.width === n * w) return;          // 截图（avatarShot）改过画布大小也要重来
    W = w; H = h; ren.setPixelRatio(1); ren.setSize(n * w, h, false);
    /* 画面只往上加高：视锥上下对称撑大，只取上面那一段 */
    const full = Math.round(w * (2 * TALL - 1));
    cam.fov = 2 * Math.atan(Math.tan(CAMERA.fov / 2 * Math.PI / 180) * full / w) * 180 / Math.PI;
    cam.aspect = w / full; cam.setViewOffset(w, full, 0, 0, w, h); cam.updateProjectionMatrix();
  }
  function draw(pose) {
    fit(); ren.setScissorTest(n > 1);
    models.forEach((m, i) => { m.apply(pose); ren.setViewport(i * W, 0, W, H); ren.setScissor(i * W, 0, W, H); ren.render(scenes[i], cam); });
  }

  let ptr = null, last = 0, gaps = [], coarse = matchMedia('(pointer: coarse)').matches, drawn = 0, eased = false, raf = 0;
  let stopped = reduce, onScreen = true;
  const gaze = () => {
    if (!ptr) return null;
    const r = cv.getBoundingClientRect(), cy = r.bottom - r.width / (2 * n);   // 它们在各自画框下面那块方的里面
    return { dx: Math.max(-1, Math.min(1, (ptr.x - (r.left + r.width / 2)) / (innerWidth * 0.45))),
             dy: Math.max(-1, Math.min(1, (ptr.y - cy) / (innerHeight * 0.45))), t: ptr.t };
  };
  function stop() { stopped = true; draw(motion.still()); onStop?.(); }
  /* 慢的设备自己让一步：按实际两次画之间隔了多久量，连着 40 帧（看中位数）慢过 45 帧 / 秒（触屏那档 24 帧 / 秒）就降一级。
     慢得离谱（三倍）8 帧就下结论。看中位数不看平均：偶尔卡一下（一次 1 秒）不算慢 */
  function tick(now) {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (document.hidden || !onScreen || (coarse && now - drawn < 32)) return;
    if (drawn) {
      const lim = coarse ? 42 : 22, med = () => [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
      gaps.push(Math.min(1000, now - drawn));
      if (gaps.length >= 40 || (gaps.length >= 8 && med() > 3 * lim)) {
        if (med() > lim) {
          if (!eased) { eased = true; for (const m of models) if (m.U.uShells.value > 16) m.setShells(16); dprCap = 1; coarse = true; }
          else return stop();
        }
        gaps.length = 0;
      }
    }
    draw(motion.pose(now / 1000, dt, gaze())); drawn = now;
  }
  const resume = () => { drawn = 0; gaps.length = 0; };                 // 切走再回来：那一段空白不算慢
  document.addEventListener('visibilitychange', resume);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; resume(); });
  io.observe(cv);
  const onMove = e => { if (e.pointerType === 'mouse') ptr = { x: e.clientX, y: e.clientY, t: performance.now() / 1000 }; };
  addEventListener('pointermove', onMove, { passive: true });
  const onResize = () => stopped && draw(motion.still());
  addEventListener('resize', onResize);
  const poke = () => !stopped && motion.poke(performance.now() / 1000);
  cv.addEventListener('click', poke);

  motion.start(performance.now() / 1000, intro && !reduce);
  if (reduce) draw(motion.still()); else raf = requestAnimationFrame(tick);

  let backTimer = 0;
  return {
    renderer: ren, models,
    get stopped() { return stopped; },
    /* 换动作；once 的动作做完回调 onBack（让按钮回到「平时」） */
    set(name, onBack) {
      clearTimeout(backTimer);
      const once = motion.actions[name]?.kind === 'once';
      /* 停着的时候（减动效、太慢）：换成那个动作停住的那一格；做一次的动作不做，直接回到平时 */
      if (stopped) { motion.set(once ? 'idle' : name, 0); draw(motion.still()); if (once) onBack?.(); return; }
      const back = motion.set(name, performance.now() / 1000);
      if (back > 0) backTimer = setTimeout(() => { motion.set('idle', performance.now() / 1000); onBack?.(); }, back * 1000);
    },
    poke,
    /* 摆一个静止的姿势（截图、出帧图用），动画停掉 */
    still(pose) { stopped = true; cancelAnimationFrame(raf); draw(pose); },
    destroy() {
      stopped = true; cancelAnimationFrame(raf); clearTimeout(backTimer); io.disconnect();
      document.removeEventListener('visibilitychange', resume); removeEventListener('pointermove', onMove);
      removeEventListener('resize', onResize); cv.removeEventListener('click', poke);
      for (const m of models) m.dispose(); ren.dispose();
    },
  };
}
