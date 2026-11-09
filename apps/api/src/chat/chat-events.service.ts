import { Injectable } from '@nestjs/common';
import type { ChatEvent } from '@inkseek/shared';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class ChatEventsService {
  private readonly subject = new Subject<ChatEvent>();

  /** Fan-out to connected SSE subscribers; events with no listener are dropped. */
  emit(event: ChatEvent): void {
    this.subject.next(event);
  }

  /** Shared observable, so an SSE response sees events emitted after it subscribed. */
  stream(): Observable<ChatEvent> {
    return this.subject.asObservable();
  }
}
