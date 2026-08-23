const bubble = document.getElementById("bubble");
const character = document.getElementById("character");
const message = document.getElementById("message");
const status = document.getElementById("status");
const statusText = document.getElementById("statusText");
let lastCompleted = 0;

const celebrate = () => {
  character.classList.remove("celebrate");
  requestAnimationFrame(() => character.classList.add("celebrate"));
  setTimeout(() => character.classList.remove("celebrate"), 900);
};

character.addEventListener("click", () => window.oneuldoMate.talk());
character.addEventListener("dblclick", () => window.oneuldoMate.open());
bubble.addEventListener("click", () => window.oneuldoMate.open());
status.addEventListener("click", () => window.oneuldoMate.open());
document.addEventListener("contextmenu", (event) => { event.preventDefault(); window.oneuldoMate.menu(); });

window.oneuldoMate.onMessage((nextMessage) => {
  message.textContent = nextMessage;
  bubble.animate([{ transform:"translateY(5px)", opacity:.4 }, { transform:"translateY(0)", opacity:1 }], { duration:260, easing:"ease-out" });
  if (nextMessage.includes("완료") || nextMessage.includes("해냈")) celebrate();
});

window.oneuldoMate.onStatus(({ completed, total }) => {
  statusText.textContent = `${completed}/${total}`;
  if (completed > lastCompleted) celebrate();
  lastCompleted = completed;
});
