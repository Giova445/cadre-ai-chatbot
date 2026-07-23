// The floating launcher bubble: bottom-corner button that toggles the panel,
// swaps its icon (chat <-> close), and carries an unread-count badge for
// answers that complete while the panel is closed.

import { createChatIcon, createCloseIcon } from "./icons";
import type { WidgetConfig } from "./config";

export type LauncherController = {
  element: HTMLButtonElement;
  setOpen(open: boolean): void;
  setUnread(count: number): void;
};

export function createLauncher(cfg: WidgetConfig, onToggle: () => void): LauncherController {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cadre-launcher";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", "cadre-panel");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", cfg.launcherLabel);

  const iconWrap = document.createElement("span");
  iconWrap.className = "cadre-launcher-icon";
  iconWrap.append(createChatIcon());

  const badge = document.createElement("span");
  badge.className = "cadre-badge";
  badge.hidden = true;
  badge.setAttribute("aria-hidden", "true");

  button.append(iconWrap, badge);
  button.addEventListener("click", onToggle);

  function setUnread(count: number): void {
    if (count <= 0) {
      badge.hidden = true;
      badge.textContent = "";
      return;
    }
    badge.hidden = false;
    badge.textContent = count > 9 ? "9+" : String(count);
  }

  function setOpen(open: boolean): void {
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close chat" : cfg.launcherLabel);
    iconWrap.replaceChildren(open ? createCloseIcon() : createChatIcon());
    if (open) setUnread(0);
  }

  return { element: button, setOpen, setUnread };
}
