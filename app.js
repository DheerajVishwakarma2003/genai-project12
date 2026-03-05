/********************
 * Utilities
 ********************/
const $ = (id) => document.getElementById(id);

const toast = $("toast");
let toastTimer = null;

function showToast(msg, type = "default") {
  if (!toast) return;
  toast.textContent = msg;
  toast.className = "toast show";
  if (type === "error") toast.classList.add("toast-error");
  if (type === "success") toast.classList.add("toast-success");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

/********************
 * Storage
 ********************/
const STORAGE = {
  history: "pg_history",
  settings: "pg_settings",
  json: "pg_last_json"
};

const DEFAULT_SETTINGS = {
  defaultTone: "conversational",
  defaultPlatform: "instagram",
  includeHashtags: true
};

function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(STORAGE.settings)) || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  localStorage.setItem(STORAGE.settings, JSON.stringify(s));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.history)) || [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(STORAGE.history, JSON.stringify(items));
}

/********************
 * Page Navigation
 ********************/
const navDashboard = $("navDashboard");
const navHistory   = $("navHistory");
const navSettings  = $("navSettings");

const pageDashboard = $("pageDashboard");
const pageHistory   = $("pageHistory");
const pageSettings  = $("pageSettings");

const pageTitle = $("pageTitle");

function showPage(which) {
  [navDashboard, navHistory, navSettings].forEach(n => n?.classList.remove("active"));
  [pageDashboard, pageHistory, pageSettings].forEach(p => {
    if (p) { p.classList.remove("active"); p.style.display = "none"; }
  });

  if (which === "dashboard") {
    navDashboard?.classList.add("active");
    if (pageDashboard) { pageDashboard.classList.add("active"); pageDashboard.style.display = "block"; }
    if (pageTitle) pageTitle.textContent = "Dashboard";
  } else if (which === "history") {
    navHistory?.classList.add("active");
    if (pageHistory) { pageHistory.classList.add("active"); pageHistory.style.display = "block"; }
    if (pageTitle) pageTitle.textContent = "History";
    renderHistory();
  } else {
    navSettings?.classList.add("active");
    if (pageSettings) { pageSettings.classList.add("active"); pageSettings.style.display = "block"; }
    if (pageTitle) pageTitle.textContent = "Settings";
    loadSettingsUI();
  }
}

/********************
 * Generator State
 ********************/
const topic      = $("topic");
const tone       = $("tone");
const desc       = $("desc");
const wRange     = $("wRange");
const hRange     = $("hRange");
const wLabel     = $("wLabel");
const hLabel     = $("hLabel");
const ratioPill  = $("ratioPill");
const previewTag   = $("previewTag");
const previewImage = $("previewImage");
const captionBox   = $("captionBox");
const jsonPreview  = $("jsonPreview");
const genStatus    = $("genStatus");

let activePlatform = "instagram";

/********************
 * Helpers
 ********************/
function updateSizeUI() {
  if (!wRange || !hRange) return;
  const w = parseInt(wRange.value || 1080);
  const h = parseInt(hRange.value || 1080);
  if (wLabel)    wLabel.textContent    = w + "px";
  if (hLabel)    hLabel.textContent    = h + "px";
  if (ratioPill) ratioPill.textContent = `${w} × ${h}`;
  if (previewTag) previewTag.textContent = `${activePlatform} • ${w}×${h}`;
}

function buildJsonPrompt() {
  return {
    platform:    activePlatform,
    topic:       topic?.value?.trim() || "Post",
    tone:        tone?.value || "conversational",
    size: {
      width:  wRange ? parseInt(wRange.value) : 1080,
      height: hRange ? parseInt(hRange.value) : 1080
    },
    description: desc?.value?.trim() || ""
  };
}

function saveToHistory(json, caption, imageDataUrl) {
  const items = getHistory();
  items.unshift({
    id:        crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    topic:     json.topic,
    tone:      json.tone,
    platform:  json.platform,
    size:      json.size,
    caption,
    image:     imageDataUrl || null,
    json
  });
  saveHistory(items.slice(0, 30));
}

function renderHistory() {
  const list  = $("historyList");
  const empty = $("historyEmpty");
  if (!list) return;

  const items = getHistory();
  list.innerHTML = "";
  if (empty) empty.style.display = items.length ? "none" : "block";

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    const thumbStyle = item.image
      ? `background-image:url(${item.image});background-size:cover;background-position:center;`
      : "";
    div.innerHTML = `
      <div class="thumb" style="${thumbStyle}">
        ${item.image ? "" : `<span>${escapeHtml(item.platform)}</span>`}
      </div>
      <div class="h-meta">
        <strong>${escapeHtml(item.topic)}</strong>
        <div class="h-caption small">${escapeHtml((item.caption || "").slice(0, 120))}</div>
        <div class="h-tags">
          <span class="tag-pill">${escapeHtml(item.platform)}</span>
          <span class="tag-pill">${escapeHtml(item.tone)}</span>
          <span class="tag-pill">${item.size?.width}×${item.size?.height}</span>
        </div>
        <div class="small muted">${new Date(item.createdAt).toLocaleString()}</div>
      </div>
      <div class="h-actions">
        <button class="mini-btn" data-copy="${escapeHtml(item.caption || "")}">Copy</button>
      </div>
    `;
    // Wire copy button
    div.querySelector("[data-copy]")?.addEventListener("click", (e) => {
      navigator.clipboard.writeText(e.target.dataset.copy || "").then(() => showToast("Copied!", "success"));
    });
    list.appendChild(div);
  });
}

function loadSettingsUI() {
  const s = getSettings();
  const setTone     = $("setTone");
  const setPlatform = $("setPlatform");
  const setHashtags = $("setHashtags");
  if (setTone)     setTone.value     = s.defaultTone;
  if (setPlatform) setPlatform.value = s.defaultPlatform;
  if (setHashtags) setHashtags.checked = s.includeHashtags;
}

function setGenStatus(msg, type = "") {
  if (!genStatus) return;
  genStatus.textContent = msg;
  genStatus.className   = "small gen-status " + type;
}

/********************
 * DOMContentLoaded
 ********************/
document.addEventListener("DOMContentLoaded", () => {

  updateSizeUI();

  // Apply saved defaults
  const s = getSettings();
  if (tone) tone.value = s.defaultTone;
  activePlatform = s.defaultPlatform || "instagram";
  updateSizeUI();

  // Platform pills — require data-platform attribute on each .pill element
  document.querySelectorAll(".pill[data-platform]").forEach(pill => {
    if (pill.dataset.platform === activePlatform) pill.classList.add("active");
    pill.addEventListener("click", () => {
      document.querySelectorAll(".pill[data-platform]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activePlatform = pill.dataset.platform;
      updateSizeUI();
    });
  });

  // Restore last JSON preview
  const last = localStorage.getItem(STORAGE.json);
  if (last && jsonPreview) {
    try { jsonPreview.textContent = JSON.stringify(JSON.parse(last), null, 2); }
    catch (e) { /* ignore */ }
  }

  // Clear History
  $("clearHistoryBtn")?.addEventListener("click", () => {
    if (!confirm("Clear all history?")) return;
    saveHistory([]);
    renderHistory();
    showToast("History cleared");
  });

  // Save Settings
  $("saveSettingsBtn")?.addEventListener("click", () => {
    saveSettings({
      defaultTone:     $("setTone")?.value     || DEFAULT_SETTINGS.defaultTone,
      defaultPlatform: $("setPlatform")?.value || DEFAULT_SETTINGS.defaultPlatform,
      includeHashtags: $("setHashtags")?.checked ?? DEFAULT_SETTINGS.includeHashtags
    });
    showToast("Settings saved", "success");
  });

  // Copy Caption
  $("copyCaptionBtn")?.addEventListener("click", () => {
    const text = captionBox?.textContent || "";
    if (!text.trim()) { showToast("Nothing to copy"); return; }
    navigator.clipboard.writeText(text).then(() => showToast("Copied!", "success"));
  });

  // Download Image
  $("downloadBtn")?.addEventListener("click", () => {
    const img = previewImage?.querySelector("img");
    if (!img) { showToast("No image yet", "error"); return; }
    const a = document.createElement("a");
    a.href     = img.src;
    a.download = `post_${Date.now()}.png`;
    a.click();
    showToast("Downloading...");
  });

  // Forgot Password link
  $("forgotLink")?.addEventListener("click", () => {
    const email = $("loginEmail")?.value?.trim();
    if (!email) { alert("Enter your email first"); return; }
    if (window.firebaseSendReset) {
      window.firebaseSendReset(email);
    }
  });

  // Switch auth cards
  $("goSignup")?.addEventListener("click", () => {
    $("loginCard")?.classList.remove("active");
    $("signupCard")?.classList.add("active");
  });
  $("goLogin")?.addEventListener("click", () => {
    $("signupCard")?.classList.remove("active");
    $("loginCard")?.classList.add("active");
  });

});

/********************
 * Nav Events
 ********************/
navDashboard?.addEventListener("click", () => showPage("dashboard"));
navHistory?.addEventListener("click",   () => showPage("history"));
navSettings?.addEventListener("click",  () => showPage("settings"));

wRange?.addEventListener("input", updateSizeUI);
hRange?.addEventListener("input", updateSizeUI);

/********************
 * Generate Button — calls Flask /generate
 ********************/
$("generateBtn")?.addEventListener("click", async () => {

  const topicVal = topic?.value?.trim();
  if (!topicVal) { showToast("Please enter a topic", "error"); return; }

  setGenStatus("Generating…", "loading");
  if (captionBox)   captionBox.textContent   = "";
  if (jsonPreview)  jsonPreview.textContent   = "";
  if (previewImage) previewImage.innerHTML    = `<div class="gen-loader"><div class="spinner"></div><p>Creating your post…</p></div>`;

  const $btn = $("generateBtn");
  if ($btn) { $btn.disabled = true; $btn.textContent = "Generating…"; }

  const json = buildJsonPrompt();

  // Get Firebase ID token
  let token = null;
  if (window.getFirebaseToken) {
    token = await window.getFirebaseToken();
  }

  if (!token) {
    setGenStatus("Not logged in", "error");
    showToast("Please log in first", "error");
    if ($btn) { $btn.disabled = false; $btn.textContent = "Generate New Post"; }
    if (previewImage) previewImage.innerHTML = `<span>Generated Preview</span>`;
    return;
  }

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(json)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${response.status}`);
    }

    const data = await response.json();

    const caption      = data.caption || "No caption returned.";
    const imageDataUrl = data.image   || null;

    // Show generated image
    if (previewImage) {
      if (imageDataUrl) {
        previewImage.innerHTML = `<img src="${imageDataUrl}" alt="Generated post" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:0;" />`;
      } else {
        previewImage.innerHTML = `<span>Image unavailable</span>`;
      }
    }

    if (captionBox)  captionBox.textContent  = caption;
    if (jsonPreview) jsonPreview.textContent = JSON.stringify(json, null, 2);

    localStorage.setItem(STORAGE.json, JSON.stringify(json));
    saveToHistory(json, caption, imageDataUrl);

    setGenStatus("Done ✓", "done");
    showToast("Post generated!", "success");

  } catch (err) {
    console.error("Generate error:", err);
    setGenStatus("Error", "error");
    showToast("Error: " + err.message, "error");
    if (previewImage) previewImage.innerHTML = `<span>Generation failed</span>`;
  } finally {
    if ($btn) { $btn.disabled = false; $btn.textContent = "Generate New Post"; }
  }
});

/********************
 * Logout
 ********************/
$("logoutBtn")?.addEventListener("click", async () => {
  if (window.firebaseLogout) {
    await window.firebaseLogout();
    showToast("Logged out");
  }
});