/* 3d-animation · App 里的小尺寸：播 tools/frames.cjs 出的帧图（一秒 12 格硬切），不跑 3D —— 列表头像、Tab 图标、通知里都放这个。
   不用装任何东西。用法：
     <AvatarFrames data={require('./frames.json')} source={require('./frames.webp')} width={48} state={state} onBack={() => setState('idle')} />
   系统开了减少动态效果：停在正面那一格。App 切到后台不走。 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, View, type ImageSourcePropType, type ViewStyle } from 'react-native';

export type FramesData = { fps: number; tall: number; cols: number; rows: number;
  seq: Record<string, [number, number][]>; kinds: Record<string, 'loop' | 'once'> };
export type AvatarFramesProps = {
  data: FramesData; source: ImageSourcePropType; width: number;
  state?: string; intro?: boolean; onBack?: () => void; style?: ViewStyle;
};

export function AvatarFrames({ data, source, width, state = 'idle', intro = false, onBack, style }: AvatarFramesProps) {
  const h = Math.round(width * data.tall);
  const [cell, setCell] = useState(data.seq.idle[0][0]);
  const run = useRef({ name: '', list: [] as number[], at: 0, reduce: false });
  const back = useRef(onBack); back.current = onBack;

  const load = (name: string) => {
    const r = run.current; if (!data.seq[name]) return;
    r.name = name; r.list = data.seq[name].flatMap(([i, n]) => Array(n).fill(i)); r.at = 0;
  };
  const step = () => {
    const r = run.current;
    if (r.at >= r.list.length) {
      if (data.kinds[r.name] === 'once') { load('idle'); back.current?.(); } else r.at = 0;
    }
    setCell(r.list[r.at++]);
  };

  useEffect(() => {
    let timer: any = 0, active = AppState.currentState === 'active', alive = true;
    const sub = AppState.addEventListener('change', s => { active = s === 'active'; });
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!alive) return;
      run.current.reduce = reduce;
      if (reduce) return;
      load(intro ? 'enter' : state); step();
      timer = setInterval(() => active && step(), 1000 / data.fps);
    });
    return () => { alive = false; clearInterval(timer); sub.remove(); };
  }, [data]);
  useEffect(() => { if (!run.current.reduce && run.current.name && run.current.name !== state) { load(state); step(); } }, [state]);

  return (
    <View style={[{ width, height: h, overflow: 'hidden' }, style]} accessible accessibilityRole="image" accessibilityLabel="会动的形象">
      <Image source={source} fadeDuration={0}
        style={{ position: 'absolute', width: data.cols * width, height: data.rows * h,
                 left: -(cell % data.cols) * width, top: -Math.floor(cell / data.cols) * h }} />
    </View>
  );
}
