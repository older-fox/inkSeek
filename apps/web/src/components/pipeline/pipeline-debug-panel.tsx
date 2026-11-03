import type {
  ChatPipelineRunDetail,
  ChatPipelineRunStatus,
  ChatPipelineScope,
} from '@inkseek/shared';
import { AlertTriangle, CheckCircle2, FlaskConical, LoaderCircle, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDuration } from './pipeline-ui';

interface PipelineDebugPanelProps {
  scope: ChatPipelineScope;
  scopeId: string | null;
  scopeLabel: string;
  onClose: () => void;
  onCompleted: (run: ChatPipelineRunDetail) => void;
}

const STATUS_STYLE: Record<ChatPipelineRunStatus, { label: string; text: string }> = {
  SUCCEEDED: { label: '试跑成功', text: 'text-jade-300' },
  RUNNING: { label: '试跑中', text: 'text-brass-300' },
  FAILED: { label: '试跑失败', text: 'text-signal-400' },
  INTERRUPTED: { label: '已中断', text: 'text-mist-400' },
};

interface ReplyEffect {
  text: string;
  images: string[];
}

function readReplyEffects(value: unknown): ReplyEffect[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const record = entry as Record<string, unknown>;
    if (record['type'] !== 'reply' || typeof record['text'] !== 'string') {
      return [];
    }
    const images = Array.isArray(record['images'])
      ? record['images'].filter((image): image is string => typeof image === 'string')
      : [];
    return [{ text: record['text'], images }];
  });
}

/**
 * Dry run: executes the effective graph against a typed message and records
 * the requested effects on the run, without committing any of them.
 */
export function PipelineDebugPanel({
  scope,
  scopeId,
  scopeLabel,
  onClose,
  onCompleted,
}: PipelineDebugPanelProps) {
  const [text, setText] = useState('');
  const [senderName, setSenderName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChatPipelineRunDetail | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const run = await api.debugPipelineRun({
        scope,
        scopeId,
        text: trimmed,
        senderName: senderName.trim() || undefined,
      });
      setResult(run);
      onCompleted(run);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const effects = readReplyEffects(result?.effects);
  const failedNodes = result?.nodes.filter((node) => node.status === 'FAILED') ?? [];

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭试跑面板"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-950/65 backdrop-blur-sm"
      />
      <section className="absolute right-0 top-0 flex h-full w-full max-w-[27rem] flex-col border-l border-mist-100/[0.1] bg-ink-950/95 shadow-[-30px_0_80px_-40px_rgba(0,0,0,1)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-mist-100/[0.07] px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[0.52rem] uppercase tracking-[0.22em] text-brass-300">
              <FlaskConical className="size-3" strokeWidth={1.7} />
              Dry Run
            </p>
            <h2 className="mt-1.5 text-[0.95rem] font-medium text-mist-100">试跑管线</h2>
            <p className="mt-1 text-[0.58rem] leading-5 text-mist-500">
              用一条模拟消息执行「{scopeLabel}」当前生效的图。回复效果只记录在运行详情里，不会发送到任何渠道。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-mist-100/[0.08] text-mist-500 transition hover:border-mist-100/[0.2] hover:text-mist-200"
          >
            <X className="size-3.5" strokeWidth={1.8} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
          <label className="block">
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">
              发送者
            </span>
            <input
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              maxLength={80}
              placeholder="调试消息"
              className="mt-1.5 h-9 w-full rounded-lg border border-mist-100/[0.1] bg-ink-900/60 px-3 text-[0.7rem] text-mist-100 outline-none transition placeholder:text-mist-600 focus:border-brass-400/40"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">
              模拟消息
            </span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
              rows={5}
              placeholder="输入一条对方可能发来的消息，看看管线会怎么处理。"
              className="mt-1.5 w-full resize-y rounded-lg border border-mist-100/[0.1] bg-ink-900/60 px-3 py-2 text-[0.7rem] leading-6 text-mist-100 outline-none transition placeholder:text-mist-600 focus:border-brass-400/40"
            />
            <span className="mt-1 block text-right font-mono text-[0.48rem] text-mist-600">
              {text.length} / 4000
            </span>
          </label>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || text.trim().length === 0}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-brass-400/35 bg-brass-400/[0.12] text-[0.72rem] text-brass-200 transition hover:bg-brass-400/[0.2] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? (
              <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.8} />
            ) : (
              <Send className="size-3.5" strokeWidth={1.8} />
            )}
            {pending ? '正在执行' : '执行试跑'}
          </button>

          {error && (
            <p className="flex items-start gap-1.5 rounded-lg border border-signal-400/25 bg-signal-400/[0.06] px-3 py-2 text-[0.6rem] leading-5 text-signal-400">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.8} />
              {error}
            </p>
          )}

          {result && (
            <section className="rounded-xl border border-mist-100/[0.08] bg-ink-900/50 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-[0.68rem]',
                    STATUS_STYLE[result.status].text,
                  )}
                >
                  {result.status === 'SUCCEEDED' ? (
                    <CheckCircle2 className="size-3.5" strokeWidth={1.8} />
                  ) : (
                    <AlertTriangle className="size-3.5" strokeWidth={1.8} />
                  )}
                  {STATUS_STYLE[result.status].label}
                </span>
                <span className="font-mono text-[0.5rem] text-mist-600">
                  {formatDuration(result.durationMs)} · {result.nodes.length} 节点
                </span>
              </div>

              <p className="mt-2 font-mono text-[0.5rem] text-mist-600">
                {result.graphId}@{result.graphVersion} ·{' '}
                {result.nodes.filter((node) => node.status === 'SUCCEEDED').length} 成功 ·{' '}
                {result.nodes.filter((node) => node.status === 'SKIPPED').length} 跳过
              </p>

              {result.error && (
                <p className="mt-2 text-[0.58rem] leading-5 text-signal-400">{result.error}</p>
              )}

              <div className="mt-3 border-t border-mist-100/[0.06] pt-2.5">
                <p className="font-mono text-[0.48rem] uppercase tracking-[0.16em] text-mist-600">
                  回复效果 · {effects.length}
                </p>
                {effects.length === 0 ? (
                  <p className="mt-1.5 text-[0.58rem] leading-5 text-mist-600">
                    本次试跑没有产生回复效果。若预期要回复，检查消息输出卡片是否开启以及上游分支是否命中。
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    {effects.map((effect, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-jade-400/20 bg-jade-400/[0.05] px-2.5 py-2"
                      >
                        <p className="whitespace-pre-wrap text-[0.62rem] leading-5 text-mist-200">
                          {effect.text || '（空文本）'}
                        </p>
                        {effect.images.length > 0 && (
                          <p className="mt-1 font-mono text-[0.5rem] text-mist-600">
                            附带 {effect.images.length} 张图片
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[0.52rem] leading-4 text-mist-600">
                  效果未发送；真实渠道只在收到消息并运行 live 管线时发送。
                </p>
              </div>

              {failedNodes.length > 0 && (
                <div className="mt-3 border-t border-mist-100/[0.06] pt-2.5">
                  <p className="font-mono text-[0.48rem] uppercase tracking-[0.16em] text-signal-400">
                    失败节点
                  </p>
                  {failedNodes.map((node) => (
                    <p key={node.id} className="mt-1 text-[0.56rem] leading-4 text-signal-400">
                      {node.nodeId}（{node.nodeType}）：{node.error ?? '未知错误'}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-mist-100/[0.07] px-5 py-3">
          <span className="font-mono text-[0.48rem] uppercase tracking-[0.14em] text-mist-600">
            Debug · effect-free
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-mist-100/[0.12] px-3 py-1.5 text-[0.62rem] text-mist-400 transition hover:border-mist-100/[0.24] hover:text-mist-200"
          >
            关闭
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
