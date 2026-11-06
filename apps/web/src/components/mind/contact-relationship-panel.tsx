import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ChannelAvatar } from '@/components/connection-bits';
import { ApiError, api } from '@/lib/api';
import { relationInputFromDraft } from './mind-format';
import { RelationEditor, RelationshipChangeList } from './mind-people';
import { EmptyState, MindDrawer } from './mind-ui';

export interface ChatContactBrief {
  externalId: string;
  name: string;
  avatarUrl: string | null;
  accent: 'brass' | 'jade';
}

export function ContactRelationshipPanel({
  personaId,
  contact,
  onClose,
}: {
  personaId: string;
  contact: ChatContactBrief | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const relationshipQuery = useQuery({
    queryKey: ['mind', 'relationship', personaId, contact?.externalId],
    queryFn: () => api.mindRelationshipByExternalId(personaId, contact!.externalId),
    enabled: Boolean(personaId && contact),
    staleTime: 5_000,
  });
  const contactId = relationshipQuery.data?.contactId ?? '';
  const update = useMutation({
    mutationFn: (draft: Parameters<typeof relationInputFromDraft>[1]) => {
      const record = relationshipQuery.data;
      if (!record) {
        throw new Error('关系记录尚未载入');
      }
      return api.updateMindRelationship(personaId, relationInputFromDraft(record.contactId, draft));
    },
    onSuccess: () => {
      toast.success('关系已更新');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '更新失败'),
  });

  return (
    <MindDrawer
      open={Boolean(contact)}
      title={contact?.name ?? '联系人'}
      subtitle={contact ? `QQ ${contact.externalId}` : undefined}
      onClose={onClose}
      widthClassName="sm:max-w-[36rem]"
    >
      {contact ? (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-mist-100/[0.07] bg-ink-950/25 p-3">
            <ChannelAvatar
              src={contact.avatarUrl}
              initials={Array.from(contact.name)[0] ?? '?'}
              accent={contact.accent}
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate text-[0.88rem] text-mist-200">{contact.name}</p>
              <p className="mt-0.5 font-mono text-[0.64rem] text-mist-600">TA 对这个人的实时关系</p>
            </div>
          </div>
          {relationshipQuery.isPending ? (
            <div className="grid place-items-center py-14">
              <LoaderCircle className="size-5 animate-spin text-brass-300" />
            </div>
          ) : !relationshipQuery.data ? (
            <EmptyState compact text="还没有这个联系人的关系记录。" />
          ) : (
            <>
              <RelationEditor
                key={`${relationshipQuery.data.id}-${relationshipQuery.data.updatedAt}`}
                record={relationshipQuery.data}
                saving={update.isPending}
                onSave={(draft) => update.mutate(draft)}
              />
              <RelationshipChangeList personaId={personaId} contactId={contactId} />
            </>
          )}
        </>
      ) : null}
    </MindDrawer>
  );
}
