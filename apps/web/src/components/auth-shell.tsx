import type { LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { BrandMark } from '@/components/brand-mark';
import { InkBackdrop } from '@/components/ink-backdrop';

interface AuthShellProps {
  eyebrow: string;
  title: ReactNode;
  description: string;
  features: { icon: LucideIcon; label: string; detail: string }[];
  children: ReactNode;
  footerNote?: string;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  features,
  children,
  footerNote,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <InkBackdrop />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[86rem] lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="hidden flex-col justify-between px-10 py-12 lg:flex xl:px-16">
          <BrandMark />

          <div className="max-w-xl">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-brass-400/80"
            >
              {eyebrow}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-6 font-display text-[clamp(2.8rem,4.2vw,4.2rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-mist-100"
            >
              {title}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 max-w-lg text-[0.95rem] leading-7 text-mist-500"
            >
              {description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.28 }}
              className="mt-10 grid max-w-lg grid-cols-3 gap-3"
            >
              {features.map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="rounded-xl border border-mist-100/[0.06] bg-ink-900/40 px-3.5 py-3.5 backdrop-blur-sm"
                >
                  <Icon className="size-4 text-brass-400" strokeWidth={1.6} />
                  <p className="mt-3 text-[0.8rem] font-medium text-mist-200">{label}</p>
                  <p className="mt-1 text-[0.68rem] leading-5 text-mist-600">{detail}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="flex items-center gap-3 text-[0.68rem] tracking-[0.14em] text-mist-600">
            <span className="h-px w-10 bg-brass-400/30" />
            INKSEEK AGENT CONTROL PLANE
          </div>
        </aside>

        <main className="relative flex min-h-screen flex-col px-5 py-8 sm:px-10 lg:px-12 lg:py-12">
          <div className="lg:hidden">
            <BrandMark />
          </div>

          <div className="flex flex-1 items-center justify-center py-10">
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="w-full max-w-[27.5rem]"
            >
              {children}
            </motion.div>
          </div>

          <p className="text-center text-[0.68rem] leading-5 text-mist-600">
            {footerNote ?? '配置与凭据仅存储在数据库中 · 会话使用 HttpOnly Cookie'}
          </p>
        </main>
      </div>
    </div>
  );
}
