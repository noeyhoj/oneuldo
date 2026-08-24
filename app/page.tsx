"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Goal = {
  id: string;
  title: string;
  done: boolean;
  reason?: string;
  note?: string;
  carry?: boolean;
  carriedFrom?: string;
};

type DailyRecord = {
  date: string;
  done: string[];
  extraDone?: string[];
  unfinished: { title: string; reason: string; note: string; carry: boolean }[];
  headline?: string;
  note: string;
  syncedUntilMidnight?: boolean;
};

type PendingCarryover = {
  id: string;
  title: string;
  sourceDate: string;
  targetDate: string;
};

type Settings = {
  morning: string;
  evening: string;
  cheer: "거의 없음" | "가끔" | "자주";
  character: boolean;
  characterSize: "small" | "medium" | "large";
  theme: "coral" | "sage" | "lavender";
  animal: "cat" | "dog" | "rabbit" | "bear";
};

const REASONS = ["시간이 부족했어요", "우선순위가 바뀌었어요", "생각보다 어려웠어요", "컨디션이 좋지 않았어요"];

const dateKey = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const readPendingCarryovers = (): PendingCarryover[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem("oneuldo-pending-carryovers") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const getDueCarryovers = (today: string) => readPendingCarryovers().filter((item) => item.targetDate <= today);

const addDaysToDateKey = (sourceDate: string, days: number) => {
  const date = new Date(`${sourceDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const KOREAN_COUNTS = ["영", "한", "두", "세", "네", "다섯"];
const KOREAN_ORDINALS = ["영 번째", "첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"];
const koreanCount = (value: number) => KOREAN_COUNTS[value] || String(value);
const koreanOrdinal = (value: number) => KOREAN_ORDINALS[value] || `${value}번째`;
const humanizeCountPhrases = (text = "") => text.replace(/([1-5])가지/g, (_, value: string) => `${koreanCount(Number(value))} 가지`);

const buildCompanionReflection = (done: string[], unfinished: DailyRecord["unfinished"]) => {
  const joined = done.join(" ");
  const has = (words: string[]) => words.some((word) => joined.includes(word));
  const carried = unfinished.filter((item) => item.carry);
  const reasons = unfinished.map((item) => item.reason);
  const allDone = done.length > 0 && unfinished.length === 0;

  if (!done.length) {
    if (reasons.some((reason) => reason.includes("컨디션"))) return { headline: "오늘은 나를 쉬게 해준 날이야.", note: "몸과 마음이 지친 날에는 쉬어가는 것도 꼭 필요한 일이야. 오늘을 돌아봐준 것만으로 충분해." };
    if (carried.length) return { headline: "내일의 나에게 길을 잘 남겨뒀어.", note: "오늘 다 하지 못했어도 괜찮아. 다시 이어갈 일을 스스로 골라둔 것도 분명한 한 걸음이야." };
    return { headline: "오늘을 돌아본 것부터 잘했어.", note: "완료 표시가 없는 날에도 애쓴 시간은 사라지지 않아. 여기까지 와서 하루를 살펴본 마음을 기억할게." };
  }
  if (allDone) return { headline: "마음에 담은 일을 모두 해냈어.", note: "오늘의 약속을 하나씩 지켜낸 리듬이 참 멋져. 이 뿌듯함을 오래 기억해둘게." };
  if (reasons.some((reason) => reason.includes("컨디션")) && has(["산책", "운동", "요가", "달리기", "스트레칭"])) return { headline: "피곤한 날에도 나를 잘 돌봤어.", note: "컨디션이 좋지 않은 날에도 나를 위한 움직임은 챙겼어. 무리하지 않으면서도 마음을 돌본 오늘이 참 다정해." };
  if (has(["산책", "운동", "요가", "달리기", "스트레칭"])) return { headline: "오늘, 나를 잘 돌봤어.", note: "바쁜 하루 속에서도 몸과 마음을 위한 시간을 만들었어. 나를 챙긴 선택도 소중한 성취야." };
  if (has(["공부", "책", "읽기", "강의", "알고리즘", "연습"])) return { headline: "오늘의 배움을 차곡차곡 쌓았어.", note: "지금은 작아 보여도 오늘 익힌 한 가지가 내일의 나를 든든하게 만들어줄 거야." };
  if (has(["기획", "프로젝트", "포트폴리오", "보고서", "회의", "문구", "화면", "PR"])) return { headline: "복잡한 일을 한 걸음 앞으로 옮겼어.", note: "막연했던 일을 눈에 보이는 모양으로 바꿔냈어. 오늘 만든 한 조각이 다음 걸음을 더 가볍게 해줄 거야." };
  if (has(["전화", "연락", "가족", "친구", "만나"])) return { headline: "따뜻한 마음을 잘 건넸어.", note: "소중한 사람을 떠올리고 마음을 건넨 일도 오늘의 아름다운 성취야." };
  if (carried.length) return { headline: `${koreanCount(done.length)} 가지나 해내고, 내일의 길도 골랐어.`, note: "해낸 일은 충분히 기뻐하고, 남은 일은 부담 대신 선택으로 남겼어. 오늘을 참 현명하게 정리했어." };
  return { headline: `오늘 ${koreanCount(done.length)} 가지나 앞으로 나아갔어.`, note: "크고 작은 일을 해낸 순간들이 모여 오늘의 발자국이 됐어. 네가 움직인 만큼을 다정하게 기억할게." };
};

const LEGACY_SAMPLE_GOAL_IDS = new Set(["welcome-1", "welcome-2", "welcome-3"]);
const removeLegacySampleGoals = (goals: Goal[]) => goals.filter((goal) => !LEGACY_SAMPLE_GOAL_IDS.has(goal.id));
const isLegacySampleRecord = (record: DailyRecord) => {
  const done = record.done.join("\u0000");
  if (record.note === "계획보다 적어도, 꼭 해내고 싶었던 건 다 해냈어.") return done === "프로젝트 회의\u0000알고리즘 문제 1개" && record.unfinished.length === 0;
  if (record.note === "피곤한 날에도 나를 위한 산책은 챙겼어.") {
    const [unfinished] = record.unfinished;
    return done === "포트폴리오 문구 다듬기\u0000산책 20분"
      && record.unfinished.length === 1
      && unfinished.title === "책 30쪽 읽기"
      && unfinished.reason === "컨디션이 좋지 않았어요"
      && unfinished.note === "퇴근 후에 너무 피곤했다."
      && unfinished.carry === true;
  }
  return record.note === "오늘 세 가지나 앞으로 나아갔어."
    && done === "PR 작성하기\u0000운동 30분\u0000엄마에게 전화하기"
    && record.unfinished.length === 0;
};
const removeLegacySampleRecords = (records: DailyRecord[]) => records.filter((record) => !isLegacySampleRecord(record));

const MATE_OPTIONS = [
  { value: "cat", label: "고양이", description: "조용히 곁을 지켜줄게요", asset: "./mates/mate-cat-sign-3d.png" },
  { value: "dog", label: "강아지", description: "작은 성취도 함께 기뻐해요", asset: "./mates/mate-dog-sign-3d.png" },
  { value: "rabbit", label: "토끼", description: "당신의 리듬을 천천히 따라갈게요", asset: "./mates/mate-rabbit-sign-3d.png" },
  { value: "bear", label: "곰", description: "지친 날에는 포근하게 응원해요", asset: "./mates/mate-bear-sign-3d.png" },
] as const;
const MATE_CHEERS = [
  "오늘의 속도도 충분히 너다워 🌿",
  "작은 한 칸도 분명한 전진이야.",
  "조금 지친 날엔 숨을 고르는 것도 좋은 일이야.",
  "서두르지 않아도 방향은 그대로야.",
  "지금 여기까지 온 것도 참 잘했어.",
  "오늘의 작은 용기를 내가 기억할게 ✨",
];
const goalAwareMateCheers = (goals: Goal[]) => {
  const openGoal = goals.find((goal) => !goal.done);
  return [
    ...MATE_CHEERS,
    openGoal && `“${openGoal.title}”도 오늘의 속도에 맞춰 한 걸음씩 가보자.`,
  ].filter((message): message is string => Boolean(message));
};
const APP_VERSION = "1.22.0";
const BUG_REPORT_EMAIL = "dryzero0@gmail.com";
const BUG_REPORT_MAILTO = `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(`[오늘도 ${APP_VERSION}] 버그 제보`)}&body=${encodeURIComponent(`안녕하세요. 오늘도 앱을 사용하다 발견한 문제를 제보합니다.

• 앱 버전: ${APP_VERSION}
• macOS 버전:

[발생한 문제]


[재현 방법]
1.
2.

[기대한 동작]


[스크린샷 또는 참고 내용]
`)}`;

const initialSettings: Settings = { morning: "09:00", evening: "18:00", cheer: "가끔", character: true, characterSize: "medium", theme: "coral", animal: "cat" };

const timeToMinutes = (value: string) => {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
};

const normalizeToTenMinutes = (value: string) => {
  const [hour = "0", minute = "0"] = value.split(":");
  const safeHour = Math.min(23, Math.max(0, Number(hour) || 0));
  const safeMinute = Math.min(50, Math.max(0, Math.floor((Number(minute) || 0) / 10) * 10));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
};

const keepTimesInOrder = (settings: Settings): Settings => {
  const normalized = { ...settings, morning: normalizeToTenMinutes(settings.morning), evening: normalizeToTenMinutes(settings.evening) };
  return timeToMinutes(normalized.evening) < timeToMinutes(normalized.morning)
    ? { ...normalized, evening: normalized.morning }
    : normalized;
};

export default function Home() {
  const [view, setView] = useState<"today" | "review" | "records">("today");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [newGoal, setNewGoal] = useState("");
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [message, setMessage] = useState("오늘의 속도도 충분히 너다워 🌿");
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [activeDate, setActiveDate] = useState(dateKey());
  const [hydrated, setHydrated] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingFresh, setOnboardingFresh] = useState(false);
  const [dueCarryovers, setDueCarryovers] = useState<PendingCarryover[]>([]);

  /* Local storage is an external client-only source, so hydration intentionally updates state here. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const storedGoals = localStorage.getItem("oneuldo-goals");
    const storedGoalsDate = localStorage.getItem("oneuldo-goals-date");
    const storedRecords = localStorage.getItem("oneuldo-records");
    const storedSettings = localStorage.getItem("oneuldo-settings");
    const today = dateKey();
    const due = getDueCarryovers(today);
    setDueCarryovers(due);
    if (storedGoals) {
      const parsedGoals = JSON.parse(storedGoals) as Goal[];
      const cleanedGoals = removeLegacySampleGoals(Array.isArray(parsedGoals) ? parsedGoals : []);
      if (cleanedGoals.length !== parsedGoals.length) localStorage.setItem("oneuldo-goals", JSON.stringify(cleanedGoals));
      if (storedGoalsDate && storedGoalsDate !== today) setGoals([]);
      else setGoals(cleanedGoals);
    } else if (due.length) setGoals([]);
    if (storedRecords) {
      const parsedRecords = JSON.parse(storedRecords) as DailyRecord[];
      const cleanedRecords = removeLegacySampleRecords(Array.isArray(parsedRecords) ? parsedRecords : []);
      setRecords(cleanedRecords);
      if (cleanedRecords.length !== parsedRecords.length) localStorage.setItem("oneuldo-records", JSON.stringify(cleanedRecords));
    }
    if (storedSettings) setSettings(keepTimesInOrder({ ...initialSettings, ...JSON.parse(storedSettings) }));
    const onboarded = localStorage.getItem("oneuldo-onboarded");
    if (!onboarded) {
      setGoals([]);
      setRecords([]);
      setOnboardingFresh(true);
      setOnboardingOpen(true);
    }
    localStorage.setItem("oneuldo-goals-date", today);
    setActiveDate(today);
    if (due.length) setMessage(`${koreanCount(due.length)} 가지가 어제에서 기다리고 있어. 오늘에 넣을 일만 천천히 골라보자 🌿`);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("oneuldo-goals", JSON.stringify(goals));
    localStorage.setItem("oneuldo-goals-date", activeDate);
    localStorage.setItem("oneuldo-records", JSON.stringify(records));
    localStorage.setItem("oneuldo-settings", JSON.stringify(settings));
  }, [goals, records, settings, activeDate, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const rollOverDay = () => {
      const today = dateKey();
      if (today === activeDate) return;
      const due = getDueCarryovers(today);
      setGoals([]);
      setDueCarryovers(due);
      setActiveDate(today);
      setMessage(due.length ? `${koreanCount(due.length)} 가지가 어제에서 기다리고 있어. 오늘에 넣을 일만 골라도 충분해 🌿` : "새로운 하루야. 오늘 마음에 담아둘 일을 천천히 골라보자.");
    };
    const timer = window.setInterval(rollOverDay, 30_000);
    window.addEventListener("focus", rollOverDay);
    document.addEventListener("visibilitychange", rollOverDay);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", rollOverDay);
      document.removeEventListener("visibilitychange", rollOverDay);
    };
  }, [activeDate, hydrated]);

  const completeCount = goals.filter((goal) => goal.done).length;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);
  const reviewedToday = records.some((record) => record.date === activeDate);
  const openRecords = () => {
    const today = dateKey();
    setSelectedDate(records.some((record) => record.date === today) ? today : addDaysToDateKey(today, -1));
    setView("records");
  };
  const talkToGoalMate = () => {
    const candidates = goalAwareMateCheers(goals).filter((candidate) => candidate !== message);
    setMessage(candidates[Math.floor(Math.random() * candidates.length)] || MATE_CHEERS[0]);
  };

  useEffect(() => {
    if (!hydrated || !reviewedToday) return;
    const goalDone = goals.filter((goal) => goal.done).map((goal) => goal.title);
    const unfinished = goals.filter((goal) => !goal.done).map((goal) => ({
      title: goal.title,
      reason: goal.reason || "회고 후에 더한 목표예요",
      note: goal.note || "",
      carry: Boolean(goal.carry),
    }));
    // A saved review mirrors the live goal list until the date rolls over.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords((current) => current.map((record) => {
      if (record.date !== activeDate) return record;
      const extraDone = record.extraDone || [];
      const done = [...new Set([...goalDone, ...extraDone])];
      const reflection = buildCompanionReflection(done, unfinished);
      const syncedRecord: DailyRecord = { ...record, done, extraDone, unfinished, headline: reflection.headline, note: reflection.note, syncedUntilMidnight: true };
      return JSON.stringify(record) === JSON.stringify(syncedRecord) ? record : syncedRecord;
    }));

    const otherDays = readPendingCarryovers().filter((item) => item.sourceDate !== activeDate);
    const tomorrow = addDaysToDateKey(activeDate, 1);
    const currentCarries = goals
      .filter((goal) => !goal.done && goal.carry)
      .map<PendingCarryover>((goal) => ({ id: goal.id, title: goal.title, sourceDate: activeDate, targetDate: tomorrow }));
    localStorage.setItem("oneuldo-pending-carryovers", JSON.stringify([...otherDays, ...currentCarries]));
  }, [goals, activeDate, hydrated, reviewedToday]);

  const addGoal = (event: FormEvent) => {
    event.preventDefault();
    const title = newGoal.trim();
    if (!title) return;
    if (goals.length >= 5) {
      setMessage("오늘은 이 다섯 가지면 충분해. 욕심내지 않아도 괜찮아 🌿");
      return;
    }
    setGoals((current) => [...current, { id: crypto.randomUUID(), title, done: false }]);
    setNewGoal("");
    setAdding(false);
    setMessage("오늘 지키고 싶은 작은 약속, 내가 잘 기억해둘게.");
  };

  const toggleGoal = (id: string) => {
    const target = goals.find((goal) => goal.id === id);
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, done: !goal.done } : goal));
    if (target && !target.done) {
      const nextCount = completeCount + 1;
      setMessage(nextCount === 1 ? "첫 번째 약속을 지켰네. 오늘의 좋은 시작이야 🎉" : nextCount === goals.length ? "오늘의 약속을 모두 지켰네. 정말 다정한 하루야!" : `오늘의 ${koreanOrdinal(nextCount)} 작은 성취도 잘 기억할게 ✨`);
    } else {
      setMessage("괜찮아. 다시 시작하고 싶을 때 천천히 돌아오면 돼.");
    }
  };

  useEffect(() => {
    const handleMenuToggle = (event: Event) => toggleGoal((event as CustomEvent<string>).detail);
    const handleCharacterVisibility = (event: Event) => setSettings((current) => ({ ...current, character: Boolean((event as CustomEvent<boolean>).detail) }));
    window.addEventListener("oneuldo:toggle-goal", handleMenuToggle);
    window.addEventListener("oneuldo:set-character-visibility", handleCharacterVisibility);
    return () => {
      window.removeEventListener("oneuldo:toggle-goal", handleMenuToggle);
      window.removeEventListener("oneuldo:set-character-visibility", handleCharacterVisibility);
    };
  });

  const updateGoal = (id: string, patch: Partial<Goal>) => {
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, ...patch } : goal));
  };

  const resolveCarryover = (item: PendingCarryover, action: "accept" | "skip") => {
    if (action === "accept" && goals.length >= 5) {
      setMessage("오늘의 다섯 칸이 모두 찼어. 한 칸을 비우면 이 일을 다시 선택할 수 있어.");
      return;
    }
    const alreadyAdded = goals.some((goal) => goal.title === item.title);
    if (action === "accept" && !alreadyAdded) {
      setGoals((current) => [...current, { id: `carry-${item.id}-${activeDate}`, title: item.title, done: false, carriedFrom: item.sourceDate }]);
    }
    const isTarget = (pending: PendingCarryover) => pending.id === item.id && pending.sourceDate === item.sourceDate;
    const nextPending = readPendingCarryovers().filter((pending) => !isTarget(pending));
    localStorage.setItem("oneuldo-pending-carryovers", JSON.stringify(nextPending));
    setDueCarryovers((current) => current.filter((pending) => !isTarget(pending)));
    setMessage(action === "accept" ? alreadyAdded ? "이미 오늘의 목표에 담겨 있어서 한 번만 남겨뒀어." : `“${item.title}”을 오늘의 리듬에 맞게 다시 담았어.` : `“${item.title}”은 오늘 목록에 넣지 않을게. 선택하지 않아도 괜찮아.`);
  };

  const finishReview = (rememberedDone: string[]) => {
    const unfinished = goals.filter((goal) => !goal.done).map((goal) => ({ title: goal.title, reason: goal.reason || "이유를 남기지 않았어요", note: goal.note || "", carry: Boolean(goal.carry) }));
    const goalDone = goals.filter((goal) => goal.done).map((goal) => goal.title);
    const extraDone = [...new Set(rememberedDone.map((item) => item.trim()).filter((item) => item && !goalDone.includes(item)))];
    const done = [...goalDone, ...extraDone];
    const reflection = buildCompanionReflection(done, unfinished);
    const sourceDate = activeDate;
    const carryovers = goals.filter((goal) => !goal.done && goal.carry).map<PendingCarryover>((goal) => ({ id: goal.id, title: goal.title, sourceDate, targetDate: addDaysToDateKey(sourceDate, 1) }));
    const pending = readPendingCarryovers().filter((item) => item.sourceDate !== sourceDate);
    localStorage.setItem("oneuldo-pending-carryovers", JSON.stringify([...pending, ...carryovers]));
    const record: DailyRecord = {
      date: sourceDate,
      done,
      extraDone,
      unfinished,
      headline: reflection.headline,
      note: reflection.note,
      syncedUntilMidnight: true,
    };
    setRecords((current) => [...current.filter((item) => item.date !== record.date), record].sort((a, b) => a.date.localeCompare(b.date)));
    setSelectedDate(record.date);
    setMessage(extraDone.length ? `목표 밖에서도 ${koreanCount(extraDone.length)} 가지나 더 발견했네. 오늘의 기록에 다정하게 남겨뒀어 ✨` : carryovers.length ? `오늘의 기록을 남겼어. ${koreanCount(carryovers.length)} 가지는 내일 TODO에서 다시 만날게 🌙` : reflection.note);
    setView("records");
  };

  const selectedRecord = records.find((record) => record.date === selectedDate);

  const finishOnboarding = (nextSettings: Settings, firstGoal: string) => {
    setSettings(keepTimesInOrder(nextSettings));
    const title = firstGoal.trim();
    if (title) {
      if (onboardingFresh) setGoals([{ id: crypto.randomUUID(), title, done: false }]);
      else if (goals.length < 5) setGoals((current) => [...current, { id: crypto.randomUUID(), title, done: false }]);
    }
    localStorage.setItem("oneuldo-onboarded", "1");
    setOnboardingOpen(false);
    setOnboardingFresh(false);
    setView("today");
    setMessage("반가워! 오늘부터 네가 남긴 작은 발자국들을 다정하게 기억할게 🌿");
  };

  const skipOnboarding = () => {
    localStorage.setItem("oneuldo-onboarded", "1");
    setOnboardingOpen(false);
    setOnboardingFresh(false);
  };

  return (
    <main className={`app-shell theme-${settings.theme} ${!hydrated ? "is-hydrating" : ""} ${onboardingOpen && onboardingFresh ? "is-first-onboarding" : ""}`}>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView("today")} aria-label="오늘도 - 네가 해낸 하루를 기억할게, 홈">
          <span className="brand-image" aria-hidden="true" />
          <span className="brand-copy"><strong>오늘도</strong><span className="brand-tagline"> - 네가 해낸 하루를 기억할게</span></span>
        </button>
        <nav className="main-nav" aria-label="주요 메뉴">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")} type="button">오늘</button>
          <button className={view === "records" ? "active" : ""} onClick={openRecords} type="button">내 기록</button>
        </nav>
        <div className="top-actions">
          {view !== "review" && <button className="review-button" type="button" onClick={() => setView("review")}><span>☾</span> 오늘 돌아보기</button>}
          <button className="icon-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="설정 열기">⚙</button>
        </div>
      </header>

      {view === "today" && (
        <section className="today-view">
          <div className="day-column">
            <div className="date-kicker">{dateLabel}</div>
            <h1>오늘은 어떤 하루를<br />보내고 싶어?</h1>
            <p className="intro">오늘 꼭 해내고 싶은 것만 적어봐.<br />세 가지면 충분해.</p>

            {!!dueCarryovers.length && <section className="carryover-inbox" aria-label="어제에서 이어갈 일 고르기">
              <div className="carryover-head">
                <div><span aria-hidden="true">↗</span><div><strong>어제에서 이어갈 일</strong><small>오늘에 넣을 일만 골라보세요.</small></div></div>
                <em>남은 자리 {Math.max(0, 5 - goals.length)}개</em>
              </div>
              <div className="carryover-list">{dueCarryovers.map((item) => <article className="carryover-row" key={`${item.sourceDate}-${item.id}`}>
                <div><small>{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(`${item.sourceDate}T12:00:00`))}에서</small><strong>{item.title}</strong></div>
                <div className="carryover-actions"><button type="button" onClick={() => resolveCarryover(item, "skip")}>이번에는 넘기기</button><button type="button" disabled={goals.length >= 5} onClick={() => resolveCarryover(item, "accept")}>오늘에 추가</button></div>
              </article>)}</div>
            </section>}

            <div className="goal-card">
              <div className="goal-card-head">
                <div><h2>오늘의 목표</h2><p>{goals.length}/5 · 너무 많지 않게</p></div>
                <span className="done-badge">{completeCount}개를 해냈어요</span>
              </div>
              <div className="goal-list">
                {goals.map((goal) => (
                  <div className={`goal-row ${goal.done ? "is-done" : ""}`} key={goal.id}>
                    <button className="check-button" type="button" onClick={() => toggleGoal(goal.id)} aria-label={`${goal.title} ${goal.done ? "미완료로 변경" : "완료"}`}>
                      <span aria-hidden="true">{goal.done ? "✓" : ""}</span>
                    </button>
                    <button className="goal-title" type="button" onClick={() => toggleGoal(goal.id)}><span>{goal.title}</span>{goal.carriedFrom && <small>어제에서 이어온 일</small>}</button>
                    <button className="delete-goal" type="button" onClick={() => setGoals((current) => current.filter((item) => item.id !== goal.id))} aria-label={`${goal.title} 삭제`}>×</button>
                  </div>
                ))}
              </div>
              {adding ? (
                <form className="add-form" onSubmit={addGoal}>
                  <input value={newGoal} maxLength={60} onChange={(event) => setNewGoal(event.target.value)} placeholder="오늘 꼭 해내고 싶은 일" aria-label="새 목표" />
                  <button type="submit">추가</button>
                  <button type="button" onClick={() => setAdding(false)}>취소</button>
                </form>
              ) : (
                <button className="add-goal" type="button" onClick={() => setAdding(true)} disabled={goals.length >= 5}>+ &nbsp;{goals.length >= 5 ? "오늘은 이만큼이면 충분해" : "목표 추가하기"}</button>
              )}
            </div>
            <button className="mobile-review" type="button" onClick={() => setView("review")}>오늘 해낸 일 돌아보기 <span>→</span></button>
          </div>

          {settings.character && <GoalMate message={message} animal={settings.animal} completed={completeCount} total={goals.length} onClick={talkToGoalMate} />}
        </section>
      )}

      {view === "review" && <ReviewView goals={goals} completeCount={completeCount} onUpdate={updateGoal} onBack={() => setView("today")} onFinish={finishReview} />}

      {view === "records" && <RecordsView records={records} selectedDate={selectedDate} onSelect={setSelectedDate} selected={selectedRecord} />}

      {settingsOpen && <SettingsModal settings={settings} onChange={(nextSettings) => setSettings(keepTimesInOrder(nextSettings))} onClose={() => setSettingsOpen(false)} onRestartGuide={() => { setSettingsOpen(false); setOnboardingFresh(false); setOnboardingOpen(true); }} />}
      {onboardingOpen && <OnboardingGuide settings={settings} onFinish={finishOnboarding} onSkip={skipOnboarding} />}
    </main>
  );
}

function GoalMate({ message, animal, completed, total, onClick }: { message: string; animal: Settings["animal"]; completed: number; total: number; onClick: () => void }) {
  const progress = total ? completed / total : 0;
  const progressColor = progress >= 1 ? "#4f9a68" : progress >= .5 ? "#e28a38" : progress > 0 ? "#ef7654" : "#8f735e";
  const selectedMate = MATE_OPTIONS.find((option) => option.value === animal) || MATE_OPTIONS[0];
  return (
    <aside className="mate-zone" aria-label="목표 메이트">
      <button className="speech" type="button" onClick={onClick}>
        <strong>{message.includes("해냈") || message.includes("성취") ? "오늘의 발자국이야" : "오늘도 네 편이야 🌿"}</strong>
        <span>{humanizeCountPhrases(message)}</span>
      </button>
      <button className={`mate animal-${animal}`} type="button" onClick={onClick} aria-label={`${selectedMate.label} 목표 메이트와 대화하기`}>
        <span className="mate-art" aria-hidden="true" style={{ backgroundImage: `url(${selectedMate.asset})` }} />
        <span className="mate-status" aria-hidden="true"><small>오늘</small><strong style={{ color: progressColor }}>{completed}/{total}</strong></span>
      </button>
    </aside>
  );
}

function ReviewView({ goals, completeCount, onUpdate, onBack, onFinish }: { goals: Goal[]; completeCount: number; onUpdate: (id: string, patch: Partial<Goal>) => void; onBack: () => void; onFinish: (rememberedDone: string[]) => void }) {
  const cards = useMemo<Array<{ type: "done" | "difficult"; goal: Goal } | { type: "empty-done" }>>(() => {
    const doneCards = goals.filter((goal) => goal.done).map((goal) => ({ type: "done" as const, goal }));
    const difficultCards = goals.filter((goal) => !goal.done).map((goal) => ({ type: "difficult" as const, goal }));
    return [...(doneCards.length ? doneCards : [{ type: "empty-done" as const }]), ...difficultCards];
  }, [goals]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const [rememberedInput, setRememberedInput] = useState("");
  const [rememberedDone, setRememberedDone] = useState("");
  const [memoryFinished, setMemoryFinished] = useState(false);
  const dragStart = useRef(0);
  const dragOffset = useRef(0);
  const draggingActive = useRef(false);
  const activeCard = cards[activeIndex];
  const cardsComplete = activeIndex >= cards.length;
  const memoryStep = cardsComplete && !memoryFinished;
  const reviewComplete = cardsComplete && memoryFinished;
  const carryCount = goals.filter((goal) => !goal.done && goal.carry).length;
  const reviewedCount = completeCount + (rememberedDone ? 1 : 0);

  const rememberDone = (event: FormEvent) => {
    event.preventDefault();
    const title = rememberedInput.trim();
    if (!title || rememberedDone) return;
    setRememberedDone(title);
    setRememberedInput("");
    setMemoryFinished(true);
  };

  const advance = (direction: "left" | "right") => {
    if (!activeCard || exiting) return;
    if (activeCard.type === "difficult") onUpdate(activeCard.goal.id, { carry: direction === "right" });
    setExiting(direction);
    window.setTimeout(() => {
      setActiveIndex((current) => current + 1);
      dragOffset.current = 0;
      setDragX(0);
      setExiting(null);
    }, 240);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, textarea")) return;
    dragStart.current = event.clientX;
    draggingActive.current = true;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingActive.current) return;
    const nextOffset = Math.max(-190, Math.min(190, event.clientX - dragStart.current));
    dragOffset.current = nextOffset;
    setDragX(nextOffset);
  };
  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingActive.current) return;
    draggingActive.current = false;
    setDragging(false);
    const finalOffset = Math.max(-190, Math.min(190, event.clientX - dragStart.current));
    dragOffset.current = finalOffset;
    if (Math.abs(finalOffset) >= 85) advance(finalOffset < 0 ? "left" : "right");
    else { dragOffset.current = 0; setDragX(0); }
  };
  const handlePointerCancel = () => {
    draggingActive.current = false;
    dragOffset.current = 0;
    setDragging(false);
    setDragX(0);
  };
  const previousCard = () => {
    if (exiting || activeIndex === 0) return;
    dragOffset.current = 0;
    setDragX(0);
    setActiveIndex((current) => current - 1);
  };

  return (
    <section className="review-view deck-review-view">
      <div className="review-wrap">
        <button className="back-link" type="button" onClick={onBack}>← &nbsp;오늘로 돌아가기</button>
        <div className="review-heading deck-heading">
          <span className="moon-icon">☾</span>
          <p>{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date())} · 오늘의 기록</p>
          <h1>카드를 넘기며<br /><em>오늘을 가볍게</em> 돌아봐요.</h1>
        </div>

        <div className="review-stage">
          <div className="review-progress" aria-live="polite">
            <div><span style={{ width: `${(Math.min(activeIndex, cards.length) + (memoryFinished ? 1 : 0)) / (cards.length + 1) * 100}%` }} /></div>
            <strong>{reviewComplete ? "돌아보기 완료" : memoryStep ? "한 가지만 떠올리기" : `${activeIndex + 1} / ${cards.length + 1}`}</strong>
          </div>

          {!reviewComplete && activeCard && <div className="review-card-stack" aria-label={`${activeIndex + 1}번째 회고 카드`}>
            <div className="stack-sheet back" aria-hidden="true" /><div className="stack-sheet middle" aria-hidden="true" />
            <article
              key={activeCard.type === "empty-done" ? "empty-done" : activeCard.goal.id}
              className={`review-card review-deck-card ${activeCard.type === "difficult" ? "difficult-swipe-card" : activeCard.type === "empty-done" ? "empty-done-swipe-card" : "done-swipe-card"} ${dragging ? "is-dragging" : ""} ${exiting ? `exit-${exiting}` : ""}`}
              style={!exiting && dragX !== 0 ? { transform: `translateX(${dragX}px) rotate(${dragX / 38}deg)` } : undefined}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerCancel}
            >
              <span className="drag-choice left" style={{ opacity: Math.max(0, -dragX / 90) }}>{activeCard.type === "difficult" ? "그만하기" : "확인했어요"}</span>
              <span className="drag-choice right" style={{ opacity: Math.max(0, dragX / 90) }}>{activeCard.type === "difficult" ? "내일 TODO에 넣기" : "확인했어요"}</span>

              {activeCard.type === "done" ? <>
                <div className="review-card-kind done"><span>✓</span><div><small>오늘 해낸 일</small><strong>{completeCount}가지 중 {goals.filter((goal) => goal.done).findIndex((goal) => goal.id === activeCard.goal.id) + 1}번째</strong></div></div>
                <div className="done-card-center"><span>✨</span><h2>{activeCard.goal.title}</h2><p>오늘 분명히 앞으로 나아간 순간이에요.</p></div>
                <p className="swipe-help">← 어느 방향으로든 넘겨 다음 카드 보기 →</p>
              </> : activeCard.type === "empty-done" ? <>
                <div className="review-card-kind done empty"><span>☁</span><div><small>오늘 해낸 일</small><strong>비어 있는 날도 오늘의 기록이에요</strong></div></div>
                <div className="done-card-center empty-done-center"><span>☾</span><h2>오늘 완료로 표시한 일은<br />아직 없어요.</h2><p>그래도 오늘을 돌아보러 온 것부터 충분한 한 걸음이에요.</p></div>
                <p className="swipe-help">← 어느 방향으로든 넘겨 어려웠던 일 돌아보기 →</p>
              </> : <>
                <div className="review-card-kind difficult"><span>☼</span><div><small>오늘 하기 어려웠던 일</small><strong>마음을 가볍게 정리해봐요</strong></div></div>
                <h2 className="review-task-title">{activeCard.goal.title}</h2>
                <p className="question">오늘은 왜 하기 어려웠을까요?</p>
                <div className="reason-chips">
                  {REASONS.map((reason) => <button className={activeCard.goal.reason === reason ? "selected" : ""} type="button" key={reason} onClick={() => onUpdate(activeCard.goal.id, { reason })}>{reason}</button>)}
                </div>
                <textarea value={activeCard.goal.note || ""} onChange={(event) => onUpdate(activeCard.goal.id, { note: event.target.value })} placeholder="이유를 한 줄로 남겨보세요 (선택)" aria-label={`${activeCard.goal.title} 회고`} />
                <div className="swipe-decisions"><button type="button" className="stop" onClick={() => advance("left")}><span>←</span> 이번에는 그만하기</button><button type="button" className="carry" onClick={() => advance("right")}>내일 TODO에 넣기 <span>→</span></button></div>
              </>}
            </article>
          </div>}

          {memoryStep && <article className="review-card memory-card">
            <div className="memory-card-kind"><span aria-hidden="true">✦</span><div><small>목표 밖에서 발견한 일</small><strong>한 가지만 기억해도 충분해요</strong></div></div>
            <div className="memory-card-copy"><span aria-hidden="true">💭</span><h2>오늘 한 일 중에<br />한 가지만 더 떠올려볼까요?</h2><p>크거나 특별한 일일 필요 없어요.<br /><b>한 가지면 오늘을 기억하기에 충분해요.</b></p></div>
            <form className="memory-form" onSubmit={rememberDone}>
              <input value={rememberedInput} onChange={(event) => setRememberedInput(event.target.value)} maxLength={60} placeholder="예: 밀린 설거지를 했다" aria-label="목표 외에 오늘 해낸 일 한 가지" />
              <button type="submit" disabled={!rememberedInput.trim()}>기록하고 넘어가기</button>
            </form>
            <p className="memory-one-note">딱 한 가지만 적으면 바로 다음으로 넘어가요.</p>
            <button className="finish-memory" type="button" onClick={() => setMemoryFinished(true)}>지금은 더 기억나는 일이 없어요<b>→</b></button>
          </article>}

          {reviewComplete && <article className="review-card review-complete-card">
            <span className="complete-mate" aria-hidden="true">•ᴗ•</span>
            <p>오늘의 카드 정리 완료</p>
            <h2>{reviewedCount ? `${koreanCount(reviewedCount)} 가지나 해낸 오늘을 기억할게요.` : "오늘을 돌아본 것만으로도 충분해요."}</h2>
            <span>{rememberedDone ? "목표 밖에서도 소중한 한 가지를 더 발견했어요." : carryCount ? `${koreanCount(carryCount)} 가지는 내일 TODO에 다시 나타나요.` : "선택한 내용은 내 기록에 차분히 남겨둘게요."}</span>
            <button className="finish-review" type="button" onClick={() => onFinish(rememberedDone ? [rememberedDone] : [])}>오늘의 기록 남기기 <b>→</b></button>
          </article>}

          <div className="review-stage-nav"><button type="button" onClick={() => { if (memoryStep) setActiveIndex(Math.max(0, cards.length - 1)); else previousCard(); }} disabled={(activeIndex === 0 && !memoryStep) || Boolean(exiting)}>← 이전 카드</button>{!cardsComplete && activeCard?.type !== "difficult" && <button type="button" onClick={() => advance("right")}>다음 카드 →</button>}</div>
        </div>
      </div>
    </section>
  );
}

function RecordsView({ records, selectedDate, onSelect, selected }: { records: DailyRecord[]; selectedDate: string; onSelect: (date: string) => void; selected?: DailyRecord }) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const lastDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const calendar = [...Array(firstDay).fill(null), ...Array.from({ length: lastDate }, (_, index) => index + 1)];
  const recordDates = new Set(records.map((record) => record.date));
  const reflection = selected ? buildCompanionReflection(selected.done, selected.unfinished) : undefined;
  const fullDate = (day: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return (
    <section className="records-view">
      <div className="records-head"><p>나의 하루들</p><h1>해낸 날이<br />이만큼이나 쌓였어.</h1></div>
      <div className="records-layout">
        <article className="calendar-card">
          <div className="calendar-head"><h2>{now.getFullYear()}<span>{now.getMonth() + 1}월</span></h2><div><button type="button" aria-label="이전 달">‹</button><button type="button" aria-label="다음 달">›</button></div></div>
          <div className="weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{calendar.map((day, index) => day ? <button type="button" key={day} className={`${recordDates.has(fullDate(day)) ? "has-record" : ""} ${selectedDate === fullDate(day) ? "selected" : ""}`} onClick={() => recordDates.has(fullDate(day)) && onSelect(fullDate(day))}><span>{day}</span>{recordDates.has(fullDate(day)) && <i />}</button> : <span key={`empty-${index}`} />)}</div>
          <p className="calendar-note"><i /> 오늘의 기록을 남긴 날</p>
        </article>

        <article className="daily-card">
          {selected ? <>
            <div className="daily-card-head"><div><p>{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${selected.date}T12:00:00`))}</p><h2>{humanizeCountPhrases(selected.headline || reflection?.headline)}</h2></div><div className="record-head-side">{selected.syncedUntilMidnight && selected.date === dateKey() && <small>자정까지 오늘 TODO와 동기화 중</small>}<span className="mini-mate">•ᴗ•</span></div></div>
            <div className="record-section"><p>✨ 오늘 해낸 일</p><ul>{selected.done.map((item) => <li className={selected.extraDone?.includes(item) ? "remembered-done" : ""} key={item}><span>✓</span><div><strong>{item}</strong>{selected.extraDone?.includes(item) && <small>목표 밖에서 기억난 일</small>}</div></li>)}</ul></div>
            {!!selected.unfinished.length && <div className="record-section unfinished">
              <p className="unfinished-heading"><span aria-hidden="true">↗</span>오늘 하기 어려웠던 일 <em>{selected.unfinished.length}</em></p>
              <div className="unfinished-list">{selected.unfinished.map((item) => <article className="unfinished-item" key={item.title}>
                <span className="unfinished-mark" aria-hidden="true">○</span>
                <div className="unfinished-copy"><strong>{item.title}</strong>{item.note && <q>{item.note}</q>}</div>
                <div className="unfinished-meta"><span>{item.reason}</span><em className={item.carry ? "carry" : "stop"}>{item.carry ? "↗ 다음 날 TODO로 보냄" : "✓ 이번에는 그만하기"}</em></div>
              </article>)}</div>
            </div>}
            <blockquote><span>“</span>{humanizeCountPhrases(selected.note || reflection?.note)}<small>— 네 목표 메이트가</small></blockquote>
          </> : <div className="no-record"><span>☾</span><h2>아직 기록이 없어요</h2><p>오늘을 돌아보면 첫 카드가 생겨요.</p></div>}
        </article>
      </div>
    </section>
  );
}

function useDocumentScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const shellScrollTop = shell?.scrollTop || 0;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow, paddingRight: body.style.paddingRight, scrollBehavior: root.style.scrollBehavior };
    const previousShell = shell ? { overflow: shell.style.overflow, overscrollBehavior: shell.style.overscrollBehavior } : null;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    document.documentElement.classList.add("modal-scroll-locked");
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (shell) {
      shell.style.overflow = "hidden";
      shell.style.overscrollBehavior = "none";
    }
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.documentElement.classList.remove("modal-scroll-locked");
      const { scrollBehavior, ...bodyStyles } = previous;
      Object.assign(body.style, bodyStyles);
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);
      root.style.scrollBehavior = scrollBehavior;
      if (shell && previousShell) {
        Object.assign(shell.style, previousShell);
        shell.scrollTop = shellScrollTop;
      }
    };
  }, []);
}

function SettingsModal({ settings, onChange, onClose, onRestartGuide }: { settings: Settings; onChange: (value: Settings) => void; onClose: () => void; onRestartGuide: () => void }) {
  useDocumentScrollLock();

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-scroll">
        <div className="modal-head"><div><p>나의 리듬에 맞게</p><h2 id="settings-title">설정</h2></div><button className="close-settings" type="button" onPointerDown={(event) => { event.stopPropagation(); onClose(); }} onClick={onClose} aria-label="설정 닫기"><span aria-hidden="true">×</span></button></div>
        <div className="setting-row"><div><strong>하루 시작</strong><span>오늘의 목표를 물어볼게.</span></div><SoftTimePicker kind="morning" value={settings.morning} maxValue={settings.evening} onChange={(morning) => onChange({ ...settings, morning })} /></div>
        <div className="setting-row"><div><strong>하루 회고</strong><span>해낸 일을 같이 돌아볼게.</span></div><SoftTimePicker kind="evening" value={settings.evening} minValue={settings.morning} onChange={(evening) => onChange({ ...settings, evening })} /></div>
        <div className="setting-block"><strong>응원 빈도</strong><div className="setting-options">{(["거의 없음", "가끔", "자주"] as Settings["cheer"][]).map((option) => <button className={settings.cheer === option ? "selected" : ""} type="button" key={option} onClick={() => onChange({ ...settings, cheer: option })}>{option}</button>)}</div></div>
        <div className="setting-block mate-picker-block">
          <strong>나의 목표 메이트</strong><span>오늘을 함께할 동물을 골라보세요.</span>
          <div className="mate-options">{MATE_OPTIONS.map((option) => <button className={settings.animal === option.value ? "selected" : ""} type="button" key={option.value} aria-pressed={settings.animal === option.value} onClick={() => onChange({ ...settings, animal: option.value })}><span className="mate-option-art" aria-hidden="true" style={{ backgroundImage: `url(${option.asset})` }} /><b>{option.label}</b>{settings.animal === option.value && <i>선택됨</i>}</button>)}</div>
        </div>
        <div className="setting-block companion-display-block">
          <strong>데스크톱 캐릭터</strong><span>화면에서 보이는 크기와 표시 여부를 정해보세요.</span>
          <div className="companion-visibility" aria-label="데스크톱 캐릭터 표시 설정">
            <button className={settings.character ? "selected" : ""} type="button" aria-pressed={settings.character} onClick={() => onChange({ ...settings, character: true })}><i aria-hidden="true">●</i> 표시하기</button>
            <button className={!settings.character ? "selected hidden" : ""} type="button" aria-pressed={!settings.character} onClick={() => onChange({ ...settings, character: false })}><i aria-hidden="true">○</i> 숨기기</button>
          </div>
          <div className={`companion-size-control ${!settings.character ? "is-disabled" : ""}`}>
            <div><b>캐릭터 크기</b><small>{settings.character ? "바꾸면 화면의 캐릭터에 바로 반영돼요." : "캐릭터를 표시하면 크기를 바꿀 수 있어요."}</small></div>
            <div className="companion-size-options" aria-label="캐릭터 크기">
              {([{"value":"small","label":"작게"},{"value":"medium","label":"보통"},{"value":"large","label":"크게"}] as { value: Settings["characterSize"]; label: string }[]).map((option) => <button className={settings.characterSize === option.value ? "selected" : ""} type="button" key={option.value} disabled={!settings.character} aria-pressed={settings.characterSize === option.value} onClick={() => onChange({ ...settings, characterSize: option.value })}><i className={`size-dot ${option.value}`} aria-hidden="true" />{option.label}</button>)}
            </div>
          </div>
        </div>
        <button className="restart-guide" type="button" onClick={onRestartGuide}>✦ &nbsp;첫 시작 가이드 다시 보기</button>
        <a className="bug-report-link" href={BUG_REPORT_MAILTO} target="_blank" rel="noreferrer">
          <span className="bug-report-icon" aria-hidden="true">✉</span>
          <span><strong>이메일로 버그 제보하기</strong><small>{BUG_REPORT_EMAIL} · 기본 메일 앱에서 작성해요.</small></span>
          <b aria-hidden="true">↗</b>
        </a>
        <button className="save-settings" type="button" onClick={onClose}>이대로 함께하기</button>
        <footer className="app-info" aria-label="앱 정보">
          <div><strong>오늘도</strong><span>데스크톱 목표 메이트</span></div>
          <div><small>버전 {APP_VERSION}</small><span>데이터는 이 Mac에 저장돼요.</span></div>
        </footer>
        </div>
      </section>
    </div>
  );
}

function OnboardingGuide({ settings, onFinish, onSkip }: { settings: Settings; onFinish: (settings: Settings, firstGoal: string) => void; onSkip: () => void }) {
  useDocumentScrollLock();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(settings);
  const [firstGoal, setFirstGoal] = useState("");
  const totalSteps = 6;
  const selectedMate = MATE_OPTIONS.find((option) => option.value === draft.animal) || MATE_OPTIONS[0];

  const next = () => setStep((current) => Math.min(totalSteps - 1, current + 1));
  const back = () => setStep((current) => Math.max(0, current - 1));

  return (
    <div className={`onboarding-backdrop theme-${draft.theme}`}>
      <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-top">
          <div className="guide-progress" aria-label={`${totalSteps}단계 중 ${step + 1}단계`}>{Array.from({ length: totalSteps }, (_, index) => <i className={index <= step ? "active" : ""} key={index} />)}</div>
          <button type="button" className="skip-guide" onClick={onSkip}>건너뛰기</button>
        </div>

        <div className="guide-content" key={step}>
          {step === 0 && <div className="guide-step empathy-step">
            <span className="guide-kicker">오늘도의 첫 질문</span>
            <h1 id="onboarding-title">하루가 끝날 때<br /><em>“오늘 뭐했지?”</em>라는<br />생각이 든 적 있나요?</h1>
            <div className="feeling-chips"><span>하루 종일 바쁘긴 했는데</span><span>할 일을 다 못한 것만 보이고</span><span>누가 옆에서 잘했다고 해줬으면</span></div>
          </div>}

          {step === 1 && <div className="guide-step promise-step">
            <span className="guide-kicker">우리가 기억할 것</span>
            <h1 id="onboarding-title">하지 못한 일보다<br /><em>당신이 해낸 일을</em><br />먼저 기억할게요.</h1>
            <div className="promise-card">
              <div className="promise-muted"><span>○</span><div><small>아직 못한 일</small><s>볼 때마다 자책하기</s></div></div>
              <div className="promise-highlight"><span>✓</span><div><small>오늘 해낸 일</small><strong>작은 한 가지도 발견하기</strong></div></div>
            </div>
          </div>}

          {step === 2 && <div className="guide-step meet-step">
            <div className="guide-mate-showcase">
              <span className="guide-mate-art" aria-hidden="true" style={{ backgroundImage: `url(${selectedMate.asset})` }} />
              <div className="guide-speech"><strong>“반가워!”</strong><span>서두르지 않아도 괜찮아요.<br />오늘의 작은 걸음을 곁에서 기억할게요.</span></div>
            </div>
            <span className="guide-kicker">네 목표 메이트</span>
            <h1 id="onboarding-title">독촉하지 않고,<br />조용히 같이 있을게요.</h1>
            <p>목표를 해내면 함께 기뻐하고,<br />힘든 날에는 천천히 해도 괜찮다고 말해줄게요.</p>
          </div>}

          {step === 3 && <div className="guide-step review-guide-step">
            <span className="guide-kicker">오늘 돌아보기 사용법</span>
            <h1 id="onboarding-title">카드를 넘기며<br /><em>오늘을 가볍게 정리해요.</em></h1>
            <p>해낸 일은 한 번 더 기뻐하고, 어려웠던 일은 내일로 가져갈지 편하게 골라요.</p>
            <div className="guide-review-demo" aria-label="오늘 돌아보기 카드 사용 방법">
              <article className="guide-done-card"><small>오늘 해낸 일</small><span>✓</span><strong>작은 성취도 카드로 확인</strong><p>어느 방향으로든 넘겨요</p></article>
              <article className="guide-difficult-card"><small>오늘 하기 어려웠던 일</small><strong>내 마음에 맞는 방향으로</strong><div><span>← 그만하기</span><i>드래그</i><span>내일 TODO에 넣기 →</span></div></article>
            </div>
            <div className="guide-review-tip"><span>☾</span><p><strong>언제 사용하면 좋나요?</strong> 하루를 마칠 때 1분만 투자해도, 해낸 일과 내려놓을 일을 분명하게 구분할 수 있어요.</p></div>
          </div>}

          {step === 4 && <div className="guide-step rhythm-step">
            <span className="guide-kicker">나의 리듬 알려주기</span>
            <h1 id="onboarding-title">언제 하루를 시작하고<br />돌아보면 좋을까요?</h1>
            <p>알림은 이 두 번만 보낼게요. 언제든 설정에서 바꿀 수 있어요.</p>
            <div className="rhythm-grid">
              <article className="rhythm-card morning"><span className="rhythm-icon sun">☀</span><div className="rhythm-copy"><small>하루 시작</small><strong>오늘의 목표를 물어볼게요</strong><span>가볍게 하루를 시작할 시간</span></div><SoftTimePicker kind="morning" value={draft.morning} maxValue={draft.evening} onChange={(morning) => setDraft((current) => keepTimesInOrder({ ...current, morning }))} showPresets /></article>
              <article className="rhythm-card evening"><span className="rhythm-icon moon">☾</span><div className="rhythm-copy"><small>하루 회고</small><strong>해낸 일을 함께 돌아볼게요</strong><span>마음을 놓고 하루를 돌아볼 시간</span></div><SoftTimePicker kind="evening" value={draft.evening} minValue={draft.morning} onChange={(evening) => setDraft((current) => keepTimesInOrder({ ...current, evening }))} showPresets /></article>
            </div>
          </div>}

          {step === 5 && <div className="guide-step ready-step">
            <span className="guide-kicker">이제 준비 끝</span>
            <h1 id="onboarding-title">나와 함께할 메이트와<br /><em>첫 목표 하나</em>를 골라봐요.</h1>
            <div className="guide-mate-options" aria-label="목표 메이트 선택">{MATE_OPTIONS.map((option) => <button className={draft.animal === option.value ? "selected" : ""} type="button" key={option.value} aria-pressed={draft.animal === option.value} onClick={() => setDraft({ ...draft, animal: option.value })}><span className="guide-mate-option-art" aria-hidden="true" style={{ backgroundImage: `url(${option.asset})` }} /><strong>{option.label}</strong><small>{option.description}</small>{draft.animal === option.value && <i aria-hidden="true">✓</i>}</button>)}</div>
            <label className="first-goal-field"><span>오늘 꼭 해내고 싶은 한 가지</span><input value={firstGoal} maxLength={60} onChange={(event) => setFirstGoal(event.target.value)} placeholder="예: 산책 20분 하기" /></label>
            <p className="optional-note">첫 목표는 비워두고 나중에 적어도 괜찮아요.</p>
          </div>}
        </div>

        <div className="guide-actions">
          <button className="guide-back" type="button" onClick={back} disabled={step === 0}>← &nbsp;이전</button>
          {step < totalSteps - 1 ? <button className="guide-next" type="button" onClick={next}>다음 <span>→</span></button> : <button className="guide-next finish" type="button" onClick={() => onFinish(draft, firstGoal)}>오늘도와 시작하기 <span>→</span></button>}
        </div>
      </section>
    </div>
  );
}

const TIME_PRESETS = {
  morning: [{ value: "07:00", label: "7시" }, { value: "08:00", label: "8시" }, { value: "09:00", label: "9시" }, { value: "10:00", label: "10시" }],
  evening: [{ value: "18:00", label: "18시" }, { value: "19:00", label: "19시" }, { value: "20:00", label: "20시" }, { value: "21:00", label: "21시" }],
} as const;

function SoftTimePicker({ kind, value, onChange, showPresets = false, minValue, maxValue }: { kind: "morning" | "evening"; value: string; onChange: (value: string) => void; showPresets?: boolean; minValue?: string; maxValue?: string }) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const { hour, minute } = timeParts(value);
  const label = kind === "morning" ? "하루 시작 알림 시간" : "하루 회고 알림 시간";

  const openPicker = () => {
    setDraftValue(normalizeToTenMinutes(value));
    setOpen(true);
  };

  return (
    <div className={`soft-time-control ${kind}`}>
      <button className={`soft-time-field ${open ? "is-open" : ""}`} type="button" onClick={openPicker} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}, ${hour}시 ${minute}분. 눌러서 변경`}>
        <strong>{String(hour).padStart(2, "0")}<i>:</i>{minute}</strong>
        <span className="time-edit" aria-hidden="true"><i /></span>
      </button>
      {showPresets && <div className="time-presets" aria-label={`${label} 빠른 선택`}>
        <span>{kind === "morning" ? "시작 추천" : "회고 추천"}</span>
        {TIME_PRESETS[kind].map((preset) => <button className={value === preset.value ? "selected" : ""} type="button" key={preset.value} onClick={() => onChange(preset.value)}>{preset.label}</button>)}
      </div>}
      {open && createPortal(<TimePickerDialog kind={kind} value={draftValue} minValue={minValue} maxValue={maxValue} onChange={setDraftValue} onCancel={() => setOpen(false)} onConfirm={() => { onChange(draftValue); setOpen(false); }} />, document.body)}
    </div>
  );
}

function timeParts(value: string) {
  const [hourValue, minute = "00"] = value.split(":");
  return {
    hour: Number(hourValue),
    minute,
  };
}

function valueFromParts(hour: number, minute: string) {
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function TimePickerDialog({ kind, value, minValue, maxValue, onChange, onCancel, onConfirm }: { kind: "morning" | "evening"; value: string; minValue?: string; maxValue?: string; onChange: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const { hour, minute } = timeParts(value);
  const hourWheel = useRef<HTMLDivElement>(null);
  const minuteWheel = useRef<HTMLDivElement>(null);
  const update = (next: Partial<{ hour: number; minute: string }>) => onChange(valueFromParts(next.hour ?? hour, next.minute ?? minute));
  const title = kind === "morning" ? "하루 시작 시간" : "하루 회고 시간";
  const beforeMinimum = minValue !== undefined && timeToMinutes(value) < timeToMinutes(minValue);
  const afterMaximum = maxValue !== undefined && timeToMinutes(value) > timeToMinutes(maxValue);
  const invalid = beforeMinimum || afterMaximum;
  const validationMessage = beforeMinimum ? `회고 시간은 시작 시간(${minValue})보다 빠를 수 없어요.` : afterMaximum ? `시작 시간은 회고 시간(${maxValue})보다 늦을 수 없어요.` : "";

  return (
    <div className={`time-dialog-backdrop ${kind}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="time-dialog" role="dialog" aria-modal="true" aria-labelledby={`${kind}-time-title`}>
        <header className="time-dialog-head">
          <span className={`time-dialog-icon ${kind}`}>{kind === "morning" ? "☀" : "☾"}</span>
          <div><small>{kind === "morning" ? "가볍게 시작하는 시간" : "마음을 놓고 돌아보는 시간"}</small><h2 id={`${kind}-time-title`}>{title} 정하기</h2></div>
          <button type="button" onClick={onCancel} aria-label="시간 선택 닫기">×</button>
        </header>
        <p className="time-range-note"><span>24시간</span> 00:00부터 23:50까지 10분 단위로 설정해요.</p>
        <div className="time-wheel-picker">
          <TimeWheel controlRef={hourWheel} label="시" value={hour} min={0} max={23} step={1} pad onChange={(nextHour) => update({ hour: nextHour })} onMoveHorizontal={(direction) => { if (direction === 1) minuteWheel.current?.focus(); }} />
          <span className="wheel-colon">:</span>
          <TimeWheel controlRef={minuteWheel} label="분" value={Number(minute)} min={0} max={50} step={10} pad onChange={(nextMinute) => update({ minute: String(nextMinute).padStart(2, "0") })} onMoveHorizontal={(direction) => { if (direction === -1) hourWheel.current?.focus(); }} />
        </div>
        <p className="wheel-hint"><span>↕</span> 값 변경 <span>↔</span> 시·분 이동</p>
        <div className={`time-validation ${invalid ? "is-visible" : ""}`} role="status" aria-live="polite">{validationMessage}</div>
        <footer className="time-dialog-actions"><button type="button" onClick={onCancel}>취소</button><button type="button" className="confirm-time" onClick={onConfirm} disabled={invalid}>{String(hour).padStart(2, "0")}:{minute}로 정하기</button></footer>
      </section>
    </div>
  );
}

function TimeWheel({ controlRef, label, value, min, max, step, onChange, onMoveHorizontal, pad = false }: { controlRef: RefObject<HTMLDivElement | null>; label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; onMoveHorizontal: (direction: -1 | 1) => void; pad?: boolean }) {
  const wheelDelta = useRef(0);
  const [motion, setMotion] = useState<{ direction: -1 | 1 | null; tick: number }>({ direction: null, tick: 0 });
  const move = (direction: -1 | 1) => {
    const next = value + direction * step;
    setMotion((current) => ({ direction, tick: current.tick + 1 }));
    onChange(next > max ? min : next < min ? max : next);
  };
  const display = (number: number) => String(number).padStart(pad ? 2 : 1, "0");
  const adjacent = (direction: -1 | 1) => {
    const next = value + direction * step;
    return next > max ? min : next < min ? max : next;
  };
  const handleWheel = (deltaY: number) => {
    wheelDelta.current += deltaY;
    if (Math.abs(wheelDelta.current) < 140) return;
    move(wheelDelta.current > 0 ? 1 : -1);
    wheelDelta.current = 0;
  };

  return (
    <div ref={controlRef} className="time-wheel" onWheel={(event) => { event.preventDefault(); event.stopPropagation(); handleWheel(event.deltaY); }} tabIndex={0} role="spinbutton" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} onKeyDown={(event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); move(event.key === "ArrowUp" ? -1 : 1); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onMoveHorizontal(event.key === "ArrowLeft" ? -1 : 1); }
    }}>
      <span>{label}</span>
      <div className={`wheel-numbers ${motion.direction === 1 ? "turn-forward" : motion.direction === -1 ? "turn-backward" : ""}`} key={motion.tick}>
        <button type="button" onClick={() => move(-1)} aria-label={`${label} 올리기`}>{display(adjacent(-1))}</button>
        <strong>{display(value)}</strong>
        <button type="button" onClick={() => move(1)} aria-label={`${label} 내리기`}>{display(adjacent(1))}</button>
      </div>
    </div>
  );
}
