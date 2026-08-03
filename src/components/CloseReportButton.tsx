"use client";
import { useState } from "react";

interface Report {
  text: string;
  date: string;
  time: string;
  closed?: boolean;
}

export function CloseReportButton({
  api = "/api/close-report",
  title = "장 마감 리포트",
  desc = "지수·수급·등락·신고저·시총상위·섹터·국채금리 마감 데이터를 텍스트로 저장",
  filePrefix = "signo-마감리포트",
}: {
  api?: string;
  title?: string;
  desc?: string;
  filePrefix?: string;
} = {}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(api);
      const j = await r.json();
      if (j.error || !j.data) throw new Error(j.error || "리포트 생성 실패");
      setReport(j.data as Report);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob([report.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filePrefix}-${report.date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("클립보드 복사 실패 (다운로드를 이용하세요)");
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-muted mt-0.5">
            {desc}
            {report && report.closed === false && " · 15:40 이전이라 장중 잠정치입니다"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "집계 중…" : report ? "새로고침" : "마감 데이터 생성"}
          </button>
          {report && (
            <>
              <button
                onClick={download}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand/50"
              >
                .txt 저장
              </button>
              <button
                onClick={copy}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand/50"
              >
                {copied ? "복사됨" : "복사"}
              </button>
            </>
          )}
        </div>
      </div>
      {err && <div className="mt-2 text-xs text-down">{err}</div>}
      {report && (
        <pre className="tnum mt-3 max-h-72 overflow-auto rounded-lg bg-canvas/60 p-3 text-[11px] leading-relaxed whitespace-pre">
          {report.text}
        </pre>
      )}
    </div>
  );
}
