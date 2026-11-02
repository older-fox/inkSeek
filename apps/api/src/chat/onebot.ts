export interface OneBotSegment {
  type: string;
  data: Record<string, unknown>;
}

export interface OneBotSender {
  user_id: number | string;
  nickname?: string;
  card?: string;
  role?: string;
}

export interface OneBotEvent {
  post_type: string;
  time?: number;
  self_id?: number | string;
  [key: string]: unknown;
}

export interface OneBotMessageEvent extends OneBotEvent {
  post_type: 'message' | 'message_sent';
  message_type: 'private' | 'group';
  sub_type?: string;
  message_id: number | string;
  user_id: number | string;
  group_id?: number | string;
  target_id?: number | string;
  message: OneBotSegment[] | string;
  raw_message?: string;
  sender?: OneBotSender;
}

export interface OneBotGroupInfo {
  group_id?: number | string;
  group_name?: string;
  member_count?: number;
  max_member_count?: number;
}

export interface OneBotGroupMember {
  user_id: number | string;
  nickname?: string;
  card?: string;
  role?: string;
  join_time?: number;
}

export interface OneBotActionResponse<T = unknown> {
  status: string;
  retcode: number;
  data: T;
  message?: string;
  wording?: string;
  echo?: string | number;
}

/** Only the call surface a message ingestor needs from a NapCat client. */
export interface OneBotRequester {
  call<T>(action: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
}

export function isOneBotMessageEvent(event: OneBotEvent): event is OneBotMessageEvent {
  return (
    (event.post_type === 'message' || event.post_type === 'message_sent') &&
    (event['message_type'] === 'private' || event['message_type'] === 'group') &&
    (event['message_id'] !== undefined || event['message'] !== undefined)
  );
}

/**
 * NapCat normally pushes an array of message segments. When the account is
 * configured with string post format we keep the raw text as-is; CQ code
 * parsing is intentionally left to the future message pipeline.
 */
export function normalizeSegments(message: OneBotSegment[] | string): OneBotSegment[] {
  if (Array.isArray(message)) {
    return message.filter(
      (segment): segment is OneBotSegment =>
        Boolean(segment) && typeof segment.type === 'string' && typeof segment.data === 'object',
    );
  }

  return message ? [{ type: 'text', data: { text: message } }] : [];
}

export function externalIdOf(value: number | string | undefined | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function userAvatarUrl(userId: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(userId)}&s=100`;
}

export function groupAvatarUrl(groupId: string): string {
  return `https://p.qlogo.cn/gh/${encodeURIComponent(groupId)}/${encodeURIComponent(groupId)}/100`;
}
