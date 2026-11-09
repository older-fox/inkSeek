import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { MindLoopService } from './mind-loop.service.js';

const TICK_MS = 30_000;
const LEASE_MS = 2 * 60_000;

@Injectable()
export class MindHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MindHeartbeatService.name);
  private readonly workerId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loop: MindLoopService,
  ) {}

  /** Starts the shared 30s wake poll; several instances coordinate via leases. */
  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    this.logger.log('人格心智心跳已启动');
  }

  /** Stops polling; an in-flight tick is left to finish on its own. */
  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Brings the next wake forward and drops any lease; false means no state row. */
  async trigger(personaId: string): Promise<boolean> {
    const updated = await this.prisma.personaState.updateMany({
      where: { personaId },
      data: {
        nextWakeAt: new Date(),
        wakeReason: '手动唤醒',
        leaseUntil: null,
        leaseOwner: null,
      },
    });
    return updated.count > 0;
  }

  /** One poll: claims due rows by lease so concurrent instances cannot double-wake. */
  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.personaState.findMany({
        where: {
          nextWakeAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          persona: {
            channel: {
              mindSettings: { is: { heartbeatEnabled: true, mode: { not: 'OFF' } } },
            },
          },
        },
        orderBy: { nextWakeAt: 'asc' },
        take: 10,
      });
      for (const state of due) {
        const claimed = await this.prisma.personaState.updateMany({
          where: {
            personaId: state.personaId,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          data: {
            leaseUntil: new Date(now.getTime() + LEASE_MS),
            leaseOwner: this.workerId,
          },
        });
        if (claimed.count === 0) {
          continue;
        }
        await this.wake(state.personaId);
      }
    } catch (error) {
      this.logger.warn(`心跳轮询失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Runs one heartbeat turn outside the DB lease contract of callers; the lease
   *  is always released and any silence falls back to a safe reschedule. */
  private async wake(personaId: string): Promise<void> {
    try {
      const settings = await this.prisma.chatMindSettings.findFirst({
        where: { channel: { persona: { id: personaId } } },
      });
      if (!settings || settings.mode === 'OFF' || !settings.heartbeatEnabled) {
        await this.reschedule(personaId, settings?.wakeIntervalMinutes ?? 30);
        return;
      }
      const result = await this.loop.submitHeartbeat(personaId);
      if (!result) {
        // Runtime reschedules on its own paths; this is a safety net.
        await this.reschedule(personaId, settings.wakeIntervalMinutes);
      }
    } catch (error) {
      this.logger.warn(
        `人格 ${personaId} 心跳失败：${error instanceof Error ? error.message : String(error)}`,
      );
      const settings = await this.prisma.chatMindSettings.findFirst({
        where: { channel: { persona: { id: personaId } } },
      });
      await this.reschedule(personaId, settings?.wakeIntervalMinutes ?? 30);
    } finally {
      await this.prisma.personaState.updateMany({
        where: { personaId },
        data: { leaseUntil: null, leaseOwner: null },
      });
    }
  }

  /** Pushes the next wake out by the configured interval and clears the lease. */
  private async reschedule(personaId: string, minutes: number): Promise<void> {
    await this.prisma.personaState.updateMany({
      where: { personaId },
      data: {
        nextWakeAt: new Date(Date.now() + minutes * 60_000),
        leaseUntil: null,
        leaseOwner: null,
        wakeReason: '心跳安全重排',
      },
    });
  }
}
