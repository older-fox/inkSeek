import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LoaderCircle, Search, UserRoundSearch, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { InputShell } from '@/components/field';
import { NewPersonaCard, PersonaCard } from '@/components/persona-card';
import { api } from '@/lib/api';
import { matchesPersona, PERSONAS } from '@/lib/personas';
import { meQuery } from '@/lib/queries';

export function PersonasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useQuery(meQuery);
  const [query, setQuery] = useState('');

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      void navigate({ to: '/login' });
    },
  });

  const personas = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return PERSONAS.filter((persona) => matchesPersona(persona, normalized));
  }, [query]);

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-5 animate-spin text-brass-400" />
      </div>
    );
  }

  const searching = query.trim().length > 0;

  return (
    <AppShell
      user={user}
      onLogout={() => logoutMutation.mutate()}
      loggingOut={logoutMutation.isPending}
    >
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
                {searching ? `匹配 ${personas.length} / ${PERSONAS.length}` : `已收录 ${PERSONAS.length} 位`}
              </span>
            </div>

            <h1 className="mt-4 font-display text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-mist-100">
              人格中心
            </h1>
            <p className="mt-3 max-w-xl text-[0.9rem] leading-7 text-mist-500">
              以卡牌归档人格设定。正面是公开档案，点击卡面翻到背面，查看背景、禁忌与更私密的参数。
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
                    onClick={() => setQuery('')}
                    className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                    aria-label="清除搜索"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <span className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-mist-600">
                    {PERSONAS.length} files
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
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索姓名、职业、关键词…"
              />
            </InputShell>
          </div>
        </motion.header>

        {personas.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 px-5 py-4"
          >
            <UserRoundSearch className="size-4 shrink-0 text-mist-600" strokeWidth={1.7} />
            <p className="min-w-0 flex-1 text-[0.8rem] text-mist-500">
              没有找到与「{query.trim()}」匹配的人格。
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded-lg border border-brass-400/25 bg-brass-400/[0.06] px-3 py-1.5 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/10"
            >
              清除搜索
            </button>
          </motion.div>
        )}

        <div className="mt-8 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
          {personas.map((persona, index) => (
            <motion.div
              key={persona.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: Math.min(index * 0.05, 0.3),
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <PersonaCard persona={persona} />
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: Math.min(personas.length * 0.05, 0.3),
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <NewPersonaCard />
          </motion.div>
        </div>
      </div>
    </AppShell>
  );
}
