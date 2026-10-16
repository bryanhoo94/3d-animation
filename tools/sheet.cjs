// 一页里连摆几个静止姿势、各截一张（只截画布），再拼成一张对照表；正面那张另存 <输出>-front.png（给 overlay.py）。
// 改形状以后看这张表：每个动作有没有穿模、手有没有埋进头里。
//   PW=<playwright 路径> node tools/sheet.cjs <预览页网址> <输出.png> [宽 520] [高 700]
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs');
(async () => {
  const [url, out, w = '520', h = '700'] = process.argv.slice(2);
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url.replace(/\/?(\?.*)?$/, '/?pose=%7B%7D'));
  await p.waitForFunction('window.avatarReady === true', null, { timeout: 180000 });
  const acts = await p.evaluate(() => [...document.querySelectorAll('.seg button')].map(b => [b.dataset.s, b.textContent]).filter(([s]) => s !== 'idle'));
  const poses = [['正面', {}], ['闭眼', { blink: 1 }], ['往左看', { look: -0.42, gx: -0.03 }], ['往右看', { look: 0.42, gx: 0.03, nod: 0.12 }],
    ['侧面', { yaw: 1.2 }], ['背面', { yaw: Math.PI }], ['蹲', { sq: 0.86 }], ['跳到最高', { dy: 0.62, smile: 1, roll: 0.06, fl: 0.5, fr: 0.5 }],
    ...await Promise.all(acts.map(async ([a, label]) => [label, await p.evaluate(a => window.avatarStill(a), a)]))];
  const c = await p.$('#c'), shots = [];
  for (const [name, q] of poses) {
    await p.evaluate(q => window.avatarDraw(q), q);
    shots.push([name, 'data:image/png;base64,' + (await c.screenshot({ timeout: 600000 })).toString('base64')]);
    process.stdout.write(`\r${shots.length}/${poses.length} ${name}      `);
  }
  const png = await p.evaluate(async shots => {
    const ims = await Promise.all(shots.map(([, s]) => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.src = s; })));
    const cw = ims[0].width, ch = ims[0].height + 28, cols = Math.min(5, ims.length), rows = Math.ceil(ims.length / cols);
    const k = Math.min(1, 1600 / (cw * cols)), cv = document.createElement('canvas');
    cv.width = Math.round(cw * cols * k); cv.height = Math.round(ch * rows * k);
    const g = cv.getContext('2d'); g.scale(k, k); g.fillStyle = '#151412'; g.fillRect(0, 0, cw * cols, ch * rows);
    g.font = '20px sans-serif'; g.fillStyle = '#c4bba9';
    ims.forEach((im, i) => { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch; g.drawImage(im, x, y); g.fillText(shots[i][0], x + 12, y + ch - 8); });
    return cv.toDataURL('image/png');
  }, shots);
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  const front = out.replace(/\.png$/, '') + '-front.png';                   // 正面那一张原尺寸单独存：tools/overlay.py 拿它跟原图叠
  fs.writeFileSync(front, Buffer.from(shots[0][1].split(',')[1], 'base64'));
  console.log(`\n${out}（${poses.length} 个姿势）＋ ${front}`, errs.join(' | ') || '没有报错');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
