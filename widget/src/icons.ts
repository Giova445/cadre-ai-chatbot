// Tiny inlined SVG icons for the launcher/composer. Every string here is a
// static, hardcoded constant — never user- or model-derived data — so
// `innerHTML` is safe. Anything that renders user input or model output (chat
// text, starter-chip labels) MUST use `textContent` instead (see panel.ts).

function svgIcon(pathMarkup: string, viewBox = "0 0 24 24"): SVGElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<svg viewBox="${viewBox}" fill="currentColor" aria-hidden="true"><title></title>${pathMarkup}</svg>`;
  return wrapper.firstElementChild as SVGElement;
}

const CHAT_PATH =
  '<path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2z"/>';

const CLOSE_PATH =
  '<path d="M6.4 4.98L4.98 6.4 10.59 12l-5.61 5.6 1.42 1.42L12 13.41l5.6 5.61 1.41-1.42L13.4 12l5.61-5.6-1.42-1.42L12 10.59z"/>';

const SEND_PATH =
  '<path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/>';

export function createChatIcon(): SVGElement {
  return svgIcon(CHAT_PATH);
}

export function createCloseIcon(): SVGElement {
  return svgIcon(CLOSE_PATH);
}

export function createSendIcon(): SVGElement {
  return svgIcon(SEND_PATH);
}
