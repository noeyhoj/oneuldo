"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Goal = {
  id: string;
  title: string;
  done: boolean;
  reason?: string;
  note?: string;
  carry?: boolean;
};

type DailyRecord = {
  date: string;
  done: string[];
  unfinished: { title: string; reason: string; note: string; carry: boolean }[];
  note: string;
};

type Settings = {
  morning: string;
  evening: string;
  cheer: "거의 없음" | "가끔" | "자주";
  character: boolean;
};

const REASONS = ["시간이 부족했어요", "우선순위가 바뀌었어요", "생각보다 어려웠어요", "컨디션이 좋지 않았어요"];
const DEFAULT_GOALS: Goal[] = [
  { id: "welcome-1", title: "기획서 핵심 흐름 정리하기", done: true },
  { id: "welcome-2", title: "프로젝트 첫 화면 만들기", done: false },
  { id: "welcome-3", title: "30분 산책하기", done: false },
];

const dateKey = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const SAMPLE_RECORDS: DailyRecord[] = [
  { date: dateKey(-3), done: ["프로젝트 회의", "알고리즘 문제 1개"], unfinished: [], note: "계획보다 적어도, 꼭 하고 싶은 건 다 해냈어." },
  { date: dateKey(-2), done: ["포트폴리오 문구 다듬기", "산책 20분"], unfinished: [{ title: "책 30쪽 읽기", reason: "컨디션이 좋지 않았어요", note: "퇴근 후에 너무 피곤했다.", carry: true }], note: "피곤한 날에도 나를 위한 산책은 챙겼어." },
  { date: dateKey(-1), done: ["PR 작성하기", "운동 30분", "엄마에게 전화하기"], unfinished: [], note: "오늘 세 가지나 앞으로 나아갔어." },
];

const initialSettings: Settings = { morning: "09:00", evening: "18:00", cheer: "가끔", character: true };

export default function Home() {
  const [view, setView] = useState<"today" | "review" | "records">("today");
  const [goals, setGoals] = useState<Goal[]>(DEFAULT_GOALS);
  const [records, setRecords] = useState<DailyRecord[]>(SAMPLE_RECORDS);
  const [newGoal, setNewGoal] = useState("");
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [message, setMessage] = useState("이미 하나를 해냈어 ✨");
  const [selectedDate, setSelectedDate] = useState(dateKey(-1));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedGoals = localStorage.getItem("oneuldo-goals");
    const storedRecords = localStorage.getItem("oneuldo-records");
    const storedSettings = localStorage.getItem("oneuldo-settings");
    if (storedGoals) setGoals(JSON.parse(storedGoals));
    if (storedRecords) setRecords(JSON.parse(storedRecords));
    if (storedSettings) setSettings(JSON.parse(storedSettings));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("oneuldo-goals", JSON.stringify(goals));
    localStorage.setItem("oneuldo-records", JSON.stringify(records));
    localStorage.setItem("oneuldo-settings", JSON.stringify(settings));
  }, [goals, records, settings, hydrated]);

  const completeCount = goals.filter((goal) => goal.done).length;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);

  const addGoal = (event: FormEvent) => {
    event.preventDefault();
    const title = newGoal.trim();
    if (!title) return;
    if (goals.length >= 5) {
      setMessage("오늘은 이 다섯 가지면 충분해 🌿");
      return;
    }
    setGoals((current) => [...current, { id: crypto.randomUUID(), title, done: false }]);
    setNewGoal("");
    setAdding(false);
    setMessage("오늘의 마음을 기억해둘게.");
  };

  const toggleGoal = (id: string) => {
    const target = goals.find((goal) => goal.id === id);
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, done: !goal.done } : goal));
    if (target && !target.done) {
      const nextCount = completeCount + 1;
      setMessage(nextCount === 1 ? "좋은 시작인데? 🎉" : nextCount === goals.length ? "오늘의 목표를 다 해냈네. 정말 멋져!" : `오늘 벌써 ${nextCount}번째 완료야 ✨`);
    } else {
      setMessage("다시 천천히 해보면 돼.");
    }
  };

  const updateGoal = (id: string, patch: Partial<Goal>) => {
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, ...patch } : goal));
  };

  const finishReview = () => {
    const record: DailyRecord = {
      date: dateKey(),
      done: goals.filter((goal) => goal.done).map((goal) => goal.title),
      unfinished: goals.filter((goal) => !goal.done).map((goal) => ({ title: goal.title, reason: goal.reason || "이유를 남기지 않았어요", note: goal.note || "", carry: Boolean(goal.carry) })),
      note: completeCount ? `오늘 ${completeCount}가지나 앞으로 나아갔어.` : "오늘을 돌아본 것만으로도 충분해.",
    };
    setRecords((current) => [...current.filter((item) => item.date !== record.date), record].sort((a, b) => a.date.localeCompare(b.date)));
    setSelectedDate(record.date);
    setMessage("오늘의 기록이 하나 쌓였어 🌙");
    setView("records");
  };

  const selectedRecord = records.find((record) => record.date === selectedDate) || records.at(-1);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView("today")} aria-label="오늘도 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>오늘도</span>
        </button>
        <nav className="main-nav" aria-label="주요 메뉴">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")} type="button">오늘</button>
          <button className={view === "records" ? "active" : ""} onClick={() => setView("records")} type="button">내 기록</button>
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
            <p className="intro">오늘 꼭 하고 싶은 것만 적어봐.<br />세 가지면 충분해.</p>

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
                    <button className="goal-title" type="button" onClick={() => toggleGoal(goal.id)}>{goal.title}</button>
                    <button className="delete-goal" type="button" onClick={() => setGoals((current) => current.filter((item) => item.id !== goal.id))} aria-label={`${goal.title} 삭제`}>×</button>
                  </div>
                ))}
              </div>
              {adding ? (
                <form className="add-form" onSubmit={addGoal}>
                  <input autoFocus value={newGoal} maxLength={60} onChange={(event) => setNewGoal(event.target.value)} placeholder="오늘 꼭 하고 싶은 일" aria-label="새 목표" />
                  <button type="submit">추가</button>
                  <button type="button" onClick={() => setAdding(false)}>취소</button>
                </form>
              ) : (
                <button className="add-goal" type="button" onClick={() => setAdding(true)} disabled={goals.length >= 5}>+ &nbsp;{goals.length >= 5 ? "오늘은 이만큼이면 충분해" : "목표 추가하기"}</button>
              )}
            </div>
            <button className="mobile-review" type="button" onClick={() => setView("review")}>오늘 해낸 일 돌아보기 <span>→</span></button>
          </div>

          {settings.character && <GoalMate message={message} onClick={() => setMessage(completeCount ? `오늘 ${completeCount}가지나 해냈어. 잘하고 있어!` : "천천히 시작해도 괜찮아.")} />}
        </section>
      )}

      {view === "review" && <ReviewView goals={goals} completeCount={completeCount} onUpdate={updateGoal} onBack={() => setView("today")} onFinish={finishReview} />}

      {view === "records" && <RecordsView records={records} selectedDate={selectedDate} onSelect={setSelectedDate} selected={selectedRecord} />}

      {settingsOpen && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function GoalMate({ message, onClick }: { message: string; onClick: () => void }) {
  return (
    <aside className="mate-zone" aria-label="목표 메이트">
      <button className="speech" type="button" onClick={onClick}>
        <strong>{message.includes("시작") ? "좋은 시작인데?" : "잘하고 있어"}</strong>
        <span>{message}</span>
      </button>
      <button className="mate" type="button" onClick={onClick} aria-label="목표 메이트와 대화하기">
        <span className="mate-tail" />
        <span className="mate-ear left" /><span className="mate-ear right" />
        <span className="mate-body"><i className="eye left" /><i className="eye right" /><i className="cheek left" /><i className="cheek right" /><i className="mouth" /><i className="paw left" /><i className="paw right" /></span>
        <span className="mate-shadow" />
      </button>
    </aside>
  );
}

function ReviewView({ goals, completeCount, onUpdate, onBack, onFinish }: { goals: Goal[]; completeCount: number; onUpdate: (id: string, patch: Partial<Goal>) => void; onBack: () => void; onFinish: () => void }) {
  const unfinished = goals.filter((goal) => !goal.done);
  return (
    <section className="review-view">
      <div className="review-wrap">
        <button className="back-link" type="button" onClick={onBack}>← &nbsp;오늘로 돌아가기</button>
        <div className="review-heading">
          <span className="moon-icon">☾</span>
          <p>{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date())} · 오늘의 기록</p>
          <h1>오늘도 고생했어.<br /><em>해낸 일부터</em> 같이 볼까?</h1>
        </div>

        <div className="review-grid">
          <article className="review-card success-card">
            <div className="section-title"><span>✨</span><div><p>오늘 해낸 일</p><strong>{completeCount}가지나 앞으로 나아갔어</strong></div></div>
            <ul>{goals.filter((goal) => goal.done).map((goal) => <li key={goal.id}><span>✓</span>{goal.title}</li>)}</ul>
            {!completeCount && <p className="empty-copy">오늘을 돌아보러 온 것도 하나의 기록이야.</p>}
          </article>

          {unfinished.map((goal) => (
            <article className="review-card reflection-card" key={goal.id}>
              <div className="section-title"><span>☼</span><div><p>오늘 하기 어려웠던 일</p><strong>{goal.title}</strong></div></div>
              <p className="question">오늘은 왜 하기 어려웠을까?</p>
              <div className="reason-chips">
                {REASONS.map((reason) => <button className={goal.reason === reason ? "selected" : ""} type="button" key={reason} onClick={() => onUpdate(goal.id, { reason })}>{reason}</button>)}
              </div>
              <textarea value={goal.note || ""} onChange={(event) => onUpdate(goal.id, { note: event.target.value })} placeholder="이유를 한 줄로 남겨보세요 (선택)" aria-label={`${goal.title} 회고`} />
              <div className="carry-row">
                <div><strong>이 목표는 어떻게 할까?</strong><span>선택해도, 그냥 두어도 괜찮아.</span></div>
                <div className="segmented">
                  <button className={goal.carry === true ? "selected" : ""} type="button" onClick={() => onUpdate(goal.id, { carry: true })}>내일 다시 하기</button>
                  <button className={goal.carry === false ? "selected" : ""} type="button" onClick={() => onUpdate(goal.id, { carry: false })}>이번에는 그만하기</button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <button className="finish-review" type="button" onClick={onFinish}>오늘의 기록 남기기 <span>→</span></button>
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
            <div className="daily-card-head"><div><p>{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${selected.date}T12:00:00`))}</p><h2>오늘도 꽤 잘했어.</h2></div><span className="mini-mate">•ᴗ•</span></div>
            <div className="record-section"><p>✨ 오늘 해낸 일</p><ul>{selected.done.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul></div>
            {!!selected.unfinished.length && <div className="record-section unfinished"><p>☼ 다음으로 미룬 일</p>{selected.unfinished.map((item) => <div className="unfinished-item" key={item.title}><strong>{item.title}</strong><span>{item.reason}</span>{item.note && <q>{item.note}</q>}{item.carry && <em>내일 다시 해보기</em>}</div>)}</div>}
            <blockquote><span>“</span>{selected.note}<small>— 네 목표 메이트가</small></blockquote>
          </> : <div className="no-record"><span>☾</span><h2>아직 기록이 없어요</h2><p>오늘을 돌아보면 첫 카드가 생겨요.</p></div>}
        </article>
      </div>
    </section>
  );
}

function SettingsModal({ settings, onChange, onClose }: { settings: Settings; onChange: (value: Settings) => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head"><div><p>나의 리듬에 맞게</p><h2 id="settings-title">설정</h2></div><button type="button" onClick={onClose} aria-label="설정 닫기">×</button></div>
        <div className="setting-row"><div><strong>하루 시작</strong><span>오늘의 목표를 물어볼게.</span></div><input type="time" value={settings.morning} onChange={(event) => onChange({ ...settings, morning: event.target.value })} /></div>
        <div className="setting-row"><div><strong>하루 회고</strong><span>해낸 일을 같이 돌아볼게.</span></div><input type="time" value={settings.evening} onChange={(event) => onChange({ ...settings, evening: event.target.value })} /></div>
        <div className="setting-block"><strong>응원 빈도</strong><div className="setting-options">{(["거의 없음", "가끔", "자주"] as Settings["cheer"][]).map((option) => <button className={settings.cheer === option ? "selected" : ""} type="button" key={option} onClick={() => onChange({ ...settings, cheer: option })}>{option}</button>)}</div></div>
        <label className="toggle-row"><div><strong>목표 메이트 표시</strong><span>데스크톱 한쪽에서 기다릴게.</span></div><input type="checkbox" checked={settings.character} onChange={(event) => onChange({ ...settings, character: event.target.checked })} /><i /></label>
        <button className="save-settings" type="button" onClick={onClose}>이대로 함께하기</button>
      </section>
    </div>
  );
}
