import Image from "next/image";
import { ThemeToggle } from "./ThemeToggle";
import { ViewportToggle } from "./ViewportToggle";

const EN_TO_KR: Record<string, string> = {
  Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토",
};

function seoulNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const wd = get("weekday"); // "Wed"
  const isWeekend = wd === "Sat" || wd === "Sun";
  return {
    label: `${y}.${m}.${d} (${EN_TO_KR[wd] ?? wd})`,
    status: isWeekend ? "휴장 · 주말" : "장 운영일",
    open: !isWeekend,
  };
}

export function SignoHeader() {
  const { label, status, open } = seoulNow();
  return (
    <header className="relative overflow-hidden rounded-3xl px-6 py-5 md:px-8 shadow-[0_30px_70px_-30px_rgba(20,22,60,.55)] bg-[linear-gradient(120deg,#3844BE_0%,#232A7A_55%,#1B2064_100%)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid place-items-center w-14 h-14 rounded-2xl bg-white shadow-lg overflow-hidden shrink-0">
            <Image src="/brand/signo-icon.png" alt="SIGNO" width={54} height={54} priority />
          </div>
          <div>
            <p className="font-[family-name:var(--font-grotesk)] text-white text-3xl font-bold tracking-[0.14em] leading-none">
              SIGNO
            </p>
            <p className="text-[#C7CBF0] text-xs md:text-sm mt-1.5">
              실시간 AI 주식 시그널 · KRX 마켓 대시보드
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="tnum text-white text-base md:text-lg font-bold">{label}</div>
            <span
              className={`inline-block mt-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${
                open ? "bg-confirm/30" : "bg-white/15"
              }`}
            >
              {status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ViewportToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
