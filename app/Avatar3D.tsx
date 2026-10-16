/* 3d-animation · App 版（Expo / React Native）：实时 3D 那一只，跟网页版同一份 kit.js、motion.js、模型文件。
   要装：npx expo install expo-gl three（expo-gl 是原生模块：加上以后要重新打一次包，EAS build；之后换形象、加动作只改 JS）。
   用法：
     import * as pink from './pink-model';
     <Avatar3D model={pink} skin="fur" width={160} state={state} onBack={() => setState('idle')} onSlow={() => setSlow(true)} />
   会自己做的：开场（背对着转过来再跳）· 点它跳 · 手指按住拖动它就跟着看 · App 切到后台不画 · 30 帧 ·
   慢的手机自己让一步（毛减到 16 层，还慢就停在正面并调 onSlow，可以换成 <AvatarFrames>）· 系统开了减少动态效果：停在正面不动。
   小的地方（列表头像、图标、Tab）别放这个，放 <AvatarFrames>：一屏同时跑好几个 GL 会卡。 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, AppState, View, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { buildAvatar, CAMERA, POSE0 } from './kit';
import { createMotion } from './motion';

export type AvatarModel = { SPEC: any; KEY: any; ACTIONS?: Record<string, any> };
export type Avatar3DProps = {
  model: AvatarModel;
  skin?: 'fur' | 'vinyl';
  width: number;                 // 高是 width × 1.375（上面那截是跳起来的头顶空间）
  state?: string;                // 'idle' | 'think' | 'work' | 'done' | 模型文件 ACTIONS 里新加的
  intro?: boolean;               // 第一次出来演开场
  detail?: number;               // 网格细到几（默认 32）
  shells?: number;               // 毛几层（默认 32；慢了自己减到 16）
  onBack?: () => void;           // 做一次的动作（done…）做完了：把 state 放回 'idle'
  onSlow?: () => void;           // 太慢，停在正面了
  style?: ViewStyle;
};

export function Avatar3D({ model, skin, width, state = 'idle', intro = true, detail = 32, shells = 32, onBack, onSlow, style }: Avatar3DProps) {
  const height = Math.round(width * CAMERA.tall);
  const live = useRef<{ set: (s: string) => void; poke: () => void; touch: (e: GestureResponderEvent) => void; stop: () => void } | null>(null);
  const cb = useRef({ onBack, onSlow, state });
  cb.current = { onBack, onSlow, state };
  const down = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => () => live.current?.stop(), []);
  useEffect(() => { live.current?.set(state); }, [state]);

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    /* three 要一个 canvas：给它一个假的，真正画在 expo-gl 的 context 上 */
    const canvas = { width: W, height: H, style: {}, clientWidth: W, clientHeight: H,
      addEventListener() {}, removeEventListener() {}, getContext: () => gl } as unknown as HTMLCanvasElement;
    const ren = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true, alpha: true });
    ren.setPixelRatio(1); ren.setSize(W, H, false); ren.setClearColor(0, 0);
    const m = buildAvatar(THREE, model.SPEC, { skin, detail, shells });
    const scene = new THREE.Scene(); scene.add(m.root);
    /* 画框同网页：视锥上下对称撑大，只取上面那一段 */
    const cam = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, 30);
    cam.position.set(...(CAMERA.pos as [number, number, number])); cam.lookAt(...(CAMERA.at as [number, number, number]));
    const full = Math.round(W * (2 * CAMERA.tall - 1));
    cam.fov = 2 * Math.atan(Math.tan(CAMERA.fov / 2 * Math.PI / 180) * full / W) * 180 / Math.PI;
    cam.aspect = W / full; cam.setViewOffset(W, full, 0, 0, W, H); cam.updateProjectionMatrix();
    const draw = (pose: object) => { m.apply(pose); ren.render(scene, cam); gl.endFrameEXP(); };

    const motion = createMotion({ POSE0, KEY: model.KEY, ACTIONS: model.ACTIONS });
    const now = () => performance.now() / 1000;
    let stopped = false, raf = 0, last = 0, drawn = 0, eased = false, active = AppState.currentState === 'active', backTimer: any = 0;
    let gaze: { dx: number; dy: number; t: number } | null = null;
    const gaps: number[] = [];
    const still = () => draw(motion.still());
    const stopAt = () => { stopped = true; cancelAnimationFrame(raf); still(); };
    /* 慢的手机：按两次画之间实际隔了多久量，连着 40 帧（看中位数）慢过 24 帧 / 秒就降一级；慢得离谱（三倍）8 帧就下结论 */
    function tick(ms: number) {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0; last = ms;
      if (!active || ms - drawn < 32) return;                             // 30 帧
      if (drawn) {
        const lim = 42, med = () => [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
        gaps.push(Math.min(1000, ms - drawn));
        if (gaps.length >= 40 || (gaps.length >= 8 && med() > 3 * lim)) {
          if (med() > lim) {
            if (!eased && m.fur) { eased = true; m.setShells(16); }
            else { stopAt(); cb.current.onSlow?.(); return; }
          }
          gaps.length = 0;
        }
      }
      draw(motion.pose(ms / 1000, dt, gaze)); drawn = ms;
    }
    const sub = AppState.addEventListener('change', s => { active = s === 'active'; drawn = 0; gaps.length = 0; });

    live.current = {
      set(s) {
        clearTimeout(backTimer);
        const once = motion.actions[s]?.kind === 'once';
        /* 停着的时候（减动效、太慢）：换成那个动作停住的那一格；做一次的动作不做，直接回到平时 */
        if (stopped) { motion.set(once ? 'idle' : s, 0); draw(motion.still()); if (once) cb.current.onBack?.(); return; }
        const back = motion.set(s, now());
        if (back > 0) backTimer = setTimeout(() => { motion.set('idle', now()); cb.current.onBack?.(); }, back * 1000);
      },
      poke() { if (!stopped) motion.poke(now()); },
      /* 手指在它身上：跟着看（坐标按它自己的框算，脚下那块方的中心是原点） */
      touch(e) {
        const { locationX: x, locationY: y } = e.nativeEvent, c = (v: number) => Math.max(-1, Math.min(1, v));
        gaze = { dx: c((x - width / 2) / (width / 2)), dy: c((y - (height - width / 2)) / (width / 2)), t: now() };
      },
      stop() { stopped = true; cancelAnimationFrame(raf); clearTimeout(backTimer); sub.remove(); m.dispose(); ren.dispose(); },
    };
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (reduce) { stopped = true; still(); return; }
      motion.start(now(), intro);
      if (cb.current.state !== 'idle') live.current?.set(cb.current.state);
      raf = requestAnimationFrame(tick);
    });
  }

  return (
    <View
      style={[{ width, height }, style]}
      accessible accessibilityRole="image" accessibilityLabel="会动的形象，点它会跳起来笑"
      onStartShouldSetResponder={() => true}
      onResponderGrant={e => { down.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now() }; live.current?.touch(e); }}
      onResponderMove={e => live.current?.touch(e)}
      onResponderRelease={e => {
        const d = down.current; down.current = null;
        if (d && Math.hypot(e.nativeEvent.pageX - d.x, e.nativeEvent.pageY - d.y) < 10 && Date.now() - d.t < 400) live.current?.poke();
      }}
    >
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}

