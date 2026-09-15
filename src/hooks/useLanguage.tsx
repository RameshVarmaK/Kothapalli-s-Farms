import { createContext, useContext, useState, ReactNode } from 'react';
import { te } from '../i18n/te';

type Language = 'en' | 'te';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('language');
      return (saved as Language) || 'en';
    }
    return 'en';
  });

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', next);
    }
  };

  const t = (text: string): string => {
    if (language === 'en') return text;
    return te[text] || text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
