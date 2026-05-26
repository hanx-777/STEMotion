import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  rightPanelOpen: true,
  
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen }))
}));
