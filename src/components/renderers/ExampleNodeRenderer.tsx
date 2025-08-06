import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ProcessedNode } from '../../lib/types';
import { useMemo, useState } from 'react';

interface ExampleNodeRendererProps {
  node: ProcessedNode;
}

const ExampleNodeRenderer = ({ node }: ExampleNodeRendererProps) => {
  const [showSolution, setShowSolution] = useState(false);

  const displayContent = useMemo(() => {
    let content = `&emsp;&emsp;**${node.displayNumber}**&emsp;${node.content}`;
    if (showSolution && node.solution) {
      content += `\n\n&emsp;&emsp;${node.solution}`;
    }
    return content;
  }, [node.content, node.solution, node.displayNumber, showSolution]);

  const handleClick = () => {
    if (node.solution) {
      setShowSolution(prev => !prev);
    }
  };

  return (
    <div
      className="text-base"
      onClick={handleClick}
    >
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
    </div>
  );
};

export default ExampleNodeRenderer;
