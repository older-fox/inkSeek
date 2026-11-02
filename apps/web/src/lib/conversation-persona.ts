import type {
  ChatConversationKind,
  ChatConversationPersonaRecord,
  ChatPersonaValue,
  SaveConversationPersonaInput,
} from '@inkseek/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PersonaValue } from '@/lib/channel-persona';
import type { SourcedConversation } from '@/lib/connections';
import {
  groupPersonaDefaults,
  groupPersonaMetadata,
  readGroupPersonaMeta,
  readGroupPersonaOverrides,
} from '@/lib/group-persona';
import { ApiError, api } from '@/lib/api';
import {
  appendPersonaHistory,
  formatPersonaValue,
  type PersonaMetadata,
} from '@/lib/persona-metadata';
import {
  privatePersonaDefaults,
  privatePersonaMetadata,
  readPrivatePersonaMeta,
  readPrivatePersonaOverrides,
} from '@/lib/private-persona';
import { chatConversationPersonaQuery } from '@/lib/queries';

const SAVE_DELAY_MS = 500;
const HISTORY_LIMIT = 200;

export type PersonaSyncState = 'idle' | 'saving' | 'saved' | 'error';

export interface ConversationPersonaEditor {
  values: Record<string, PersonaValue> | null;
  meta: PersonaMetadata | null;
  ready: boolean;
  error: boolean;
  syncState: PersonaSyncState;
  update: (key: string, label: string, value: PersonaValue) => void;
  flush: () => void;
}

interface Draft {
  conversationId: string;
  values: Record<string, PersonaValue>;
  meta: PersonaMetadata;
}

interface PendingSave {
  conversationId: string;
  values: Record<string, PersonaValue>;
  history: PersonaMetadata['history'];
}

const LEGACY_READERS = {
  GROUP: {
    defaults: groupPersonaDefaults,
    defaultMeta: groupPersonaMetadata,
    readValues: readGroupPersonaOverrides,
    readMeta: readGroupPersonaMeta,
  },
  PRIVATE: {
    defaults: privatePersonaDefaults,
    defaultMeta: privatePersonaMetadata,
    readValues: readPrivatePersonaOverrides,
    readMeta: readPrivatePersonaMeta,
  },
} as const;

/**
 * Loads and persists the persona attached to a conversation. Group rows are
 * keyed by the conversation; private rows are keyed by channel + contact, so
 * every private scene with the same person shares one profile.
 */
export function useConversationPersona(
  conversation: SourcedConversation | null,
  kind: ChatConversationKind,
): ConversationPersonaEditor {
  const conversationId = conversation?.id ?? null;
  const legacyScope =
    conversation !== null ? `${conversation.source.id}:${conversation.externalId}` : null;
  const reader = LEGACY_READERS[kind];
  const queryClient = useQueryClient();
  const query = useQuery({
    ...chatConversationPersonaQuery(conversationId ?? ''),
    enabled: conversationId !== null,
  });
  const record = query.data ?? null;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncState, setSyncState] = useState<PersonaSyncState>('idle');
  const activeDraft = draft && draft.conversationId === conversationId ? draft : null;

  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const migratedRef = useRef<string | null>(null);

  const applyRecord = useCallback(
    (next: ChatConversationPersonaRecord) => {
      queryClient.setQueryData(chatConversationPersonaQuery(next.conversationId).queryKey, next);
    },
    [queryClient],
  );

  const runSave = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (savingRef.current) {
      return;
    }

    const pending = pendingRef.current;

    if (!pending) {
      return;
    }

    pendingRef.current = null;
    savingRef.current = true;
    setSyncState('saving');

    try {
      const payload: SaveConversationPersonaInput = {
        values: toChatValues(pending.values),
        history: pending.history.slice(0, HISTORY_LIMIT).map((entry) => ({ ...entry })),
      };
      const saved = await api.saveChatConversationPersona(pending.conversationId, payload);
      applyRecord(saved);
      setSyncState('saved');
    } catch (error) {
      setSyncState('error');
      toast.error(error instanceof ApiError ? error.message : '人格属性保存失败，请稍后重试');
    } finally {
      savingRef.current = false;

      if (pendingRef.current) {
        void runSave();
      }
    }
  }, [applyRecord]);

  const flush = useCallback(() => {
    void runSave();
  }, [runSave]);

  useEffect(() => {
    void runSave();
    setDraft(null);
    setSyncState('idle');
  }, [conversationId, runSave]);

  useEffect(() => {
    if (!record || record.persisted || !conversationId || !legacyScope) {
      return;
    }

    if (migratedRef.current === legacyScope) {
      return;
    }

    const legacyValues = reader.readValues(legacyScope);
    const legacyMeta = reader.readMeta(legacyScope);
    const hasLegacyValues = Object.keys(legacyValues).length > 0;

    if (!hasLegacyValues && !legacyMeta) {
      return;
    }

    migratedRef.current = legacyScope;
    const values = { ...reader.defaults(), ...legacyValues };
    const meta = legacyMeta ?? record.meta;

    setDraft({ conversationId, values, meta });
    pendingRef.current = { conversationId, values, history: meta.history };
    void runSave();
  }, [record, conversationId, legacyScope, reader, runSave]);

  useEffect(() => {
    return () => {
      void runSave();
    };
  }, [runSave]);

  const storedValues = record?.values ?? null;
  const storedMeta = record?.meta ?? null;
  const overrides = activeDraft?.values ?? storedValues;
  const meta = activeDraft?.meta ?? storedMeta;
  const fallbackValues = reader.defaults();
  const values = overrides === null ? fallbackValues : { ...fallbackValues, ...overrides };
  const ready = record !== null;

  const update = useCallback(
    (key: string, label: string, value: PersonaValue) => {
      if (!conversationId || !ready) {
        return;
      }

      const previous = values[key];
      const nextValues = { ...values, [key]: value };
      const nextMeta = appendPersonaHistory(meta ?? reader.defaultMeta(), {
        field: label,
        from: formatPersonaValue(previous),
        to: formatPersonaValue(value),
      });

      setDraft({ conversationId, values: nextValues, meta: nextMeta });
      pendingRef.current = {
        conversationId,
        values: nextValues,
        history: nextMeta.history,
      };
      setSyncState('saving');

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runSave();
      }, SAVE_DELAY_MS);
    },
    [conversationId, ready, values, meta, reader, runSave],
  );

  return {
    values: conversation ? values : null,
    meta: conversation ? meta : null,
    ready,
    error: query.isError,
    syncState,
    update,
    flush,
  };
}

function toChatValues(values: Record<string, PersonaValue>): Record<string, ChatPersonaValue> {
  const result: Record<string, ChatPersonaValue> = {};

  Object.entries(values).forEach(([key, value]) => {
    result[key] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : [...value];
  });

  return result;
}
