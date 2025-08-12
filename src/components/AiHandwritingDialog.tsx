import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import { processHandwritingImage } from "@/lib/ai-service";
import { toast } from "sonner";
import { Upload, X, CheckCircle, Loader } from "lucide-react";
import type { AiOperation } from "@/lib/types";

export function AiHandwritingDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const executeAiOperation = useAppStore((state) => state.executeAiOperation);
  const selectedNode = useAppStore((state) => state.selectedNode);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      toast.error("Please select an image file first.");
      return;
    }
    if (!selectedNode) {
      toast.error("Please select a parent node in the tree first.");
      return;
    }

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async (event) => {
        const base64String = event.target?.result as string;
        const responseJson = await processHandwritingImage(base64String, selectedNode.id);
        
        // The AI service should return a clean JSON string.
        const operations: AiOperation[] = JSON.parse(responseJson);

        toast.info(`Received ${operations.length} operations from AI. Executing...`);

        for (const op of operations) {
          await executeAiOperation(op);
        }

        toast.success("Handwritten notes processed and added successfully!");
        resetState();
      };
      reader.onerror = (error) => {
        throw new Error("Failed to read file: " + error);
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetState} disabled={isProcessing}>
            取消
          </Button>
          <Button onClick={handleProcess} disabled={!file || isProcessing}>
            {isProcessing ? (
              <Loader className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            开始处理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
