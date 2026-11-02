import { useQueryClient } from '@tanstack/react-query';
import type { ChatEvent } from '@inkseek/shared';
import { useEffect } from 'react';

/**
 * 订阅后端渠道命名空间的实时变更。收到事件后只失效对应缓存，
 * 由 React Query 重新拉取真实数据，避免前端自造状态。
 */
export function useChatEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/v1/chat/events', { withCredentials: true });

    source.onmessage = (event) => {
      let payload: ChatEvent;

      try {
        payload = JSON.parse(event.data) as ChatEvent;
      } catch {
        return;
      }

      if (!payload || typeof payload.type !== 'string') {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });

      if (payload.conversationId) {
        void queryClient.invalidateQueries({
          queryKey: ['chat', 'messages', payload.conversationId],
        });
      }
    };

    return () => {
      source.close();
    };
  }, [queryClient]);
}
