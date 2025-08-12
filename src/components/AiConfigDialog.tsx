import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAiConfigStore, type AiPreset, type AiProvider } from "@/stores/useAiConfigStore";
import { Settings, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function AiConfigDialog() {
  const presets = useAiConfigStore((state) => state.presets);
  const activePresetId = useAiConfigStore((state) => state.activePresetId);
  const setActivePresetId = useAiConfigStore((state) => state.setActivePresetId);
  const addPreset = useAiConfigStore((state) => state.addPreset);
  const updatePreset = useAiConfigStore((state) => state.updatePreset);
  const deletePreset = useAiConfigStore((state) => state.deletePreset);

  const [selectedPreset, setSelectedPreset] = useState<AiPreset | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const activePreset = presets.find(p => p.id === activePresetId);
    setSelectedPreset(activePreset || null);
    setIsEditing(false); // Reset editing state when preset changes
  }, [activePresetId, presets]);

  const handleUpdateField = (field: keyof AiPreset, value: string) => {
    if (selectedPreset) {
      setSelectedPreset({ ...selectedPreset, [field]: value });
    }
  };

  const handleSave = () => {
    if (!selectedPreset) return;

    if (!selectedPreset.name || !selectedPreset.apiKey || !selectedPreset.modelName || !selectedPreset.baseUrl) {
      toast.error("除 API 密钥外，所有字段均为必填项。");
      return;
    }

    if (selectedPreset.isDefault || presets.some(p => p.id === selectedPreset.id)) {
      // It's an existing preset
      updatePreset(selectedPreset.id, selectedPreset);
    } else {
      // It's a new preset
      addPreset(selectedPreset);
    }
    
    toast.success(`预设 "${selectedPreset.name}" 已成功保存！`);
    setIsEditing(false);
  };
  
  const handleAddNew = () => {
    const newPresetTemplate: AiPreset = {
      id: 'new-preset', // Temporary ID
      name: '新的自定义预设',
      provider: 'openai',
      apiKey: '',
      modelName: 'gpt-4o',
      baseUrl: '',
      isDefault: false,
    };
    setSelectedPreset(newPresetTemplate);
    setActivePresetId(null); // Deselect active preset
    setIsEditing(true);
  };

  const handleDelete = () => {
    if (selectedPreset && !selectedPreset.isDefault) {
      deletePreset(selectedPreset.id);
      toast.success(`预设 "${selectedPreset.name}" 已被删除。`);
      setActivePresetId(presets[0]?.id || null); // Fallback to first preset
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>AI 模型配置</DialogTitle>
          <DialogDescription>
            管理并选择您的 AI 模型预设。您的配置将保存在本地浏览器中。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-6">
          <div className="flex items-center gap-2">
            <Select value={activePresetId || ''} onValueChange={setActivePresetId}>
              <SelectTrigger>
                <SelectValue placeholder="选择一个预设..." />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name} {preset.isDefault && "(默认)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {selectedPreset && (
            <div className="grid gap-4 p-4 border rounded-lg animate-in fade-in">
              <div className="grid gap-2">
                <Label htmlFor="preset-name">预设名称</Label>
                <Input
                  id="preset-name"
                  value={selectedPreset.name}
                  onChange={(e) => handleUpdateField('name', e.target.value)}
                  readOnly={selectedPreset.isDefault && !isEditing}
                />
              </div>
              <div className="grid gap-2">
                <Label>提供商</Label>
                <RadioGroup
                  value={selectedPreset.provider}
                  onValueChange={(value) => handleUpdateField('provider', value as AiProvider)}
                  disabled={selectedPreset.isDefault && !isEditing}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="gemini" id="gemini" />
                    <Label htmlFor="gemini">Gemini</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="openai" id="openai" />
                    <Label htmlFor="openai">OpenAI 兼容</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="model-name">模型名称</Label>
                <Input
                  id="model-name"
                  value={selectedPreset.modelName}
                  onChange={(e) => handleUpdateField('modelName', e.target.value)}
                  readOnly={selectedPreset.isDefault && !isEditing}
                  placeholder="例如, gemini-1.5-flash-latest 或 gpt-4o"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base-url">接口地址 (Base URL)</Label>
                <Input
                  id="base-url"
                  value={selectedPreset.baseUrl}
                  onChange={(e) => handleUpdateField('baseUrl', e.target.value)}
                  readOnly={selectedPreset.isDefault && !isEditing}
                  placeholder="例如, https://api.openai.com/v1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api-key">API 密钥</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={selectedPreset.apiKey}
                  onChange={(e) => handleUpdateField('apiKey', e.target.value)}
                  placeholder="输入您的 API 密钥"
                />
              </div>
              <div className="flex justify-between mt-2">
                <div>
                  {!selectedPreset.isDefault && (
                    <Button variant="destructive" onClick={handleDelete}>
                      <Trash2 className="mr-2 h-4 w-4" /> 删除
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {isEditing && (
                     <Button variant="outline" onClick={() => setIsEditing(false)}>取消</Button>
                  )}
                  {!selectedPreset.isDefault || isEditing ? (
                    <Button onClick={handleSave}>保存预设</Button>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>编辑</Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
