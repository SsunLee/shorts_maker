import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    parsed[args[index]?.replace(/^--/, "")] = args[index + 1];
  }
  return parsed;
}

const args = parseArgs();
const payloadPath = args.payload;
const statusPath = args.status;

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeStatus(patch) {
  const current = await readJson(statusPath).catch(() => ({ logs: [] }));
  const next = {
    ...current,
    ...patch,
    logs: patch.logs || current.logs || [],
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(statusPath, JSON.stringify(next, null, 2), "utf8");
}

async function log(message, step = "running") {
  const current = await readJson(statusPath).catch(() => ({ logs: [] }));
  const logs = [...(current.logs || []), { at: new Date().toISOString(), message }].slice(-100);
  await writeStatus({ logs, message, step });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '<figure><img src="$2" alt="$1" /><figcaption>$1</figcaption></figure>')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownTableToHtml(lines) {
  const rows = lines
    .filter((line) => line.includes("|") && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => inlineMarkdownToHtml(cell.trim()))
    );
  if (rows.length === 0) {
    return "";
  }
  const [head, ...body] = rows;
  const headHtml = head.map((cell) => `<th>${cell}</th>`).join("");
  const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let tableLines = [];
  let listLines = [];
  let codeLines = [];
  let inCode = false;
  let codeLang = "";

  const flushTable = () => {
    if (tableLines.length > 0) {
      html.push(markdownTableToHtml(tableLines));
      tableLines = [];
    }
  };
  const flushList = () => {
    if (listLines.length > 0) {
      html.push(`<ul>${listLines.map((line) => `<li>${inlineMarkdownToHtml(line.replace(/^-\s*/, ""))}</li>`).join("")}</ul>`);
      listLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flushTable();
      flushList();
      if (inCode) {
        const code = escapeHtml(codeLines.join("\n"));
        html.push(`<pre><code>${code}</code></pre>`);
        codeLines = [];
        inCode = false;
        codeLang = "";
      } else {
        inCode = true;
        codeLang = trimmed.replace(/^```/, "").trim().toLowerCase();
      }
      continue;
    }
    if (inCode) {
      if (codeLang !== "ai-image") {
        codeLines.push(line);
      }
      continue;
    }
    if (!trimmed) {
      flushTable();
      flushList();
      html.push("<p><br /></p>");
      continue;
    }
    if (trimmed.startsWith("<")) {
      flushTable();
      flushList();
      html.push(line);
      continue;
    }
    if (trimmed.startsWith("|")) {
      flushList();
      tableLines.push(line);
      continue;
    }
    if (trimmed.startsWith("- ")) {
      flushTable();
      listLines.push(line);
      continue;
    }
    flushTable();
    flushList();
    if (line.startsWith("## ")) {
      html.push(`<h2>${inlineMarkdownToHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${inlineMarkdownToHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      html.push(`<blockquote>${inlineMarkdownToHtml(line.slice(2))}</blockquote>`);
    } else {
      html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
    }
  }
  flushTable();
  flushList();
  return html.join("\n");
}

function normalizePosts(payload) {
  const rawPosts = Array.isArray(payload.posts) && payload.posts.length > 0
    ? payload.posts
    : [
        {
          body: payload.body || "",
          category: payload.category,
          tags: payload.tags || "",
          title: payload.title || ""
        }
      ];

  return rawPosts.map((post, index) => ({
    body: String(post.body || ""),
    category: String(post.category || payload.category || "주식").trim() || "주식",
    index,
    tags: String(post.tags || ""),
    title: String(post.title || "").trim()
  }));
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return undefined;
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function normalizeBrowserLaunchError(error, profileDir) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const message = stripAnsi(rawMessage);
  const lower = message.toLowerCase();
  const normalizedProfile = String(profileDir || "").toLowerCase();
  const looksLikeProfileConflict =
    lower.includes("target page, context or browser has been closed") &&
    (lower.includes("--user-data-dir") || (normalizedProfile && lower.includes(normalizedProfile)));

  if (!looksLikeProfileConflict) {
    return error instanceof Error ? error : new Error(rawMessage || "Chrome 실행에 실패했습니다.");
  }

  return new Error(
    [
      "티스토리 자동화 Chrome 프로필이 이미 사용 중이라 브라우저를 열 수 없습니다.",
      "자동화에서 열린 Chrome 창을 닫고 다시 실행해 주세요.",
      "일반 Chrome 창은 괜찮지만, 같은 자동화 프로필은 동시에 열 수 없습니다.",
      `프로필: ${profileDir}`
    ].join(" ")
  );
}

async function launchTistoryBrowser(profileDir, launchOptions) {
  try {
    return await chromium.launchPersistentContext(profileDir, launchOptions);
  } catch (error) {
    throw normalizeBrowserLaunchError(error, profileDir);
  }
}

async function setTitle(page, title) {
  const titleLocator = page
    .locator("textarea#post-title-inp, textarea[placeholder*='제목'], textarea[placeholder*='title'], input[placeholder*='제목'], input[placeholder*='title']")
    .first();

  const directInputOk = await titleLocator
    .click({ timeout: 5000 })
    .then(async () => {
      await page.keyboard.press("Control+A").catch(() => null);
      await page.keyboard.press("Backspace").catch(() => null);
      await page.keyboard.insertText(title);
      await page.waitForTimeout(300);
      return true;
    })
    .catch(() => false);

  const synced = await page
    .evaluate((value) => {
      const candidates = Array.from(document.querySelectorAll("textarea,input,[contenteditable='true']"));
      const target =
        document.querySelector("textarea#post-title-inp") ||
        candidates.find((element) => {
          const text = [
            element.id,
            element.getAttribute("name"),
            element.getAttribute("placeholder"),
            element.getAttribute("aria-label"),
            element.getAttribute("data-placeholder"),
            element.className
          ]
            .filter(Boolean)
            .join(" ");
          return /title|제목|post-title/i.test(text);
        });
      if (!target) return false;

      const setter =
        target instanceof HTMLTextAreaElement
          ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
          : target instanceof HTMLInputElement
            ? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
            : undefined;
      if (setter) {
        setter.call(target, value);
      } else if ("value" in target) {
        target.value = value;
      } else {
        target.textContent = value;
      }
      target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
      target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
      target.dispatchEvent(new Event("blur", { bubbles: true }));
      target.dispatchEvent(new Event("focusout", { bubbles: true }));
      return String("value" in target ? target.value : target.textContent || "").includes(value.slice(0, 20));
    }, title)
    .catch(() => false);

  return directInputOk || synced;
}

async function setEditorContent(page, html) {
  for (const frame of page.frames()) {
    try {
      const ok = await frame.evaluate((content) => {
        const win = window;
        if (win.tinymce?.activeEditor) {
          win.tinymce.activeEditor.setContent(content);
          win.tinymce.activeEditor.fire("change");
          return true;
        }
        const candidates = Array.from(document.querySelectorAll("[contenteditable='true'], textarea"));
        const target =
          candidates.find((element) => element.id === "tinymce" || String(element.className || "").includes("mce-content-body")) ||
          candidates
            .map((element) => ({ element, area: element.getBoundingClientRect().width * element.getBoundingClientRect().height }))
            .sort((a, b) => b.area - a.area)[0]?.element;
        if (!target) return false;
        if ("value" in target) {
          target.value = content;
        } else {
          target.innerHTML = content;
        }
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, html);
      if (ok) return true;
    } catch {
      // cross-origin or inaccessible frame
    }
  }
  return false;
}

async function findVisibleTextElement(page, patterns) {
  return page.evaluate((patternSources) => {
    const regexes = patternSources.map((source) => new RegExp(source, "i"));
    const candidates = Array.from(document.querySelectorAll("button,a,[role='button'],span,div"));
    const visible = candidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const matched = visible.find((element) => {
      const text = (element.textContent || "").trim().replace(/\s+/g, " ");
      return text && regexes.some((regex) => regex.test(text));
    });
    return matched ? (matched.textContent || "").trim().replace(/\s+/g, " ") : "";
  }, patterns.map((pattern) => pattern.source));
}

async function getTistoryEditorMode(page) {
  return page
    .evaluate(() => {
      const modeCandidates = Array.from(document.querySelectorAll("button,a,[role='button'],span,div"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.top < 260 &&
            rect.width <= 180 &&
            rect.height <= 70 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const text = (element.textContent || "").trim().replace(/\s+/g, " ");
          const compact = text.replace(/\s/g, "").replace(/[▾▼⌄∨⌃▲]/g, "");
          return { compact, left: rect.left, text, top: rect.top };
        })
        .filter((item) => item.compact.length > 0 && item.compact.length <= 18)
        .filter((item) => /기본모드|마크다운|Markdown|HTML|Basic/i.test(item.compact))
        .sort((a, b) => {
          const aCurrentScore = /모드|Markdown|HTML|Basic/i.test(a.compact) ? 0 : 1;
          const bCurrentScore = /모드|Markdown|HTML|Basic/i.test(b.compact) ? 0 : 1;
          if (aCurrentScore !== bCurrentScore) return aCurrentScore - bCurrentScore;
          return b.left - a.left;
        });

      const current = modeCandidates[0]?.compact || "";
      if (/기본모드|Basic/i.test(current)) return "basic";
      if (/마크다운|Markdown/i.test(current)) return "markdown";
      if (/HTML/i.test(current)) return "html";
      return "unknown";
    })
    .catch(() => "unknown");
}

async function isMarkdownEditorMode(page) {
  return (await getTistoryEditorMode(page)) === "markdown";
}

async function waitForMarkdownEditorMode(page, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isMarkdownEditorMode(page)) {
      return true;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function clickTextWithPlaywright(page, patterns, timeoutMs = 5000) {
  const perAttemptTimeout = Math.max(500, Math.floor(timeoutMs / Math.max(1, patterns.length * 2)));
  for (const pattern of patterns) {
    const roleNames = ["button", "menuitem", "option", "combobox"];
    for (const roleName of roleNames) {
      try {
        await page.getByRole(roleName, { name: pattern }).first().click({ timeout: perAttemptTimeout });
        return true;
      } catch {
        // try next role/text
      }
    }
    try {
      await page.getByText(pattern).first().click({ timeout: perAttemptTimeout });
      return true;
    } catch {
      // synthetic DOM fallback below
    }
  }
  return false;
}

async function clickVisibleText(page, patterns, timeoutMs = 10000) {
  const trustedClicked = await clickTextWithPlaywright(page, patterns, Math.min(timeoutMs, 6000));
  if (trustedClicked) {
    return true;
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const clicked = await page.evaluate((patternSources) => {
      const regexes = patternSources.map((source) => new RegExp(source, "i"));
      const candidates = Array.from(document.querySelectorAll("button,a,[role='button'],span,div,li"));
      const visible = candidates.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
      const matched = visible.find((element) => {
        const text = (element.textContent || "").trim().replace(/\s+/g, " ");
        return text && regexes.some((regex) => regex.test(text));
      });
      if (!matched) return false;
      matched.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      matched.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      matched.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    }, patterns.map((pattern) => pattern.source));
    if (clicked) {
      return true;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function confirmModeChangeIfNeeded(page) {
  const clicked = await clickVisibleText(page, [/^확인$/, /^OK$/i], 2000);
  if (clicked) {
    await log("전환 확인 팝업의 확인 버튼을 클릭했습니다.", "mode-confirm");
    await page.waitForTimeout(800);
  }
  return clicked;
}

async function selectTistoryCategory(page, categoryName) {
  const category = String(categoryName || "").trim();
  if (!category) {
    return false;
  }

  await log(`카테고리 '${category}' 선택을 시도합니다.`, "category");

  const nativeSelected = await page
    .evaluate((targetCategory) => {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const select of selects) {
        const option = Array.from(select.options || []).find((item) => (item.textContent || "").trim() === targetCategory);
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }, category)
    .catch(() => false);
  if (nativeSelected) {
    await log(`카테고리 '${category}'를 선택했습니다.`, "category");
    return true;
  }

  const categoryPattern = new RegExp(`^${escapeRegExp(category)}$`);
  const alreadySelected = await findVisibleTextElement(page, [categoryPattern]);
  if (alreadySelected) {
    await log(`카테고리 '${category}'가 이미 선택된 것으로 보입니다.`, "category");
    return true;
  }

  const opened = await clickVisibleText(page, [/^카테고리$/, /카테고리/], 5000);
  if (!opened) {
    await log("카테고리 드롭다운을 찾지 못했습니다. 카테고리는 수동 확인이 필요합니다.", "category");
    return false;
  }
  await page.waitForTimeout(500);

  const selected = await clickVisibleText(page, [categoryPattern], 5000);
  await log(
    selected ? `카테고리 '${category}'를 선택했습니다.` : `카테고리 '${category}' 항목을 찾지 못했습니다. 수동 확인이 필요합니다.`,
    "category"
  );
  return selected;
}

async function switchEditorToMarkdown(page) {
  await log("에디터 모드를 확인합니다.", "mode-check");
  const currentMode = await getTistoryEditorMode(page);
  await log(`현재 에디터 모드 감지: ${currentMode}`, "mode-check");
  if (currentMode === "markdown") {
    await log("이미 마크다운 모드라서 전환을 건너뜁니다.", "mode-check");
    return true;
  }

  await log("기본모드 드롭다운을 선택합니다.", "mode-open");
  const opened = await clickVisibleText(page, [/^기본모드$/, /기본모드/, /^기본$/, /^Basic$/i, /^HTML$/i]);
  if (!opened) {
    throw new Error("티스토리 에디터 모드 드롭다운을 찾지 못했습니다.");
  }
  await page.waitForTimeout(500);

  await log("마크다운 메뉴를 선택합니다.", "mode-markdown");
  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 5000 })
    .then(async (dialog) => {
      await log(`전환 확인 팝업을 확인합니다: ${dialog.message()}`, "mode-confirm");
      await dialog.accept();
      return true;
    })
    .catch(() => false);

  const selected = await clickVisibleText(page, [/^마크다운$/, /^Markdown$/i]);
  if (!selected) {
    throw new Error("티스토리 에디터 모드 메뉴에서 마크다운 항목을 찾지 못했습니다.");
  }
  const dialogHandled = await dialogPromise;
  if (!dialogHandled) {
    const domConfirmed = await confirmModeChangeIfNeeded(page);
    if (!domConfirmed) {
      await log("전환 확인 팝업은 표시되지 않았습니다. 계속 진행합니다.", "mode-confirm");
    }
  }
  await page.waitForTimeout(1200);

  const nextMode = await waitForMarkdownEditorMode(page);
  if (!nextMode) {
    throw new Error("마크다운 모드 전환을 확인하지 못했습니다.");
  }
  await log("마크다운 모드 전환을 확인했습니다.", "mode-done");
  return true;
}

async function waitForMarkdownEditorReady(page, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await page
      .evaluate(() => {
        const container = document.querySelector("#markdown-editor-container");
        const codeMirrorElement = container?.querySelector(".CodeMirror");
        const rect = codeMirrorElement?.getBoundingClientRect();
        return Boolean(container && codeMirrorElement && rect && rect.width > 0 && rect.height > 0);
      })
      .catch(() => false);
    if (ready) {
      return true;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function verifyMarkdownEditorContent(page, expected) {
  const needle = String(expected || "").trim().slice(0, 80);
  if (!needle) {
    return true;
  }
  return page
    .evaluate((value) => {
      const container = document.querySelector("#markdown-editor-container");
      const codeMirrorElement = container?.querySelector(".CodeMirror");
      const cm = codeMirrorElement?.CodeMirror;
      if (cm?.getValue) {
        return String(cm.getValue() || "").includes(value);
      }
      return String(container?.innerText || "").includes(value);
    }, needle)
    .catch(() => false);
}

async function syncMarkdownEditorState(page, markdown) {
  return page
    .evaluate((content) => {
      const container = document.querySelector("#markdown-editor-container");
      const codeMirrorElement = container?.querySelector(".CodeMirror");
      const cm = codeMirrorElement?.CodeMirror;
      if (cm?.save) {
        cm.save();
      }

      const current = String(cm?.getValue?.() || content || "");
      const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      const emit = (element) => {
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
        element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));
        element.dispatchEvent(new Event("focusout", { bubbles: true }));
      };

      for (const textarea of Array.from(container?.querySelectorAll("textarea") || [])) {
        textareaSetter?.call(textarea, current);
        emit(textarea);
      }
      for (const input of Array.from(container?.querySelectorAll("input") || [])) {
        inputSetter?.call(input, current);
        emit(input);
      }
      if (codeMirrorElement) {
        emit(codeMirrorElement);
      }
      if (container) {
        emit(container);
      }
      return Boolean(current.trim());
    }, markdown)
    .catch(() => false);
}

async function setMarkdownEditorContent(page, markdown) {
  const ready = await waitForMarkdownEditorReady(page);
  if (!ready) {
    await log("Markdown 에디터 컨테이너가 아직 준비되지 않았습니다.", "fill-body");
    return false;
  }

  const editor = page.locator("#markdown-editor-container .CodeMirror").first();
  await editor.click({ timeout: 5000 });
  await page.keyboard.press("Control+A").catch(() => null);
  await page.keyboard.press("Backspace").catch(() => null);
  await page.keyboard.insertText(markdown);
  await page.waitForTimeout(800);
  await syncMarkdownEditorState(page, markdown);

  if (await verifyMarkdownEditorContent(page, markdown)) {
    await log("CodeMirror 실제 입력 경로로 본문 입력을 확인했습니다.", "fill-body");
    return true;
  }

  await log("실제 입력 확인에 실패해 CodeMirror 내부 API로 재시도합니다.", "fill-body");
  await page
    .evaluate((content) => {
      const codeMirrorElement = document.querySelector("#markdown-editor-container .CodeMirror");
      const cm = codeMirrorElement?.CodeMirror;
      if (!cm?.setValue) {
        return false;
      }
      cm.focus?.();
      cm.setValue(content);
      cm.refresh?.();
      cm.save?.();
      return true;
    }, markdown)
    .catch(() => false);
  await syncMarkdownEditorState(page, markdown);
  await page.waitForTimeout(800);
  return verifyMarkdownEditorContent(page, markdown);
}

async function setTags(page, tags) {
  const normalized = String(tags || "")
    .split(/\s+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .join(", ");
  if (!normalized) {
    return false;
  }
  return page.evaluate((value) => {
    const candidates = Array.from(document.querySelectorAll("input,textarea,[contenteditable='true']"));
    const target = candidates.find((element) => {
      const text = [
        element.id,
        element.getAttribute("name"),
        element.getAttribute("placeholder"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-placeholder"),
        element.className
      ]
        .filter(Boolean)
        .join(" ");
      return /tag|태그/i.test(text);
    });
    if (!target) return false;
    if ("value" in target) {
      target.value = value;
    } else {
      target.textContent = value;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, normalized);
}

async function publishTistoryPost(page) {
  await log("완료 버튼을 클릭해 발행 바텀시트를 엽니다.", "publish-open");
  const opened = await clickVisibleText(page, [/^완료$/, /^Done$/i], 8000);
  if (!opened) {
    throw new Error("티스토리 완료 버튼을 찾지 못했습니다. 발행 단계는 수동 확인이 필요합니다.");
  }
  await page.waitForTimeout(1200);

  await log("발행 바텀시트에서 공개 옵션을 선택합니다.", "publish-public");
  const publicSelected = await clickVisibleText(page, [/^공개$/], 5000);
  if (!publicSelected) {
    await log("공개 옵션을 자동 선택하지 못했습니다. 기본 공개 상태인지 열린 화면에서 확인해 주세요.", "publish-public");
  }
  await page.waitForTimeout(700);

  await log("공개 발행 버튼 클릭을 시도합니다.", "publish-submit");
  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 5000 })
    .then(async (dialog) => {
      await log(`발행 확인 팝업을 확인합니다: ${dialog.message()}`, "publish-confirm");
      await dialog.accept();
      return true;
    })
    .catch(() => false);

  const submitted = await clickVisibleText(page, [/^공개 발행$/, /공개\s*발행/, /^발행$/, /^발행하기$/, /^게시$/], 8000);
  if (!submitted) {
    throw new Error("티스토리 공개 발행 버튼을 찾지 못했습니다. 발행 바텀시트 구조를 확인해 주세요.");
  }
  await dialogPromise;
  await clickVisibleText(page, [/^확인$/, /^OK$/i], 2000).catch(() => false);
  await page.waitForTimeout(2000);
  await log("공개 발행 버튼을 클릭했습니다. 티스토리 화면에서 발행 결과를 최종 확인해 주세요.", "publish-submit");
}

async function waitForWriteScreen(page, timeoutMs) {
  const started = Date.now();
  let noticeShown = false;
  while (Date.now() - started < timeoutMs) {
      const ready = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        const hasTitle = Array.from(document.querySelectorAll("textarea,input,[contenteditable='true']")).some((element) => {
        const hint = [
          element.id,
          element.getAttribute("placeholder"),
          element.getAttribute("aria-label"),
          element.getAttribute("data-placeholder")
        ]
          .filter(Boolean)
          .join(" ");
        return /title|제목|post-title/i.test(hint);
      });
      return hasTitle || /제목을 입력|완료|임시저장/.test(text);
    }).catch(() => false);
    if (ready) {
      return true;
    }
    if (!noticeShown) {
      await log("글쓰기 화면을 기다리는 중입니다. 로그인 화면이 보이면 열린 Chrome에서 직접 로그인해 주세요.", "wait-login");
      noticeShown = true;
    }
    await page.waitForTimeout(2000);
  }
  return false;
}

async function openWriteEditorForNextPost(page, writeUrl, postNumber, totalPosts) {
  await log(`[${postNumber}/${totalPosts}] 다음 글쓰기 화면을 엽니다.`, "next-post");
  await page.waitForTimeout(1200);
  const clicked = await clickVisibleText(page, [/^글쓰기$/, /글쓰기/], 8000);
  if (clicked) {
    await page.waitForTimeout(1800);
    if (await waitForWriteScreen(page, 20000)) {
      await log(`[${postNumber}/${totalPosts}] 글쓰기 버튼으로 새 글 화면 진입을 확인했습니다.`, "next-post");
      return true;
    }
    await log(`[${postNumber}/${totalPosts}] 글쓰기 버튼 클릭 후 화면 확인에 실패해 URL로 재진입합니다.`, "next-post");
  } else {
    await log(`[${postNumber}/${totalPosts}] 글쓰기 버튼을 찾지 못해 URL로 재진입합니다.`, "next-post");
  }
  await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  return waitForWriteScreen(page, 10 * 60 * 1000);
}

async function main() {
  if (!payloadPath || !statusPath) {
    throw new Error("payload/status path is required.");
  }
  const payload = await readJson(payloadPath);
  const posts = normalizePosts(payload);
  if (posts.length === 0) {
    throw new Error("처리할 티스토리 글 데이터가 없습니다.");
  }
  if (posts.length > 1 && payload.mode === "prepare") {
    throw new Error("다건 연속 자동화는 입력 후 검수 모드로 실행할 수 없습니다. 임시저장 또는 공개 발행까지를 선택해 주세요.");
  }
  await log("티스토리 자동화 워커를 시작했습니다.", "start");

  const chromePath = await findChromeExecutable();
  const profileDir = path.join(process.cwd(), ".local", "tistory-chrome-profile");
  const launchOptions = {
    args: ["--window-size=1280,900"],
    headless: false,
    viewport: { width: 1280, height: 900 }
  };
  if (chromePath) {
    launchOptions.executablePath = chromePath;
  } else {
    launchOptions.channel = "chrome";
  }

  await log(`티스토리 자동화 Chrome 프로필을 엽니다: ${profileDir}`, "open-browser");
  const context = await launchTistoryBrowser(profileDir, launchOptions);
  let completed = false;

  try {
    const page = context.pages()[0] || (await context.newPage());
    const writeUrl = payload.writeUrl || "https://www.tistory.com/";
    await log(`Chrome을 열고 티스토리 글쓰기 URL로 이동합니다: ${writeUrl}`, "open-browser");
    await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    const ready = await waitForWriteScreen(page, 10 * 60 * 1000);
    if (!ready) {
      throw new Error("글쓰기 화면을 찾지 못했습니다. 티스토리 글쓰기 URL 또는 로그인 상태를 확인해 주세요.");
    }

    await log(`연속 처리 대상 ${posts.length}건을 확인했습니다.`, "queue");

    for (let index = 0; index < posts.length; index += 1) {
      const post = posts[index];
      const postNumber = index + 1;
      if (!post.title || !post.body) {
        throw new Error(`[${postNumber}/${posts.length}] 제목 또는 본문이 비어 있어 처리할 수 없습니다.`);
      }
      if (index > 0) {
        const opened = await openWriteEditorForNextPost(page, writeUrl, postNumber, posts.length);
        if (!opened) {
          throw new Error(`[${postNumber}/${posts.length}] 다음 글쓰기 화면을 찾지 못했습니다.`);
        }
      }

      await log(`[${postNumber}/${posts.length}] 글 작성 자동화를 시작합니다: ${post.title}`, "post-start");
      await selectTistoryCategory(page, post.category);
      await switchEditorToMarkdown(page);

      await log(`[${postNumber}/${posts.length}] 제목을 입력합니다.`, "fill-title");
      const titleOk = await setTitle(page, post.title);
      if (!titleOk) {
        await log(`[${postNumber}/${posts.length}] 제목 입력 영역을 자동으로 찾지 못했습니다. 브라우저에서 직접 제목 영역을 확인해 주세요.`, "warn-title");
      }

      await log(`[${postNumber}/${posts.length}] 본문 Markdown을 입력합니다.`, "fill-body");
      const bodyOk = await setMarkdownEditorContent(page, post.body);
      if (!bodyOk) {
        await log(`[${postNumber}/${posts.length}] Markdown 에디터 입력에 실패해 HTML 에디터 입력 방식으로 한 번 더 시도합니다.`, "fill-body-fallback");
        const html = markdownToHtml(post.body);
        const fallbackOk = await setEditorContent(page, html);
        if (!fallbackOk) {
          throw new Error(`[${postNumber}/${posts.length}] 본문 에디터를 찾지 못했습니다. 티스토리 에디터 구조가 바뀌었거나 로그인 상태가 아닐 수 있습니다.`);
        }
      }

      const tagsOk = await setTags(page, post.tags);
      await log(
        tagsOk
          ? `[${postNumber}/${posts.length}] 태그를 입력했습니다.`
          : `[${postNumber}/${posts.length}] 태그 입력 영역은 찾지 못했습니다. 필요하면 수동으로 확인해 주세요.`,
        "fill-tags"
      );

      if (payload.mode === "publish") {
        await publishTistoryPost(page);
        await log(`[${postNumber}/${posts.length}] 공개 발행 처리를 완료했습니다.`, "post-done");
      } else if (payload.mode === "save-draft") {
        await log(`[${postNumber}/${posts.length}] 임시저장 버튼 클릭을 시도합니다.`, "save-draft");
        const clicked = await page.getByText("임시저장", { exact: false }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
        await log(
          clicked
            ? `[${postNumber}/${posts.length}] 임시저장 버튼을 클릭했습니다.`
            : `[${postNumber}/${posts.length}] 임시저장 버튼을 찾지 못했습니다. 브라우저에서 직접 확인해 주세요.`,
          "save-draft"
        );
      } else {
        await log("자동 입력을 완료했습니다. 열린 브라우저에서 최종 확인 후 직접 저장/발행해 주세요.", "review");
      }
    }

    await writeStatus({
      state: "success",
      step: "done",
      message: `티스토리 자동화 ${posts.length}건 처리가 완료되었습니다.`
    });
    completed = true;
  } finally {
    if (completed && payload.mode !== "prepare") {
      await log("자동화 완료 후 Chrome 프로필 잠금을 해제하기 위해 브라우저 컨텍스트를 닫습니다.", "browser-close");
      await context.close().catch(() => null);
      await writeStatus({
        state: "success",
        step: "done",
        message: `티스토리 자동화 ${posts.length}건 처리가 완료되었습니다.`
      });
    }
  }
}

main().catch(async (error) => {
  await writeStatus({
    state: "error",
    step: "error",
    message: error instanceof Error ? error.message : String(error)
  }).catch(() => {});
  process.exitCode = 1;
});
