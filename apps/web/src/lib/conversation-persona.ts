import {
  relationshipPatchFromValues,
  relationshipToPersonaValues,
  stancePatchFromValues,
  stanceToPersonaValues,
  type ChatConversationKind,
} from '@inkseek/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import type { PersonaValue } from '@/lib/channel-persona';
import type { SourcedConversation } from '@/lib/connections';
import { groupPersonaDefaults } from '@/lib/group-persona';
import { privatePersonaDefaults } from '@/lib/private-persona';
import { chatChannelsQuery, mindGroupStancesQuery, mindRelationshipsQuery } from '@/lib/queries';

const SAVE_DELAY_MS = 500;

export type PersonaSyncState = 'idle' | 'saving' | 'saved' | 'error';

export interface ConversationPersonaEditor {
  values: Record<string, PersonaValue> | null;
  ready: boolean;
  error: boolean;
  syncState: PersonaSyncState;
  update: (key: string, value: PersonaValue) => void;
  flush: () => void;
}

interface Draft {
  conversationId: string;
  values: Record<string, PersonaValue>;
}

interface PendingSave {
  conversationId: string;
  personaId: string;
  kind: ChatConversationKind;
  contactId: string;
  values: Record<string, PersonaValue>;
}

/**
 * Reads and writes the single PersonaRelationship / PersonaGroupStance row.
 * The conversation panels are projections of those rows; no per-conversation
 * copy of the persona's attributes exists anymore.
 */
export function useConversationPersona(
  conversation: SourcedConversation | null,
  kind: ChatConversationKind,
): ConversationPersonaEditor {
  const conversationId = conversation?.id ?? null;
  const channelId = conversation?.source.id ?? null;
  const queryClient = useQueryClient();
  const channelsQuery = useQuery(chatChannelsQuery);
  const personaId =
    channelsQuery.data?.find((channel) => channel.id === channelId)?.persona?.id ?? '';

  const relationshipsQuery = useQuery({
    ...mindRelationshipsQuery(personaId),
    enabled: Boolean(personaId) && kind === 'PRIVATE' && Boolean(conversationId),
  });
  const stancesQuery = useQuery({
    ...mindGroupStancesQuery(personaId),
    enabled: Boolean(personaId) && kind === 'GROUP' && Boolean(conversationId),
  });

  const relationship =
    kind === 'PRIVATE' && conversation
      ? (relationshipsQuery.data?.find((item) => item.externalId === conversation.externalId) ??
        null)
      : null;
  const stance =
    kind === 'GROUP' && conversationId
      ? (stancesQuery.data?.find((item) => item.conversationId === conversationId) ?? null)
      : null;

  const serverValues = useMemo(
    () =>
      kind === 'PRIVATE'
        ? relationship
          ? relationshipToPersonaValues(relationship)
          : null
        : stance
          ? stanceToPersonaValues(stance)
          : null,
    [kind, relationship, stance],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncState, setSyncState] = useState<PersonaSyncState>('idle');
  const activeDraft = draft && draft.conversationId === conversationId ? draft : null;
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);

  const entityQuery = kind === 'PRIVATE' ? relationshipsQuery : stancesQuery;
  const entity = kind === 'PRIVATE' ? relationship : stance;
  const defaults = kind === 'PRIVATE' ? privatePersonaDefaults() : groupPersonaDefaults();
  const overrides = activeDraft?.values ?? serverValues;
  const values = useMemo(
    () => (conversation ? { ...defaults, ...(overrides ?? {}) } : null),
    [conversation, defaults, overrides],
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
      if (pending.kind === 'PRIVATE') {
        const patch = relationshipPatchFromValues(pending.values);
        patch.extras = { ...asRecord(relationship?.extras), ...asRecord(patch.extras) };
        await api.updateMindRelationship(pending.personaId, {
          ...patch,
          contactId: pending.contactId,
        });
      } else {
        const patch = stancePatchFromValues(pending.values);
        patch.extras = { ...asRecord(stance?.extras), ...asRecord(patch.extras) };
        await api.updateMindGroupStance(pending.personaId, {
          ...patch,
          conversationId: pending.conversationId,
        });
      }
      setSyncState('saved');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    } catch (error) {
      setSyncState('error');
      toast.error(error instanceof ApiError ? error.message : '人格属性保存失败，请稍后重试');
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        void runSave();
      }
    }
  }, [queryClient, relationship, stance]);

  const flush = useCallback(() => {
    void runSave();
  }, [runSave]);

  useEffect(() => {
    void runSave();
    setDraft(null);
    setSyncState('idle');
  }, [conversationId, runSave]);

  useEffect(() => {
    return () => {
      void runSave();
    };
  }, [runSave]);

  const update = useCallback(
    (key: string, value: PersonaValue) => {
      if (!conversationId || !personaId || !values || !entity) {
        return;
      }
      const contactId = kind === 'PRIVATE' ? (relationship?.contactId ?? '') : '';
      if (kind === 'PRIVATE' && !contactId) {
        toast.error('还没有这个联系人的关系记录');
        return;
      }
      const nextValues = { ...values, [key]: value };
      setDraft({ conversationId, values: nextValues });
      pendingRef.current = {
        conversationId,
        personaId,
        kind,
        contactId,
        values: nextValues,
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
    [conversationId, personaId, values, entity, kind, relationship, runSave],
  );

  return {
    values,
    ready: Boolean(personaId) && entityQuery.isSuccess && Boolean(entity),
    error: entityQuery.isError || Boolean(personaId && entityQuery.isSuccess && !entity),
    syncState,
    update,
    flush,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
