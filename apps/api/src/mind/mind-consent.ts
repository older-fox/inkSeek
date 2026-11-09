import type { TodoConsent } from '@inkseek/shared';
import { readStringArray, type MindScene, type SceneMessage } from './mind.types.js';

/** Strong invitation cues. Weak verbs like 来/去 alone are not consent. */
const INVITE_PATTERN =
  /一起|要不要|能不能|可不可以|约(?:好|定|个|一)?|邀请|陪我|帮我|开黑|见面|碰面|来不来|去不去|有空吗|有时间吗|要不要来|要不要去|等你|不见不散/u;
const ACCEPT_STRONG =
  /我?(?:可以|能去|能来|会去|会来|答应|同意)|好啊|好呀|行的|可以啊|没问题|当然|不见不散|到时候见|等你|走起|安排(?:上|好)?|开黑/u;
const ACCEPT_BARE = /^(?:嗯+|好|行|成|走|来|去吧?|可以)(?:啊|呀|的|吧|呢)?$/u;
const ACCEPT_NEGATIVE = /不|没|别|算了|再说|改天|下次|以后|考虑|看看/u;
const QUESTION = /[?？]|吗|呢|怎么|为什么|要不要|能不能/u;

const MAX_CONSENT_GAP = 40;
const MAX_CONSENT_AGE_MS = 12 * 60 * 60 * 1000;

export type ConsentCheck = { ok: true } | { ok: false; reason: string };

/**
 * A persona-authored plan is only stored when the conversation contains an
 * explicit invitation and a later, explicit acceptance from the other side.
 * Wants, "maybe later", stale replies and group-wide invitations that never
 * mention the persona are not consent.
 */
export function checkTodoConsent(scene: MindScene, consent: TodoConsent | undefined): ConsentCheck {
  if (!consent?.inviteMessageId || !consent.acceptMessageId) {
    return { ok: false, reason: '缺少邀请与答应的消息 ID' };
  }
  const inviteIndex = scene.messages.findIndex((message) => message.id === consent.inviteMessageId);
  const acceptIndex = scene.messages.findIndex((message) => message.id === consent.acceptMessageId);
  if (inviteIndex < 0) {
    return { ok: false, reason: '邀请消息不在最近对话里' };
  }
  if (acceptIndex < 0) {
    return { ok: false, reason: '答应消息不在最近对话里' };
  }
  if (inviteIndex === acceptIndex) {
    return { ok: false, reason: '邀请与答应不能是同一条消息' };
  }
  if (acceptIndex < inviteIndex) {
    return { ok: false, reason: '答应必须发生在邀请之后' };
  }
  if (acceptIndex - inviteIndex > MAX_CONSENT_GAP) {
    return { ok: false, reason: '答应离邀请太远，不能算作这次邀约的同意' };
  }
  const invite = scene.messages[inviteIndex]!;
  const accept = scene.messages[acceptIndex]!;
  if (invite.isSelf === accept.isSelf) {
    return { ok: false, reason: '邀请和答应必须来自双方' };
  }
  if (Date.now() - new Date(accept.sentAt).getTime() > MAX_CONSENT_AGE_MS) {
    return { ok: false, reason: '答应已经太久了，需要重新确认' };
  }
  if (!isInvitation(invite.text)) {
    return { ok: false, reason: '邀请消息里没有明确邀约' };
  }
  if (!isAcceptance(accept.text)) {
    return { ok: false, reason: '答应消息里没有明确同意' };
  }
  if (
    !invite.isSelf &&
    scene.conversation.kind === 'GROUP' &&
    !mentionsPersona(scene, invite)
  ) {
    return { ok: false, reason: '群里的邀请没有点名或 @ 人格' };
  }
  if (consent.withContactId) {
    const counterpart = invite.isSelf ? accept : invite;
    const known = scene.cast.some(
      (member) =>
        member.contactId === consent.withContactId ||
        member.externalId === consent.withContactId ||
        member.nickname === consent.withContactId,
    );
    if (!known || counterpart.isSelf) {
      return { ok: false, reason: '约定的对象不在场' };
    }
    const expected = scene.cast.find(
      (member) =>
        member.contactId === consent.withContactId ||
        member.externalId === consent.withContactId ||
        member.nickname === consent.withContactId,
    );
    if (expected && expected.contactId !== counterpart.senderId) {
      return { ok: false, reason: '答应的人不是约定的对象' };
    }
  }
  return { ok: true };
}

/** Invitation must look like an ask, not a passing mention; overlong text is rejected outright. */
function isInvitation(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 200) {
    return false;
  }
  return INVITE_PATTERN.test(value);
}

/** Short hedges and questions are hearsay, not agreement, even when they contain a yes-like token. */
function isAcceptance(text: string): boolean {
  const value = text
    .trim()
    .replace(/[\s，,。.!！~～…]+/gu, '');
  if (!value || value.length > 40) {
    return false;
  }
  if (QUESTION.test(value) || ACCEPT_NEGATIVE.test(value)) {
    return false;
  }
  return ACCEPT_STRONG.test(value) || ACCEPT_BARE.test(value);
}

/** Group messages count as directed only when they name or @ the persona or one of its aliases. */
function mentionsPersona(scene: MindScene, message: SceneMessage): boolean {
  const values = scene.persona.values as Record<string, unknown> | null;
  const names = [scene.persona.name, ...readStringArray(values?.['aliases'])]
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.some((name) => message.text.includes(name))) {
    return true;
  }
  const atNames = [...message.text.matchAll(/@([^\s@]+)/gu)].map((match) => match[1] ?? '');
  return atNames.some((at) => names.some((name) => at.includes(name) || name.includes(at)));
}
