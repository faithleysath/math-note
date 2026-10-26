import MDEditor from '@uiw/react-md-editor';
import { typeLabel, type ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { markdownComponents } from '../markdownComponents';
import { contentWithNumber } from '../../lib/display';
import { useMemo, useState } from 'react';

interface TheoremNodeRendererProps {
  node: ProcessedNode;
}

/** 理科新增的命题类别用左侧色条区分；数学定理保持原排版 */
const CLAIM_ACCENT: Record<string, string> = {
  law: 'border-l-4 border-indigo-400 pl-3',
  principle: 'border-l-4 border-violet-400 pl-3',
  reaction: 'border-l-4 border-teal-400 pl-3',
};

const CLAIM_TITLE_COLOR: Record<string, string> = {
  law: 'text-indigo-700',
  principle: 'text-violet-700',
  reaction: 'text-teal-700',
};

const TheoremNodeRenderer = ({ node }: TheoremNodeRendererProps) => {
  const [showSolution, setShowSolution] = useState(false);
  const displayContent = useMemo(() => {
    let content = `&emsp;&emsp;${contentWithNumber(node.content, node.displayNumber, node.numberSource)}`;
    if (showSolution && node.solution) {
      content += `\n\n&emsp;&emsp;${node.solution}`;
    }
    return content;
  }, [node.content, node.solution, node.displayNumber, node.numberSource, showSolution]);

  const handleClick = () => {
    if (node.solution) {
      setShowSolution(prev => !prev);
    }
  };

  const claimTitle =
    node.kind && CLAIM_ACCENT[node.kind] ? `${typeLabel(node)} · ${node.title}` : null;

  return (
    <div className={`text-base ${node.kind ? CLAIM_ACCENT[node.kind] ?? '' : ''}`} onClick={handleClick}>
      {claimTitle && (
        <div className={`mb-1 text-xs font-semibold ${CLAIM_TITLE_COLOR[node.kind as string] ?? ''}`}>
          {claimTitle}
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

export default TheoremNodeRenderer;
