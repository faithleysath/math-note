import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { markdownComponents } from '../markdownComponents';
import { contentWithNumber, titleCarriesNumber } from '../../lib/display';
import { useMemo } from 'react';

interface NoteNodeRendererProps {
  node: ProcessedNode;
}

const SCIENCE_NOTE_STYLES: Record<
  string,
  { label: string; wrapper: string; labelClass: string }
> = {
  experiment: {
    label: '实验',
    wrapper: 'border-teal-400 bg-teal-50',
    labelClass: 'text-teal-700',
  },
  model: {
    label: '模型',
    wrapper: 'border-violet-400 bg-violet-50',
    labelClass: 'text-violet-700',
  },
  phenomenon: {
    label: '现象',
    wrapper: 'border-amber-400 bg-amber-50',
    labelClass: 'text-amber-700',
  },
  process: {
    label: '过程',
    wrapper: 'border-emerald-400 bg-emerald-50',
    labelClass: 'text-emerald-700',
  },
  structure: {
    label: '结构',
    wrapper: 'border-sky-400 bg-sky-50',
    labelClass: 'text-sky-700',
  },
};

const NoteNodeRenderer = ({ node }: NoteNodeRendererProps) => {
  const style = node.kind ? SCIENCE_NOTE_STYLES[node.kind] : undefined;
  const displayTitle = useMemo(() => {
    if (!style) return node.title;
    // 「实验：探究……」在卡片里去掉重复的类型前缀
    return node.title.replace(new RegExp(`^${style.label}[：:]\\s*`), '');
  }, [node.title, style]);
  const displayContent = useMemo(() => {
    const number = titleCarriesNumber(node.title, node.displayNumber) ? '' : node.displayNumber;
    return contentWithNumber(node.content, number, node.numberSource);
  }, [node.content, node.displayNumber, node.numberSource, node.title]);

  return (
    <div className={`text-base p-4 border-l-4 my-2 ${style ? style.wrapper : 'border-yellow-400 bg-yellow-50'}`}>
      {style && (
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className={`text-xs font-semibold tracking-wide ${style.labelClass}`}>
            {style.label}
          </span>
          <span className="text-sm font-semibold text-slate-700">{displayTitle}</span>
        </div>
      )}
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        {...markdownPlugins()} components={markdownComponents()}
      />
    </div>
  );
};

export default NoteNodeRenderer;
