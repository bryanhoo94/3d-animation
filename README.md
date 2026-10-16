# 3d-animation

一张形象图 → 一只会动的 3D 形象，网页和 App 都能用。

- 照原图手搭（不是图片转 3D）：形状、五官、颜色都从原图量出来，再跟原图叠着改到像。
- 两种皮：**有毛**（毛绒）/ **没毛**（软胶、搪胶）。同一份形状一个字切换，也能并排比。
- 先问要哪些动作再做。默认有：开场转身、平时（呼吸、眨眼、跟着鼠标 / 手指看）、想、干活、好了（跳起来笑）、点它跳；用大白话说新动作（挥手、转一圈…）就加。
- 出：网页（three.js 实时）· App（Expo：expo-gl 实时 ＋ 小尺寸帧图）· 帧图（一张图 ＋ json）。
- 只收「圆身子 + 两只手（或翅膀、鳍）+ 两只脚 + 一张脸」这一类身体。章鱼、长手长脚、四条腿、要走路的，它会直接说做不了。

## 装

```bash
git clone <这个仓库> 3d-animation && cd 3d-animation
bash install.sh          # 先说要做什么，确认后才动手；--yes 不问
```
它只做两件事：把这个文件夹链接到 `~/.claude/skills/3d-animation`，有 `~/.codex` 的话再链接到 `~/.codex/skills/3d-animation`。不下载东西、不改你的项目。

## 用

- Claude Code：`/3d-animation 图片路径`，或者直接说「把这张图做成会动的 3D」。
- Codex：`$3d-animation 图片路径`（Codex 里 skill 用 `$` 叫，`/` 是它自己的命令）。

它会先回你一条：能不能做、推荐有毛还是没毛、要哪些动作、出网页还是 App、放哪。你回 ok 才开始。

之后：
- `/3d-animation 加动作：挥手` —— 给做好的那只加动作，网页、App、帧图一起有。
- `/3d-animation 换成没毛` —— 换皮，形状不动。

## 里面有什么

| | |
|---|---|
| `SKILL.md` | 给 AI 看的流程和规矩 |
| `core/` | `kit.js` 骨架（形状 → 模型、两种皮）· `motion.js` 动作 · `frames.js` 帧图的格子 |
| `web/` | `avatar.js` 挂到 canvas 上 · `index.html` 预览页 · `frames-player.js` 播帧图 |
| `app/` | `Avatar3D.tsx`（expo-gl）· `AvatarFrames.tsx` |
| `examples/` | 粉色毛绒怪（有毛 ＋ 软胶版，带「挥手」）· 软胶企鹅 |
| `tools/` | 量图、凑预览页、姿势表、跟原图叠、跑动画流程、出帧图 |
| `references/` | 每一步的细节 |

自己看例子：

```bash
bash tools/assemble.sh /tmp/pink examples/pink/pink-model.js examples/pink/r1.jpg
cd /tmp/pink && python3 -m http.server 8781     # 开 http://127.0.0.1:8781/
```

## 来历

做法来自 Elio 的白色雪鸮标（2026-10），之后用同一套做了粉色毛绒怪（有毛 r1、软胶 r3）和软胶企鹅（r2），都逐张对过原图；拆成这个 skill 时三只渲染出来跟原来逐像素一样。

`vendor/three.module.min.js` 是 [three.js](https://threejs.org) r170（MIT）。
