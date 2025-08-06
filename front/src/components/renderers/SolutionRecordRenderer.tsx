import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ProcessedNode } from '../../lib/types';
import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface SolutionRecordRendererProps {
  node: ProcessedNode;
}

const SolutionRecordRenderer = ({ node }: SolutionRecordRendererProps) => {
  const displayContent = useMemo(() => {
    return node.content;
  }, [node.content]);

  const solutionContent = useMemo(() => {
    return node.solution;
  }, [node.solution]);

  return (
    <div className="text-base px-4 border-l-4 border-red-400 bg-red-50 my-2">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1">
          <AccordionTrigger className="text-red-700 hover:no-underline hover:text-red-800 cursor-pointer">
            {node.title}
          </AccordionTrigger>
          <AccordionContent>
            <MDEditor.Markdown
              source={displayContent}
              style={{ backgroundColor: 'transparent' }}
              remarkPlugins={[remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
            />
            {solutionContent && (
              <>
                <hr className="my-4" />
                <MDEditor.Markdown
                  source={solutionContent}
                  style={{ backgroundColor: 'transparent' }}
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
                />
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default SolutionRecordRenderer;
