"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { I18nProvider, useI18n } from "@/lib/i18n";

const ReportView = dynamic(() => import("@/components/ReportView"), {
  ssr: false,
  loading: () => (
    <div className="report-loading">
      <div className="spinner" style={{ width: 32, height: 32 }} />
      <div>Loading...</div>
    </div>
  ),
});

function ReportContent() {
  const searchParams = useSearchParams();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const points = useMemo(() => {
    const raw = searchParams.get("points");
    if (!raw) return [];

    return raw
      .split("|")
      .map((pair, idx) => {
        const [latStr, lngStr] = pair.split(",");
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (isNaN(lat) || isNaN(lng)) return null;
        return {
          lat,
          lng,
          id: `report-point-${idx}`,
          label: isRu ? `Точка ${idx + 1}` : `Point ${idx + 1}`,
        };
      })
      .filter(Boolean)
      .slice(0, 5);
  }, [searchParams, isRu]);

  return <ReportView points={points} />;
}

function ReportPageContent() {
  const { lang } = useI18n();
  const isRu = lang === "ru";

  return (
    <div className="report-page">
      <nav className="report-nav">
        <Link href="/" className="report-nav-back">
          {isRu ? "← Вернуться к карте" : "← Back to map"}
        </Link>
        <span className="report-nav-title">Climate Risk Intelligence</span>
      </nav>
      <Suspense
        fallback={
          <div className="report-loading">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <div>{isRu ? "Загрузка отчёта..." : "Loading report..."}</div>
          </div>
        }
      >
        <ReportContent />
      </Suspense>
    </div>
  );
}

export default function ReportPage() {
  return (
    <I18nProvider>
      <ReportPageContent />
    </I18nProvider>
  );
}
