import {
  AtSign,
  MessageSquareQuote,
  Plus,
  Quote,
  RotateCw,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { Persona, PersonaAccent, PersonaTrait } from '@/lib/personas';

const CARD_HEIGHT = 'h-[33rem]';

function PersonaAvatar({ name, accent }: { name: string; accent: PersonaAccent }) {
  return (
    <span
      className={cn(
        'relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        accent === 'jade'
          ? 'border-jade-400/25 bg-gradient-to-br from-jade-400/25 via-jade-400/10 to-transparent text-jade-300'
          : 'border-brass-400/25 bg-gradient-to-br from-brass-400/25 via-brass-400/10 to-transparent text-brass-300',
      )}
      aria-hidden="true"
    >
      <span className="font-display text-xl font-semibold tracking-wide">{name.slice(0, 1)}</span>
      <UserRound className="absolute bottom-1.5 right-1.5 size-3 opacity-45" strokeWidth={1.6} />
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
    </span>
  );
}

function TraitMeter({ trait, tone }: { trait: PersonaTrait; tone: 'brass' | 'jade' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.62rem] text-mist-500">{trait.label}</span>
        <span className="font-mono text-[0.56rem] text-mist-600">{trait.value}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
        <motion.span
          className={cn(
            'block h-full rounded-full',
            tone === 'jade' ? 'bg-jade-400/80' : 'bg-brass-400/80',
          )}
          initial={{ width: 0 }}
          animate={{ width: `${trait.value}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function CardFooter({ hint }: { hint: string }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
      <RotateCw className="size-3" strokeWidth={1.7} />
      {hint}
    </p>
  );
}

function PersonaFront({ persona }: { persona: Persona }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-5">
      <div
        className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full opacity-60 blur-2xl"
        style={{
          background:
            persona.accent === 'jade'
              ? 'radial-gradient(circle, var(--orb-jade), transparent 68%)'
              : 'radial-gradient(circle, var(--orb-brass), transparent 68%)',
        }}
      />
      <div className="absolute inset-x-5 top-0 h-px hairline" />

      <div className="relative flex items-start gap-3">
        <PersonaAvatar name={persona.name} accent={persona.accent} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[1.18rem] font-semibold tracking-tight text-mist-100">
            {persona.name}
          </h3>
          <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-brass-400/70">
            {persona.serial}
          </p>
          <p className="mt-1 text-[0.7rem] text-mist-500">
            {persona.occupation}
            <span className="mx-1.5 text-mist-600">·</span>
            {persona.age} 岁
          </p>
        </div>
      </div>

      <div className="mt-4 border-l-2 border-brass-400/40 pl-3">
        <p className="line-clamp-2 font-display text-[0.92rem] leading-6 text-mist-200">
          「{persona.quote}」
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {persona.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full border border-mist-100/10 bg-ink-950/30 px-2 py-0.5 text-[0.62rem] text-mist-500"
          >
            {keyword}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
          核心倾向
        </span>
        <span className="font-mono text-[0.5rem] text-mist-600">0—100</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {persona.traits.map((trait) => (
          <TraitMeter key={trait.label} trait={trait} tone="brass" />
        ))}
      </div>

      <div className="mt-auto space-y-3 border-t border-mist-100/[0.06] pt-4">
        <div className="flex gap-2.5">
          <MessageSquareQuote
            className="mt-0.5 size-3.5 shrink-0 text-brass-400/75"
            strokeWidth={1.7}
          />
          <div className="min-w-0">
            <p className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
              语言风格
            </p>
            <p className="mt-0.5 line-clamp-2 text-[0.68rem] leading-5 text-mist-400">
              {persona.languageStyle}
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <AtSign className="mt-0.5 size-3.5 shrink-0 text-jade-400/75" strokeWidth={1.7} />
          <div className="min-w-0">
            <p className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
              称呼
            </p>
            <p className="mt-0.5 line-clamp-2 text-[0.68rem] leading-5 text-mist-400">
              {persona.addressStyle}
            </p>
          </div>
        </div>
      </div>

      <CardFooter hint="点击翻面 · 查看档案" />
    </div>
  );
}

function PersonaBack({ persona }: { persona: Persona }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-5">
      <div className="absolute inset-x-5 top-0 h-px hairline" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-brass-400/70">
            Persona Dossier
          </p>
          <h3 className="mt-1.5 truncate font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
            {persona.name}
          </h3>
          <p className="mt-1 text-[0.68rem] text-mist-500">
            {persona.occupation}
            <span className="mx-1.5 text-mist-600">·</span>
            {persona.age} 岁
          </p>
        </div>
        <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
          {persona.serial}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.07] bg-ink-950/30 p-3">
        <span className="grid size-3.5 place-items-center">
          <Quote className="size-3.5 text-brass-400/70" strokeWidth={1.7} />
        </span>
        <p className="mt-1.5 text-[0.76rem] leading-6 text-mist-300">{persona.story}</p>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-1.5">
          <span className="grid size-3.5 shrink-0 place-items-center">
            <ShieldAlert className="size-3.5 text-signal-400/80" strokeWidth={1.7} />
          </span>
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
            禁忌内容
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {persona.taboos.map((taboo) => (
            <span
              key={taboo}
              className="rounded-full border border-signal-400/20 bg-signal-400/[0.06] px-2 py-0.5 text-[0.62rem] text-signal-400"
            >
              {taboo}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
            身体参数
          </span>
          <span className="font-mono text-[0.5rem] text-mist-600">0—100</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {persona.physical.map((trait) => (
            <TraitMeter key={trait.label} trait={trait} tone="jade" />
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-mist-100/[0.06] pt-4">
        <div>
          <p className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
            经验等级
          </p>
          <p className="mt-0.5 text-[0.62rem] text-mist-600">性经验</p>
        </div>
        <span className="rounded-full border border-brass-400/25 bg-brass-400/10 px-3 py-1 font-mono text-[0.62rem] text-brass-300">
          {persona.experience.level} · {persona.experience.label}
        </span>
      </div>

      <CardFooter hint="点击返回正面" />
    </div>
  );
}

export function PersonaCard({ persona }: { persona: Persona }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `${persona.name} 的人格档案，当前为背面，点击返回正面`
          : `${persona.name} 的人格档案，点击查看背面`
      }
      onClick={() => setFlipped((value) => !value)}
      className={cn(
        CARD_HEIGHT,
        'group block w-full cursor-pointer text-left [perspective:1600px] transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none',
      )}
    >
      <div className="relative h-full w-full [transform-style:preserve-3d]">
        <motion.div
          initial={false}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="glass-panel absolute inset-0 overflow-hidden rounded-[1.5rem] backdrop-blur-none [backface-visibility:hidden]"
        >
          <PersonaFront persona={persona} />
        </motion.div>
        <motion.div
          initial={false}
          animate={{ rotateY: flipped ? 0 : -180 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="glass-panel absolute inset-0 overflow-hidden rounded-[1.5rem] backdrop-blur-none [backface-visibility:hidden]"
        >
          <PersonaBack persona={persona} />
        </motion.div>
      </div>
    </button>
  );
}

export function NewPersonaCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      aria-label="新建人格，共 25 步"
      title="新建人格"
      className={cn(
        CARD_HEIGHT,
        'group flex w-full flex-col items-center justify-center gap-4 rounded-[1.5rem] border border-dashed border-mist-100/15 bg-ink-900/20 text-mist-600 transition',
        'hover:border-brass-400/35 hover:bg-ink-900/40 hover:text-brass-300',
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl border border-mist-100/10 bg-ink-950/40 transition duration-300 group-hover:rotate-90 group-hover:border-brass-400/30">
        <Plus className="size-6" strokeWidth={1.4} />
      </span>
      <span className="text-[0.8rem]">新建人格</span>
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-600">
        25 steps · create
      </span>
    </button>
  );
}
