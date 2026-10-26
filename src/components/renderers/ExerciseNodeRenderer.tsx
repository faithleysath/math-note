import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { markdownComponents } from '../markdownComponents';
import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ExerciseNodeRendererProps {
  node: ProcessedNode;
  solutionLabel?: string;
}

const ExerciseNodeRenderer = ({ node, solutionLabel = '显示/隐藏题解' }: ExerciseNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return node.content;
  }, [node.content]);

  const solutionContent = useMemo(() => {
    return node.solution;
  }, [node.solution]);

  return (
    <div className="text-base p-4 pb-0 border-l-4 border-blue-400 bg-blue-50 my-2">
      {node.numberSource === 'source' && node.displayNumber && (
        <div className="mb-1 text-xs font-semibold text-blue-700">
          原书编号：{node.displayNumber}
        </div>
      )}
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        {...markdownPlugins()} components={markdownComponents()}
      />
      {solutionContent && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-blue-700 hover:no-underline hover:text-blue-800 cursor-pointer">
              {solutionLabel}
            </AccordionTrigger>
            <AccordionContent>
              <MDEditor.Markdown
                source={solutionContent}
                style={{ backgroundColor: 'transparent' }}
                {...markdownPlugins()} components={markdownComponents()}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
};

export default ExerciseNodeRenderer;
