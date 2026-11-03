import {
  ArrowLeft,
  ArrowRight,
  Check,
  History,
  LoaderCircle,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  experienceLabelOf,
  PERSONA_EXPERIENCE_LEVELS,
  type PersonaAdvanced,
  type PersonaExperienceLevel,
  type PersonaGender,
  type PersonaRecord,
  type PersonaSummary,
} from '@inkseek/shared';
import { GhostButton, PrimaryButton } from '@/components/button';
import { PersonaAdvancedPanel } from '@/components/persona-advanced-panel';
import { PersonaAiWriter } from '@/components/persona-ai-writer';
import {
  ChoiceControl,
  CommaListControl,
  LevelControl,
  LinesControl,
  NumberControl,
  SliderControl,
  SwitchControl,
  TextAreaControl,
  TextControl,
  TimeZonePicker,
} from '@/components/persona-form-controls';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatPersonaTimestamp } from '@/lib/persona-metadata';
import {
  clearDraft,
  createDefaultDraft,
  hasDraftContent,
  LEVEL_OPTIONS,
  loadDraft,
  PERSONA_TIMEZONE_OPTIONS,
  PHASES,
  saveDraft,
  SLIDER_GROUPS,
  STEPS,
  TOTAL_STEPS,
  validateStep,
  type ChoiceOption,
  type PersonaDraft,
  type StepErrors,
} from '@/lib/persona-draft';

interface PersonaWizardProps {
  open: boolean;
  onClose: () => void;
  persona?: PersonaSummary | null;
}

type View = 'intro' | 'step' | 'milestone' | 'advanced' | 'ai' | 'success';

interface ResumeState {
  step: number;
  updatedAt: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const STEP_TRANSITION = { duration: 0.26, ease: EASE };
const VIEW_TRANSITION = { duration: 0.24, ease: EASE };
const EXPERIENCE_OPTIONS = PERSONA_EXPERIENCE_LEVELS.map(
  (level) => `${level} · ${experienceLabelOf(level)}`,
);

const GENDER_OPTIONS: readonly ChoiceOption<PersonaGender>[] = [
  { value: '女', label: '女性', hint: '称呼与卡面按女性展示' },
  { value: '男', label: '男性', hint: '称呼与卡面按男性展示' },
  { value: '未设定', label: '未设定', hint: '保持中性，不标注性别' },
];

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

function PhaseRail({
  activePhase,
  step,
  onSelectPhase,
}: {
  activePhase: number;
  step: number;
  onSelectPhase?: (phase: number) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-mist-100/[0.07] px-5 py-7 lg:flex">
      <p className="font-mono text-[0.54rem] uppercase tracking-[0.26em] text-mist-600">
        Filing Sequence
      </p>

      <ol className="mt-6 space-y-1">
        {PHASES.map((phase, index) => {
          const done = index < activePhase;
          const active = index === activePhase;

          const body = (
            <div
              className={cn(
                'flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-300',
                active && 'bg-brass-400/[0.07]',
                !active && !done && 'opacity-50',
                onSelectPhase && 'group/phase hover:bg-mist-100/[0.04]',
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
          );

          return (
            <li key={phase.name}>
              {onSelectPhase ? (
                <button
                  type="button"
                  onClick={() => onSelectPhase(index)}
                  aria-label={`跳转到${phase.name}`}
                  className="block w-full cursor-pointer text-left"
                >
                  {body}
                </button>
              ) : (
                body
              )}
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

export function PersonaWizard({ open, onClose, persona }: PersonaWizardProps) {
  const queryClient = useQueryClient();
  const editing = Boolean(persona);
  const editingId = persona?.id ?? '';
  const recordQuery = useQuery({
    queryKey: ['personas', editingId],
    queryFn: () => api.persona(editingId),
    enabled: open && editing,
    staleTime: 10_000,
  });
  const [data, setData] = useState<PersonaDraft>(createDefaultDraft);
  const [experienceLevel, setExperienceLevel] = useState<PersonaExperienceLevel>('Ⅰ');
  const [gender, setGender] = useState<PersonaGender>('未设定');
  const [quote, setQuote] = useState('');
  const [view, setView] = useState<View>('intro');
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<StepErrors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [result, setResult] = useState<PersonaRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const saveMutation = useMutation({
    mutationFn: (input: {
      draft: PersonaDraft;
      experienceLevel: PersonaExperienceLevel;
      gender: PersonaGender;
      quote: string;
    }) => {
      const payload = {
        data: input.draft,
        profile: {
          experienceLevel: input.experienceLevel,
          gender: input.gender,
          quote: input.quote.trim(),
        },
      };

      return persona ? api.updatePersona(persona.id, payload) : api.createPersona(payload);
    },
    onSuccess: (record) => {
      setResult(record);
      setSaveError(null);

      if (!editing) {
        clearDraft();
        setSavedAt(null);
        setResume(null);
      }

      void queryClient.invalidateQueries({ queryKey: ['personas'] });
      setView('success');
    },
    onError: (error) => {
      setSaveError(error instanceof ApiError ? error.message : '保存失败，请稍后重试');
    },
  });

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setDirection(1);
    setErrors({});
    setConfirmDiscard(false);
    setAiPrompt('');
    setResult(null);
    setSaveError(null);

    if (persona) {
      setData(persona.data);
      setExperienceLevel(persona.profile.experienceLevel);
      setGender(persona.profile.gender);
      setQuote(persona.profile.quote);
      setStep(1);
      setSavedAt(null);
      setResume(null);
      setView('intro');
    } else {
      const draft = loadDraft();
      setData(draft?.data ?? createDefaultDraft());
      setExperienceLevel('Ⅰ');
      setGender('未设定');
      setQuote('');
      setStep(draft?.step ?? 1);
      setSavedAt(draft?.updatedAt ?? null);
      setResume(draft ? { step: draft.step, updatedAt: draft.updatedAt } : null);
      setView('intro');
    }

    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    return () => window.cancelAnimationFrame(frame);
  }, [open, persona]);

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
  const experienceIndex = Math.max(0, PERSONA_EXPERIENCE_LEVELS.indexOf(experienceLevel));

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

  const updateAdvanced = (
    key: keyof PersonaAdvanced,
    value: PersonaAdvanced[keyof PersonaAdvanced],
  ) => {
    const nextValue = Array.isArray(value)
      ? value.map((item) => item.trim()).filter(Boolean)
      : value;

    setData((previous) => ({
      ...previous,
      advanced: { ...previous.advanced, [key]: nextValue } as PersonaAdvanced,
    }));
  };

  const openAdvanced = () => {
    setDirection(1);
    setConfirmDiscard(false);
    setSaveError(null);
    setView('advanced');
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
    setConfirmDiscard(false);
    setView('step');
  };

  const handleDiscardAndStart = () => {
    clearDraft();
    setData(createDefaultDraft());
    setStep(1);
    setView('step');
    setDirection(1);
    setErrors({});
    setSavedAt(null);
    setResume(null);
    setConfirmDiscard(false);
  };

  const handleApplyAi = (next: PersonaDraft) => {
    const snapshot = saveDraft(next, 1);

    setData(next);
    setSavedAt(snapshot?.updatedAt ?? null);
    setResume({ step: 1, updatedAt: snapshot?.updatedAt ?? new Date().toISOString() });
    setStep(1);
    setView('step');
    setDirection(1);
    setErrors({});
    setConfirmDiscard(false);
  };

  const handleSave = () => {
    setSaveError(null);

    if (!editing) {
      const nextErrors = validateStep(step, data);

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        focusFirstError();
        return;
      }

      setErrors({});
    }

    saveMutation.mutate({ draft: data, experienceLevel, gender, quote });
  };

  const handleNext = () => {
    const nextErrors = editing ? {} : validateStep(step, data);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusFirstError();
      return;
    }

    setErrors({});

    if (step === TOTAL_STEPS) {
      handleSave();
      return;
    }

    if (!editing) {
      const snapshot = saveDraft(data, step + 1);
      if (snapshot) {
        setSavedAt(snapshot.updatedAt);
      }
    }

    setDirection(1);

    if (!editing && current.milestone) {
      setView('milestone');
      return;
    }

    setStep(step + 1);
  };

  const handleSelectPhase = (phaseIndex: number) => {
    const target = STEPS.find((item) => item.phase === phaseIndex);

    if (!target) {
      return;
    }

    setDirection(target.id >= step ? 1 : -1);
    setStep(target.id);
    setView('step');
    setErrors({});
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
    if (editing) {
      onClose();
      return;
    }

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
                placeholder="TA 真正的名字"
              />
              <CommaListControl
                id="persona-aliases"
                label="化名与绰号"
                lines={data.aliases}
                onChange={(lines) => update('aliases', lines)}
                max={5}
                perLineMax={10}
                error={errors.aliases}
                placeholder="阿野，小野，Ye"
                hint="用逗号分隔，失焦后自动识别；最多 5 个，每个 10 字以内。"
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
                id="persona-race"
                label="种族"
                value={data.race}
                onChange={(value) => update('race', value)}
                max={10}
                required
                error={errors.race}
                placeholder="人类 / 精灵 / 仿生人"
              />
              <NumberControl
                id="persona-height"
                label="身高"
                value={data.height_cm}
                onChange={(value) => update('height_cm', value)}
                min={100}
                max={400}
                unit="cm"
                required
                hint="可填范围 100–400 cm"
                error={errors.height_cm}
                placeholder="168"
              />
              <NumberControl
                id="persona-weight"
                label="体重"
                value={data.weight_kg}
                onChange={(value) => update('weight_kg', value)}
                min={20}
                max={300}
                unit="kg"
                required
                hint="可填范围 20–300 kg"
                error={errors.weight_kg}
                placeholder="52"
              />
            </div>

            <ChoiceControl
              label="性别"
              value={gender}
              options={GENDER_OPTIONS}
              onChange={setGender}
              columns={3}
              hint="用于称呼与卡面展示，不改变互动规则。"
            />

            <TextControl
              id="persona-quote"
              label="一句话人格台词"
              value={quote}
              onChange={setQuote}
              max={400}
              placeholder="门开着，雨太大就晚点来。"
              hint="一句话立住人设，显示在角色卡正面的台词位，也会进入渠道台词锚点。"
            />

            <SwitchControl
              label="时间感知"
              description="TA 能感知现实中的当前时间，并据此判断日夜、日期与季节。"
              checked={data.time_awareness}
              onChange={(checked) => update('time_awareness', checked)}
            />
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <TextAreaControl
              id="persona-body"
              label="体型描述"
              value={data.body_type}
              onChange={(value) => update('body_type', value)}
              max={80}
              rows={3}
              error={errors.body_type}
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
              id="persona-hair"
              label="发型描述"
              value={data.hair}
              onChange={(value) => update('hair', value)}
              max={300}
              rows={5}
              required
              error={errors.hair}
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
              hint="常服、配饰与季节性外套，最好能一眼认出 TA。"
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
            id="persona-world-setting"
            label="世界观"
            value={data.world_setting}
            onChange={(value) => update('world_setting', value)}
            max={500}
            rows={8}
            error={errors.world_setting}
            placeholder="TA 生活在什么时代、什么地方，科技与社会规则走到了哪一步。"
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
            placeholder="TA 的来处，塑造 TA 的那几件事，以及 TA 现在为什么在这里。"
            hint="最多 2000 字。重要的不是完整年表，而是塑造 TA 的那几件事。"
          />
        );

      case 7:
        return (
          <TextAreaControl
            id="persona-knowledge"
            label="知识边界"
            value={data.knowledge_boundary}
            onChange={(value) => update('knowledge_boundary', value)}
            max={500}
            rows={8}
            error={errors.knowledge_boundary}
            placeholder="TA 熟悉什么、完全不知道什么，以及面对超出认知的问题会如何反应。"
            hint="限定 LLM 可以调用的知识范围，避免 TA 突然知道不该知道的事。"
          />
        );

      case 8:
        return (
          <LinesControl
            id="persona-core-values"
            label="核心价值观"
            lines={data.core_values}
            onChange={(lines) => update('core_values', lines)}
            perLineMax={20}
            required
            error={errors.core_values}
            placeholder="不否定他人劳动"
            hint="模糊情境下，TA 默认站在这一边。每行一条，最多 20 字，数量不限。"
          />
        );

      case 9:
        return (
          <LinesControl
            id="persona-taboos"
            label="禁忌"
            lines={data.taboos}
            onChange={(lines) => update('taboos', lines)}
            perLineMax={20}
            required
            error={errors.taboos}
            placeholder="当众被起哄"
            hint="被触碰时，TA 会警觉、回避、冷淡或反驳。"
          />
        );

      case 10:
        return (
          <LinesControl
            id="persona-fears"
            label="恐惧来源"
            lines={data.fears}
            onChange={(lines) => update('fears', lines)}
            perLineMax={20}
            error={errors.fears}
            placeholder="被证明自己毫无价值"
            hint="越靠近这些事，TA 越会害怕。"
          />
        );

      case 11:
        return (
          <LinesControl
            id="persona-soft-spots"
            label="软肋"
            lines={data.soft_spots}
            onChange={(lines) => update('soft_spots', lines)}
            perLineMax={20}
            error={errors.soft_spots}
            placeholder="被人认真认可手艺"
            hint="什么是 TA 无法拒绝的温柔，也是道歉能生效的依据。"
          />
        );

      case 12:
        return (
          <LinesControl
            id="persona-non-negotiable"
            label="绝对红线"
            lines={data.non_negotiable}
            onChange={(lines) => update('non_negotiable', lines)}
            perLineMax={20}
            error={errors.non_negotiable}
            placeholder="不接受当众羞辱"
            hint="TA 不会让步的事。输出与之冲突时，应当被打回或改写。"
          />
        );

      case 13:
        return (
          <div className="space-y-6">
            <TextAreaControl
              id="persona-long-term-motivation"
              label="长期目标"
              value={data.long_term_motivation}
              onChange={(value) => update('long_term_motivation', value)}
              max={60}
              rows={3}
              error={errors.long_term_motivation}
              placeholder="把旧书店重新开成街角最安静的据点。"
              hint="一句话即可，给所有行为一个总方向。"
            />
            <TextAreaControl
              id="persona-current-goal"
              label="当前目标"
              value={data.current_goal}
              onChange={(value) => update('current_goal', value)}
              max={60}
              rows={3}
              error={errors.current_goal}
              placeholder="在本周结束前凑齐下个月的房租。"
              hint="近期最想完成的事；完成或失败后应被替换。"
            />
            <TextAreaControl
              id="persona-doing-now"
              label="正在做的事"
              value={data.doing_now}
              onChange={(value) => update('doing_now', value)}
              max={100}
              rows={4}
              error={errors.doing_now}
              placeholder="清点刚到的一批旧书，手边放着一杯凉掉的茶。"
              hint="决定 TA 被打扰时是短回还是多话。"
            />
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
          </div>
        );

      case 14:
        return (
          <div className="space-y-7">
            <TextControl
              id="persona-language-style"
              label="说话风格"
              value={data.language_style}
              onChange={(value) => update('language_style', value)}
              max={200}
              error={errors.language_style}
              placeholder="句子偏短，先回应情绪，再讲事情。"
              hint="一句话描述 TA 的消息读起来是什么感觉。"
            />
            <TextControl
              id="persona-conflict-style"
              label="冲突风格"
              value={data.conflict_style}
              onChange={(value) => update('conflict_style', value)}
              max={200}
              error={errors.conflict_style}
              placeholder="先听完对方把话说完，再把自己的界线讲清楚。"
              hint="一句话描述被冒犯时的反应方式。"
            />
            <TextControl
              id="persona-humor-style"
              label="幽默风格"
              value={data.humor_style}
              onChange={(value) => update('humor_style', value)}
              max={200}
              error={errors.humor_style}
              placeholder="冷不丁来一句冷幽默，不刻意逗笑。"
              hint="一句话描述开玩笑的方式与频率。"
            />
            <TextControl
              id="persona-memory-bias"
              label="记忆倾向"
              value={data.memory_bias}
              onChange={(value) => update('memory_bias', value)}
              max={200}
              error={errors.memory_bias}
              placeholder="记住重要的承诺与细节，小事就让它过去。"
              hint="一句话描述记住什么、忘记什么。"
            />
            <TextControl
              id="persona-sentence-length"
              label="句长偏好"
              value={data.sentence_length}
              onChange={(value) => update('sentence_length', value)}
              max={200}
              error={errors.sentence_length}
              placeholder="句子长短混着来，随情绪自然变化。"
              hint="一句话描述句子的长短倾向。"
            />
            <TextControl
              id="persona-punctuation"
              label="标点习惯"
              value={data.punctuation}
              onChange={(value) => update('punctuation', value)}
              max={200}
              error={errors.punctuation}
              placeholder="标点常规，句末收稳，不堆叠符号。"
              hint="一句话描述标点使用习惯，区分度很高。"
            />
            <LevelControl
              label="口胡概率"
              value={data.typo_level}
              options={LEVEL_OPTIONS.typo}
              onChange={(value) => update('typo_level', value)}
              required
              hint="从「从不出错」到「容易打错」，影响消息里的手滑与重复。"
            />
            <LevelControl
              label="分条发送"
              value={data.split_level}
              options={LEVEL_OPTIONS.split}
              onChange={(value) => update('split_level', value)}
              required
              hint="推荐值为「均衡」；模型仍会根据场景自行调整。"
            />
          </div>
        );

      case 15:
        return (
          <div className="space-y-6">
            <LinesControl
              id="persona-particles"
              label="语气词"
              lines={data.particles}
              onChange={(lines) => update('particles', lines)}
              perLineMax={10}
              error={errors.particles}
              placeholder="嗯 / 就是 / 算了"
              hint="每行一个，数量不限。TA 会在句首或句尾自然带出来。"
            />
            <LinesControl
              id="persona-openers"
              label="常用开头"
              lines={data.openers}
              onChange={(lines) => update('openers', lines)}
              perLineMax={10}
              error={errors.openers}
              placeholder="那个 / 你听我说"
              hint="每行一个，数量不限。让 TA 开口的第一秒就像 TA。"
            />
          </div>
        );

      case 16:
        return (
          <LinesControl
            id="persona-banned-words"
            label="禁用语"
            lines={data.banned_words}
            onChange={(lines) => update('banned_words', lines)}
            perLineMax={20}
            error={errors.banned_words}
            placeholder="亲爱的"
            hint="每行一个词或短语，数量不限。这些词不会从 TA 口中出现。"
          />
        );

      case 17:
        return (
          <div className="space-y-7">
            <LevelControl
              label="表情偏向"
              value={data.emoji_level}
              options={LEVEL_OPTIONS.emoji}
              onChange={(value) => update('emoji_level', value)}
              required
            />
            <LevelControl
              label="打字速度"
              value={data.typing_level}
              options={LEVEL_OPTIONS.typing}
              onChange={(value) => update('typing_level', value)}
              required
              hint="影响回复的节奏感，以及长句是否会被拆开。"
            />
            <TimeZonePicker
              id="persona-time-zone"
              label="时区"
              value={data.time_zone}
              options={PERSONA_TIMEZONE_OPTIONS}
              onChange={(value) => update('time_zone', value)}
              required
              hint="TA 所在时区，影响时间判断与在线状态。"
            />
          </div>
        );

      case 18:
        return (
          <div className="space-y-7">
            <TextControl
              id="persona-online-policy"
              label="在线策略"
              value={data.online_policy}
              onChange={(value) => update('online_policy', value)}
              max={200}
              error={errors.online_policy}
              placeholder="醒着就回，忙时先简短应一声，闲下来再补上。"
              hint="一句话描述 TA 的在线状态如何判断。"
            />
            <TextControl
              id="persona-location"
              label="当前位置"
              value={data.location}
              onChange={(value) => update('location', value)}
              max={40}
              error={errors.location}
              placeholder="旧书店二楼靠窗的位置"
              hint="此刻所在地点，会影响场景描写与打扰时的反应。"
            />
            <LevelControl
              label="睡眠深度"
              value={data.sleep_depth}
              options={LEVEL_OPTIONS.sleepDepth}
              onChange={(value) => update('sleep_depth', value)}
              required
              hint="决定 TA 被消息吵醒的概率与反应。"
            />
          </div>
        );

      case 19:
      case 20:
      case 21:
      case 22: {
        const sliders = SLIDER_GROUPS[stepId] ?? [];

        return (
          <div className="space-y-8">
            {sliders.map((slider) => (
              <SliderControl
                key={slider.key}
                label={slider.label}
                value={data[slider.key]}
                hint={slider.hint}
                error={errors[slider.key]}
                onChange={(value) => update(slider.key, value)}
              />
            ))}
            {stepId === 22 && (
              <LevelControl
                label="经验等级"
                value={experienceIndex}
                options={EXPERIENCE_OPTIONS}
                onChange={(index) =>
                  setExperienceLevel(PERSONA_EXPERIENCE_LEVELS[index] ?? 'Ⅰ')
                }
                hint="相关互动的经验程度，仅作档案标记，不改变同意规则。"
              />
            )}
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
                      {editing ? 'Persona Revision' : 'Persona Creation'}
                    </span>
                    <div className="flex items-center gap-1">
                      {!editing && (
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="rounded-lg px-2.5 py-1.5 text-[0.66rem] text-mist-500 transition hover:bg-mist-100/5 hover:text-mist-200"
                        >
                          稍后再填
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCancel}
                        aria-label={editing ? '取消编辑' : '取消并保存草稿'}
                        className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-7 sm:px-10">
                    <span className="grid size-14 place-items-center rounded-2xl border border-brass-400/25 bg-brass-400/10 text-brass-300">
                      <Sparkles className="size-6" strokeWidth={1.5} />
                    </span>

                    <h2
                      id="persona-wizard-title"
                      className="mt-7 font-display text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-mist-100"
                    >
                      {editing ? `重新整理「${persona?.name ?? 'TA'}」的档案` : '一起写下 TA 的一生'}
                    </h2>
                    <p className="mt-4 text-[0.88rem] leading-7 text-mist-400">
                      {editing ? (
                        <>
                          这张卡已有{' '}
                          <span className="text-brass-300">{TOTAL_STEPS} 步</span> 的完整字段。
                          你可以直接跳转阶段补充或改写，历史留空的项不会阻止保存；每次保存都会生成一个新版本。
                        </>
                      ) : (
                        <>
                          这不是一张需要一次填完的问卷，更像是把一个人的轮廓慢慢描出来。共{' '}
                          <span className="text-brass-300">{TOTAL_STEPS} 步</span>，分为{' '}
                          <span className="text-brass-300">{PHASES.length} 个阶段</span>，大约需要
                          10–15 分钟。中途离开也没关系，草稿会留在这台设备上。慢慢来，TA
                          会因此更完整。
                        </>
                      )}
                    </p>

                    <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
                      {(editing && persona
                        ? [
                            { value: persona.serial, label: '档案编号' },
                            { value: `v${persona.currentVersion}`, label: '当前版本' },
                            {
                              value: formatPersonaTimestamp(persona.updatedAt, false),
                              label: '最近更新',
                            },
                          ]
                        : [
                            { value: `${TOTAL_STEPS}`, label: '步 · 分阶段填写' },
                            { value: `${PHASES.length}`, label: '个阶段 · 阶段小结' },
                            { value: '自动', label: '保存至本机草稿' },
                          ]
                      ).map((item) => (
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

                    {editing && (
                      <div className="mt-5 rounded-xl border border-mist-100/[0.07] bg-ink-950/25">
                        <div className="flex items-center justify-between gap-3 border-b border-mist-100/[0.06] px-4 py-2.5">
                          <span className="flex items-center gap-1.5 text-[0.68rem] text-mist-400">
                            <History className="size-3.5 text-brass-400/75" strokeWidth={1.7} />
                            版本历史
                          </span>
                          <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
                            {recordQuery.isPending
                              ? '读取中'
                              : `${recordQuery.data?.versions.length ?? 0} 个版本`}
                          </span>
                        </div>

                        <div className="max-h-44 overflow-y-auto px-4 py-2">
                          {recordQuery.isPending ? (
                            <p className="py-2 text-[0.64rem] text-mist-600">正在读取版本记录…</p>
                          ) : (recordQuery.data?.versions ?? []).length === 0 ? (
                            <p className="py-2 text-[0.64rem] text-mist-600">暂无版本记录。</p>
                          ) : (
                            <ul className="divide-y divide-mist-100/[0.05]">
                              {(recordQuery.data?.versions ?? []).slice(0, 8).map((version) => (
                                <li
                                  key={version.version}
                                  className="flex items-center justify-between gap-3 py-1.5"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 rounded border border-brass-400/25 bg-brass-400/[0.08] px-1.5 py-0.5 font-mono text-[0.52rem] text-brass-300">
                                      v{version.version}
                                    </span>
                                    <span className="truncate font-mono text-[0.56rem] text-mist-600">
                                      {formatPersonaTimestamp(version.createdAt, false)}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-[0.58rem] text-mist-500">
                                    {version.changedCount} 项变更
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <p className="border-t border-mist-100/[0.06] px-4 py-2 text-[0.56rem] leading-4 text-mist-600">
                          创建于 {formatPersonaTimestamp(persona?.createdAt ?? '', false)} ·
                          更新于 {formatPersonaTimestamp(persona?.updatedAt ?? '', false)}
                        </p>
                      </div>
                    )}

                    {!editing && resume && (
                      <div className="mt-5 rounded-xl border border-jade-400/20 bg-jade-400/[0.06] px-4 py-3">
                        <AnimatePresence mode="wait" initial={false}>
                          {confirmDiscard ? (
                            <motion.div
                              key="discard-confirm"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.16 }}
                              className="flex flex-wrap items-center gap-x-3 gap-y-2"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-2">
                                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-signal-400" />
                                <p className="text-[0.68rem] leading-5 text-signal-400">
                                  丢弃草稿并重新开始？
                                  <span className="text-mist-500">
                                    {' '}
                                    当前填写的内容会从本机移除。
                                  </span>
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={handleDiscardAndStart}
                                  className="h-7 rounded-md bg-signal-400/90 px-2.5 text-[0.64rem] font-medium text-ink-950 transition hover:bg-signal-400"
                                >
                                  丢弃并重填
                                </button>
                                <GhostButton
                                  type="button"
                                  onClick={() => setConfirmDiscard(false)}
                                  className="h-7 px-2.5 text-[0.64rem]"
                                >
                                  保留草稿
                                </GhostButton>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="discard-info"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.16 }}
                              className="flex items-start gap-3"
                            >
                              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-jade-400" />
                              <div className="min-w-0 flex-1">
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
                              <button
                                type="button"
                                onClick={() => setConfirmDiscard(true)}
                                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.62rem] text-mist-500 transition hover:bg-signal-400/10 hover:text-signal-400"
                              >
                                <Trash2 className="size-3" />
                                重新填写
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                      <PrimaryButton
                        type="button"
                        onClick={handleStart}
                        className="h-12 w-full px-8 text-[0.82rem] sm:w-auto"
                      >
                        {editing ? '继续编辑' : resume ? '继续填写' : '开始填写'}
                        <ArrowRight className="size-4" />
                      </PrimaryButton>
                      {editing && (
                        <button
                          type="button"
                          onClick={openAdvanced}
                          className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brass-400/30 bg-brass-400/[0.07] px-6 text-[0.8rem] font-medium text-brass-200 transition hover:border-brass-400/50 hover:bg-brass-400/[0.12] sm:w-auto"
                        >
                          <SlidersHorizontal className="size-4 text-brass-300 transition group-hover:rotate-6" />
                          进阶档案 · 15 项
                        </button>
                      )}
                      {!editing && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDiscard(false);
                            setView('ai');
                          }}
                          className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brass-400/30 bg-brass-400/[0.07] px-6 text-[0.8rem] font-medium text-brass-200 transition hover:border-brass-400/50 hover:bg-brass-400/[0.12] sm:w-auto"
                        >
                          <Sparkles className="size-4 text-brass-300 transition group-hover:rotate-12" />
                          AI 编写
                        </button>
                      )}
                    </div>

                    <p className="mt-3 text-[0.62rem] leading-5 text-mist-600">
                      {editing
                        ? '编辑时可自由跳转阶段，保存不会强制补齐历史空白项。'
                        : '也可以让 AI 根据一段描述先生成全部属性，再逐项修改。'}
                    </p>

                    <p className="mt-4 text-[0.6rem] leading-5 text-mist-600">
                      {editing
                        ? '带 * 的信息是创建时的必填项；编辑保存不强制补齐。所有字数均按中文字符计算。'
                        : '带 * 的信息为必填；其余可以留空。所有字数均按中文字符计算。'}
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
                  <PhaseRail
                    activePhase={current.phase}
                    step={step}
                    onSelectPhase={editing ? handleSelectPhase : undefined}
                  />

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {view === 'milestone' ? (
                      <div className="flex items-center justify-between gap-4 border-b border-mist-100/[0.07] px-5 py-4 sm:px-8">
                        <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-brass-400/75">
                          Milestone · {String(step).padStart(2, '0')} / {TOTAL_STEPS}
                        </span>
                        <button
                          type="button"
                          onClick={handleCancel}
                          aria-label={editing ? '取消编辑' : '取消并保存草稿'}
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
                            aria-label={editing ? '取消编辑' : '取消并保存草稿'}
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
                      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7"
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

                    {view === 'step' && saveError && (
                      <p className="flex items-start gap-2 border-t border-signal-400/20 bg-signal-400/[0.06] px-5 py-2.5 text-[0.68rem] leading-5 text-signal-400 sm:px-8">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
                        <span className="min-w-0 break-words">{saveError}</span>
                      </p>
                    )}

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
                                editing || savedAt ? 'bg-jade-400' : 'bg-mist-100/20',
                              )}
                            />
                            {editing
                              ? `${persona?.serial ?? ''} · v${persona?.currentVersion ?? 1} · 保存后生成新版本`
                              : savedLabel
                                ? `草稿已保存 ${savedLabel}`
                                : '草稿自动保存在本机'}
                          </span>
                        </div>

                        {editing ? (
                          <div className="flex shrink-0 items-center gap-2">
                            {step < TOTAL_STEPS && (
                              <GhostButton
                                type="button"
                                onClick={handleNext}
                                className="h-10 px-4 text-[0.74rem]"
                              >
                                下一步
                                <ArrowRight className="size-3.5" />
                              </GhostButton>
                            )}
                            <PrimaryButton
                              type="button"
                              onClick={handleSave}
                              disabled={saveMutation.isPending}
                              className="h-10 w-auto px-5 text-[0.76rem]"
                            >
                              {saveMutation.isPending ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : (
                                <Save className="size-4" />
                              )}
                              保存修改
                            </PrimaryButton>
                          </div>
                        ) : (
                          <PrimaryButton
                            type="button"
                            onClick={handleNext}
                            disabled={saveMutation.isPending}
                            className="h-10 w-auto shrink-0 px-5 text-[0.76rem]"
                          >
                            {saveMutation.isPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : step === TOTAL_STEPS ? (
                              <Check className="size-4" />
                            ) : (
                              <ArrowRight className="size-4" />
                            )}
                            {step === TOTAL_STEPS ? '保存人格' : '下一步'}
                          </PrimaryButton>
                        )}
                      </footer>
                    )}
                  </div>
                </motion.div>
              )}

              {view === 'advanced' && (
                <motion.div
                  key="advanced"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={VIEW_TRANSITION}
                  className="relative flex min-h-0 flex-1 flex-col"
                >
                  <header className="border-b border-mist-100/[0.07] px-5 pb-4 pt-5 sm:px-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-brass-400/75">
                          Advanced Dossier · 15 Fields
                        </span>
                        <h2
                          id="persona-wizard-title"
                          className="mt-2 font-display text-[1.35rem] font-semibold tracking-tight text-mist-100"
                        >
                          进阶档案
                        </h2>
                        <p className="mt-1 text-[0.72rem] leading-5 text-mist-500">
                          不进入 {TOTAL_STEPS} 步主流程的行为级设置，按需展开；未改动项保持推荐默认。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="取消编辑"
                        className="shrink-0 rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </header>

                  <div
                    ref={scrollRef}
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7"
                  >
                    <div className="mx-auto w-full max-w-3xl">
                      <PersonaAdvancedPanel value={data.advanced} onChange={updateAdvanced} />
                    </div>
                  </div>

                  {saveError && (
                    <p className="flex items-start gap-2 border-t border-signal-400/20 bg-signal-400/[0.06] px-5 py-2.5 text-[0.68rem] leading-5 text-signal-400 sm:px-8">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
                      <span className="min-w-0 break-words">{saveError}</span>
                    </p>
                  )}

                  <footer className="flex items-center justify-between gap-3 border-t border-mist-100/[0.07] px-5 py-4 sm:px-8">
                    <div className="flex min-w-0 items-center gap-2">
                      <GhostButton
                        type="button"
                        onClick={() => {
                          setDirection(-1);
                          setView('step');
                        }}
                        className="h-9 shrink-0 px-3 text-[0.72rem]"
                      >
                        <ArrowLeft className="size-3.5" />
                        返回 {TOTAL_STEPS} 步
                      </GhostButton>
                      <span className="ml-1 hidden min-w-0 items-center gap-1.5 truncate font-mono text-[0.54rem] uppercase tracking-[0.1em] text-mist-600 md:flex">
                        <span className="size-1.5 shrink-0 rounded-full bg-jade-400" />
                        {`${persona?.serial ?? ''} · v${persona?.currentVersion ?? 1} · 保存后生成新版本`}
                      </span>
                    </div>

                    <PrimaryButton
                      type="button"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                      className="h-10 w-auto shrink-0 px-5 text-[0.76rem]"
                    >
                      {saveMutation.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      保存修改
                    </PrimaryButton>
                  </footer>
                </motion.div>
              )}

              {view === 'ai' && (
                <motion.div
                  key="ai"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={VIEW_TRANSITION}
                  className="relative flex min-h-0 flex-1 flex-col"
                >
                  <PersonaAiWriter
                    prompt={aiPrompt}
                    hasDraft={Boolean(resume) || hasDraftContent(data)}
                    onPromptChange={setAiPrompt}
                    onBack={() => setView('intro')}
                    onCancel={handleCancel}
                    onApply={handleApplyAi}
                  />
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
                      {editing ? 'Revision Filed' : 'Dossier Complete'}
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
                      {editing
                        ? `${result?.serial ?? persona?.serial ?? ''} · v${result?.currentVersion ?? persona?.currentVersion ?? 1}`
                        : `${TOTAL_STEPS} / ${TOTAL_STEPS} · All Filed`}
                    </p>
                    <h2
                      id="persona-wizard-title"
                      className="mt-3 font-display text-[clamp(1.7rem,3.4vw,2.3rem)] font-semibold leading-tight tracking-tight text-mist-100"
                    >
                      {editing
                        ? `「${data.name.trim() || 'TA'}」已更新到 v${result?.currentVersion ?? ''}`
                        : `「${data.name.trim() || 'TA'}」已经写好了`}
                    </h2>
                    <p className="mt-3 max-w-md text-[0.8rem] leading-7 text-mist-500">
                      {editing
                        ? '修改已写入人格卡，并作为新版本归档。之前的版本仍可在档案的版本历史里查看。'
                        : '基础档案、世界与来处、价值内核、表达方式与性格参数都已归档，这张卡已经出现在人格中心。'}
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                      {[data.occupation, data.race, data.age ? `${data.age} 岁` : '']
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
                      {!editing && (
                        <GhostButton
                          type="button"
                          onClick={handleRestart}
                          className="h-12 w-full px-5 text-[0.78rem] sm:w-auto"
                        >
                          再创建一位
                        </GhostButton>
                      )}
                    </div>

                    <p className="mt-6 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
                      {editing
                        ? `版本归档于 ${formatPersonaTimestamp(result?.updatedAt ?? '', false)}`
                        : '本次草稿已从浏览器清除'}
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
