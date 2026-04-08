"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "app_language";
const FALLBACK_LANG = "ru";
const SUPPORTED_LANGS = new Set(["ru", "en"]);

const I18nContext = createContext({
  lang: FALLBACK_LANG,
  locale: "ru-RU",
  setLang: () => {},
  toggleLang: () => {},
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window === "undefined") return FALLBACK_LANG;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.has(saved)) {
        return saved;
      }
    } catch {
      // ignore localStorage read errors
    }
    return FALLBACK_LANG;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore localStorage write errors
    }

    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((nextLang) => {
    if (SUPPORTED_LANGS.has(nextLang)) {
      setLangState(nextLang);
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === "ru" ? "en" : "ru"));
  }, []);

  const value = useMemo(
    () => ({
      lang,
      locale: lang === "ru" ? "ru-RU" : "en-US",
      setLang,
      toggleLang,
    }),
    [lang, setLang, toggleLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
