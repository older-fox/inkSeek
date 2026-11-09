import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { meQuery } from '@/lib/queries';
import { routeSection } from '@/lib/route-section';

/**
 * Authenticated shell wrapper: gates on the current user, wires logout, and
 * fades page content in on route changes so each section animates on entry.
 */
export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const section = useRouterState({ select: (state) => routeSection(state.location.pathname) });
  const { data: user } = useQuery(meQuery);

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      void navigate({ to: '/login' });
    },
  });

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-5 animate-spin text-brass-400" />
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      onLogout={() => logoutMutation.mutate()}
      loggingOut={logoutMutation.isPending}
    >
      <motion.div
        key={section}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Outlet />
      </motion.div>
    </AppShell>
  );
}
