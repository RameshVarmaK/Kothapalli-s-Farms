import { createContext, useContext, useState, ReactNode } from 'react';

type ViewMode = 'basic' | 'power';

interface ViewModeContextType {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ViewMode>(() => {
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('viewMode');
      return (saved as ViewMode) || 'basic';
    }
    return 'basic';
  });

  const handleSetMode = (newMode: ViewMode) => {
    setMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('viewMode', newMode);
    }
  };

  return (
    <ViewModeContext.Provider value={{ mode, setMode: handleSetMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within ViewModeProvider');
  }
  return context;
}
