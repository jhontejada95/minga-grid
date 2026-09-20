"use client";

import { useT } from "@/lib/lang";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useT();

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center rounded-md border p-0.5 text-[11px] font-semibold uppercase tracking-wider ${className}`}
      style={{
        borderColor: "#1E293B",
        background: "#0A0E15",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`rounded px-2.5 py-1 transition-all ${
          lang === "en"
            ? "shadow-sm"
            : "hover:text-[#94A3B8]"
        }`}
        style={{
          background: lang === "en" ? "#1E293B" : "transparent",
          color: lang === "en" ? "#F8FAFC" : "#64748B",
        }}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("es")}
        aria-pressed={lang === "es"}
        className={`rounded px-2.5 py-1 transition-all ${
          lang === "es"
            ? "shadow-sm"
            : "hover:text-[#94A3B8]"
        }`}
        style={{
          background: lang === "es" ? "#1E293B" : "transparent",
          color: lang === "es" ? "#F8FAFC" : "#64748B",
        }}
      >
        ES
      </button>
    </div>
  );
}
