import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

export function AiConfigSheet() {
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
      toast.error("All fields except API Key (if already saved) must be filled.");
      return;
    }

    if (selectedPreset.isDefault || presets.some(p => p.id === selectedPreset.id)) {
      // It's an existing preset
      updatePreset(selectedPreset.id, selectedPreset);
    } else {
      // It's a new preset
      addPreset(selectedPreset);
    }
    
    toast.success(`Preset "${selectedPreset.name}" saved successfully!`);
    setIsEditing(false);
  };
  
  const handleAddNew = () => {
    const newPresetTemplate: AiPreset = {
      id: 'new-preset', // Temporary ID
      name: 'New Custom Preset',
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
      toast.success(`Preset "${selectedPreset.name}" has been deleted.`);
      setActivePresetId(presets[0]?.id || null); // Fallback to first preset
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>AI Model Configuration</SheetTitle>
          <SheetDescription>
            Manage and select your AI model presets. Your configurations are saved locally.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 py-6">
          <div className="flex items-center gap-2">
            <Select value={activePresetId || ''} onValueChange={setActivePresetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a preset..." />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name} {preset.isDefault && "(Default)"}
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
                <Label htmlFor="preset-name">Preset Name</Label>
                <Input
                  id="preset-name"
                  value={selectedPreset.name}
                  onChange={(e) => handleUpdateField('name', e.target.value)}
                  readOnly={selectedPreset.isDefault && !isEditing}
                />
              </div>
              <div className="grid gap-2">
                <Label>Provider</Label>
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
                    <Label htmlFor="openai">OpenAI-Compatible</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="model-name">Model Name</Label>
                <Input
                  id="model-name"
                  value={selectedPreset.modelName}
                  onChange={(e) => handleUpdateField('modelName', e.target.value)}
                  readOnly={selectedPreset.isDefault && !isEditing}
                  placeholder="e.g., gemini-1.5-flash-latest or gpt-4o"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base-url">Base URL</Label>
                <Input
                  id="base-url"
                  value={selectedPreset.baseUrl}
                  onChange={(e) => handleUpdateField('baseUrl', e.target.value)}
                  readOnly={selectedPreset.isDefault && !isEditing}
                  placeholder="e.g., https://api.openai.com/v1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={selectedPreset.apiKey}
                  onChange={(e) => handleUpdateField('apiKey', e.target.value)}
                  placeholder="Enter your API key"
                />
              </div>
              <div className="flex justify-between mt-2">
                <div>
                  {!selectedPreset.isDefault && (
                    <Button variant="destructive" onClick={handleDelete}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {isEditing && (
                     <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                  )}
                  {!selectedPreset.isDefault || isEditing ? (
                    <Button onClick={handleSave}>Save Preset</Button>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>Edit</Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
