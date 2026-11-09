import { ConversationWorkspace } from '@/components/conversation-workspace';

/** Private chat list and conversation view; also the default landing route. */
export function PrivateChatsPage() {
  return <ConversationWorkspace kind="private" />;
}
