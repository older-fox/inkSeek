import { Injectable } from '@nestjs/common';
import type { ChatPipelineRunEvent } from '@inkseek/shared';
import { Observable, Subject } from 'rxjs';

/**
 * In-process fan-out for pipeline run lifecycle events. The web canvas only
 * listens while debug mode is on, but the runner emits unconditionally so a
 * subscriber never has to race with the run start.
 */
@Injectable()
export class PipelineEventsService {
  private readonly subject = new Subject<ChatPipelineRunEvent>();

  emit(event: ChatPipelineRunEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<ChatPipelineRunEvent> {
    return this.subject.asObservable();
  }
}
