import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ActiveFormula {
  id: string;
  latex: string;
  title?: string;
}

interface AssistantState {
  messages: ChatMessage[];
  currentNarration: string | null;
  generatedSummary: string | null;
  activeFormulas: ActiveFormula[];

  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setNarration: (text: string | null) => void;
  setGeneratedSummary: (summary: string | null) => void;
  addFormula: (id: string, latex: string, title?: string) => void;
  removeFormula: (id: string) => void;
  clearFormulas: () => void;
  reset: () => void;
}

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const useAssistantStore = create<AssistantState>((set) => ({
  messages: [],
  currentNarration: null,
  generatedSummary: null,
  activeFormulas: [],

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, { ...message, id: makeId(), timestamp: Date.now() }],
    })),

  setNarration: (text) => set({ currentNarration: text }),
  setGeneratedSummary: (summary) => set({ generatedSummary: summary }),

  addFormula: (id, latex, title) =>
    set((state) => {
      const nextFormula = { id, latex, title };
      const exists = state.activeFormulas.some((formula) => formula.id === id);

      return {
        activeFormulas: exists
          ? state.activeFormulas.map((formula) => (formula.id === id ? nextFormula : formula))
          : [...state.activeFormulas, nextFormula],
      };
    }),

  removeFormula: (id) =>
    set((state) => ({
      activeFormulas: state.activeFormulas.filter((formula) => formula.id !== id),
    })),

  clearFormulas: () => set({ activeFormulas: [] }),

  reset: () => set({ messages: [], currentNarration: null, generatedSummary: null, activeFormulas: [] }),
}));
