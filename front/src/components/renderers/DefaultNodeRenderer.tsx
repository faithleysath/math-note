import type { ProcessedLightweightNode } from '../../lib/types';

interface DefaultNodeRendererProps {
  node: ProcessedLightweightNode;
}

const DefaultNodeRenderer = ({ node }: DefaultNodeRendererProps) => {
  return (
    <div className="text-red-500 font-bold p-4 bg-red-100 border border-red-500 rounded-md">
      渲染错误：不支持的节点类型 "{node.type}"
    </div>
  );
};

export default DefaultNodeRenderer;
