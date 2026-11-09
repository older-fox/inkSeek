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

/**
 * NapCat sends pokes as `notice/notify` with `sub_type: "poke"`; some builds
 * use `notice_type: "poke"` directly. Neither shape carries a message_id.
 */
export interface OneBotPokeEvent extends OneBotEvent {
  post_type: 'notice';
  notice_type?: string;
  sub_type?: string;
  user_id: number | string;
  target_id?: number | string;
  group_id?: number | string;
  sender?: OneBotSender;
  nickname?: string;
  card?: string;
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

/**
 * One forwarded history line. NapCat exposes two shapes: a `node` wrapper
 * (from `get_forward_msg`) carrying `message`, or a plain message object
 * (from the inline `forward.data.content`) carrying `message` + `sender`.
 * `content` sometimes arrives as a legacy CQ-code string instead.
 */
export interface OneBotForwardNode {
  type?: string;
  data?: {
    id?: string;
    user_id?: number | string;
    uin?: number | string;
    nickname?: string;
    name?: string;
    time?: number | string;
    message?: OneBotSegment[] | string;
    content?: OneBotSegment[] | string;
  };
  user_id?: number | string;
  time?: number | string;
  message_id?: number | string;
  message?: OneBotSegment[] | string;
  sender?: OneBotSender;
}

export interface OneBotForwardData {
  id?: string;
  content?: OneBotForwardNode[];
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

/** Narrows raw events to message ones; message_sent is included so self echoes are ingested. */
export function isOneBotMessageEvent(event: OneBotEvent): event is OneBotMessageEvent {
  return (
    (event.post_type === 'message' || event.post_type === 'message_sent') &&
    (event['message_type'] === 'private' || event['message_type'] === 'group') &&
    (event['message_id'] !== undefined || event['message'] !== undefined)
  );
}

/** Accepts both poke shapes, since NapCat builds disagree on sub_type vs notice_type. */
export function isOneBotPokeEvent(event: OneBotEvent): event is OneBotPokeEvent {
  return (
    event.post_type === 'notice' &&
    event['user_id'] !== undefined &&
    (event['sub_type'] === 'poke' || event['notice_type'] === 'poke')
  );
}

/**
 * NapCat normally pushes an array of message segments. When the account is
 * configured with string post format we keep the raw text as-is; CQ code
 * parsing is not supported.
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

/** QQ ids arrive as numbers or strings; blank values collapse to null. */
export function externalIdOf(value: number | string | undefined | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** QQ's public avatar endpoint; 100px is sufficient for the chat lists. */
export function userAvatarUrl(userId: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(userId)}&s=100`;
}

/** Group avatars use a different QQ CDN path than user avatars. */
export function groupAvatarUrl(groupId: string): string {
  return `https://p.qlogo.cn/gh/${encodeURIComponent(groupId)}/${encodeURIComponent(groupId)}/100`;
}
