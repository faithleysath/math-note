import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ExerciseNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const ExerciseNodeRenderer = ({ fullNode }: ExerciseNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return fullNode.content;
  }, [fullNode.content]);

  const solutionContent = useMemo(() => {
    return fullNode.solution;
  }, [fullNode.solution]);

  return (
    <div className="text-base p-4 pb-0 border-l-4 border-blue-400 bg-blue-50 my-2">
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
      {solutionContent && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-blue-700 hover:no-underline hover:text-blue-800 cursor-pointer">
              显示/隐藏题解
            </AccordionTrigger>
            <AccordionContent>
              <MDEditor.Markdown
                source={solutionContent}
                style={{ backgroundColor: 'transparent' }}
                remarkPlugins={[remarkMath]}
                rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
};

export default ExerciseNodeRenderer;
