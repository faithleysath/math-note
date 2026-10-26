import { useCallback, useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { ensureMermaid } from '../lib/mermaid';

interface MermaidBlockProps {
  /** mermaid 图源（```mermaid 代码块的原文） */
  code: string;
}

interface MermaidErrorProps {
  code: string;
  message: string;
  onRetry?: () => void;
}

/**
 * 渲染失败的降级：原样显示 mermaid 源码 + 一行错误提示，外加手动重试。
 * 正文里一张图画不出来不该影响整页阅读，所以这里只占自己的位置。
 */
export function MermaidError({ code, message, onRetry }: MermaidErrorProps) {
  return (
    <div className="mermaid-block mermaid-block-error" data-mermaid-error="">
      <pre className="mermaid-source">
        <code className="language-mermaid">{code}</code>
      </pre>
      <p className="mermaid-error-message">Mermaid 渲染失败：{message}</p>
      {onRetry && (
        <button type="button" className="mermaid-retry" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

/** mermaid.render 需要唯一 id；StrictMode 下 effect 会跑两遍，随机后缀避免撞 id */
function renderId(): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `mermaid-inline-${suffix}`;
}

/** 一次渲染的结果；key 用来判断它是不是当前这份源码 / 这一次重试的 */
interface RenderState {
  key: string;
  svg?: string;
  error?: string;
}

/**
 * 正文里的 ```mermaid 代码块。
 * 渲染是异步的：先显示「渲染中」，成功后插入 svg，失败则降级成源码 + 错误提示。
 * StrictMode / 快速切换内容时用 cancelled 标记丢弃过期的渲染结果。
 */
const MermaidBlock = ({ code }: MermaidBlockProps) => {
  const source = code.trim();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RenderState | null>(null);

  // 源码或重试次数变了，旧结果自动失效（不用在 effect 里同步清 state）
  const renderKey = `${attempt}\u0000${source}`;

  useEffect(() => {
    let cancelled = false;
    if (!source) return;

    ensureMermaid();
    mermaid
      .render(renderId(), source)
      .then((result) => {
        if (!cancelled) setState({ key: renderKey, svg: result.svg });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState({
          key: renderKey,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [source, renderKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const current = state && state.key === renderKey ? state : null;
  const error = source ? (current?.error ?? null) : '代码块是空的';
  if (error) return <MermaidError code={source} message={error} onRetry={retry} />;

  const svg = current?.svg ?? null;
  if (svg === null) {
    return (
      <div className="mermaid-block mermaid-block-pending" aria-busy="true">
        渲染中…
      </div>
    );
  }
  return <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
};

export default MermaidBlock;
