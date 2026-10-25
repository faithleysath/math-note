import { useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildPrompt, describeOperation, generateOperations } from '@/lib/ai';
import { childIds } from '@/lib/graph';
import { allowedChildTypes, NODE_TYPE_META, type AiOperation, type Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';

interface AiHandwritingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiHandwritingDialog({ isOpen, onClose }: AiHandwritingDialogProps) {
  const index = useGraphStore((state) => state.index);
  const selectedId = useGraphStore((state) => state.selectedId);
  const expandedBranchId = useGraphStore((state) => state.expandedBranchId);
  const applyAiOperations = useGraphStore((state) => state.applyAiOperations);

  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [operations, setOperations] = useState<AiOperation[]>([]);
  const [applying, setApplying] = useState(false);

  /** 目标父节点：选中的节点能挂子节点就用它，否则往上找 */
  const parent = useMemo<Node | null>(() => {
    const candidates: (Node | null)[] = [
      selectedId ? (index.nodes.get(selectedId) ?? null) : null,
      expandedBranchId ? (index.nodes.get(expandedBranchId) ?? null) : null,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (allowedChildTypes(candidate.type).length > 0) return candidate;
      if (candidate.parentId) {
        const up = index.nodes.get(candidate.parentId);
        if (up && allowedChildTypes(up.type).length > 0) return up;
      }
    }
    return index.roots.length > 0 ? (index.nodes.get(index.roots[0]) ?? null) : null;
  }, [index, selectedId, expandedBranchId]);

  const reset = () => {
    setPreview(null);
    setImageBase64(null);
    setOperations([]);
    setLoading(false);
    setApplying(false);
  };

  const handleFile = (file: File) => {
    setMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setImageBase64(result.split(',')[1] ?? null);
      setOperations([]);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imageBase64 || !parent) return;
    setLoading(true);
    try {
      const lastChildId = childIds(index, parent.id).at(-1) ?? null;
      const prompt = buildPrompt({ parent, nodes: [...index.nodes.values()], lastChildId });
      const result = await generateOperations({ prompt, imageBase64, mimeType });
      setOperations(result.operations);
      if (result.operations.length === 0) toast.warning('模型没有给出任何操作。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '识别失败。');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const result = await applyAiOperations(operations);
      if (result.errors.length === 0) {
        reset();
        onClose();
      } else {
        toast.error(result.errors[0]);
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>从手写笔记生成节点</DialogTitle>
          <DialogDescription>
            上传一张手写笔记照片，模型会把它拆成节点和关系。
            {parent ? `目标父节点：${NODE_TYPE_META[parent.type].label}「${parent.title}」` : '先在左侧选一个父节点。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/40">
            <Upload className="h-4 w-4" />
            选择图片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>

          {preview && (
            <img src={preview} alt="待识别的手写笔记" className="max-h-56 w-auto rounded border" />
          )}

          {operations.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border bg-muted/30 p-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                将执行 {operations.length} 个操作（确认后才会写入）
              </p>
              <ol className="list-inside list-decimal space-y-0.5 text-xs">
                {operations.map((op, position) => (
                  <li key={`${op.op}-${position}`}>{describeOperation(op, index.nodes)}</li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>
            取消
          </Button>
          {operations.length === 0 ? (
            <Button onClick={() => void analyze()} disabled={!imageBase64 || loading || !parent}>
              {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              分析
            </Button>
          ) : (
            <Button onClick={() => void apply()} disabled={applying}>
              {applying && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              应用到图谱
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AiHandwritingDialog;
