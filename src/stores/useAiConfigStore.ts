import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export type AiProvider = 'gemini' | 'openai';

export interface AiPreset {
  id: string;
  name: string;
  provider: AiProvider;
  apiKey: string;
  modelName: string;
  baseUrl: string;
  isDefault?: boolean; // To prevent deletion of default presets
}

interface AiConfigState {
  presets: AiPreset[];
  activePresetId: string | null;
  getPresetById: (id: string) => AiPreset | undefined;
  getActivePreset: () => AiPreset | undefined;
  setActivePresetId: (id: string | null) => void;
  addPreset: (preset: Omit<AiPreset, 'id'>) => void;
  updatePreset: (id: string, updates: Partial<Omit<AiPreset, 'id' | 'isDefault'>>) => void;
  deletePreset: (id: string) => void;
}

const defaultPresets: AiPreset[] = [
  {
    id: 'default-gemini-official',
    name: 'Gemini (Official)',
    provider: 'gemini',
    apiKey: '',
    modelName: 'gemini-1.5-flash-latest',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    isDefault: true,
  },
  {
    id: 'default-gemini-proxy',
    name: 'Gemini (Project Proxy)',
    provider: 'gemini',
    apiKey: '',
    modelName: 'gemini-1.5-flash-latest',
    baseUrl: '/api/geminiProxy/v1beta',
    isDefault: true,
  },
  {
    id: 'default-openai-official',
    name: 'OpenAI (Official)',
    provider: 'openai',
    apiKey: '',
    modelName: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    isDefault: true,
  },
];

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      presets: defaultPresets,
      activePresetId: defaultPresets[0].id, // Default to the first preset
      
      getPresetById: (id) => get().presets.find(p => p.id === id),

      getActivePreset: () => {
        const { presets, activePresetId } = get();
        return presets.find(p => p.id === activePresetId);
      },

      setActivePresetId: (id) => set({ activePresetId: id }),

      addPreset: (preset) => {
        const newPreset = { ...preset, id: uuidv4() };
        set((state) => ({ presets: [...state.presets, newPreset] }));
      },

      updatePreset: (id, updates) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      deletePreset: (id) => {
        set((state) => ({
          presets: state.presets.filter((p) => !(p.id === id && !p.isDefault)),
        }));
      },
    }),
    {
      name: 'ai-preset-config-storage',
      storage: createJSONStorage(() => localStorage),
      // A custom merge function to ensure default presets are always present
      merge: (persistedState, currentState) => {
        const persisted = persistedState as AiConfigState;
        if (!persisted || !persisted.presets) {
          return currentState;
        }
        // Ensure default presets are always there and updated if needed
        const mergedPresets = [...defaultPresets];
        const persistedCustomPresets = persisted.presets.filter(p => !p.isDefault);
        
        // Simple merge: just add the custom presets from storage
        // A more complex merge could update existing custom presets
        mergedPresets.push(...persistedCustomPresets);

        return {
          ...currentState,
          ...persisted,
          presets: mergedPresets,
        };
      },
    }
  )
);
