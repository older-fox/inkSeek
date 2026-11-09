import { ConversationWorkspace } from '@/components/conversation-workspace';

/** Group chat list and conversation view with the same workspace layout as private chats. */
export function GroupChatsPage() {
  return <ConversationWorkspace kind="group" />;
}
