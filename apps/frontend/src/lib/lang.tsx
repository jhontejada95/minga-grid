"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { t as translate, type CopyKey, type Lang } from "@minga/shared";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: CopyKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key: CopyKey) => translate(key, "en"),
});

const STORAGE_KEY = "minga_grid_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // English is the default, ALWAYS, on initial server and client render to prevent hydration mismatch
  const [lang, setLangState] = useState<Lang>("en");

  // Read stored language only after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "es" || stored === "en") {
        setLangState(stored);
        document.documentElement.lang = stored;
      } else {
        document.documentElement.lang = "en";
      }
    } catch {
      // localStorage may throw in private browsing mode
      document.documentElement.lang = "en";
    }
  }, []);

  const setLang = useCallback((nextLang: Lang) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_KEY, nextLang);
    } catch {}
    if (typeof document !== "undefined") {
      document.documentElement.lang = nextLang;
    }
  }, []);

  const t = useCallback(
    (key: CopyKey) => translate(key, lang),
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
