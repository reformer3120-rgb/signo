"use client";
import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

function apply(pc: boolean) {
  const m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute("content", pc ? "width=1280" : "width=device-width, initial-scale=1");
}

export function ViewportToggle() {
  const [pc, setPc] = useState(false);

  useEffect(() => {
    setPc(localStorage.getItem("signo-view") === "pc");
  }, []);

  const toggle = () => {
    const n = !pc;
    setPc(n);
    try {
      localStorage.setItem("signo-view", n ? "pc" : "mobile");
    } catch {}
    apply(n);
  };

  return (
    <button
      onClick={toggle}
      aria-label="PC/모바일 화면 전환"
      className="flex items-center gap-1 h-9 px-2.5 rounded-full bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors"
    >
      {pc ? <Smartphone size={14} /> : <Monitor size={14} />}
      <span>{pc ? "모바일" : "PC화면"}</span>
    </button>
  );
}
