import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { contentWithNumber, titleCarriesNumber } from '../../lib/display';
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
    const number = titleCarriesNumber(node.title, node.displayNumber) ? '' : node.displayNumber;
    return contentWithNumber(node.content, number, node.numberSource);
  }, [node.content, node.displayNumber, node.numberSource, node.title]);

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
              {...markdownPlugins()}
            />
            {solutionContent && (
              <>
                <hr className="my-4" />
                <MDEditor.Markdown
                  source={solutionContent}
                  style={{ backgroundColor: 'transparent' }}
                  {...markdownPlugins()}
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
