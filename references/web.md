# 网页版

## 一个独立页面（最快）

```bash
bash tools/assemble.sh <输出文件夹> <名字>-model.js <原图缩略图.jpg>
```
文件夹里就是一个能直接上线的页面：`index.html`（预览页：画布 ＋ 动作按钮 ＋ 原图小图）、`config.js`（放哪几只）、`kit.js`、`motion.js`、`avatar.js`、`frames.js`、`frames-player.js`、`three.module.min.js`、模型文件、原图。
- 并排比两种皮、加右上角链接：改 `config.js`（`SHOW`、`LINKS`）。
- 本地看：在文件夹里 `python3 -m http.server 8781 --bind 127.0.0.1`（端口被占就换一个），开 `http://127.0.0.1:8781/`（模块要从 http 开，file:// 不行）。
- 上线：整个文件夹在旁边做好、验完，一次换上去（`mv -T 新 旧`；或者每个文件先写临时名再 `mv`，按「被引用的先换」的顺序）。改了某个文件就在 import 那里加 `?v=2`，免得浏览器用旧的。
- 截图口子：`?pose={"smile":1}` 摆一个静止姿势；`window.avatarDraw(pose)`；`window.avatarShot(px, pose, small)` 出透明 PNG；`window.avatarStill('think')` 拿某个动作停住的姿势。

## 接进已有的网页

把 `kit.js`、`motion.js`、`avatar.js`、模型文件、`three.module.min.js`（或项目自己的 three，≥ r163）放进同一个文件夹：

```html
<canvas id="mascot" style="width:160px;aspect-ratio:8/11"></canvas>
<script type="module">
import * as THREE from './three.module.min.js';
import { buildAvatar, POSE0 } from './kit.js';
import { createMotion } from './motion.js';
import { mountAvatar } from './avatar.js';
import * as M from './pink-model.js';

const av = mountAvatar({
  THREE, canvas: document.getElementById('mascot'),
  models: [buildAvatar(THREE, M.SPEC, { skin: 'fur', detail: 40, shells: 40 })],
  motion: createMotion({ POSE0, KEY: M.KEY, ACTIONS: M.ACTIONS }),
  intro: true,                       // 第一次出来演开场
  onStop: () => {},                  // 设备太慢停下了（可以换成帧图）
});
// 跟业务状态接上：在想 → av.set('think')；干活 → av.set('work')；做完 → av.set('done', () => 按钮回到平时)
</script>
```

- 画布宽高比 8 : 11（一只）：下面方的那块是它站着，上面多出来的是跳起来的头顶空间。不想占版面：画布比框高，贴底放，上面那截用负的 margin 冒出去、`pointer-events:none`。
- 会自己做：看不见不画（页签在后台、滚出屏幕）· 触屏 30 帧 · 慢的设备降一级（毛减到 16 层、像素密度 1），还慢停在正面 · 系统开了「减少动态效果」就停在正面 · 只认鼠标跟随（触屏不跟）。
- 一个页面里**实时的最多一两只**。同一屏有好几个（列表、导航、头像）的放帧图。

## 小尺寸：帧图

```bash
PW=<playwright> node tools/frames.cjs http://127.0.0.1:8781/ <输出文件夹> 192 [small]
```
出 `frames.webp`（页面用）、`frames.png`（看）、`frames.json`（格子在哪、每个动作是哪几格停几格）。一格在页面上多宽，出的时候就用它的 2–3 倍（48px 的图标出 144）；小于 64px 加 `small`（毛粗一点，缩小了还看得出是毛）。

```js
import { mountFrames } from './frames-player.js';
const f = mountFrames(document.getElementById('icon'), { data: await (await fetch('frames.json')).json(), src: 'frames.webp', width: 48 });
f.set('think'); f.set('done');   // done 跳一下就自己回到平时
```
一秒 12 格硬切（定格动画那种）；减动效停在正面那一格。改了模型或动作要重出帧图。
