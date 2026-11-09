import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const FIT_SCALE = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.5;

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(FIT_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const reset = useCallback(() => {
    setScale(FIT_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((current + delta).toFixed(2))));
      if (next <= FIT_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Keep the Escape from also closing any dialog underneath the lightbox,
        // including other listeners registered on document itself.
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        zoomBy(ZOOM_STEP);
        return;
      }
      if (event.key === '-') {
        zoomBy(-ZOOM_STEP);
        return;
      }
      if (event.key === '0') {
        reset();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    stageRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose, reset, zoomBy]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 0.25 : -0.25);
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [zoomBy]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (scale <= FIT_SCALE) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (typeof document === 'undefined') {
    return null;
  }

  const pannable = scale > FIT_SCALE;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      role="dialog"
      aria-modal="true"
      aria-label={`图片预览：${alt}`}
      data-image-lightbox="true"
      onClick={onClose}
      className="fixed inset-0 z-[140] flex flex-col bg-[#05090e]/85 backdrop-blur-sm"
    >
      <div
        className="flex items-center justify-between gap-4 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="truncate font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-500">
          {alt}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭图片预览"
          className="rounded-lg border border-mist-100/10 bg-mist-100/5 p-1.5 text-mist-400 transition hover:bg-mist-100/10 hover:text-mist-200"
        >
          <X className="size-4" />
        </button>
      </div>

      <div
        ref={stageRef}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => (pannable ? reset() : zoomBy(1.5))}
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 outline-none',
          pannable ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        )}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          className={cn(
            'max-h-full max-w-full select-none rounded-lg object-contain shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)]',
            !dragging && 'transition-transform duration-150',
          )}
          onClick={(event) => event.stopPropagation()}
        />
      </div>

      <div
        className="flex items-center justify-center gap-2 px-4 pb-5 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomBy(-ZOOM_STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="缩小图片"
          className="rounded-lg border border-mist-100/10 bg-mist-100/5 p-2 text-mist-300 transition hover:bg-mist-100/10 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-12 text-center font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-400">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="放大图片"
          className="rounded-lg border border-mist-100/10 bg-mist-100/5 p-2 text-mist-300 transition hover:bg-mist-100/10 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={scale === FIT_SCALE && offset.x === 0 && offset.y === 0}
          aria-label="重置缩放"
          className="ml-1 rounded-lg border border-mist-100/10 bg-mist-100/5 p-2 text-mist-300 transition hover:bg-mist-100/10 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
