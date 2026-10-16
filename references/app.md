# App 版（Expo / React Native）

跟网页同一份 `kit.js`、`motion.js`、模型文件；外面换成两个组件：

- `Avatar3D.tsx`：大的那只，实时 3D（expo-gl ＋ three）。
- `AvatarFrames.tsx`：小的地方（列表头像、Tab、通知），播帧图，不用装任何东西。

## 装

```bash
npx expo install expo-gl three
npm i -D @types/three
```
- `expo-gl` 是原生模块：**加上以后要重新打一次包**（EAS build / `npx expo run:ios|android`），之后换形象、加动作只改 JS（能走热更新）。只用 `AvatarFrames` 就不用装、不用重新打包。
- three 要 ≥ 0.163（只剩 WebGL2）。验过：three 0.186（npm 装的）和网页用的 r170，同一只同一个姿势画出来逐像素一样（有毛、没毛都比过）。
- tsconfig：Expo 默认 `allowJs: true`，kit / motion / 模型文件是 .js 直接 import。项目关了 allowJs，就给这几个文件各加一个 `.d.ts`（`export const SPEC: any` 那种）。

## 放

把 `kit.js`、`motion.js`、`<名字>-model.js`、`Avatar3D.tsx`、`AvatarFrames.tsx`、`frames.json`、`frames.webp` 放进同一个文件夹（例如 `components/avatar/`）。

```tsx
import { useState } from 'react';
import { Avatar3D } from './components/avatar/Avatar3D';
import { AvatarFrames } from './components/avatar/AvatarFrames';
import * as pink from './components/avatar/pink-model';

const [state, setState] = useState('idle');          // 'idle' | 'think' | 'work' | 'done' | 新加的动作
const [slow, setSlow] = useState(false);

// 大的
{slow
  ? <AvatarFrames data={require('./components/avatar/frames.json')} source={require('./components/avatar/frames.webp')} width={160} state={state} onBack={() => setState('idle')} />
  : <Avatar3D model={pink} skin="fur" width={160} state={state} onBack={() => setState('idle')} onSlow={() => setSlow(true)} />}

// 小的（列表、Tab）
<AvatarFrames data={require('./components/avatar/frames.json')} source={require('./components/avatar/frames.webp')} width={40} state={state} />
```

- 高是宽的 1.375 倍（上面那截是跳起来的头顶空间）；不想占版面就用负的 `marginTop` 让它冒出去。
- `Avatar3D` 会自己做：开场 · 点它跳（轻点）· 手指按住拖，它跟着看 · App 切到后台不画 · 30 帧 · 慢的手机先把毛减到 16 层，还慢停在正面并调 `onSlow` · 系统开了「减少动态效果」停在正面。
- `state` 换成 `done` 这种做一次的：做完调 `onBack`，把 state 放回 `'idle'`。
- **一屏最多一个 `Avatar3D`**。每个 GLView 一个 GL context，好几个同时跑会卡、会被系统回收。
- 毛在手机上最吃性能（GLView 按设备像素画，3 倍屏的 160pt 就是 480px 宽）。中低端手机先用没毛的，或者 `shells={24}`。

## 帧图

跟网页同一套：`tools/frames.cjs` 出 `frames.webp` ＋ `frames.json`。App 里一格在屏幕上 40pt，就出 `40 × 3 = 120` 宽（3 倍屏）；小于 64pt 加 `small`。整张图别超过 4096px 宽（Android 老机器的限制）：工具一行放 8 格，所以一格别超过 512。

## 验（这台服务器没有手机）

1. `npx tsc --noEmit`：组件和 kit / motion 的类型过。
2. `npx expo export --platform web`，起本地服务，用 playwright 开：expo-gl 在网页上也是 WebGL2，能验组件逻辑（开场、换 state、onBack、点它跳、帧图在播、没有报错）。
3. 真手机的流畅度、毛在手机 GPU 上的样子，只能请用户装上看；交付时照实说没验过。
