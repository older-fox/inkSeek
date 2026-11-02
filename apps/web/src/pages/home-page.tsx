import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BarChart3, Bot, CalendarClock, MessageSquare, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { meQuery } from '@/lib/queries';

const modules = [
  {
    icon: MessageSquare,
    title: '对话控制台',
    description: '流式对话、工具调用、中断与重试，一条时间线看清执行轨迹。',
  },
  {
    icon: CalendarClock,
    title: '定时任务',
    description: 'Cron 调度、失败重试与执行历史，让智能体按时醒来。',
  },
  {
    icon: BarChart3,
    title: '数据洞察',
    description: '运行指标、用量趋势与自定义图表，把平台状态变成直觉。',
  },
];

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

export function HomePage() {
  const { data: user } = useQuery(meQuery);

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="relative mx-auto w-full max-w-5xl px-6 py-14 sm:px-8 lg:py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[0.63rem] uppercase tracking-[0.3em] text-brass-400/75">
            Overview
          </span>
          <span className="h-px w-12 bg-brass-400/25" />
          <span className="text-[0.72rem] text-mist-600">{dateFormatter.format(new Date())}</span>
        </div>

        <h1 className="mt-5 font-display text-[clamp(2rem,3.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-mist-100">
          {greeting}，{user?.displayName ?? ''}
        </h1>
        <p className="mt-4 max-w-2xl text-[0.95rem] leading-7 text-mist-500">
          控制台已经就绪。账户与 Redis 配置均已写入数据库，接下来可以接入第一个智能体，
          或从一条定时任务开始。
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.09, delayChildren: 0.18 } },
        }}
        className="mt-11 grid gap-4 sm:grid-cols-3"
      >
        {modules.map(({ icon: Icon, title, description }) => (
          <motion.article
            key={title}
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="group relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-brass-400/25 hover:bg-ink-900/60"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-brass-300">
                <Icon className="size-[1.1rem]" strokeWidth={1.6} />
              </span>
              <span className="rounded-full border border-mist-100/[0.07] px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
                待接入
              </span>
            </div>

            <h2 className="mt-5 font-display text-[1.05rem] font-semibold tracking-tight text-mist-200">
              {title}
            </h2>
            <p className="mt-2 text-[0.8rem] leading-6 text-mist-600">{description}</p>

            <div className="mt-6 flex items-center gap-1.5 text-[0.68rem] text-mist-600 transition group-hover:text-brass-400/80">
              即将上线
              <ArrowUpRight className="size-3.5" />
            </div>

            <span className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-brass-400/25 to-transparent opacity-0 transition group-hover:opacity-100" />
          </motion.article>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-10 flex flex-wrap items-center gap-4 rounded-2xl border border-mist-100/[0.06] bg-ink-950/30 px-5 py-4"
      >
        <span className="relative grid size-9 place-items-center rounded-full border border-brass-400/25 bg-brass-400/[0.06]">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border border-brass-400/30" />
          <Sparkles className="size-4 text-brass-300" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.82rem] text-mist-300">控制面已建立，等待第一段指令</p>
          <p className="mt-0.5 text-[0.7rem] text-mist-600">
            后续模块将在此基础上逐步启用，无需重新初始化
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-jade-300">
          <Bot className="size-3.5" />
          Agent ready
        </div>
      </motion.div>
    </div>
  );
}
