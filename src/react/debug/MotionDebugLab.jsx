import React, { useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';

import '../styles/window-motion.css';
import '../styles/debug-lab.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

const DEFAULT_AVG_LINES = Object.freeze([
  { id: 'linxi', speaker: '林夕', text: '空气里还有刚下过雨的味道。这里的钟，为什么一直停在十八点四十七分？', portrait: '/main_characters/girl/00.png' },
  { id: 'broadcast', speaker: '校内广播', text: '请还没有找到教室的同学，沿着蓝色灯光慢慢向前。重复：不用着急。', sigil: 'FM 13' },
  { id: 'narrator', speaker: '旁白', text: '黑板上的粉笔字轻轻飘下来，像在等一句完整的话把它写实。', sigil: 'LOG' },
]);

const CARD_STATES = Object.freeze([
  { id: 'normal', word: '我', pos: '主语', note: '普通', tone: 'normal' },
  { id: 'rare', word: '时间', pos: '宾语', note: '稀有', tone: 'rare' },
  { id: 'upgraded', word: '斩＋', pos: '谓语', note: '升级', tone: 'upgraded' },
  { id: 'disabled', word: '遗忘', pos: '特殊', note: '禁用', tone: 'disabled', disabled: true },
  { id: 'drag', word: '影子', pos: '主语', note: '可拖拽', tone: 'drag' },
]);

function motionProps(reduced, enter = true) {
  if (reduced) return { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } };
  return {
    initial: enter ? { opacity: 0 } : false,
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.24, ease: EASE_OUT },
  };
}

export function MotionWindowPreview({
  title,
  children,
  focused = false,
  onFocus,
  className = '',
  reducedMotion = false,
}) {
  return (
    <motion.section
      className={`motion-lab-window ${focused ? 'is-focused' : ''} ${className}`.trim()}
      data-motion-window
      tabIndex={0}
      onPointerDown={onFocus}
      onFocus={onFocus}
      {...motionProps(reducedMotion)}
    >
      <header className="motion-lab-window-title" data-motion-window-title>
        <span>{title}</span>
        <i aria-hidden="true">×</i>
        <motion.b
          aria-hidden="true"
          animate={{ scaleX: focused ? 1 : 0.18, opacity: focused ? 0.8 : 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
        />
      </header>
      <div className="motion-lab-window-body">{children}</div>
    </motion.section>
  );
}

export function MotionAvgPreview({
  lines = DEFAULT_AVG_LINES,
  index = 0,
  onAdvance,
  reducedMotion = false,
}) {
  const line = lines[index % lines.length];
  const advance = () => onAdvance?.((index + 1) % lines.length);
  return (
    <motion.article
      className="motion-lab-avg"
      data-motion-avg
      role="button"
      tabIndex={0}
      aria-label={`${line.speaker}：${line.text}。点击继续`}
      onClick={advance}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          advance();
        }
      }}
      whileTap={reducedMotion ? undefined : { scale: 0.992 }}
      transition={{ duration: 0.1 }}
    >
      <div className="motion-lab-avg-portrait" data-motion-avg-portrait>
        <AnimatePresence mode="wait" initial={false}>
          {line.portrait ? (
            <motion.img
              key={line.id}
              src={line.portrait}
              alt={line.speaker}
              initial={reducedMotion ? false : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE_OUT }}
            />
          ) : (
            <motion.span
              key={line.id}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
            >{line.sigil}</motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="motion-lab-avg-copy" data-motion-avg-copy>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={line.id}
            initial={reducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE_OUT }}
          >
            <strong data-motion-avg-speaker>{line.speaker}</strong>
            <p data-motion-avg-text>{line.text}</p>
          </motion.div>
        </AnimatePresence>
        <small>点击推进　{index + 1}/{lines.length}</small>
      </div>
    </motion.article>
  );
}

function MotionCard({ card, reducedMotion }) {
  const interactive = !card.disabled;
  return (
    <motion.button
      type="button"
      className={`motion-lab-card tone-${card.tone}`}
      disabled={card.disabled}
      drag={card.tone === 'drag' && !reducedMotion}
      dragConstraints={{ left: -18, right: 18, top: -18, bottom: 18 }}
      dragElastic={0.08}
      whileHover={interactive && !reducedMotion ? { y: -10, rotate: card.tone === 'rare' ? -1 : 0.6, scale: 1.035 } : undefined}
      whileTap={interactive && !reducedMotion ? { y: -3, scale: 0.96 } : undefined}
      whileDrag={!reducedMotion ? { y: -14, scale: 1.06 } : undefined}
      transition={{ type: 'spring', stiffness: 440, damping: 30, mass: 0.72 }}
      aria-label={`${card.word}，${card.pos}，${card.note}`}
    >
      <span className="motion-lab-card-pos">{card.pos}</span>
      <b>{card.word}</b>
      <small>{card.note}</small>
    </motion.button>
  );
}

export function MotionDebugLab({ onBack, reducedMotion, className = '' }) {
  const userReducedMotion = useReducedMotion();
  const [motionOverride, setMotionOverride] = useState(null);
  const [focusedWindow, setFocusedWindow] = useState('normal');
  const [modalOpen, setModalOpen] = useState(false);
  const [avgIndex, setAvgIndex] = useState(0);
  const prefersLess = motionOverride ?? reducedMotion ?? userReducedMotion;
  const configPreference = prefersLess ? 'always' : 'never';
  const status = useMemo(() => prefersLess ? 'REDUCED' : 'FULL', [prefersLess]);

  return (
    <MotionConfig reducedMotion={configPreference}>
      <main className={`motion-debug-lab ${className}`.trim()} data-motion-mode={status.toLowerCase()}>
        <header className="motion-debug-header">
          <div>
            <p>LOCAL MOTION QA / 18:47</p>
            <h1>互动动作检视台</h1>
            <span>卡牌、按钮、窗口与 AVG 使用同一套水色 OS 动效语法。</span>
          </div>
          <div className="motion-debug-actions">
            <button type="button" onClick={() => setMotionOverride(!prefersLess)} aria-pressed={Boolean(prefersLess)}>
              MOTION · {status}
            </button>
            {onBack ? <button type="button" onClick={onBack}>← 返回</button> : null}
          </div>
        </header>

        <section className="motion-debug-section" aria-labelledby="motion-card-heading">
          <div className="motion-debug-section-heading">
            <p>01 / HAND INTERACTION</p>
            <h2 id="motion-card-heading">卡牌状态</h2>
            <span>悬停、按压与拖拽只移动视觉层，不改变牌列布局。</span>
          </div>
          <div className="motion-lab-card-row">
            {CARD_STATES.map((card) => <MotionCard key={card.id} card={card} reducedMotion={prefersLess} />)}
          </div>
        </section>

        <section className="motion-debug-section" aria-labelledby="motion-button-heading">
          <div className="motion-debug-section-heading compact">
            <p>02 / ACTION FEEDBACK</p>
            <h2 id="motion-button-heading">按钮状态</h2>
          </div>
          <div className="motion-lab-button-row">
            <motion.button type="button" className="primary" whileHover={prefersLess ? undefined : { y: -2 }} whileTap={prefersLess ? undefined : { scale: 0.96 }}>吟诵</motion.button>
            <motion.button type="button" whileHover={prefersLess ? undefined : { y: -2 }} whileTap={prefersLess ? undefined : { scale: 0.96 }}>结束回合</motion.button>
            <button type="button" disabled>不能吟诵</button>
            <button type="button" aria-pressed="true">CRT · ON</button>
          </div>
        </section>

        <section className="motion-debug-section" aria-labelledby="motion-window-heading">
          <div className="motion-debug-section-heading">
            <p>03 / WINDOW PRESENCE</p>
            <h2 id="motion-window-heading">窗口进入、退出与焦点</h2>
            <span>窗口根节点只渐显；焦点轨在标题栏内部运行，不覆盖定位 transform。</span>
          </div>
          <div className="motion-lab-window-grid">
            <MotionWindowPreview title="句子记录.log" focused={focusedWindow === 'normal'} onFocus={() => setFocusedWindow('normal')} reducedMotion={prefersLess}>
              <p>01　我斩纸片同学。</p><p>02　猫守住走廊。</p>
            </MotionWindowPreview>
            <MotionWindowPreview title="声音设置.sys" focused={focusedWindow === 'settings'} onFocus={() => setFocusedWindow('settings')} reducedMotion={prefersLess}>
              <label>总音量 <input type="range" defaultValue="76" aria-label="总音量" /></label>
              <label>BGM <input type="range" defaultValue="62" aria-label="BGM 音量" /></label>
            </MotionWindowPreview>
            <div className="motion-lab-modal-control">
              <motion.button type="button" onClick={() => setModalOpen(true)} whileTap={prefersLess ? undefined : { scale: 0.96 }}>打开模态窗口</motion.button>
              <small>检查 AnimatePresence exit</small>
            </div>
          </div>
        </section>

        <section className="motion-debug-section" aria-labelledby="motion-avg-heading">
          <div className="motion-debug-section-heading">
            <p>04 / AVG CADENCE</p>
            <h2 id="motion-avg-heading">说话人与文案切换</h2>
            <span>点击整块对话推进；原角色图只做位移和透明度反馈。</span>
          </div>
          <MotionAvgPreview index={avgIndex} onAdvance={setAvgIndex} reducedMotion={prefersLess} />
        </section>

        <AnimatePresence>
          {modalOpen ? (
            <motion.div className="motion-lab-modal-backdrop" key="motion-lab-modal" {...motionProps(prefersLess)}>
              <MotionWindowPreview title="确认.dialog" focused className="motion-lab-modal" reducedMotion={prefersLess}>
                <p>这是一段退出动画检查。关闭后，窗口先完成 opacity exit 再卸载。</p>
                <div className="motion-lab-modal-buttons">
                  <motion.button type="button" onClick={() => setModalOpen(false)} whileTap={prefersLess ? undefined : { scale: 0.96 }}>确认关闭</motion.button>
                </div>
              </MotionWindowPreview>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

export default MotionDebugLab;

