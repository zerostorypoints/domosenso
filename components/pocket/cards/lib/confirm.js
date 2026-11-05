// Confirming a risky act in place (DESIGN.md: unlock, close all, sound a siren). No dialog: the first
// tap arms the button, which then reads `confirmText()` (data-armed set) for ARM_MS; a second tap in
// that time acts, otherwise it goes back. An act that needs no confirmation (`safe()` true: locking a
// lock, stopping a siren) runs `safeAct` at the first tap instead.
//
//   armed(button, confirmText, act, safe?, safeAct?)

export const ARM_MS = 4000;

export function armed(button, confirmText, act, safe = () => false, safeAct = act) {
  let timer = null;
  let before = "";
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    if (button.hasAttribute("data-armed")) {
      button.removeAttribute("data-armed");
      button.textContent = before;
    }
  };
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (button.hasAttribute("data-armed")) {
      disarm();
      act();
      return;
    }
    if (safe()) {
      safeAct();
      return;
    }
    before = button.textContent;
    button.setAttribute("data-armed", "");
    button.textContent = confirmText();
    timer = setTimeout(disarm, ARM_MS);
  });
  return disarm;
}
