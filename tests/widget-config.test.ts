import { describe, it, expect } from "vitest";
import { parseConfig, parseStarters } from "@/widget/src/config";

const SCRIPT_SRC = "https://chat.gocadre.ai/widget.js";

describe("widget config — parseConfig precedence + defaults", () => {
  it("falls all the way through to built-in defaults", () => {
    const cfg = parseConfig({}, undefined, SCRIPT_SRC);
    expect(cfg.client).toBe("");
    expect(cfg.apiBase).toBe("https://chat.gocadre.ai");
    expect(cfg.color).toBe("#db4545");
    expect(cfg.position).toBe("bottom-right");
    expect(cfg.theme).toBe("auto");
    expect(cfg.launcherLabel).toBe("Chat with us");
    expect(cfg.greeting).toMatch(/Cadre AI/);
    expect(cfg.starters).toBeNull();
  });

  it("apiBase auto-derives from the script src origin (trailing slash stripped)", () => {
    const cfg = parseConfig({}, undefined, "https://staging.gocadre.ai/widget.js?v=2");
    expect(cfg.apiBase).toBe("https://staging.gocadre.ai");
  });

  it("contactUrl defaults to an ABSOLUTE URL on apiBase, not a host-relative path", () => {
    const cfg = parseConfig({}, undefined, SCRIPT_SRC);
    expect(cfg.contactUrl).toBe("https://chat.gocadre.ai/contact");
  });

  it("data-* attributes override built-in defaults", () => {
    const cfg = parseConfig(
      {
        client: "acme",
        color: "#111111",
        position: "bottom-left",
        greeting: "Hi from Acme",
        launcherLabel: "Ask Acme",
        theme: "dark",
        contactUrl: "https://chat.gocadre.ai/talk-to-us",
      },
      undefined,
      SCRIPT_SRC,
    );
    expect(cfg.client).toBe("acme");
    expect(cfg.color).toBe("#111111");
    expect(cfg.position).toBe("bottom-left");
    expect(cfg.greeting).toBe("Hi from Acme");
    expect(cfg.launcherLabel).toBe("Ask Acme");
    expect(cfg.theme).toBe("dark");
    expect(cfg.contactUrl).toBe("https://chat.gocadre.ai/talk-to-us");
  });

  it("window.CadreChat overrides data-* (precedence: window > data-* > defaults)", () => {
    const cfg = parseConfig(
      { client: "from-data", color: "#222222" },
      { client: "from-window" },
      SCRIPT_SRC,
    );
    expect(cfg.client).toBe("from-window");
    expect(cfg.color).toBe("#222222"); // untouched at the window tier -> falls to data-*
  });

  it("rejects an invalid data-position / data-theme and falls back to defaults", () => {
    const cfg = parseConfig({ position: "top-center", theme: "purple" }, undefined, SCRIPT_SRC);
    expect(cfg.position).toBe("bottom-right");
    expect(cfg.theme).toBe("auto");
  });

  it("returns a frozen object", () => {
    const cfg = parseConfig({}, undefined, SCRIPT_SRC);
    expect(Object.isFrozen(cfg)).toBe(true);
  });
});

describe("widget config — starters parsing", () => {
  it("is null (unset) when neither tier supplies starters", () => {
    const cfg = parseConfig({}, undefined, SCRIPT_SRC);
    expect(cfg.starters).toBeNull();
  });

  it("parses a JSON array from data-starters", () => {
    const cfg = parseConfig(
      { starters: '["What is Cadre?","How do I book a call?"]' },
      undefined,
      SCRIPT_SRC,
    );
    expect(cfg.starters).toEqual(["What is Cadre?", "How do I book a call?"]);
  });

  it("parses a `|`-delimited string from data-starters when it isn't valid JSON", () => {
    const cfg = parseConfig(
      { starters: "What is Cadre?|How do I book a call?" },
      undefined,
      SCRIPT_SRC,
    );
    expect(cfg.starters).toEqual(["What is Cadre?", "How do I book a call?"]);
  });

  it("treats an empty data-starters attribute as an explicit \"no chips\"", () => {
    const cfg = parseConfig({ starters: "" }, undefined, SCRIPT_SRC);
    expect(cfg.starters).toEqual([]);
  });

  it("accepts window.CadreChat.starters as a plain array (no parsing needed)", () => {
    const cfg = parseConfig({}, { starters: ["a", "b"] }, SCRIPT_SRC);
    expect(cfg.starters).toEqual(["a", "b"]);
  });

  it("window.CadreChat.starters overrides data-starters", () => {
    const cfg = parseConfig(
      { starters: "from-data-1|from-data-2" },
      { starters: ["from-window"] },
      SCRIPT_SRC,
    );
    expect(cfg.starters).toEqual(["from-window"]);
  });

  it("sanitizes (trims/dedupes/caps) whatever it parses", () => {
    const cfg = parseConfig(
      { starters: JSON.stringify(["  hi  ", "hi", "HI", ""]) },
      undefined,
      SCRIPT_SRC,
    );
    expect(cfg.starters).toEqual(["hi"]);
  });

  it("parseStarters: null/undefined -> null; non-array/non-string -> null", () => {
    expect(parseStarters(undefined)).toBeNull();
    expect(parseStarters(null)).toBeNull();
    expect(parseStarters(42)).toBeNull();
  });
});
