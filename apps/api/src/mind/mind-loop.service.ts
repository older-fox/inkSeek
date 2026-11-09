import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { MindTurnResult, PersonaMindMode } from '@inkseek/shared';
import type { ChatMessageSnapshot } from '../chat/chat-message.types.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MindPhoneOutcomeBrief } from './mind.types.js';
import { MindFocusService } from './mind-focus.service.js';
import { MindPhoneFocusService } from './mind-phone-focus.service.js';
import { MindRuntimeService } from './mind-runtime.service.js';

interface MessageEvent {
  kind: 'message';
  personaId: string;
  message: ChatMessageSnapshot;
  mode?: PersonaMindMode;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface HeartbeatEvent {
  kind: 'heartbeat';
  personaId: string;
  phoneOutcome?: MindPhoneOutcomeBrief;
  forceLearning?: boolean;
  resolve: (result: MindTurnResult | null) => void;
  reject: (error: unknown) => void;
}

interface PhoneStepEvent {
  kind: 'phone-step';
  personaId: string;
  focusId: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

type LoopEvent = MessageEvent | HeartbeatEvent | PhoneStepEvent;

const PRIORITY: Record<LoopEvent['kind'], number> = {
  message: 3,
  'phone-step': 2,
  heartbeat: 1,
};

/**
 * One attention stream per persona. Messages preempt whatever else is queued;
 * phone steps run between turns and yield at step boundaries. There is no
 * second actor racing the same device.
 */
@Injectable()
export class MindLoopService implements OnModuleInit {
  private readonly logger = new Logger(MindLoopService.name);
  private readonly queues = new Map<string, LoopEvent[]>();
  private readonly running = new Set<string>();
  private readonly stepTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly focus: MindFocusService,
    private readonly runtime: MindRuntimeService,
    private readonly phoneFocus: MindPhoneFocusService,
  ) {}

  /** Reclaims focus rows left ACTIVE by a previous process, skipping rehearsal boots. */
  async onModuleInit(): Promise<void> {
    // The read-only rehearsal boots this module without an HTTP server; it must
    // not touch live focus rows just because the process is new.
    if (process.env.MIND_SCRIPT_CONTEXT === '1') {
      return;
    }
    await this.focus.reclaimStale().catch((error: unknown) => {
      this.logger.warn(`回收焦点失败：${messageOf(error)}`);
    });
  }

  /** Runs the turn inside the persona's queue; channels without a persona reply directly. */
  async submitMessage(message: ChatMessageSnapshot, mode?: PersonaMindMode): Promise<void> {
    const personaId = await this.personaForChannel(message.channelId);
    if (!personaId) {
      await this.runtime.turn({ message, mode });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.push({
        kind: 'message',
        personaId,
        message,
        mode,
        resolve,
        reject,
      });
    });
  }

  /** Queues one idle heartbeat and resolves with its turn result, if any. */
  submitHeartbeat(
    personaId: string,
    options: { forceLearning?: boolean } = {},
  ): Promise<MindTurnResult | null> {
    return new Promise<MindTurnResult | null>((resolve, reject) => {
      this.push({
        kind: 'heartbeat',
        personaId,
        forceLearning: options.forceLearning,
        resolve,
        reject,
      });
    });
  }

  /** Start or resume phone work outside an event (manual request). */
  kick(personaId: string): void {
    void this.continuePhone(personaId, 0);
  }

  /**
   * Every finished phone session wakes the persona once to digest it: what it
   * played, what it noticed, battery, and any snag worth asking help about.
   */
  notifyPhoneOutcome(personaId: string, outcome: MindPhoneOutcomeBrief): void {
    this.push({
      kind: 'heartbeat',
      personaId,
      phoneOutcome: outcome,
      resolve: () => undefined,
      reject: (error) => {
        this.logger.warn(`人格 ${personaId} 手机复盘唤醒失败：${messageOf(error)}`);
      },
    });
  }

  /**
   * Called the moment a private message lands, before the burst quiet window
   * ends: the persona puts the phone down immediately, then replies later.
   */
  async notifyIncoming(channelId: string): Promise<void> {
    const personaId = await this.personaForChannel(channelId);
    if (!personaId) {
      return;
    }
    const phone = await this.focus.active(personaId, 'PHONE');
    if (phone?.status === 'ACTIVE') {
      await this.focus.pause(phone.id);
    }
    const timer = this.stepTimers.get(personaId);
    if (timer) {
      clearTimeout(timer);
      this.stepTimers.delete(personaId);
    }
  }

  /** Appends to the persona queue and starts the drain loop if it is idle. */
  private push(event: LoopEvent): void {
    const queue = this.queues.get(event.personaId) ?? [];
    queue.push(event);
    this.queues.set(event.personaId, queue);
    void this.pump(event.personaId);
  }

  /** Drains one persona's queue in priority order; re-entrant calls return at once. */
  private async pump(personaId: string): Promise<void> {
    if (this.running.has(personaId)) {
      return;
    }
    this.running.add(personaId);
    try {
      for (;;) {
        const queue = this.queues.get(personaId);
        if (!queue || queue.length === 0) {
          break;
        }
        queue.sort((left, right) => PRIORITY[right.kind] - PRIORITY[left.kind]);
        const event = queue.shift();
        if (!event) {
          break;
        }
        try {
          const result = await this.handle(event);
          if (event.kind === 'heartbeat') {
            event.resolve(result ?? null);
          } else {
            event.resolve();
          }
        } catch (error) {
          event.reject(error);
          this.logger.warn(`人格 ${personaId} 焦点事件失败：${messageOf(error)}`);
        }
      }
    } finally {
      this.running.delete(personaId);
      if ((this.queues.get(personaId)?.length ?? 0) > 0) {
        void this.pump(personaId);
      }
    }
  }

  /** Dispatches by event kind; only heartbeats produce a turn result. */
  private async handle(event: LoopEvent): Promise<MindTurnResult | null> {
    if (event.kind === 'message') {
      await this.handleMessage(event);
      return null;
    }
    if (event.kind === 'heartbeat') {
      return this.handleHeartbeat(event);
    }
    await this.handlePhoneStep(event);
    return null;
  }

  /** Interrupts phone time, answers, then restores the phone focus where it left off. */
  private async handleMessage(event: MessageEvent): Promise<void> {
    const phone = await this.focus.active(event.personaId, 'PHONE');
    // Only interrupted phone time needs a stack row; ordinary replies do not
    // clutter the focus timeline.
    let chatFocus = phone ? await this.focus.active(event.personaId, 'CHAT') : null;
    if (phone?.status === 'ACTIVE') {
      await this.focus.pause(phone.id);
    }
    if (phone && !chatFocus) {
      chatFocus = await this.focus.start({
        personaId: event.personaId,
        channelId: event.message.channelId,
        kind: 'CHAT',
        goal: '回复消息',
        parentId: phone.id,
        state: {
          conversationId: event.message.conversationId,
          messageId: event.message.messageId,
          senderId: event.message.senderId,
        },
      });
    }
    const chatFocusId = chatFocus?.id;
    try {
      await this.runtime.turn({
        message: event.message,
        mode: event.mode,
        focusId: chatFocusId,
      });
    } finally {
      if (chatFocusId) {
        await this.focus.finish(chatFocusId);
      }
      if (phone) {
        await this.focus.resume(phone.id);
      }
      // A tool call during this turn may have started a phone focus too.
      await this.continuePhone(event.personaId, 250);
    }
  }

  /** A running phone session wins over a plain heartbeat; it is stepped instead. */
  private async handleHeartbeat(event: HeartbeatEvent): Promise<MindTurnResult | null> {
    if (event.phoneOutcome) {
      const result = await this.runtime.heartbeat(event.personaId, event.phoneOutcome);
      await this.continuePhone(event.personaId, 400);
      return result;
    }
    if (event.forceLearning) {
      const result = await this.runtime.heartbeat(event.personaId, undefined, {
        forceLearning: true,
      });
      await this.continuePhone(event.personaId, 400);
      return result;
    }
    const phone = await this.focus.active(event.personaId, 'PHONE');
    if (phone) {
      if (phone.status === 'PAUSED') {
        await this.focus.resume(phone.id);
      }
      await this.continuePhone(event.personaId, 0);
      return null;
    }
    const result = await this.runtime.heartbeat(event.personaId);
    await this.continuePhone(event.personaId, 400);
    return result;
  }

  /** Advances the phone one micro-step and self-schedules the next while wanted. */
  private async handlePhoneStep(event: PhoneStepEvent): Promise<void> {
    const outcome = await this.phoneFocus.step(event.focusId);
    if (outcome.ended && outcome.brief) {
      this.notifyPhoneOutcome(event.personaId, outcome.brief);
    }
    if (outcome.continue) {
      this.scheduleStep(event.personaId, event.focusId, outcome.delayMs);
    }
  }

  /** Only one runnable phone focus, and never while chat is being answered. */
  private async continuePhone(personaId: string, delayMs: number): Promise<void> {
    const phone = await this.focus.active(personaId, 'PHONE');
    if (!phone || phone.status !== 'ACTIVE') {
      return;
    }
    const chat = await this.focus.active(personaId, 'CHAT');
    if (chat) {
      return;
    }
    this.scheduleStep(personaId, phone.id, delayMs);
  }

  /** Arms a one-shot step timer; an already pending timer is kept as-is. */
  private scheduleStep(personaId: string, focusId: string, delayMs: number): void {
    const pending = this.stepTimers.get(personaId);
    if (pending) {
      return;
    }
    const timer = setTimeout(() => {
      this.stepTimers.delete(personaId);
      void new Promise<void>((resolve, reject) => {
        this.push({ kind: 'phone-step', personaId, focusId, resolve, reject });
      });
    }, Math.max(0, delayMs));
    this.stepTimers.set(personaId, timer);
  }

  /** Persona bound to a channel, or null for channels nobody minds. */
  private async personaForChannel(channelId: string): Promise<string | null> {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { persona: { select: { id: true } } },
    });
    return channel?.persona?.id ?? null;
  }
}

/** Best-effort message text for logs; never throws on non-Error values. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
