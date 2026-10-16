// 真跑一遍动画流程（不摆姿势）：开场转身 → 跳 → 平时 → 每个动作按钮点一遍 → once 的动作做完按钮回到「平时」→ 点它跳 → 还在动。
// 页面看到的时钟换成「每帧 16.7ms」：无头浏览器软件渲染一秒只有几帧，按真时钟页面会以为设备慢、自己停掉。
//   PW=<playwright 路径> [SHELLS=2] node tools/live.cjs <预览页网址> <截图前缀> [宽 390] [高 844]
//   SHELLS：只在测试里把毛减到几层（软件渲染 40 层一帧要几秒），页面代码不动。
const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const [url, out, w = '390', h = '844'] = process.argv.slice(2);
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window); let v = performance.now(); window.__frames = 0;
    performance.now = () => v;
    /* 截图那几秒（软件渲染很慢）时钟停住：__hold 时不往下走，回调留到放开再跑，截到的就是按下截图那一刻 */
    window.__hold = false;
    const tick = cb => raf(() => { if (window.__hold) return tick(cb); v += 1000 / 60; window.__frames++; cb(v); });
    window.requestAnimationFrame = tick;
  });
  if (process.env.SHELLS) await p.route(/\/config\.js(\?.*)?$/, async r => {
    const res = await r.fetch(); const body = (await res.text()).replace(/shells:\s*\d+/, 'shells: ' + process.env.SHELLS);
    await r.fulfill({ response: res, body });
  });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.goto(url);
  await p.waitForFunction('window.avatarReady === true', null, { timeout: 180000 });
  const waitV = async s => { const t = await p.evaluate(() => performance.now()); await p.waitForFunction(x => performance.now() > x, t + s * 1000, { timeout: 600000, polling: 200 }); };
  const box = await (await p.$('#c')).boundingBox();
  const shot = async k => {
    await p.evaluate(() => { window.__hold = true; });
    await p.screenshot({ path: `${out}-${k}.png`, clip: box, timeout: 600000 });
    await p.evaluate(() => { window.__hold = false; }); console.log('截图', `${out}-${k}.png`);
  };
  const tap = sel => p.$eval(sel, el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const pressed = () => p.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.s);
  await waitV(0.25); await shot('0-开场背对'); await waitV(1.6); await shot('1-开场跳'); await waitV(1.5); await shot('2-平时');
  const acts = await p.evaluate(() => [...document.querySelectorAll('.seg button')].map(b => b.dataset.s));
  for (const a of acts.filter(a => a !== 'idle')) {
    await tap(`button[data-s="${a}"]`); await waitV(0.9); await shot(`3-${a}`);
    await waitV(1.6); console.log(a, '之后按钮停在', await pressed());
  }
  await tap('button[data-s="idle"]'); await waitV(0.5);
  await tap('#c'); await waitV(0.45); await shot('4-点它');
  const f0 = await p.evaluate(() => window.__frames); await waitV(1); const f1 = await p.evaluate(() => window.__frames);
  console.log('还在动', f1 > f0, '横向滚动', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  console.log(errs.length ? '报错：\n' + errs.join('\n') : '没有报错'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
