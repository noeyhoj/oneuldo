const bubble = document.getElementById("bubble");
const bubbleHeading = document.getElementById("bubbleHeading");
const character = document.getElementById("character");
const message = document.getElementById("message");
const statusText = document.getElementById("statusText");
const characterImage = document.getElementById("characterImage");
let lastCompleted = 0;
let bubbleTimer;
let speechTimer;
let pointerDrag;
let suppressCharacterClick = false;

const BUBBLE_VISIBLE_MS = 5000;
const SPEECH_INTERVALS = {
  "거의 없음": 10 * 60 * 1000,
  "가끔": 3 * 60 * 1000,
  "자주": 60 * 1000,
};
const MATE_ASSETS = {
  cat: "assets/mate-cat-sign-3d.png",
  dog: "assets/mate-dog-sign-3d.png",
  rabbit: "assets/mate-rabbit-sign-3d.png",
  bear: "assets/mate-bear-sign-3d.png",
};
const MATE_LABELS = { cat: "고양이", dog: "강아지", rabbit: "토끼", bear: "곰" };
const MATE_SCALES = { small: 0.8, medium: 1, large: 1.2 };

const hideBubble = () => {
  bubble.classList.add("is-hidden");
  bubble.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-speaking");
  window.oneuldoMate.resize(false);
};

const showBubble = (nextMessage) => {
  if (nextMessage) {
    message.textContent = nextMessage;
    bubbleHeading.textContent = nextMessage.includes("해냈") || nextMessage.includes("성취") || nextMessage.includes("발자국")
      ? "오늘의 발자국이야"
      : nextMessage.includes("쉬") || nextMessage.includes("숨")
        ? "잠깐 쉬어가도 좋아"
        : "오늘도 네 편이야 🌿";
  }
  clearTimeout(bubbleTimer);
  document.body.classList.add("is-speaking");
  window.oneuldoMate.resize(true);
  bubble.classList.remove("is-hidden");
  bubble.removeAttribute("aria-hidden");
  bubbleTimer = setTimeout(hideBubble, BUBBLE_VISIBLE_MS);
};

const resetPeriodicSpeech = (cheer = "가끔") => {
  clearInterval(speechTimer);
  speechTimer = setInterval(
    () => window.oneuldoMate.talk(),
    SPEECH_INTERVALS[cheer] || SPEECH_INTERVALS["가끔"],
  );
};

const celebrate = () => {
  character.classList.remove("celebrate");
  requestAnimationFrame(() => character.classList.add("celebrate"));
  setTimeout(() => character.classList.remove("celebrate"), 900);
};

character.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  pointerDrag = { id: event.pointerId, x: event.screenX, y: event.screenY, active: false };
  character.setPointerCapture(event.pointerId);
});

character.addEventListener("pointermove", (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.id) return;
  if (!pointerDrag.active && Math.hypot(event.screenX - pointerDrag.x, event.screenY - pointerDrag.y) >= 5) {
    pointerDrag.active = true;
    suppressCharacterClick = true;
    character.classList.add("is-dragging");
    window.oneuldoMate.startDrag();
  }
  if (pointerDrag.active) window.oneuldoMate.drag();
});

const finishPointerDrag = (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.id) return;
  if (pointerDrag.active) window.oneuldoMate.endDrag();
  character.classList.remove("is-dragging");
  if (character.hasPointerCapture(event.pointerId)) character.releasePointerCapture(event.pointerId);
  pointerDrag = undefined;
};

character.addEventListener("pointerup", finishPointerDrag);
character.addEventListener("pointercancel", finishPointerDrag);
character.addEventListener("click", (event) => {
  if (suppressCharacterClick) {
    event.preventDefault();
    suppressCharacterClick = false;
    return;
  }
  window.oneuldoMate.talk();
});
character.addEventListener("dblclick", () => window.oneuldoMate.open());
bubble.addEventListener("click", () => window.oneuldoMate.open());
document.addEventListener("contextmenu", (event) => { event.preventDefault(); window.oneuldoMate.menu(); });

window.oneuldoMate.onMessage((nextMessage) => {
  showBubble(nextMessage);
  bubble.animate([{ transform:"translateY(5px) scale(.98)", opacity:.4 }, { transform:"translateY(0) scale(1)", opacity:1 }], { duration:260, easing:"ease-out" });
  if (nextMessage.includes("완료") || nextMessage.includes("해냈")) celebrate();
});

window.oneuldoMate.onStatus(({ completed, total, theme = "coral", cheer = "가끔", animal = "cat", characterSize = "medium" }) => {
  const safeAnimal = MATE_ASSETS[animal] ? animal : "cat";
  const safeScale = MATE_SCALES[characterSize] || MATE_SCALES.medium;
  if (!characterImage.src.endsWith(MATE_ASSETS[safeAnimal])) characterImage.src = MATE_ASSETS[safeAnimal];
  document.body.dataset.animal = safeAnimal;
  document.body.dataset.size = MATE_SCALES[characterSize] ? characterSize : "medium";
  document.documentElement.style.setProperty("--mate-scale", String(safeScale));
  statusText.textContent = `${completed} / ${total}`;
  character.setAttribute("aria-label", `${MATE_LABELS[safeAnimal]} 목표 메이트. 오늘 목표 ${completed}/${total}. 드래그해서 옮기거나 클릭해서 대화하기`);
  const progress = total ? completed / total : 0;
  const progressColor = progress >= 1 ? "#4f9a68" : progress >= .5 ? "#e28a38" : progress > 0 ? "#ef7654" : "#8f735e";
  document.body.style.setProperty("--progress", String(progress));
  document.body.style.setProperty("--progress-color", progressColor);
  document.body.classList.remove("theme-coral", "theme-sage", "theme-lavender");
  document.body.classList.add(`theme-${theme}`);
  if (completed > lastCompleted) celebrate();
  lastCompleted = completed;
  window.oneuldoMate.resize(document.body.classList.contains("is-speaking"));
  resetPeriodicSpeech(cheer);
});

showBubble();
resetPeriodicSpeech();
