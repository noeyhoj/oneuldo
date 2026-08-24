const shortTitle = (title) => title.length > 28 ? `${title.slice(0, 27)}…` : title;

function createTrayTemplate({ state, prefs, actions }) {
  const attentionItems = [];
  if (state.attention?.reviewPending) attentionItems.push({ label: "☾ 오늘 돌아보기 · 아직", click: actions.openReview });
  if (state.attention?.startPending) attentionItems.push({ label: "● 오늘의 TODO를 아직 정하지 않았어요", click: actions.openToday });
  const goalItems = state.goals.length
    ? state.goals.map((goal) => ({
      label: shortTitle(goal.title),
      type: "checkbox",
      checked: Boolean(goal.done),
      click: () => actions.toggleGoal(goal.id),
    }))
    : [{ label: "오늘 등록한 목표가 없어요", enabled: false }];

  return [
    ...attentionItems,
    ...(attentionItems.length ? [{ type: "separator" }] : []),
    { label: state.total ? `오늘 ${state.completed}/${state.total}개 완료` : "오늘의 목표가 아직 없어요", enabled: false },
    { type: "separator" },
    ...goalItems,
    { type: "separator" },
    { label: "＋ 새 목표 추가…", click: actions.addGoal },
    { label: "오늘 화면 열기", accelerator: "CommandOrControl+Shift+O", click: actions.openToday },
    { label: "오늘 돌아보기", click: actions.openReview },
    { label: "내 기록 보기", click: actions.openRecords },
    { label: "설정…", click: actions.openSettings },
    { label: "메뉴 막대 표시 설정…", click: actions.openMenuBarSettings },
    { type: "separator" },
    { label: "목표 메이트 보기", type: "checkbox", checked: prefs.mateVisible, click: (item) => actions.setMateVisible(item.checked) },
    { label: "알림 받기", type: "checkbox", checked: prefs.reminders, click: (item) => actions.setReminders(item.checked) },
    { label: "로그인할 때 실행", type: "checkbox", checked: prefs.openAtLogin, click: (item) => actions.setOpenAtLogin(item.checked) },
    { type: "separator" },
    { label: "오늘도 종료", click: actions.quit },
  ];
}

module.exports = { createTrayTemplate };
