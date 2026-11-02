import { Injectable } from '@nestjs/common';
import type { ChatEvent } from '@inkseek/shared';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class ChatEventsService {
  private readonly subject = new Subject<ChatEvent>();

  emit(event: ChatEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<ChatEvent> {
    return this.subject.asObservable();
  }
}
