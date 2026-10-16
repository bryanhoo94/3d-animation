---
name: 3d-animation
description: 把一张形象图（吉祥物、IP、logo 里的小角色、头像）做成会动的 3D 形象：照原图手搭 three.js 模型，有毛（毛绒）或没毛（软胶 / 搪胶）两种皮，先问用户要哪些动作再做；出网页版（实时 3D）和 App 版（Expo：expo-gl 实时 3D ＋ 小尺寸帧图）。也用来给做好的形象加新动作、换皮（有毛 ↔ 没毛）、重出帧图、放进别的项目。只收「圆身子 + 两只手（或翅膀、鳍）+ 两只脚 + 一张脸」这一类身体。Use when 用户打 /3d-animation 或 $3d-animation；说「把这个形象 / 吉祥物 / avatar / logo 做成 3D」「让它动起来」「做成会动的」「像 Dots 那样活的」「加个动作（挥手、点头、睡觉、转圈…）」「换成有毛 / 没毛」「放到 App 里 / 手机上」「出帧图」。
---

# 3d-animation — 形象图 → 会动的 3D（网页 ＋ App）

一张形象图进来，出一只照原图手搭的 3D 形象：同一个模型、同一套动作，网页上实时跑、App 里实时跑，小的地方播帧图。
做法来自 Elio 的雪鸮和 2026-10 的 r1（粉色毛绒怪）/ r3（同款软胶）/ r2（软胶企鹅），这三只都逐张对过原图，在 `examples/` 里。

**为什么手搭、不用「图片转 3D」：** 2026-10-14 拿 img2threejs 跟手搭并排做过一只软胶章鱼：它把软胶认成金属、嘴丢了、轮廓只重合 56%，流程只走到第一步。手搭的更像。所以这里不用任何生成式 3D、图片转模型的工具，形状每个数都从原图量出来。

## 第零步：用户要的是哪一种

| 用户怎么说 | 怎么办 |
|---|---|
| `/3d-animation <图>`，「把这个做成 3D / 让它动起来」 | **新做一只**：走下面「新做一只」整套 |
| 「加个动作：挥手 / 点头 / 睡觉…」，形象已经做过 | **加动作**：只改模型文件的 `ACTIONS`（和 `KEY`），按 [references/motions.md](references/motions.md)；做完重出帧图 |
| 「换成有毛 / 没毛」「两种都要比一比」 | **换皮**：`skin` 改一个字，形状不动；两种并排比就在 `config.js` 的 `SHOW` 放两项。见 [references/skins.md](references/skins.md) |
| 「放到我的网站 / App 里」 | 按 [references/web.md](references/web.md) / [references/app.md](references/app.md) 接进去 |
| 「小图标也要会动」「出帧图」 | `tools/frames.cjs` 出一张帧图 ＋ json，网页用 `frames-player.js`、App 用 `AvatarFrames` |

## 新做一只

每一步做完先自己验，验过了再往下。

1. **看图，过骨架关。** 这套骨架只有：一颗身子（头身一体）· 两只手（翅膀、鳍）挂在肩膀上 · 两只脚 · 一张脸（两只眼、一张嘴）· 贴在身上的零件（耳朵、围巾、肚子那块、腮红、花纹）。
   - 能做：圆滚滚的吉祥物、毛绒玩具、搪胶公仔、企鹅、猫头鹰、小熊、小怪兽。
   - **做不了，直接说、不硬做**：章鱼和多条腿的、长手长脚的人形、四条腿的动物、要走路的、手指要动的、没有脸的。说清楚是骨架没有那几个关节，问用户要不要换一张图；要加骨架是另一件大活，先不做。
   → 验：说得出这张图的每个零件挂在骨架哪一级（head / torso / 手 / 脚）。
2. **问一次，等回复。** 按 [references/intake.md](references/intake.md) 发一条：能不能做、有毛还是没毛（看图给推荐）、要哪些动作（默认六个 ＋ 用户想加的，用大白话）、出哪几样（网页 / App / 两个都要）、放在哪。用户回 ok 才开始；没回不动手。
3. **量图。** `python3 -I tools/measure.py <原图> --mask m.png` 先看轮廓抠得对不对、选身子的半宽当 1，再带 `--unit --cx --cy --grid g.png` 量一遍：每一行的宽、眼睛和嘴的位置大小、`--pick` 取颜色（取亮面），里面的花纹边在格子图上读。**靠前的零件（眼睛、嘴、脚趾）要按透视往回收**，不然画出来偏外、偏下。数都写进模型文件，注释写清是从哪量的。见 [references/model.md](references/model.md)。
4. **建模。** 从 `examples/` 挑身体最像的一只抄一份（头身一体的圆身子 → `pink`；蛋形、花纹画在身上的 → `penguin`），改形状、零件、颜色、花纹。`kit.js` 不改。
   → 验：`bash tools/assemble.sh <文件夹> <模型.js> <原图>` 凑一个预览页，起本地服务，`tools/sheet.cjs` 出姿势表（顺手存一张正面 `-front.png`），`tools/overlay.py` 拿它跟原图叠着比、打出每行轮廓差和眼睛嘴的位置差。先改大的（身子宽高、脚底、头顶），再改零件，**每轮都看图、看数字**。轮廓、五官、颜色都对上了才往下（标准见 model.md 最后一节）。
5. **动作。** 默认六个不用写：开场（背对着转过来再跳）· 平时（呼吸、眨眼、跟着鼠标 / 手指看）· 想 · 干活 · 好了（跳起来笑）· 点它跳。每只要调的只有 `KEY`：「想」那只手举到头侧，角度每只都要在姿势表里试几组（手露在头侧、不埋进头里、不像挥手），别照抄例子的数。用户要的新动作写进 `ACTIONS`，节奏只用 `O3K`。见 [references/motions.md](references/motions.md)。
   → 验：姿势表里每个动作的手都看得见、没有穿模；`tools/live.cjs` 真跑一遍。
6. **出成品。** 网页：预览页本身就能上线，或者把 `mountAvatar` 接进现有页面（[references/web.md](references/web.md)）。App：`Avatar3D` ＋ `AvatarFrames`（[references/app.md](references/app.md)）。帧图：`tools/frames.cjs`。
7. **验收**，按 [references/verify.md](references/verify.md) 的清单：手机 390 和桌面 1440 都截图看；动画流程跑通、没有报错、没有横向滚动；App 至少用 `expo export --platform web` 在浏览器里跑一遍。
8. **交付**：给链接 / 文件路径；说清楚现在能看到什么、哪些照用户说的做了、哪里跟说的不一样（为什么）、哪些没法验（真手机的流畅度、真显卡）。截图是给自己验的，不发给用户挑。

## 硬规矩

- **形状每个数都从原图量**，注释写来源；试过不行的角度、形状，在注释里写一句「试过」，下次别再试。
- **动作只用 `O3K` 和 ω 跟踪器**（`core/motion.js`）。用户的项目有自己的动效规格（`MOTION-SPEC.md` 之类）就先读它；新动作先登记再写。
- **`kit.js`、`motion.js` 不为某一只改。** 每只的差别都放在模型文件（SPEC、KEY、ACTIONS）。只有所有角色都用得上的能力才改 kit，改完要证明旧的几只逐像素没变（[references/verify.md](references/verify.md) 的回归比对）。
- **文件平铺在同一个文件夹**，互相用 `./` 引用；kit、motion、模型文件都不 import three（由调用方传进来），网页和 App 才能用同一份。
- **上线不留半成品**：整个文件夹在旁边做好验完，再一次换上去（`mv -T` 或逐个文件临时名 ＋ `mv`）。
- **这台机器多半没有显卡**：无头浏览器走 SwiftShader 软件渲染，有毛的一帧要几秒。测试里可以减毛（`SHELLS=2`）、用虚拟时钟，页面代码不动。真机流畅度只能请用户看，照实说。

## 文件

| 路径 | 是什么 |
|---|---|
| `core/kit.js` | 骨架：SPEC → three.js 模型（层级、眼睛嘴、手的轴、毛 / 软胶两种皮、`apply(pose)`） |
| `core/motion.js` | 动作：`O3K` 节奏、`ACTIONS` 动作表、`createMotion()` 每一帧给姿势 |
| `core/frames.js` | 帧图的格子和动作序列（小尺寸用） |
| `web/avatar.js` · `web/index.html` · `web/frames-player.js` | 网页：挂到 canvas 上自己跑 · 预览页（读 `config.js`）· 播帧图 |
| `app/Avatar3D.tsx` · `app/AvatarFrames.tsx` | App（Expo）：实时 3D · 播帧图 |
| `examples/pink/` · `examples/penguin/` | 两只做好的：粉色毛绒怪（有毛 r1 ＋ 软胶 r3，带「挥手」示范）· 软胶企鹅（r2） |
| `tools/` | `measure.py` 量图 · `assemble.sh` 凑预览页 · `sheet.cjs` 姿势表 · `overlay.py` 跟原图叠 · `live.cjs` 跑动画流程 · `frames.cjs` 出帧图 |
| `vendor/three.module.min.js` | three r170（网页用；App 用 npm 的 three） |
| `references/` | intake 问什么 · model 怎么量怎么搭 · skins 两种皮 · motions 动作和加动作 · web · app · verify 验收 |

工具要 playwright：`PW=<…/node_modules/playwright>`。找不到就 `find / -path '*node_modules/playwright/package.json' 2>/dev/null | head -1`；再没有就在临时文件夹 `npm i playwright && npx playwright install chromium`。
