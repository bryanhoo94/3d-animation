// 出帧图：把预览页里第一只按 core/frames.js 的格子一格一格渲染（透明底），拼成一张图 ＋ 一份 json，给小尺寸（网页 / App）播。
//   PW=<playwright 路径> node tools/frames.cjs <预览页网址> <输出文件夹> [一格多宽 px，默认 192] [small]
//   预览页要先用 tools/assemble.sh 凑好、起一个本地服务；文件夹里要有 frames.js（assemble 会拷）。
//   small：毛用帧图那档（粗一点、乱一点）——一格在页面上小于 64px 时用。没有显卡，软件渲染：有毛 28 格约 3–10 分钟。
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [url, out, px = '192', small] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 600, height: 800 } });
  p.on('pageerror', e => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  await p.goto(url.replace(/\/?(\?.*)?$/, '/?shot'));
  await p.waitForFunction('window.avatarReady === true', null, { timeout: 180000 });
  const S = await p.evaluate(async () => {
    const { sheet } = await import('./frames.js'), cfg = await import('./config.js'), M = cfg.SHOW[0].model;
    const s = sheet(M.KEY, M.ACTIONS); window.__cells = s.cells; return { ...s, cells: s.cells.map(c => c[0]) };
  });
  const cols = 8, rows = Math.ceil(S.cells.length / cols);
  const tall = await p.evaluate(async () => (await import('./kit.js')).CAMERA.tall);
  const cells = [];
  for (let i = 0; i < S.cells.length; i++) {
    cells.push(await p.evaluate(([i, px, small]) => window.avatarShot(px, { ...window.__cells[i][1], seed: i }, small), [i, +px, !!small]));
    process.stdout.write(`\r${i + 1}/${S.cells.length} ${S.cells[i]}      `);
  }
  const [png, webp] = await p.evaluate(async ([cells, px, cols, rows, tall]) => {
    const h = Math.round(px * tall), c = document.createElement('canvas'); c.width = px * cols; c.height = h * rows;
    const g = c.getContext('2d');
    for (let i = 0; i < cells.length; i++) await new Promise(ok => { const im = new Image();
      im.onload = () => { g.drawImage(im, (i % cols) * px, Math.floor(i / cols) * h); ok(); }; im.src = cells[i]; });
    return [c.toDataURL('image/png'), c.toDataURL('image/webp', 0.8)];
  }, [cells, +px, cols, rows, tall]);
  /* png 留着看；页面和 App 用 webp（带透明，小三四倍） */
  fs.writeFileSync(path.join(out, 'frames.png'), Buffer.from(png.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(out, 'frames.webp'), Buffer.from(webp.split(',')[1], 'base64'));
  const data = { fps: S.fps, px: +px, tall, cols, rows, cells: S.cells, seq: S.seq, kinds: S.kinds };
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(data));
  console.log(`\n${out}/frames.webp ＋ frames.png（${S.cells.length} 格，${cols}×${rows}，一格 ${px}×${Math.round(px * tall)}）＋ frames.json`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
