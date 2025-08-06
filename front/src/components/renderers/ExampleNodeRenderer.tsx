import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo, useState } from 'react';

interface ExampleNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const ExampleNodeRenderer = ({ node, fullNode }: ExampleNodeRendererProps) => {
  const [showSolution, setShowSolution] = useState(false);

  const displayContent = useMemo(() => {
    let content = `&emsp;&emsp;**${node.displayNumber}**&emsp;${fullNode.content}`;
    if (showSolution && fullNode.solution) {
      content += `\n\n&emsp;&emsp;${fullNode.solution}`;
    }
    return content;
  }, [fullNode.content, fullNode.solution, node.displayNumber, showSolution]);

  const handleClick = () => {
    if (fullNode.solution && !showSolution) {
      setShowSolution(true);
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
