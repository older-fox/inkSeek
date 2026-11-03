import type { ChatPipelineRunEvent } from '@inkseek/shared';
import { useEffect, useRef } from 'react';

/**
 * Subscribes to pipeline run lifecycle events. The canvas only needs them in
 * debug mode, so the connection is opened on demand and EventSource handles
 * reconnects on its own.
 */
export function usePipelineRunEvents(
  enabled: boolean,
  onEvent: (event: ChatPipelineRunEvent) => void,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const source = new EventSource('/api/v1/pipeline/events', { withCredentials: true });

    source.onmessage = (message) => {
      let payload: ChatPipelineRunEvent;

      try {
        payload = JSON.parse(message.data) as ChatPipelineRunEvent;
      } catch {
        return;
      }

      if (!payload || typeof payload.runId !== 'string') {
        return;
      }
      handlerRef.current(payload);
    };

    return () => {
      source.close();
    };
  }, [enabled]);
}
