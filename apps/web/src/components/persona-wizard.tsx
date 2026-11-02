import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { GhostButton, PrimaryButton } from '@/components/button';
import {
  ChoiceControl,
  LevelControl,
  LinesControl,
  NumberControl,
  SelectControl,
  SliderControl,
  SwitchControl,
  TextAreaControl,
  TextControl,
  TimeRangeControl,
} from '@/components/persona-form-controls';
import { cn } from '@/lib/cn';
import {
  clearDraft,
  CONFLICT_OPTIONS,
  createDefaultDraft,
  hasDraftContent,
  HUMOR_OPTIONS,
  LEVEL_OPTIONS,
  loadDraft,
  MEMORY_OPTIONS,
  ONLINE_OPTIONS,
  PHASES,
  PUNCTUATION_OPTIONS,
  saveDraft,
  SENTENCE_OPTIONS,
  SLIDER_GROUPS,
  STEPS,
  TOTAL_STEPS,
  validateStep,
  type PersonaDraft,
  type StepErrors,
} from '@/lib/persona-draft';

interface PersonaWizardProps {
  open: boolean;
  onClose: () => void;
}

type View = 'intro' | 'step' | 'milestone' | 'success';

interface ResumeState {
  step: number;
  updatedAt: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const STEP_TRANSITION = { duration: 0.26, ease: EASE };
const VIEW_TRANSITION = { duration: 0.24, ease: EASE };

const TIME_OFFSET_OPTIONS = Array.from({ length: 25 }, (_, index) => {
  const value = index - 12;

  return {
    value: String(value),
    label: value === 0 ? '0 小时 · 无时差' : `${value > 0 ? '+' : ''}${value} 小时`,
  };
});

function formatClock(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatMoment(iso: string): string {
  const date = new Date(iso);

  if (!iso || Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PhaseRail({ activePhase, step }: { activePhase: number; step: number }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-mist-100/[0.07] px-5 py-7 lg:flex">
      <p className="font-mono text-[0.54rem] uppercase tracking-[0.26em] text-mist-600">
        Filing Sequence
      </p>

      <ol className="mt-6 space-y-1">
        {PHASES.map((phase, index) => {
          const done = index < activePhase;
          const active = index === activePhase;

          return (
            <li key={phase.name}>
              <div
                className={cn(
                  'flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-300',
                  active && 'bg-brass-400/[0.07]',
                  !active && !done && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[0.54rem] transition-colors duration-300',
                    active
                      ? 'border-brass-400/50 bg-brass-400/15 text-brass-300'
                      : done
                        ? 'border-jade-400/35 bg-jade-400/10 text-jade-300'
                        : 'border-mist-100/15 text-mist-600',
                  )}
                >
                  {done ? (
                    <Check className="size-3" strokeWidth={2.4} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-[0.76rem] transition-colors duration-300',
                      active ? 'text-mist-100' : 'text-mist-400',
                    )}
                  >
                    {phase.name}
                  </span>
                  <span className="mt-0.5 block text-[0.57rem] leading-4 text-mist-600">
                    {phase.caption}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-mist-100/[0.07] bg-ink-950/30 p-3.5">
          <p className="font-mono text-[0.5rem] uppercase tracking-[0.18em] text-mist-600">进度</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-mist-200">
            {Math.round((step / TOTAL_STEPS) * 100)}
            <span className="ml-0.5 text-[0.65rem] font-normal text-mist-600">%</span>
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300"
              animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              transition={{ duration: 0.45, ease: EASE }}
            />
          </div>
          <p className="mt-2 text-[0.58rem] text-mist-600">
            阶段 {activePhase + 1} / {PHASES.length}
          </p>
        </div>
      </div>
    </aside>
  );
}

export function PersonaWizard({ open, onClose }: PersonaWizardProps) {
  const [data, setData] = useState<PersonaDraft>(createDefaultDraft);
  const [view, setView] = useState<View>('intro');
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<StepErrors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const draft = loadDraft();
    setData(draft?.data ?? createDefaultDraft());
    setStep(draft?.step ?? 1);
    setSavedAt(draft?.updatedAt ?? null);
    setResume(draft ? { step: draft.step, updatedAt: draft.updatedAt } : null);
    setView('intro');
    setDirection(1);
    setErrors({});

    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step, view]);

  const current = STEPS[step - 1] ?? STEPS[0]!;
  const phase = PHASES[current.phase] ?? PHASES[0]!;
  const savedLabel = formatClock(savedAt);
  const resumePhase = resume ? PHASES[(STEPS[resume.step - 1] ?? STEPS[0]!).phase] : null;

  const update = <K extends keyof PersonaDraft>(key: K, value: PersonaDraft[K]) => {
    setData((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!(key in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[key as string];
      return next;
    });
  };

  const focusFirstError = () => {
    window.requestAnimationFrame(() => {
      const root = panelRef.current;

      if (!root) {
        return;
      }

      const target =
        root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        root.querySelector<HTMLElement>('.wizard-input, .wizard-textarea, .wizard-time');

      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleStart = () => {
    setDirection(1);
    setErrors({});
    setView('step');
  };

  const handleNext = () => {
    const nextErrors = validateStep(step, data);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusFirstError();
      return;
    }

    setErrors({});

    if (step === TOTAL_STEPS) {
      clearDraft();
      setSavedAt(null);
      setResume(null);
      setView('success');
      return;
    }

    const snapshot = saveDraft(data, step + 1);
    if (snapshot) {
      setSavedAt(snapshot.updatedAt);
    }

    setDirection(1);

    if (current.milestone) {
      setView('milestone');
      return;
    }

    setStep(step + 1);
  };

  const handleBack = () => {
    if (view === 'milestone') {
      setDirection(-1);
      setErrors({});
      setView('step');
      return;
    }

    if (step === 1) {
      return;
    }

    setDirection(-1);
    setErrors({});
    setStep(step - 1);
  };

  const handleContinueMilestone = () => {
    if (step >= TOTAL_STEPS) {
      setView('success');
      return;
    }

    setDirection(1);
    setErrors({});
    setStep(step + 1);
    setView('step');
  };

  const handleCancel = () => {
    if ((view === 'step' || view === 'milestone') && (step > 1 || hasDraftContent(data))) {
      saveDraft(data, view === 'milestone' ? Math.min(TOTAL_STEPS, step + 1) : step);
    }

    onClose();
  };

  const handleRestart = () => {
    clearDraft();
    setData(createDefaultDraft());
    setStep(1);
    setView('intro');
    setDirection(1);
    setErrors({});
    setSavedAt(null);
    setResume(null);
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }

    const root = panelRef.current;

    if (!root) {
      return;
    }

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const renderStep = (stepId: number) => {
    switch (stepId) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextControl
                id="persona-name"
                label="姓名"
                value={data.name}
                onChange={(value) => update('name', value)}
                max={20}
                required
                error={errors.name}
                placeholder="她真正的名字"
              />
              <TextControl
                id="persona-nickname"
                label="绰号"
                value={data.nickname}
                onChange={(value) => update('nickname', value)}
                max={5}
                error={errors.nickname}
                placeholder="熟人怎么叫她"
              />
              <NumberControl
                id="persona-age"
                label="年龄"
                value={data.age}
                onChange={(value) => update('age', value)}
                min={10}
                unit="岁"
                required
                hint="最小 10 岁"
                error={errors.age}
                placeholder="24"
              />
              <TextControl
                id="persona-identity"
                label="身份"
                value={data.identity}
                onChange={(value) => update('identity', value)}
                max={20}
                error={errors.identity}
                placeholder="继承家业的次女"
              />
              <TextControl
                id="persona-occupation"
                label="职业"
                value={data.occupation}
                onChange={(value) => update('occupation', value)}
                max={20}
                required
                error={errors.occupation}
                placeholder="旧书店店主"
              />
              <TextControl
                id="persona-species"
                label="种族"
                value={data.species}
                onChange={(value) => update('species', value)}
                max={10}
                required
                error={errors.species}
                placeholder="人类 / 精灵 / 仿生人"
              />
              <NumberControl
                id="persona-height"
                label="身高"
                value={data.height}
                onChange={(value) => update('height', value)}
                min={100}
                max={400}
                unit="cm"
                required
                hint="可填范围 100–400 cm"
                error={errors.height}
                placeholder="168"
              />
              <NumberControl
                id="persona-weight"
                label="体重"
                value={data.weight}
                onChange={(value) => update('weight', value)}
                min={20}
                max={300}
                unit="kg"
                required
                hint="可填范围 20–300 kg"
                error={errors.weight}
                placeholder="52"
              />
            </div>

            <SwitchControl
              label="时间感知"
              description="她能感知现实中的当前时间，并据此判断日夜、日期与季节。"
              checked={data.timeAwareness}
              onChange={(checked) => update('timeAwareness', checked)}
            />
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <TextAreaControl
              id="persona-body"
              label="体型描述"
              value={data.bodyDescription}
              onChange={(value) => update('bodyDescription', value)}
              max={80}
              rows={3}
              error={errors.bodyDescription}
              placeholder="高挑偏瘦，肩背线条清晰，站着时习惯微微收下巴。"
              hint="用于贴近、倚靠等互动时的体型参照，只写体型即可。"
            />
            <TextAreaControl
              id="persona-appearance"
              label="外貌描述"
              value={data.appearance}
              onChange={(value) => update('appearance', value)}
              max={300}
              rows={6}
              required
              error={errors.appearance}
              placeholder="五官、肤色、体格与常见神态……这段描述会用于生成人设图与头像。"
              hint="最多 300 字，建议包含五官、肤色、体格与常见神态。"
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <TextAreaControl
              id="persona-hairstyle"
              label="发型描述"
              value={data.hairstyle}
              onChange={(value) => update('hairstyle', value)}
              max={300}
              rows={5}
              required
              error={errors.hairstyle}
              placeholder="黑色长发，常在右侧松松挽起，额前留几缕碎发。"
              hint="长度、发色、束发方式与日常打理程度。"
            />
            <TextAreaControl
              id="persona-outfit"
              label="服装描述"
              value={data.outfit}
              onChange={(value) => update('outfit', value)}
              max={300}
              rows={5}
              required
              error={errors.outfit}
              placeholder="深色高领针织衫配长裙，出门时加一件旧呢外套。"
              hint="常服、配饰与季节性外套，最好能一眼认出她。"
            />
          </div>
        );

      case 4:
        return (
          <TextAreaControl
            id="persona-voice"
            label="声音描述"
            value={data.voice}
            onChange={(value) => update('voice', value)}
            max={300}
            rows={7}
            required
            error={errors.voice}
            placeholder="音高偏低，语速不快，尾音轻轻收住；笑的时候会先停顿半秒。"
            hint="TTS 会参考：音高、语速、口音、笑声与尾音习惯。"
          />
        );

      case 5:
        return (
          <TextAreaControl
            id="persona-worldview"
            label="世界观"
            value={data.worldview}
            onChange={(value) => update('worldview', value)}
            max={500}
            rows={8}
            error={errors.worldview}
            placeholder="她生活在什么时代、什么地方，科技与社会规则走到了哪一步。"
            hint="建议覆盖：时代背景 / 地理位置 / 科技水平。"
          />
        );

      case 6:
        return (
          <TextAreaControl
            id="persona-backstory"
            label="背景故事"
            value={data.backstory}
            onChange={(value) => update('backstory', value)}
            max={2000}
            rows={12}
            error={errors.backstory}
            placeholder="她的来处，塑造她的那几件事，以及她现在为什么在这里。"
            hint="最多 2000 字。重要的不是完整年表，而是塑造她的那几件事。"
          />
        );

      case 7:
        return (
          <TextAreaControl
            id="persona-knowledge"
            label="知识边界"
            value={data.knowledgeBoundary}
            onChange={(value) => update('knowledgeBoundary', value)}
            max={500}
            rows={8}
            error={errors.knowledgeBoundary}
            placeholder="她熟悉什么、完全不知道什么，以及面对超出认知的问题会如何反应。"
            hint="限定 LLM 可以调用的知识范围，避免她突然知道不该知道的事。"
          />
        );

      case 8:
        return (
          <LinesControl
            id="persona-core-values"
            label="核心价值观"
            lines={data.coreValues}
            onChange={(lines) => update('coreValues', lines)}
            max={5}
            perLineMax={20}
            required
            error={errors.coreValues}
            placeholder="不否定他人劳动"
            hint="模糊情境下，她默认站在这一边。每行一条，最多 20 字。"
          />
        );

      case 9:
        return (
          <LinesControl
            id="persona-taboos"
            label="禁忌"
            lines={data.taboos}
            onChange={(lines) => update('taboos', lines)}
            max={5}
            perLineMax={20}
            required
            error={errors.taboos}
            placeholder="当众被起哄"
            hint="被触碰时，她会警觉、回避、冷淡或反驳。"
          />
        );

      case 10:
        return (
          <LinesControl
            id="persona-fears"
            label="恐惧来源"
            lines={data.fears}
            onChange={(lines) => update('fears', lines)}
            max={5}
            perLineMax={20}
            error={errors.fears}
            placeholder="被证明自己毫无价值"
            hint="越靠近这些事，她越会退回到哪里。"
          />
        );

      case 11:
        return (
          <LinesControl
            id="persona-weaknesses"
            label="性格弱点"
            lines={data.weaknesses}
            onChange={(lines) => update('weaknesses', lines)}
            max={5}
            perLineMax={20}
            error={errors.weaknesses}
            placeholder="被人认真认可手艺"
            hint="什么是她无法拒绝的温柔，也是道歉能生效的依据。"
          />
        );

      case 12:
        return (
          <LinesControl
            id="persona-red-lines"
            label="绝对红线"
            lines={data.redLines}
            onChange={(lines) => update('redLines', lines)}
            max={5}
            perLineMax={20}
            error={errors.redLines}
            placeholder="不接受当众羞辱"
            hint="她不会让步的事。输出与之冲突时，应当被打回或改写。"
          />
        );

      case 13:
        return (
          <TextAreaControl
            id="persona-long-term-goal"
            label="长期目标"
            value={data.longTermGoal}
            onChange={(value) => update('longTermGoal', value)}
            max={60}
            rows={3}
            error={errors.longTermGoal}
            placeholder="把旧书店重新开成街角最安静的据点。"
            hint="一句话即可，给所有行为一个总方向。"
          />
        );

      case 14:
        return (
          <TextAreaControl
            id="persona-current-goal"
            label="当前目标"
            value={data.currentGoal}
            onChange={(value) => update('currentGoal', value)}
            max={60}
            rows={3}
            error={errors.currentGoal}
            placeholder="在本周结束前凑齐下个月的房租。"
            hint="近期最想完成的事；完成或失败后应被替换。"
          />
        );

      case 15:
        return (
          <TextAreaControl
            id="persona-doing-now"
            label="正在做的事"
            value={data.doingNow}
            onChange={(value) => update('doingNow', value)}
            max={100}
            rows={4}
            error={errors.doingNow}
            placeholder="清点刚到的一批旧书，手边放着一杯凉掉的茶。"
            hint="决定她被打扰时是短回还是多话。"
          />
        );

      case 16:
        return (
          <TextAreaControl
            id="persona-obstacle"
            label="面临的困难"
            value={data.obstacle}
            onChange={(value) => update('obstacle', value)}
            max={60}
            rows={3}
            error={errors.obstacle}
            placeholder="账目一直对不上，又不想开口向家里求助。"
            hint="让烦躁、疲惫与欲言又止有具体来源。"
          />
        );

      case 17:
        return (
          <div className="space-y-7">
            <ChoiceControl
              label="冲突风格"
              value={data.conflictStyle}
              options={CONFLICT_OPTIONS}
              onChange={(value) => update('conflictStyle', value)}
              required
            />
            <ChoiceControl
              label="幽默风格"
              value={data.humorStyle}
              options={HUMOR_OPTIONS}
              onChange={(value) => update('humorStyle', value)}
              required
            />
            <ChoiceControl
              label="记忆倾向"
              value={data.memoryBias}
              options={MEMORY_OPTIONS}
              onChange={(value) => update('memoryBias', value)}
              required
            />
            <ChoiceControl
              label="句长偏好"
              value={data.sentenceLength}
              options={SENTENCE_OPTIONS}
              onChange={(value) => update('sentenceLength', value)}
              required
            />
            <ChoiceControl
              label="标点偏好"
              value={data.punctuation}
              options={PUNCTUATION_OPTIONS}
              onChange={(value) => update('punctuation', value)}
              required
            />
            <LevelControl
              label="口胡概率"
              value={data.typoLevel}
              options={LEVEL_OPTIONS.typo}
              onChange={(value) => update('typoLevel', value)}
              required
              hint="从「从不出错」到「容易打错」，影响消息里的手滑与重复。"
            />
            <LevelControl
              label="分条发送"
              value={data.splitLevel}
              options={LEVEL_OPTIONS.split}
              onChange={(value) => update('splitLevel', value)}
              required
              hint="推荐值为「均衡」；模型仍会根据场景自行调整。"
            />
          </div>
        );

      case 18:
        return (
          <div className="space-y-6">
            <LinesControl
              id="persona-particles"
              label="语气词"
              lines={data.particles}
              onChange={(lines) => update('particles', lines)}
              max={10}
              perLineMax={10}
              error={errors.particles}
              placeholder="嗯 / 就是 / 算了"
              hint="每行一个，最多 10 个。她会在句首或句尾自然带出来。"
            />
            <LinesControl
              id="persona-openers"
              label="常用开头"
              lines={data.openers}
              onChange={(lines) => update('openers', lines)}
              max={5}
              perLineMax={10}
              error={errors.openers}
              placeholder="那个 / 你听我说"
              hint="每行一个，最多 5 个。让她开口的第一秒就像她。"
            />
          </div>
        );

      case 19:
        return (
          <TextAreaControl
            id="persona-banned-words"
            label="禁用词汇"
            value={data.bannedWords}
            onChange={(value) => update('bannedWords', value)}
            max={200}
            rows={7}
            error={errors.bannedWords}
            placeholder={'每个词一行\n例如：亲爱的\n例如：宝宝'}
            hint="每行一个词或短语，最多 200 字。这些词不会从她口中出现。"
          />
        );

      case 20:
        return (
          <div className="space-y-7">
            <LevelControl
              label="表情偏向"
              value={data.emojiLevel}
              options={LEVEL_OPTIONS.emoji}
              onChange={(value) => update('emojiLevel', value)}
              required
            />
            <LevelControl
              label="打字速度"
              value={data.typingLevel}
              options={LEVEL_OPTIONS.typing}
              onChange={(value) => update('typingLevel', value)}
              required
              hint="影响回复的节奏感，以及长句是否会被拆开。"
            />
            <SelectControl
              id="persona-time-offset"
              label="时差"
              value={String(data.timeOffset)}
              options={TIME_OFFSET_OPTIONS}
              onChange={(value) => update('timeOffset', Number(value))}
              required
              hint="她所在时区相对本地时区的偏移，正值表示她那边更晚。"
            />
          </div>
        );

      case 21:
        return (
          <div className="space-y-7">
            <TimeRangeControl
              label="睡眠时间段"
              start={data.sleepStart}
              end={data.sleepEnd}
              onStartChange={(value) => update('sleepStart', value)}
              onEndChange={(value) => update('sleepEnd', value)}
              required
              hint="跨度需在 3–12 小时之间，可跨越午夜。"
              error={errors.sleepStart ?? errors.sleepEnd}
            />
            <TimeRangeControl
              label="清醒时间段"
              start={data.awakeStart}
              end={data.awakeEnd}
              onStartChange={(value) => update('awakeStart', value)}
              onEndChange={(value) => update('awakeEnd', value)}
              required
              hint="跨度需在 3–12 小时之间，且不能与睡眠时段重叠。"
              error={errors.awakeStart ?? errors.awakeEnd}
            />
            <ChoiceControl
              label="在线策略"
              value={data.onlinePolicy}
              options={ONLINE_OPTIONS}
              onChange={(value) => update('onlinePolicy', value)}
              required
            />
            <LevelControl
              label="睡眠深度"
              value={data.sleepDepth}
              options={LEVEL_OPTIONS.sleepDepth}
              onChange={(value) => update('sleepDepth', value)}
              required
              hint="决定她在睡眠时段被消息吵醒的概率与反应。"
            />
          </div>
        );

      case 22:
      case 23:
      case 24:
      case 25: {
        const sliders = SLIDER_GROUPS[stepId] ?? [];

        return (
          <div className="space-y-8">
            <p className="rounded-xl border border-mist-100/[0.07] bg-ink-950/25 px-4 py-3 text-[0.68rem] leading-5 text-mist-500">
              滑条始终按 0–100 显示，下方标注的是这一项的允许范围。未调整时使用推荐值。
            </p>
            {sliders.map((slider) => (
              <SliderControl
                key={slider.key}
                label={slider.label}
                value={data[slider.key]}
                min={slider.min}
                max={slider.max}
                hint={slider.hint}
                error={errors[slider.key]}
                onChange={(value) => update(slider.key, value)}
              />
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="persona-wizard"
          className="fixed inset-0 z-[100] flex items-stretch justify-center bg-[#05090e]/70 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="persona-wizard-title"
            onKeyDown={handleDialogKeyDown}
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-ink-900 text-mist-100 outline-none sm:h-[min(92dvh,56rem)] sm:max-w-5xl sm:rounded-[1.6rem] sm:border sm:border-mist-100/10 sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)]"
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.99 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70"
              style={{
                background:
                  'radial-gradient(28rem 12rem at 18% 0%, var(--orb-brass), transparent 70%)',
              }}
            />

            <AnimatePresence mode="wait" initial={false}>
              {view === 'intro' && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={VIEW_TRANSITION}
                  className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
                >
                  <div className="flex items-center justify-between gap-4 px-6 pt-6 sm:px-10">
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-brass-400/75">
                      Persona Creation
                    </span>
                    <button
                      type="button"
                      onClick={handleCancel}
                      aria-label="取消并保存草稿"
                      className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10 sm:px-10">
                    <span className="grid size-14 place-items-center rounded-2xl border border-brass-400/25 bg-brass-400/10 text-brass-300">
                      <Sparkles className="size-6" strokeWidth={1.5} />
                    </span>

                    <h2
                      id="persona-wizard-title"
                      className="mt-7 font-display text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-mist-100"
                    >
                      一起写下她的一生
                    </h2>
                    <p className="mt-4 text-[0.88rem] leading-7 text-mist-400">
                      这不是一张需要一次填完的问卷，更像是把一个人的轮廓慢慢描出来。共{' '}
                      <span className="text-brass-300">{TOTAL_STEPS} 步</span>，分为{' '}
                      <span className="text-brass-300">{PHASES.length} 个阶段</span>，大约需要 10–15
                      分钟。中途离开也没关系，草稿会留在这台设备上。慢慢来，她会因此更完整。
                    </p>

                    <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
                      {[
                        { value: `${TOTAL_STEPS}`, label: '步 · 分阶段填写' },
                        { value: `${PHASES.length}`, label: '个阶段 · 阶段小结' },
                        { value: '自动', label: '保存至本机草稿' },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-mist-100/[0.07] bg-ink-950/25 px-4 py-3"
                        >
                          <p className="font-display text-lg font-semibold text-mist-200">
                            {item.value}
                          </p>
                          <p className="mt-0.5 text-[0.6rem] text-mist-600">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    {resume && (
                      <div className="mt-5 flex items-start gap-3 rounded-xl border border-jade-400/20 bg-jade-400/[0.06] px-4 py-3">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-jade-400" />
                        <div className="min-w-0">
                          <p className="text-[0.72rem] text-jade-300">
                            发现一份未完成的草稿 · 上次停在第 {resume.step} 步
                          </p>
                          <p className="mt-0.5 text-[0.6rem] text-mist-600">
                            {resumePhase?.name ?? '填写中'}
                            {formatMoment(resume.updatedAt)
                              ? ` · 保存于 ${formatMoment(resume.updatedAt)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                      <PrimaryButton
                        type="button"
                        onClick={handleStart}
                        className="h-12 w-full px-8 text-[0.82rem] sm:w-auto"
                      >
                        {resume ? '继续填写' : '开始填写'}
                        <ArrowRight className="size-4" />
                      </PrimaryButton>
                      <GhostButton
                        type="button"
                        onClick={handleCancel}
                        className="h-12 w-full px-5 text-[0.78rem] sm:w-auto"
                      >
                        稍后再填
                      </GhostButton>
                    </div>

                    <p className="mt-5 text-[0.6rem] leading-5 text-mist-600">
                      带 * 的信息为必填；其余可以留空。所有字数均按中文字符计算。
                    </p>
                  </div>
                </motion.div>
              )}

              {(view === 'step' || view === 'milestone') && (
                <motion.div
                  key="work"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={VIEW_TRANSITION}
                  className="relative flex min-h-0 flex-1"
                >
                  <PhaseRail activePhase={current.phase} step={step} />

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {view === 'milestone' ? (
                      <div className="flex items-center justify-between gap-4 border-b border-mist-100/[0.07] px-5 py-4 sm:px-8">
                        <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-brass-400/75">
                          Milestone · {String(step).padStart(2, '0')} / {TOTAL_STEPS}
                        </span>
                        <button
                          type="button"
                          onClick={handleCancel}
                          aria-label="取消并保存草稿"
                          className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <header className="border-b border-mist-100/[0.07] px-5 pb-5 pt-5 sm:px-8">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-brass-400/75">
                              <span>
                                Phase {current.phase + 1} / {PHASES.length}
                              </span>
                              <span className="text-mist-100/20">·</span>
                              <span className="normal-case tracking-[0.08em] text-mist-500">
                                {phase.name}
                              </span>
                            </div>
                            <h2
                              id="persona-wizard-title"
                              className="mt-2 font-display text-[1.35rem] font-semibold tracking-tight text-mist-100"
                            >
                              第 {step} 步 · {current.title}
                            </h2>
                            <p className="mt-1 text-[0.72rem] leading-5 text-mist-500">
                              {current.caption}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancel}
                            aria-label="取消并保存草稿"
                            className="shrink-0 rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
                          >
                            <X className="size-4" />
                          </button>
                        </div>

                        <div className="mt-4 flex items-center gap-3">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
                            <motion.span
                              className="block h-full rounded-full bg-gradient-to-r from-brass-500 via-brass-400 to-brass-300"
                              animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                              transition={{ duration: 0.45, ease: EASE }}
                            />
                          </div>
                          <span className="font-mono text-[0.54rem] tracking-[0.14em] text-mist-600">
                            {String(step).padStart(2, '0')} / {TOTAL_STEPS}
                          </span>
                        </div>
                      </header>
                    )}

                    <div
                      ref={scrollRef}
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7"
                    >
                      <div className="mx-auto w-full max-w-3xl">
                        <AnimatePresence mode="wait" initial={false}>
                          {view === 'milestone' ? (
                            <motion.div
                              key={`milestone-${step}`}
                              initial={{ opacity: 0, x: direction * 40 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: direction * -40 }}
                              transition={STEP_TRANSITION}
                              className="flex min-h-full flex-col items-center justify-center py-10 text-center"
                            >
                              <motion.span
                                initial={{ scale: 0.7, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{
                                  delay: 0.08,
                                  type: 'spring',
                                  stiffness: 240,
                                  damping: 19,
                                }}
                                className="grid size-16 place-items-center rounded-full border border-brass-400/30 bg-brass-400/10 text-brass-300"
                              >
                                <Check className="size-7" strokeWidth={1.7} />
                              </motion.span>

                              <p className="mt-6 font-mono text-[0.56rem] uppercase tracking-[0.28em] text-brass-400/70">
                                Stage Complete
                              </p>
                              <h2
                                id="persona-wizard-title"
                                className="mt-3 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mist-100"
                              >
                                {current.milestone?.title}
                              </h2>
                              <p className="mt-3 max-w-md text-[0.8rem] leading-7 text-mist-500">
                                {current.milestone?.description}
                              </p>

                              <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                                <GhostButton
                                  type="button"
                                  onClick={handleBack}
                                  className="h-11 w-full px-5 text-[0.76rem] sm:w-auto"
                                >
                                  <ArrowLeft className="size-3.5" />
                                  回看第 {step} 步
                                </GhostButton>
                                <PrimaryButton
                                  type="button"
                                  onClick={handleContinueMilestone}
                                  className="h-11 w-full px-6 text-[0.78rem] sm:w-auto"
                                >
                                  继续 · 第 {Math.min(TOTAL_STEPS, step + 1)} 步
                                  <ArrowRight className="size-4" />
                                </PrimaryButton>
                              </div>

                              <p className="mt-5 font-mono text-[0.54rem] uppercase tracking-[0.16em] text-mist-600">
                                已完成 {step} / {TOTAL_STEPS} · {phase.name}
                              </p>
                            </motion.div>
                          ) : (
                            <motion.div
                              key={`step-${step}`}
                              initial={{ opacity: 0, x: direction * 40 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: direction * -40 }}
                              transition={STEP_TRANSITION}
                            >
                              {renderStep(step)}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {view === 'step' && (
                      <footer className="flex items-center justify-between gap-3 border-t border-mist-100/[0.07] px-5 py-4 sm:px-8">
                        <div className="flex min-w-0 items-center gap-2">
                          <GhostButton
                            type="button"
                            onClick={handleBack}
                            disabled={step === 1}
                            className="h-9 shrink-0 px-3 text-[0.72rem]"
                          >
                            <ArrowLeft className="size-3.5" />
                            上一步
                          </GhostButton>
                          <GhostButton
                            type="button"
                            onClick={handleCancel}
                            className="h-9 shrink-0 px-3 text-[0.72rem]"
                          >
                            取消
                          </GhostButton>
                          <span className="ml-1 hidden min-w-0 items-center gap-1.5 truncate font-mono text-[0.54rem] uppercase tracking-[0.1em] text-mist-600 md:flex">
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                savedAt ? 'bg-jade-400' : 'bg-mist-100/20',
                              )}
                            />
                            {savedLabel ? `草稿已保存 ${savedLabel}` : '草稿自动保存在本机'}
                          </span>
                        </div>

                        <PrimaryButton
                          type="button"
                          onClick={handleNext}
                          className="h-10 w-auto shrink-0 px-5 text-[0.76rem]"
                        >
                          {step === TOTAL_STEPS ? '保存人格' : '下一步'}
                          {step === TOTAL_STEPS ? (
                            <Check className="size-4" />
                          ) : (
                            <ArrowRight className="size-4" />
                          )}
                        </PrimaryButton>
                      </footer>
                    )}
                  </div>
                </motion.div>
              )}

              {view === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={VIEW_TRANSITION}
                  className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
                >
                  <div className="flex items-center justify-between gap-4 px-6 pt-6 sm:px-10">
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-brass-400/75">
                      Dossier Complete
                    </span>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="关闭"
                      className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-10 text-center sm:px-10">
                    <motion.span
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.06, type: 'spring', stiffness: 240, damping: 19 }}
                      className="grid size-16 place-items-center rounded-full border border-jade-400/30 bg-jade-400/10 text-jade-300"
                    >
                      <Check className="size-7" strokeWidth={1.7} />
                    </motion.span>

                    <p className="mt-6 font-mono text-[0.56rem] uppercase tracking-[0.28em] text-brass-400/70">
                      25 / 25 · All Filed
                    </p>
                    <h2
                      id="persona-wizard-title"
                      className="mt-3 font-display text-[clamp(1.7rem,3.4vw,2.3rem)] font-semibold leading-tight tracking-tight text-mist-100"
                    >
                      「{data.name.trim() || '她'}」已经写好了
                    </h2>
                    <p className="mt-3 max-w-md text-[0.8rem] leading-7 text-mist-500">
                      基础档案、世界与来处、价值内核、表达方式与性格参数都已归档。后端接入后，这张卡就会正式出现在人格中心。
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                      {[data.occupation, data.species, data.age ? `${data.age} 岁` : '']
                        .filter(Boolean)
                        .map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-mist-100/10 bg-ink-950/30 px-3 py-1 text-[0.65rem] text-mist-400"
                          >
                            {item}
                          </span>
                        ))}
                    </div>

                    <div className="mt-8 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
                      <PrimaryButton
                        type="button"
                        onClick={onClose}
                        className="h-12 w-full px-10 text-[0.8rem] sm:w-auto"
                      >
                        完成
                        <Check className="size-4" />
                      </PrimaryButton>
                      <GhostButton
                        type="button"
                        onClick={handleRestart}
                        className="h-12 w-full px-5 text-[0.78rem] sm:w-auto"
                      >
                        再创建一位
                      </GhostButton>
                    </div>

                    <p className="mt-6 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
                      本次草稿已从浏览器清除
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
