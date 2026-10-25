import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useGraphStore } from '@/stores/useGraphStore';
import { buildPrompt, describeOperation, generateOperations } from '@/lib/ai';
import { childIds } from '@/lib/graph';
import { allowedChildTypes, type AiOperation, type Node } from '@/lib/schema';
import { toast } from 'sonner';
import { Upload, X, CheckCircle, Loader } from 'lucide-react';

export function AiHandwritingDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [operations, setOperations] = useState<AiOperation[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const index = useGraphStore((state) => state.index);
  const selectedId = useGraphStore((state) => state.selectedId);
  const expandedBranchId = useGraphStore((state) => state.expandedBranchId);
  const applyAiOperations = useGraphStore((state) => state.applyAiOperations);

  const resolveParent = (): Node | null => {
    const candidates: (Node | undefined)[] = [
      selectedId ? index.nodes.get(selectedId) : undefined,
      expandedBranchId ? index.nodes.get(expandedBranchId) : undefined,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (allowedChildTypes(candidate.type).length > 0) return candidate;
      const up = candidate.parentId ? index.nodes.get(candidate.parentId) : undefined;
      if (up && allowedChildTypes(up.type).length > 0) return up;
    }
    const firstRoot = index.roots[0] ? index.nodes.get(index.roots[0]) : undefined;
    return firstRoot ?? null;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setOperations([]);
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        setBase64(result.split(',')[1] ?? null);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleProcess = async () => {
    if (!base64) {
      toast.error('请先选择一张图片。');
      return;
    }
    const parent = resolveParent();
    if (!parent) {
      toast.error('请先在目录里选择一个父节点。');
      return;
    }

    setIsProcessing(true);
    try {
      const lastChildId = childIds(index, parent.id).at(-1) ?? null;
      const prompt = buildPrompt({ parent, nodes: [...index.nodes.values()], lastChildId });
      const result = await generateOperations({
        prompt,
        imageBase64: base64,
        mimeType: file?.type || 'image/jpeg',
      });
      setOperations(result.operations);
      if (result.operations.length === 0) {
        toast.warning('模型没有给出任何操作。');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '识别失败。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const result = await applyAiOperations(operations);
      if (result.errors.length === 0) {
        resetState();
      } else {
        toast.error(result.errors[0]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setBase64(null);
    setOperations([]);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : resetState())}>
      <DialogTrigger asChild>
        <Button variant="customBlue" className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          处理手写笔记
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>处理手写笔记</DialogTitle>
          <DialogDescription>
            上传您的手写笔记图片，AI 将会为您转录并整理。
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div
            className="relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/webp"
            />
            {preview ? (
              <>
                <img src={preview} alt="Preview" className="object-contain h-full w-full rounded-md" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setPreview(null);
                    setBase64(null);
                    setOperations([]);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  点击或拖拽以上传图片
                </p>
                <p className="text-xs text-muted-foreground">
                  支持 PNG, JPG, 或 WEBP 格式
                </p>
              </div>
            )}
          </div>

          {operations.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-md border p-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                将执行 {operations.length} 个操作（确认后才会写入）
              </p>
              <ol className="list-inside list-decimal space-y-0.5 text-xs text-muted-foreground">
                {operations.map((op, position) => (
                  <li key={`${op.op}-${position}`}>{describeOperation(op, index.nodes)}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetState} disabled={isProcessing}>
            取消
          </Button>
          {operations.length === 0 ? (
            <Button onClick={handleProcess} disabled={!file || isProcessing}>
              {isProcessing ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              开始处理
            </Button>
          ) : (
            <Button onClick={handleApply} disabled={isProcessing}>
              {isProcessing ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              应用到图谱
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
