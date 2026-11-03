import type {
  ChatPipelineConfigFieldKind,
  ChatPipelineIoField,
  ChatPipelineNodeCategory,
  ChatPipelineNodeType,
} from '@inkseek/shared';
import { BookOpen, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { CATEGORY_STYLE, IO_KIND_STYLE } from './pipeline-ui';

interface PipelineDocsProps {
  catalog: ChatPipelineNodeType[];
  onClose: () => void;
}

const CONFIG_KIND_LABEL: Record<ChatPipelineConfigFieldKind, string> = {
  text: '多行文本',
  string: '单行文本',
  number: '数字',
  boolean: '开关',
  select: '下拉',
  json: 'JSON',
};

const CATEGORY_ORDER: ChatPipelineNodeCategory[] = [
  'system',
  'data',
  'variable',
  'media',
  'text',
  'logic',
  'flow',
  'note',
];

export function PipelineDocs({ catalog, onClose }: PipelineDocsProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭节点文档"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-950/65 backdrop-blur-sm"
      />
      <section className="absolute right-0 top-0 flex h-full w-full max-w-[35rem] flex-col border-l border-mist-100/[0.1] bg-ink-950/95 shadow-[-30px_0_80px_-40px_rgba(0,0,0,1)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-mist-100/[0.07] px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[0.52rem] uppercase tracking-[0.22em] text-brass-300">
              <BookOpen className="size-3" strokeWidth={1.7} />
              Node Reference
            </p>
            <h2 className="mt-1.5 text-[0.95rem] font-medium text-mist-100">节点文档</h2>
            <p className="mt-1 text-[0.58rem] leading-5 text-mist-500">
              每张卡片的端口类型、配置字段与引用语法；目录与后端节点注册表同源。
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <section className="rounded-xl border border-brass-400/20 bg-brass-400/[0.04] px-3.5 py-3">
            <p className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-brass-300">
              端口与引用
            </p>
            <dl className="mt-2 space-y-1.5 text-[0.56rem] leading-5 text-mist-400">
              <div>
                <dt className="inline font-mono text-mist-200">端口类型</dt>
                <dd className="inline">
                  {' '}
                  文本、数字、布尔、JSON、图片只能连到同类型或「任意」端口；标「可选」的输入可以留空，
                  标「多路」的输入接收多条连线并在节点内汇总。图片端口传递的是媒体引用
                  （落盘地址、data URL 或远程地址），消息输出会把它转成可发送的图片，单条回复最多{' '}
                  <span className="font-mono">4</span> 张。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">系统卡片</dt>
                <dd className="inline">
                  {' '}
                  消息输入提供 <span className="font-mono">message</span>（完整消息对象）、
                  <span className="font-mono">text</span>（正文）与{' '}
                  <span className="font-mono">images</span>（图片）三个端口，消息输出只负责回发；
                  两者固定存在、不可删除。直接把 <span className="font-mono">text</span> 连到输出的{' '}
                  <span className="font-mono">text</span> 就是不经模型的复读，
                  <span className="font-mono">images</span> 对{' '}
                  <span className="font-mono">images</span> 则原样转发图片。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">注释卡片</dt>
                <dd className="inline">
                  {' '}
                  「文字描述」只用来在画布上写说明：没有端口，不参与运行，也不会出现在运行轨迹里。
                  双击卡片可以直接编辑，或选中后在右侧检查器修改。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">源卡片</dt>
                <dd className="inline">
                  {' '}
                  没有输入端口的卡片（固定内容、固定文本）每次运行都直接执行，可以当作常量来源；
                  读取变量在没有接线时也会直接执行。
                  要让读取发生在写入之后，把「写入变量」的{' '}
                  <span className="font-mono">value</span> 接到「读取变量」的顺序端口。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">消息对象</dt>
                <dd className="inline">
                  {' '}
                  <span className="font-mono">message</span> 携带{' '}
                  <span className="font-mono">sender</span>（
                  <span className="font-mono">{'{ id, name }'}</span>）、
                  <span className="font-mono">text</span>、
                  <span className="font-mono">kind</span>、
                  <span className="font-mono">images</span>、
                  <span className="font-mono">imageCount</span>、
                  <span className="font-mono">voices</span>（每条含{' '}
                  <span className="font-mono">url</span>、
                  <span className="font-mono">duration</span> 与转写{' '}
                  <span className="font-mono">transcript</span>）、
                  <span className="font-mono">voiceCount</span>、
                  <span className="font-mono">isForward</span>、
                  <span className="font-mono">hasQuote</span> 与{' '}
                  <span className="font-mono">quote</span>（引用快照，含{' '}
                  <span className="font-mono">quote.images</span>）。「消息对象取值」卡片提供下拉菜单，
                  可直接选择要取出的字段，例如发送者昵称、引用作者、引用图片；选「整个消息对象」
                  则原样输出整个对象。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">$节点.字段</dt>
                <dd className="inline">
                  {' '}
                  取上游节点输出里的字段，类型保持原样，例如{' '}
                  <span className="font-mono">$get_sender.value</span>。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">{'{{节点.字段}}'}</dt>
                <dd className="inline">
                  {' '}
                  在模板文本中插值，例如{' '}
                  <span className="font-mono">{'{{input.object.sender.name}}'}</span> 或{' '}
                  <span className="font-mono">{'{{text.text}}'}</span>。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">input.*</dt>
                <dd className="inline">
                  {' '}
                  读取当前节点已接线的输入端口，例如{' '}
                  <span className="font-mono">{'{{input.text}}'}</span>、
                  <span className="font-mono">{'{{input.object.quote.text}}'}</span>；
                  多路端口是数组。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">message.*</dt>
                <dd className="inline">
                  {' '}
                  直接读取原始消息快照：<span className="font-mono">text</span>、
                  <span className="font-mono">senderName</span>、
                  <span className="font-mono">quote</span>（含{' '}
                  <span className="font-mono">images</span>）、
                  <span className="font-mono">kind</span> 等。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">$vars.名称</dt>
                <dd className="inline">
                  {' '}
                  读取管线变量，例如 <span className="font-mono">$vars.counter</span>，
                  模板中写作 <span className="font-mono">{'{{vars.counter}}'}</span>。
                  变量名支持任意语言（如 <span className="font-mono">$vars.白名单</span>），
                  变量在图设置里声明，也可以直接在「读取变量 / 写入变量」的变量下拉底部新建；
                  每次跑图都从声明值开始；「写入变量」只改本次运行的值，不会改动图。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">连线条件</dt>
                <dd className="inline">
                  {' '}
                  连线可只在来源节点某字段等于指定值时激活；汇合节点用「任一命中」接收分支。
                </dd>
              </div>
              <div>
                <dt className="inline font-mono text-mist-200">调试模式</dt>
                <dd className="inline">
                  {' '}
                  顶栏的「调试」开关保存在本机浏览器。开启后自动跟随这张图的最新一次运行
                  （包括其他渠道继承同一张图时的实时消息），连线中点会显示来源输出与目标输入的实际值，
                  运行中的连线带流动光点；点选连线或节点，右侧检查器会展开完整的输入 / 输出与判定结果。
                  调试模式只叠加观察，不会改动图或运行数据。
                </dd>
              </div>
            </dl>
          </section>

          {CATEGORY_ORDER.map((category) => {
            const items = catalog.filter((entry) => entry.category === category);
            if (items.length === 0) {
              return null;
            }
            const style = CATEGORY_STYLE[category];
            const Icon = style.icon;
            return (
              <section key={category} className="mt-5">
                <p className="flex items-center gap-1.5 font-mono text-[0.52rem] uppercase tracking-[0.18em] text-mist-500">
                  <Icon className={cn('size-3', style.text)} strokeWidth={1.8} />
                  {style.label}
                  <span className="text-mist-600">· {items.length}</span>
                </p>
                <div className="mt-2 space-y-2.5">
                  {items.map((item) => (
                    <NodeDocCard key={item.type} entry={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function NodeDocCard({ entry }: { entry: ChatPipelineNodeType }) {
  const style = CATEGORY_STYLE[entry.category];
  const Icon = style.icon;

  return (
    <article className="rounded-xl border border-mist-100/[0.08] bg-ink-900/50 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border',
            style.border,
            style.background,
            style.text,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[0.72rem] font-medium text-mist-100">{entry.label}</h3>
            <span className="rounded border border-mist-100/[0.1] px-1 py-px font-mono text-[0.44rem] text-mist-500">
              {entry.type}
            </span>
            <span className="font-mono text-[0.44rem] text-mist-600">v{entry.version}</span>
            {entry.system && (
              <span className="rounded border border-brass-400/30 bg-brass-400/[0.08] px-1 py-px font-mono text-[0.42rem] text-brass-300">
                系统
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.56rem] leading-5 text-mist-500">{entry.description}</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <IoColumn title="输入" fields={entry.inputs} />
        <IoColumn title="输出" fields={entry.outputs} />
      </div>

      {entry.fields.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-mist-100/[0.06] bg-ink-950/40 px-2.5 py-2">
          <p className="font-mono text-[0.46rem] uppercase tracking-[0.16em] text-mist-600">
            配置字段
          </p>
          <ul className="mt-1 space-y-1">
            {entry.fields.map((field) => (
              <li key={field.key} className="flex items-baseline gap-1.5 text-[0.52rem]">
                <span className="font-mono text-mist-300">{field.key}</span>
                <span className="text-mist-500">{field.label}</span>
                <span className="rounded border border-mist-100/[0.08] px-1 py-px font-mono text-[0.42rem] text-mist-600">
                  {CONFIG_KIND_LABEL[field.kind]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function IoColumn({ title, fields }: { title: string; fields: ChatPipelineIoField[] }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[0.46rem] uppercase tracking-[0.16em] text-mist-600">{title}</p>
      {fields.length === 0 ? (
        <p className="mt-1 text-[0.5rem] text-mist-600">无</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {fields.map((field) => {
            const kind = IO_KIND_STYLE[field.kind];
            return (
              <li
                key={`${field.key}-${field.label}`}
                className="rounded-md border border-mist-100/[0.06] px-1.5 py-1"
                title={field.description}
              >
                <div className="flex items-center gap-1">
                  <span className="truncate font-mono text-[0.5rem] text-mist-200">
                    {field.key}
                  </span>
                  {field.optional && (
                    <span className="shrink-0 font-mono text-[0.4rem] text-mist-500">可选</span>
                  )}
                  {field.multiple && (
                    <span className="shrink-0 font-mono text-[0.4rem] text-jade-300">多路</span>
                  )}
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded border px-1 py-px font-mono text-[0.4rem]',
                      kind.className,
                    )}
                  >
                    {kind.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[0.46rem] text-mist-600">{field.label}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
