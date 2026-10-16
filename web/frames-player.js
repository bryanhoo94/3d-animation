/* 3d-animation · 网页上的小尺寸：播 tools/frames.cjs 出的帧图（一秒 12 格硬切），不跑 3D。
     const f = mountFrames(el, { data: await (await fetch('frames.json')).json(), src: 'frames.png', width: 48 });
     f.set('think') · f.set('done')（跳一下就回到平时）· f.destroy()
   el 是一个空的块：宽 width、高 width × tall（上面那截是跳起来的头顶空间，不想占版面就用负的 margin-top 让它冒出去）。
   减动效：停在正面那一格。 */
export function mountFrames(el, { data, src, width, intro = false, onBack } = {}) {
  const { fps, cols, rows, tall, seq, kinds } = data, h = Math.round(width * tall);
  el.style.cssText += `;position:relative;overflow:hidden;width:${width}px;height:${h}px`;
  const img = document.createElement('img');
  img.src = src; img.alt = ''; img.draggable = false;
  img.style.cssText = `position:absolute;left:0;top:0;width:${cols * width}px;height:${rows * h}px;max-width:none;pointer-events:none`;
  el.append(img);
  const show = i => { img.style.transform = `translate(${-(i % cols) * width}px,${-Math.floor(i / cols) * h}px)`; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = intro ? 'enter' : 'idle', list = [], at = 0, timer = 0;
  const load = name => { cur = name; list = seq[name].flatMap(([i, n]) => Array(n).fill(i)); at = 0; };
  function step() {
    if (at >= list.length) {
      if (kinds[cur] === 'once') { load('idle'); onBack?.(); } else at = 0;
    }
    show(list[at++]);
  }
  load(cur);
  if (reduce) show(seq.idle[0][0]); else { step(); timer = setInterval(() => !document.hidden && step(), 1000 / fps); }
  return {
    set(name) { if (!seq[name] || reduce) return; load(name); step(); },
    destroy() { clearInterval(timer); img.remove(); },
  };
}
