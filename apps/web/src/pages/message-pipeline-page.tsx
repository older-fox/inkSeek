import { Construction, Filter, Inbox, Scale, Send, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

const stages = [
  { icon: Inbox, title: '接收', description: 'NapCat 入站消息进入管线' },
  { icon: Filter, title: '归一', description: '文本、图片与语音并入上下文' },
  { icon: Scale, title: '裁决', description: '判断这一刻是否应该接话' },
  { icon: Sparkles, title: '生成', description: '按人格写出真正要发的回复' },
  { icon: Send, title: '投递', description: '只有明确通过才会发送' },
];

export function MessagePipelinePage() {
  return (
    <div className="relative mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-12">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[0.63rem] uppercase tracking-[0.3em] text-brass-400/75">
            Message Pipeline
          </span>
          <span className="h-px w-12 bg-brass-400/25" />
          <span className="text-[0.72rem] text-mist-600">占位页面 · 尚未接入数据</span>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-mist-100">
              消息管线
            </h1>
            <p className="mt-3 max-w-2xl text-[0.9rem] leading-7 text-mist-500">
              把一条消息从接收到发送的每一步拆开：先归一上下文，再裁决是否接话，最后按人格生成并投递。
              这里会用于观察与编排整条链路。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start rounded-full border border-brass-400/25 bg-brass-400/[0.07] px-3 py-1.5 sm:self-auto">
            <Construction className="size-3.5 text-brass-300" strokeWidth={1.7} />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-brass-300">
              Placeholder
            </span>
          </div>
        </div>
      </motion.header>

      <motion.section
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
        }}
        className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {stages.map(({ icon: Icon, title, description }, index) => (
          <motion.article
            key={title}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-4 transition hover:border-brass-400/25 hover:bg-ink-900/60"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-xl border border-brass-400/20 bg-brass-400/[0.08] text-brass-300">
                <Icon className="size-4" strokeWidth={1.6} />
              </span>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-600">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h2 className="mt-4 text-[0.82rem] font-medium text-mist-200">{title}</h2>
            <p className="mt-1.5 text-[0.64rem] leading-5 text-mist-600">{description}</p>
          </motion.article>
        ))}
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 rounded-2xl border border-dashed border-mist-100/[0.14] bg-ink-900/30 px-6 py-10 text-center"
      >
        <span className="mx-auto grid size-11 place-items-center rounded-xl border border-mist-100/[0.08] bg-ink-950/40 text-mist-600">
          <Construction className="size-5" strokeWidth={1.5} />
        </span>
        <h2 className="mt-4 font-display text-lg font-semibold text-mist-200">页面正在搭建</h2>
        <p className="mx-auto mt-2 max-w-md text-[0.78rem] leading-6 text-mist-500">
          目前只有导航与版式占位。后续会在这里接入消息轨迹、裁决记录，以及每条回复的模型、延迟与成本。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {['消息轨迹', '裁决记录', '模型用量', '失败与重试'].map((item) => (
            <span
              key={item}
              className="rounded-full border border-mist-100/[0.08] bg-ink-950/25 px-2.5 py-1 text-[0.6rem] text-mist-600"
            >
              {item}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
