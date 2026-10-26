import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { markdownComponents } from '../markdownComponents';
import { contentWithNumber } from '../../lib/display';
import { useMemo } from 'react';

interface DefinitionNodeRendererProps {
  node: ProcessedNode;
}

const DefinitionNodeRenderer = ({ node }: DefinitionNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return `&emsp;&emsp;${contentWithNumber(node.content, node.displayNumber, node.numberSource)}`;
  }, [node.content, node.displayNumber, node.numberSource]);

  return (
    <div className="text-base">
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        {...markdownPlugins()} components={markdownComponents()}
      />
    </div>
  );
};

export default DefinitionNodeRenderer;
