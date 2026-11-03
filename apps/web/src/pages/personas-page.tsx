import { useQuery } from '@tanstack/react-query';
import { Search, UserRoundSearch, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { PersonaSummary } from '@inkseek/shared';
import { InputShell } from '@/components/field';
import { NewPersonaCard, PersonaCard } from '@/components/persona-card';
import { PersonaWizard } from '@/components/persona-wizard';
import { matchesPersona, personaViewOf } from '@/lib/personas';
import { personasQuery } from '@/lib/queries';

export function PersonasPage() {
  const query = useQuery(personasQuery);
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<PersonaSummary | null>(null);

  const records = query.data ?? [];
  const normalized = search.trim().toLowerCase();

  const personas = useMemo(
    () =>
      records
        .map((record) => ({ record, view: personaViewOf(record) }))
        .filter(({ view }) => matchesPersona(view, normalized)),
    [records, normalized],
  );

  const searching = normalized.length > 0;
  const total = records.length;

  const closeWizard = () => {
    setWizardOpen(false);
    setEditing(null);
  };

  return (
    <>
      <div className="relative mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:py-12">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[0.63rem] uppercase tracking-[0.3em] text-brass-400/75">
                Persona Center
              </span>
              <span className="h-px w-12 bg-brass-400/25" />
              <span className="text-[0.72rem] text-mist-600">
                {query.isPending
                  ? '正在读取档案'
                  : searching
                    ? `匹配 ${personas.length} / ${total}`
                    : `已收录 ${total} 位`}
              </span>
            </div>

            <h1 className="mt-4 font-display text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-mist-100">
              人格中心
            </h1>
            <p className="mt-3 max-w-xl text-[0.9rem] leading-7 text-mist-500">
              以卡牌归档人格设定。正面是公开档案，点击卡面翻到背面，查看背景、禁忌与更私密的参数。右下角的「编辑角色卡」可以重新编辑，每次保存都会生成新版本。
            </p>
          </div>

          <div className="w-full shrink-0 sm:w-[19rem]">
            <label htmlFor="persona-search" className="sr-only">
              搜索人格
            </label>
            <InputShell
              icon={<Search className="size-4" strokeWidth={1.7} />}
              trailing={
                searching ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                    aria-label="清除搜索"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <span className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-mist-600">
                    {total} files
                  </span>
                )
              }
            >
              <input
                id="persona-search"
                type="text"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索姓名、职业、关键词…"
              />
            </InputShell>
          </div>
        </motion.header>

        {query.isError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-signal-400/25 bg-signal-400/[0.06] px-5 py-4"
          >
            <p className="min-w-0 flex-1 text-[0.8rem] text-signal-400">
              读取人格档案失败，请检查登录状态后重试。
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-lg border border-signal-400/30 bg-signal-400/[0.08] px-3 py-1.5 text-[0.7rem] text-signal-400 transition hover:bg-signal-400/[0.14]"
            >
              重新读取
            </button>
          </motion.div>
        )}

        {searching && !query.isPending && personas.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 px-5 py-4"
          >
            <UserRoundSearch className="size-4 shrink-0 text-mist-600" strokeWidth={1.7} />
            <p className="min-w-0 flex-1 text-[0.8rem] text-mist-500">
              没有找到与「{search.trim()}」匹配的人格。
            </p>
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-lg border border-brass-400/25 bg-brass-400/[0.06] px-3 py-1.5 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/10"
            >
              清除搜索
            </button>
          </motion.div>
        )}

        <div className="mt-8 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
          {query.isPending &&
            Array.from({ length: 3 }, (_, index) => (
              <div
                key={`persona-skeleton-${index}`}
                className="h-[33rem] animate-pulse rounded-[1.5rem] border border-mist-100/[0.06] bg-ink-900/30"
              />
            ))}

          {personas.map(({ record, view }, index) => (
            <motion.div
              key={record.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: Math.min(index * 0.05, 0.3),
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <PersonaCard persona={view} onEdit={() => setEditing(record)} />
            </motion.div>
          ))}

          {!query.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: Math.min(personas.length * 0.05, 0.3),
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <NewPersonaCard onCreate={() => setWizardOpen(true)} />
            </motion.div>
          )}
        </div>

        {query.isSuccess && total === 0 && !searching && (
          <p className="mt-6 flex items-center justify-center gap-2 text-[0.72rem] text-mist-600">
            <UserRoundSearch className="size-3.5" strokeWidth={1.7} />
            还没有人格卡，从「新建人格」开始写下第一位。
          </p>
        )}
      </div>

      <PersonaWizard
        open={wizardOpen || editing !== null}
        persona={editing}
        onClose={closeWizard}
      />
    </>
  );
}
