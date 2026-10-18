const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = __dirname;
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const SESSION_ROOT = path.join(CODEX_HOME, "sessions");
const CONFIG_FILE = path.join(CODEX_HOME, "config.toml");
const WIDGET_LAYOUT_SCRIPT = path.join(__dirname, "widget-window.ps1");
const ACTIVE_SESSION_FILE = path.join(
  process.env.LOCALAPPDATA || os.homedir(),
  "DeepSeekUsageMonitor",
  "active-session.json"
);
const BALANCE_URL = "https://api.deepseek.com/user/balance";
const BALANCE_TTL_MS = 30_000;

const MODELS = {
  "deepseek-flash": {
    label: "DeepSeek Flash",
    version: "DeepSeek-V4.1-Flash-1017",
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 }
  },
  "deepseek-v4-pro": {
    label: "DeepSeek V4 Pro",
    version: "DeepSeek-V4-Pro-0813",
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 }
  }
};

const MODEL_ALIASES = {
  "deepseek-chat": "deepseek-flash",
  "deepseek-reasoner": "deepseek-flash",
  "deepseek-v4-flash": "deepseek-flash",
  "deepseek-v4-flash-vision-exp": "deepseek-flash"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

let sessionApiKey = null;
let balanceCache = null;
let dailyUsageCache = null;
let activeSession = loadActiveSession();
const activeSessionListeners = new Set();

function normalizeTranscriptPath(value) {
  const resolved = path.resolve(String(value || ""));
  const root = path.resolve(SESSION_ROOT);
  if (!resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep.toLowerCase())) {
    return null;
  }
  return resolved;
}

function loadActiveSession() {
  try {
    const stored = JSON.parse(fs.readFileSync(ACTIVE_SESSION_FILE, "utf8"));
    const transcriptPath = normalizeTranscriptPath(stored.transcriptPath);
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      return {
        sessionId: String(stored.sessionId || "").trim(),
        transcriptPath,
        event: stored.event || "",
        updatedAt: stored.updatedAt || ""
      };
    }
    if (stored.sessionId) {
      return {
        sessionId: String(stored.sessionId).trim(),
        transcriptPath: null,
        event: stored.event || "",
        updatedAt: stored.updatedAt || ""
      };
    }
  } catch {
    // No active-session file yet.
  }
  return null;
}

function persistActiveSession(session) {
  try {
    fs.mkdirSync(path.dirname(ACTIVE_SESSION_FILE), { recursive: true });
    fs.writeFileSync(ACTIVE_SESSION_FILE, JSON.stringify(session), "utf8");
  } catch {
    // The in-memory value still works for the current server process.
  }
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function canonicalModel(model) {
  const normalized = String(model || "").trim().toLowerCase();
  return MODEL_ALIASES[normalized] || normalized;
}

function isDeepSeekModel(model) {
  const normalized = String(model || "").trim().toLowerCase();
  return normalized.startsWith("deepseek") || Boolean(MODEL_ALIASES[normalized]);
}

function modelInfo(model) {
  const canonical = canonicalModel(model);
  return {
    canonical,
    ...(MODELS[canonical] || MODELS["deepseek-flash"])
  };
}

function beijingDateParts(date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    day: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function isPeakBeijing(date) {
  const { day, hour, minute } = beijingDateParts(date);
  if (day === 0 || day === 6) return false;
  const minutes = hour * 60 + minute;
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
}

function rateKindFor(date, priceMode = "auto") {
  if (priceMode === "peak" || priceMode === "offPeak") return priceMode;
  return isPeakBeijing(date) ? "peak" : "offPeak";
}

function getBeijingDayBounds(reference = new Date()) {
  const offsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(reference.getTime() + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startMs = Date.UTC(year, month, day) - offsetMs;
  const pad = (value) => String(value).padStart(2, "0");
  return {
    startMs,
    endMs: startMs + 24 * 60 * 60 * 1000,
    dateLabel: `${year}.${pad(month + 1)}.${pad(day)}`
  };
}

function calculateCallCost(usage, model, rateKind) {
  const info = modelInfo(model);
  const rates = info[rateKind] || info.offPeak;
  const input = safeNumber(usage.input_tokens ?? usage.inputTokens);
  const cached = Math.min(input, safeNumber(usage.cached_input_tokens ?? usage.cachedInputTokens));
  const cacheWrite = safeNumber(usage.cache_write_input_tokens ?? usage.cacheWriteInputTokens);
  const output = safeNumber(usage.output_tokens ?? usage.outputTokens);
  const uncached = Math.max(0, input - cached);
  const cacheHitCost = (cached / 1_000_000) * rates.cacheHit;
  const cacheMissCost = (uncached / 1_000_000) * rates.cacheMiss;
  const outputCost = (output / 1_000_000) * rates.output;
  const saved = (cached / 1_000_000) * (rates.cacheMiss - rates.cacheHit);
  return {
    input,
    cached,
    cacheWrite,
    uncached,
    output,
    cacheHitCost,
    cacheMissCost,
    outputCost,
    cost: cacheHitCost + cacheMissCost + outputCost,
    saved
  };
}

function parseDeepSeekTokenFromConfig() {
  try {
    const config = fs.readFileSync(CONFIG_FILE, "utf8");
    const match = config.match(/\[model_providers\.deepseek\]([\s\S]*?)(?=\n\s*\[|$)/);
    if (!match) return null;
    const section = match[1];
    if (!/api\.deepseek\.com/i.test(section)) return null;
    const tokenMatch = section.match(/(?:experimental_bearer_token|api_key)\s*=\s*["']([^"']+)["']/);
    return tokenMatch?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function resolveApiKey() {
  if (sessionApiKey) {
    return { key: sessionApiKey, source: "本次设置" };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { key: process.env.DEEPSEEK_API_KEY.trim(), source: "环境变量" };
  }
  const configKey = parseDeepSeekTokenFromConfig();
  if (configKey) {
    return { key: configKey, source: "本机 Codex 配置" };
  }
  return null;
}

function resizeWidgetWindow(mode) {
  return new Promise((resolve, reject) => {
    const powershell = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    execFile(
      powershell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        WIDGET_LAYOUT_SCRIPT,
        "-Mode",
        mode
      ],
      { windowsHide: true, timeout: 8_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

async function fetchBalance({ force = false, keyOverride = null } = {}) {
  const resolved = keyOverride
    ? { key: keyOverride, source: "本次设置" }
    : resolveApiKey();

  if (!resolved?.key) {
    return {
      ok: false,
      connected: false,
      error: "未找到 DeepSeek API Key",
      source: null
    };
  }

  if (
    !force &&
    !keyOverride &&
    balanceCache &&
    Date.now() - balanceCache.fetchedAtMs < BALANCE_TTL_MS
  ) {
    return balanceCache.value;
  }

  try {
    const response = await fetch(BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${resolved.key}`,
        Accept: "application/json",
        "User-Agent": "deepseek-usage-dashboard/1.0"
      },
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      let apiMessage = "";
      try {
        const errorBody = await response.json();
        apiMessage = errorBody?.error?.message || errorBody?.message || "";
      } catch {
        // Keep the HTTP status as the useful diagnostic.
      }
      const authFailure = response.status === 401 || response.status === 403;
      return {
        ok: false,
        connected: authFailure ? false : true,
        error: authFailure
          ? "DeepSeek 凭证无效或已失效"
          : `DeepSeek 余额接口返回 ${response.status}${apiMessage ? `：${apiMessage}` : ""}`,
        source: resolved.source
      };
    }

    const body = await response.json();
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : [];
    const info =
      infos.find((item) => String(item.currency).toUpperCase() === "CNY") ||
      infos[0] ||
      null;

    const result = {
      ok: true,
      connected: true,
      isAvailable: Boolean(body?.is_available),
      currency: info?.currency || "CNY",
      total: safeNumber(info?.total_balance),
      granted: safeNumber(info?.granted_balance),
      toppedUp: safeNumber(info?.topped_up_balance),
      source: resolved.source,
      fetchedAt: new Date().toISOString()
    };

    balanceCache = { fetchedAtMs: Date.now(), value: result };
    return result;
  } catch (error) {
    return {
      ok: false,
      connected: true,
      error:
        error?.name === "TimeoutError"
          ? "DeepSeek 余额接口响应超时"
          : "暂时无法连接 DeepSeek 余额接口",
      source: resolved.source
    };
  }
}

async function walkSessionFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walkSessionFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const stat = await fsp.stat(fullPath);
          files.push({ path: fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
        } catch {
          // A session can disappear while the directory is being scanned.
        }
      }
    })
  );

  return files;
}

const historyTurnOffsetCache = new Map();

async function readSessionMeta(filePath) {
  let handle;
  try {
    handle = await fsp.open(filePath, "r");
    const stat = await handle.stat();
    const byteLength = Math.min(stat.size, 2 * 1024 * 1024);
    const buffer = Buffer.allocUnsafe(byteLength);
    const { bytesRead } = await handle.read(buffer, 0, byteLength, 0);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "session_meta") return event.payload || null;
      } catch {
        break;
      }
    }
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
  return null;
}

function countTurnContextsInText(text) {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('"type":"turn_context"')) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "turn_context") count += 1;
    } catch {
      // The history cutoff can land in the middle of a record.
    }
  }
  return count;
}

async function countTurnContextsBefore(filePath, endByteOffset, endOrdinalExclusive) {
  if (endByteOffset > 0) {
    let handle;
    try {
      handle = await fsp.open(filePath, "r");
      const stat = await handle.stat();
      const byteLength = Math.min(endByteOffset, stat.size);
      const buffer = Buffer.allocUnsafe(byteLength);
      const { bytesRead } = await handle.read(buffer, 0, byteLength, 0);
      return countTurnContextsInText(
        buffer.subarray(0, bytesRead).toString("utf8")
      );
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  if (endOrdinalExclusive > 0) {
    const raw = await fsp.readFile(filePath, "utf8");
    return countTurnContextsInText(
      raw.split(/\r?\n/).slice(0, endOrdinalExclusive).join("\n")
    );
  }

  return 0;
}

async function findHistoryBaseFile(baseThreadId, endByteOffset, currentFilePath) {
  const threadId = String(baseThreadId || "").trim();
  if (!threadId) return null;

  const currentPath = path.resolve(currentFilePath).toLowerCase();
  const files = await walkSessionFiles(SESSION_ROOT);
  const matches = files.filter((file) => {
    if (path.resolve(file.path).toLowerCase() === currentPath) return false;
    return path.basename(file.path).includes(threadId);
  });
  if (!matches.length) return null;

  const offset = Number(endByteOffset) || 0;
  const candidates =
    offset > 0 ? matches.filter((file) => file.size >= offset) : [];
  const pool = candidates.length ? candidates : matches;
  pool.sort((a, b) => {
    if (offset > 0) {
      const distance = Math.abs(a.size - offset) - Math.abs(b.size - offset);
      if (distance !== 0) return distance;
    }
    return a.mtimeMs - b.mtimeMs;
  });
  return pool[0];
}

// Codex continues resumed or forked threads in a new rollout file. The new file
// only contains the turns after history_base, so carry over the earlier count.
async function computeHistoryTurnOffset(meta, currentFilePath, visited = new Set()) {
  const baseThreadId =
    meta?.history_base?.thread_id || meta?.forked_from_id || "";
  const endByteOffset = Number(meta?.history_base?.end_byte_offset) || 0;
  const endOrdinalExclusive =
    Number(meta?.history_base?.end_ordinal_exclusive) ||
    Number(meta?.forked_from_ordinal_exclusive) ||
    0;

  if (!baseThreadId || (!endByteOffset && !endOrdinalExclusive)) return 0;

  const visitKey = `${baseThreadId}:${endByteOffset || endOrdinalExclusive}`;
  if (visited.has(visitKey)) return 0;
  visited.add(visitKey);

  const baseFile = await findHistoryBaseFile(
    baseThreadId,
    endByteOffset,
    currentFilePath
  );
  if (!baseFile) return 0;

  const baseMeta = await readSessionMeta(baseFile.path);
  const inherited = await computeHistoryTurnOffset(
    baseMeta,
    baseFile.path,
    visited
  );
  const local = await countTurnContextsBefore(
    baseFile.path,
    endByteOffset,
    endOrdinalExclusive
  );
  return inherited + local;
}

async function historyTurnOffsetFor(meta, filePath) {
  const baseThreadId =
    meta?.history_base?.thread_id || meta?.forked_from_id || "";
  const endByteOffset = Number(meta?.history_base?.end_byte_offset) || 0;
  const endOrdinalExclusive =
    Number(meta?.history_base?.end_ordinal_exclusive) ||
    Number(meta?.forked_from_ordinal_exclusive) ||
    0;
  if (!baseThreadId || (!endByteOffset && !endOrdinalExclusive)) return 0;

  const cacheKey = [
    baseThreadId,
    endByteOffset,
    endOrdinalExclusive,
    path.resolve(filePath).toLowerCase()
  ].join("|");
  if (historyTurnOffsetCache.has(cacheKey)) {
    return historyTurnOffsetCache.get(cacheKey);
  }

  const offset = await computeHistoryTurnOffset(meta, filePath);
  if (offset > 0) {
    historyTurnOffsetCache.set(cacheKey, offset);
    if (historyTurnOffsetCache.size > 100) {
      historyTurnOffsetCache.delete(historyTurnOffsetCache.keys().next().value);
    }
  }
  return offset;
}

async function resolveSessionFile(requestedSessionId = "", { followLatest = false } = {}) {
  const files = await walkSessionFiles(SESSION_ROOT);
  if (!files.length) return null;

  const requested = String(requestedSessionId || "").trim();
  if (requested) {
    const exact = files.find((file) => path.basename(file.path).includes(requested));
    if (exact) return exact;
  }

  if (followLatest && activeSession) {
    if (activeSession.transcriptPath) {
      const activePath = path.resolve(activeSession.transcriptPath).toLowerCase();
      const activeFile = files.find(
        (file) => path.resolve(file.path).toLowerCase() === activePath
      );
      if (activeFile) return activeFile;
    }
    if (activeSession.sessionId) {
      const activeFile = files.find((file) =>
        path.basename(file.path).includes(activeSession.sessionId)
      );
      if (activeFile) return activeFile;
    }
  }

  const environmentSession = followLatest
    ? ""
    : process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID || "";
  if (environmentSession) {
    const current = files.find((file) => path.basename(file.path).includes(environmentSession));
    if (current) return current;
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0];
}

function extractUsage(record) {
  const usage = record?.usage || {};
  return {
    input: safeNumber(usage.input_tokens),
    cached: safeNumber(usage.cached_input_tokens),
    cacheWrite: safeNumber(usage.cache_write_input_tokens),
    output: safeNumber(usage.output_tokens),
    reasoning: safeNumber(usage.reasoning_output_tokens),
    total: safeNumber(usage.total_tokens)
  };
}

async function parseSession(file) {
  const raw = await fsp.readFile(file.path, "utf8");
  const lines = raw.split(/\r?\n/);
  const turnModels = new Map();
  const completedTurns = new Map();
  const records = [];
  let sessionMeta = null;
  let latestModel = "";
  let threadUsage = null;
  let lastTimestamp = null;
  let lastCallBoundary = null;
  let firstResponseAt = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === "session_meta") {
      sessionMeta = event.payload || sessionMeta;
    }

    if (event.type === "turn_context" && event.payload) {
      const contextTime = new Date(event.timestamp);
      if (!Number.isNaN(contextTime.getTime())) {
        lastCallBoundary = contextTime;
        firstResponseAt = null;
      }
      if (event.payload.model) {
        latestModel = event.payload.model;
        if (event.payload.turn_id) {
          turnModels.set(event.payload.turn_id, event.payload.model);
        }
      }
    }

    if (event.type === "response_item" && event.payload) {
      const boundaryTime = new Date(event.timestamp);
      const isToolOutput = event.payload.type === "function_call_output";
      const isUserMessage =
        event.payload.type === "message" && event.payload.role === "user";
      const isModelOutput = [
        "reasoning",
        "message",
        "function_call",
        "custom_tool_call"
      ].includes(event.payload.type);
      if (!Number.isNaN(boundaryTime.getTime()) && (isToolOutput || isUserMessage)) {
        lastCallBoundary = boundaryTime;
        firstResponseAt = null;
      } else if (
        !Number.isNaN(boundaryTime.getTime()) &&
        isModelOutput &&
        !firstResponseAt
      ) {
        firstResponseAt = boundaryTime;
      }
    }

    if (event.type === "world_state" && !latestModel) {
      latestModel =
        event.payload?.state?.collaboration_mode?.model ||
        event.payload?.state?.model ||
        "";
    }

    if (
      event.type === "event_msg" &&
      event.payload?.type === "task_complete" &&
      event.payload.turn_id
    ) {
      completedTurns.set(event.payload.turn_id, {
        completedAt: event.payload.completed_at || event.timestamp,
        startedAt: event.payload.started_at || null,
        durationMs: safeNumber(event.payload.duration_ms),
        timeToFirstTokenMs: safeNumber(event.payload.time_to_first_token_ms)
      });
    }

    if (event.type === "token_usage_record" && event.payload) {
      const payload = event.payload;
      const usage = extractUsage(payload);
      const timestamp = new Date(event.timestamp);
      if (Number.isNaN(timestamp.getTime())) continue;
      const callStartedAt =
        lastCallBoundary && !Number.isNaN(lastCallBoundary.getTime())
          ? new Date(lastCallBoundary)
          : null;
      const latencyMs = callStartedAt
        ? Math.max(0, timestamp.getTime() - callStartedAt.getTime())
        : null;
      const firstTokenMs =
        callStartedAt && firstResponseAt
          ? Math.max(0, firstResponseAt.getTime() - callStartedAt.getTime())
          : null;
      const turnUsage = payload.turn_token_usage
        ? {
            input: safeNumber(payload.turn_token_usage.input_tokens),
            cached: safeNumber(payload.turn_token_usage.cached_input_tokens),
            output: safeNumber(payload.turn_token_usage.output_tokens),
            reasoning: safeNumber(payload.turn_token_usage.reasoning_output_tokens),
            total: safeNumber(payload.turn_token_usage.total_tokens)
          }
        : null;
      records.push({
        timestamp,
        usage,
        turnUsage,
        callStartedAt,
        latencyMs,
        firstTokenMs,
        turnId: payload.turn_id || "",
        responseId: payload.response_id || ""
      });
      if (payload.thread_token_usage) {
        threadUsage = payload.thread_token_usage;
      }
      lastTimestamp = event.timestamp;
      lastCallBoundary = timestamp;
      firstResponseAt = null;
    }
  }

  latestModel = latestModel || "deepseek-flash";
  const info = modelInfo(latestModel);
  const sessionId = sessionMeta?.session_id || path.basename(file.path).replace(/^rollout-/, "").replace(/\.jsonl$/, "");
  const startedAt =
    records[0]?.timestamp.toISOString() ||
    sessionMeta?.timestamp ||
    new Date(file.mtimeMs).toISOString();
  const lastUpdated =
    lastTimestamp || records.at(-1)?.timestamp.toISOString() || startedAt;
  let historyTurnOffset = 0;
  try {
    historyTurnOffset = await historyTurnOffsetFor(sessionMeta, file.path);
  } catch {
    // A history file can be rotated while the dashboard is refreshing.
  }

  const calls = records.map((record, index) => {
    const model = turnModels.get(record.turnId) || latestModel;
    const rateKind = rateKindFor(record.timestamp, "auto");
    const cost = calculateCallCost(
      {
        input_tokens: record.usage.input,
        cached_input_tokens: record.usage.cached,
        cache_write_input_tokens: record.usage.cacheWrite,
        output_tokens: record.usage.output
      },
      model,
      rateKind
    );
    const contextTokens = record.usage.input + record.usage.output;
    const tokensPerSecond =
      record.latencyMs && record.latencyMs > 0 && cost.output > 0
        ? (cost.output / record.latencyMs) * 1000
        : null;
    return {
      index: index + 1,
      time: record.timestamp.toISOString(),
      turnId: record.turnId,
      model,
      rateKind,
      inputTokens: cost.input,
      cachedInputTokens: cost.cached,
      uncachedInputTokens: cost.uncached,
      outputTokens: cost.output,
      reasoningTokens: record.usage.reasoning,
      totalTokens: record.usage.total || cost.input + cost.output,
      contextTokens,
      callStartedAt: record.callStartedAt?.toISOString() || null,
      latencyMs: record.latencyMs ?? null,
      firstTokenMs: record.firstTokenMs ?? null,
      tokensPerSecond: tokensPerSecond === null ? null : round(tokensPerSecond, 1),
      cacheHitRate: cost.input > 0 ? (cost.cached / cost.input) * 100 : 0,
      costCny: round(cost.cost, 6),
      cacheHitCost: round(cost.cacheHitCost, 6),
      cacheMissCost: round(cost.cacheMissCost, 6),
      outputCost: round(cost.outputCost, 6),
      savedCny: round(cost.saved, 6)
    };
  });

  const validSpeedCalls = calls.filter(
    (call) => call.tokensPerSecond !== null && call.latencyMs > 0
  );
  const recentSpeedCalls = validSpeedCalls.slice(-6);
  const recentSpeedOutput = recentSpeedCalls.reduce(
    (sum, call) => sum + call.outputTokens,
    0
  );
  const recentSpeedLatency = recentSpeedCalls.reduce(
    (sum, call) => sum + call.latencyMs,
    0
  );
  const speed = {
    latestTokensPerSecond: validSpeedCalls.at(-1)?.tokensPerSecond ?? null,
    averageTokensPerSecond:
      recentSpeedLatency > 0
        ? round((recentSpeedOutput / recentSpeedLatency) * 1000, 1)
        : null,
    sampleSize: recentSpeedCalls.length,
    sampleWindow: 6,
    unit: "tokens/s"
  };

  const turnGroups = new Map();
  records.forEach((record, index) => {
    const call = calls[index];
    const turnId = record.turnId || `turn-${index + 1}`;
    const turn =
      turnGroups.get(turnId) ||
      {
        id: turnId,
        model: call.model,
        startedAt: record.timestamp.toISOString(),
        endedAt: record.timestamp.toISOString(),
        calls: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        contextTokens: 0,
        costCny: 0,
        cacheHitCostCny: 0,
        cacheMissCostCny: 0,
        outputCostCny: 0,
        savedCny: 0,
        speedOutputTokens: 0,
        speedLatencyMs: 0
      };

    turn.model = call.model;
    turn.endedAt = record.timestamp.toISOString();
    turn.calls += 1;
    turn.contextTokens = call.contextTokens;
    turn.costCny += call.costCny;
    turn.cacheHitCostCny += call.cacheHitCost;
    turn.cacheMissCostCny += call.cacheMissCost;
    turn.outputCostCny += call.outputCost;
    turn.savedCny += call.savedCny;
    if (call.tokensPerSecond !== null && call.latencyMs > 0) {
      turn.speedOutputTokens += call.outputTokens;
      turn.speedLatencyMs += call.latencyMs;
    }
    if (record.turnUsage) {
      turn.inputTokens = record.turnUsage.input;
      turn.cachedInputTokens = record.turnUsage.cached;
      turn.outputTokens = record.turnUsage.output;
      turn.reasoningTokens = record.turnUsage.reasoning;
      turn.totalTokens = record.turnUsage.total || record.turnUsage.input + record.turnUsage.output;
    } else {
      turn.inputTokens += call.inputTokens;
      turn.cachedInputTokens += call.cachedInputTokens;
      turn.outputTokens += call.outputTokens;
      turn.reasoningTokens += call.reasoningTokens;
      turn.totalTokens += call.totalTokens;
    }
    turnGroups.set(turnId, turn);
  });

  const turns = Array.from(turnGroups.values())
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
    .map((turn, index) => {
      const completed = completedTurns.get(turn.id);
      const durationSeconds = completed
        ? Math.max(0, Math.round(completed.durationMs / 1000))
        : Math.max(
            0,
            Math.round(
              (new Date(turn.endedAt).getTime() - new Date(turn.startedAt).getTime()) / 1000
            )
          );
      return {
        ...turn,
        index: historyTurnOffset + index + 1,
        uncachedInputTokens: Math.max(0, turn.inputTokens - turn.cachedInputTokens),
        cacheHitRate:
          turn.inputTokens > 0 ? (turn.cachedInputTokens / turn.inputTokens) * 100 : 0,
        costCny: round(turn.costCny, 6),
        cacheHitCostCny: round(turn.cacheHitCostCny, 6),
        cacheMissCostCny: round(turn.cacheMissCostCny, 6),
        outputCostCny: round(turn.outputCostCny, 6),
        savedCny: round(turn.savedCny, 6),
        firstTokenMs: completed?.timeToFirstTokenMs || null,
        tokensPerSecond:
          turn.speedLatencyMs > 0
            ? round((turn.speedOutputTokens / turn.speedLatencyMs) * 1000, 1)
            : null,
        speedSampleSize:
          calls.filter(
            (call) =>
              call.turnId === turn.id &&
              call.tokensPerSecond !== null &&
              call.latencyMs > 0
          ).length,
        durationSeconds,
        completed: Boolean(completed),
        completedAt: completed?.completedAt || null
      };
    });

  const summed = calls.reduce(
    (totals, call) => {
      totals.input += call.inputTokens;
      totals.cached += call.cachedInputTokens;
      totals.uncached += call.uncachedInputTokens;
      totals.output += call.outputTokens;
      totals.reasoning += call.reasoningTokens;
      totals.cost += call.costCny;
      totals.cacheHitCost += call.cacheHitCost;
      totals.cacheMissCost += call.cacheMissCost;
      totals.outputCost += call.outputCost;
      totals.saved += call.savedCny;
      return totals;
    },
    {
      input: 0,
      cached: 0,
      uncached: 0,
      output: 0,
      reasoning: 0,
      cost: 0,
      cacheHitCost: 0,
      cacheMissCost: 0,
      outputCost: 0,
      saved: 0
    }
  );

  const authoritative = threadUsage
    ? {
        input: safeNumber(threadUsage.input_tokens),
        cached: safeNumber(threadUsage.cached_input_tokens),
        output: safeNumber(threadUsage.output_tokens),
        reasoning: safeNumber(threadUsage.reasoning_output_tokens),
        total: safeNumber(threadUsage.total_tokens)
      }
    : {
        input: summed.input,
        cached: summed.cached,
        output: summed.output,
        reasoning: summed.reasoning,
        total: summed.input + summed.output
      };

  const latestCall = calls.at(-1) || null;
  const currentContextTokens = latestCall?.contextTokens || 0;
  const contextWindow = info.contextWindow;
  const contextRate = (currentContextTokens / contextWindow) * 100;
  const cacheHitRate = authoritative.input > 0 ? (authoritative.cached / authoritative.input) * 100 : 0;
  const activeRateKind = rateKindFor(new Date(), "auto");

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    session: {
      id: sessionId,
      shortId: String(sessionId).slice(0, 8),
      file: path.basename(file.path),
      cwd: sessionMeta?.cwd || "",
      startedAt,
      lastUpdated,
      durationSeconds: Math.max(
        0,
        Math.round((new Date(lastUpdated).getTime() - new Date(startedAt).getTime()) / 1000)
      ),
      callCount: calls.length
    },
    model: {
      name: latestModel,
      canonical: info.canonical,
      label: info.label,
      version: info.version,
      contextWindow: info.contextWindow,
      maxOutput: info.maxOutput
    },
    totals: {
      inputTokens: authoritative.input,
      cachedInputTokens: authoritative.cached,
      uncachedInputTokens: Math.max(0, authoritative.input - authoritative.cached),
      outputTokens: authoritative.output,
      reasoningTokens: authoritative.reasoning,
      totalTokens: authoritative.total || authoritative.input + authoritative.output
    },
    conversation: {
      costCny: round(summed.cost, 6),
      cacheHitCostCny: round(summed.cacheHitCost, 6),
      cacheMissCostCny: round(summed.cacheMissCost, 6),
      outputCostCny: round(summed.outputCost, 6),
      cacheSavedCny: round(summed.saved, 6),
      cacheHitRate,
      averageCostCny: calls.length ? round(summed.cost / calls.length, 6) : 0,
      averageOutputTokens: calls.length
        ? Math.round(authoritative.output / calls.length)
        : 0,
      activeRateKind,
      priceMode: "auto",
      currency: "CNY",
      estimated: true
    },
    context: {
      tokens: currentContextTokens,
      window: contextWindow,
      rate: contextRate,
      remaining: Math.max(0, contextWindow - currentContextTokens),
      cached: latestCall?.cachedInputTokens || 0,
      uncached: latestCall?.uncachedInputTokens || 0,
      output: latestCall?.outputTokens || 0,
      callIndex: latestCall?.index || 0
    },
    pricing: {
      current: info[activeRateKind] || info.offPeak,
      offPeak: info.offPeak,
      peak: info.peak,
      currency: "CNY",
      unit: "每百万 tokens",
      peakRule: "北京时间工作日 09:00–12:00、14:00–18:00"
    },
    calls,
    turns,
    speed,
    lastCompletedTurnId:
      turns
        .slice()
        .reverse()
        .find((turn) => turn.completed)?.id ||
      turns.at(-1)?.id ||
      null
  };
}

async function parseDailyUsageFile(file, startMs, endMs) {
  const result = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costCny: 0,
    callCount: 0,
    sessionIds: new Set(),
    models: new Map()
  };

  let raw;
  try {
    raw = await fsp.readFile(file.path, "utf8");
  } catch {
    return result;
  }

  let latestModel = "deepseek-flash";
  const turnModels = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === "turn_context" && event.payload?.model) {
      latestModel = event.payload.model;
      if (event.payload.turn_id) {
        turnModels.set(event.payload.turn_id, event.payload.model);
      }
      continue;
    }

    if (event.type !== "token_usage_record" || !event.payload) continue;
    const timestamp = new Date(event.timestamp);
    const timestampMs = timestamp.getTime();
    if (Number.isNaN(timestampMs) || timestampMs < startMs || timestampMs >= endMs) {
      continue;
    }

    const payload = event.payload;
    const usage = extractUsage(payload);
    if (!usage.input && !usage.output) continue;
    const model = turnModels.get(payload.turn_id) || latestModel;
    if (!isDeepSeekModel(model)) continue;
    const rateKind = rateKindFor(timestamp, "auto");
    const cost = calculateCallCost(payload.usage, model, rateKind);
    const info = modelInfo(model);
    const currentModel = result.models.get(info.canonical) || {
      name: info.label,
      tokens: 0,
      costCny: 0,
      calls: 0
    };

    result.inputTokens += usage.input;
    result.cachedInputTokens += usage.cached;
    result.outputTokens += usage.output;
    result.reasoningTokens += usage.reasoning;
    result.totalTokens += usage.input + usage.output;
    result.costCny += cost.cost;
    result.callCount += 1;
    currentModel.tokens += usage.input + usage.output;
    currentModel.costCny += cost.cost;
    currentModel.calls += 1;
    result.models.set(info.canonical, currentModel);

    const sessionId = payload.session_id || payload.thread_id || payload.root_turn_id;
    if (sessionId) result.sessionIds.add(sessionId);
  }

  return result;
}

async function buildDailyUsage(force = false) {
  const bounds = getBeijingDayBounds();
  if (
    !force &&
    dailyUsageCache &&
    dailyUsageCache.dateLabel === bounds.dateLabel &&
    Date.now() - dailyUsageCache.fetchedAtMs < 2_500
  ) {
    return dailyUsageCache.value;
  }

  const files = await walkSessionFiles(SESSION_ROOT);
  const recentFiles = files.filter(
    (file) => file.mtimeMs >= bounds.startMs - 36 * 60 * 60 * 1000
  );

  const daily = {
    dateLabel: bounds.dateLabel,
    dayStart: new Date(bounds.startMs).toISOString(),
    updatedAt: new Date().toISOString(),
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    costCny: 0,
    callCount: 0,
    sessionCount: 0,
    models: []
  };

  const sessionIds = new Set();
  const models = new Map();

  for (const file of recentFiles) {
    const fileUsage = await parseDailyUsageFile(file, bounds.startMs, bounds.endMs);
    daily.totalTokens += fileUsage.totalTokens;
    daily.inputTokens += fileUsage.inputTokens;
    daily.cachedInputTokens += fileUsage.cachedInputTokens;
    daily.outputTokens += fileUsage.outputTokens;
    daily.reasoningTokens += fileUsage.reasoningTokens;
    daily.costCny += fileUsage.costCny;
    daily.callCount += fileUsage.callCount;
    fileUsage.sessionIds.forEach((sessionId) => sessionIds.add(sessionId));
    fileUsage.models.forEach((model, key) => {
      const existing = models.get(key) || {
        name: model.name,
        tokens: 0,
        costCny: 0,
        calls: 0
      };
      existing.tokens += model.tokens;
      existing.costCny += model.costCny;
      existing.calls += model.calls;
      models.set(key, existing);
    });
  }

  daily.sessionCount = sessionIds.size;
  daily.costCny = round(daily.costCny, 6);
  daily.cacheHitRate =
    daily.inputTokens > 0 ? (daily.cachedInputTokens / daily.inputTokens) * 100 : 0;
  daily.models = Array.from(models.entries())
    .map(([id, model]) => ({ id, ...model }))
    .sort((a, b) => b.tokens - a.tokens)
    .map((model) => ({
      ...model,
      costCny: round(model.costCny, 6)
    }));

  dailyUsageCache = {
    dateLabel: bounds.dateLabel,
    fetchedAtMs: Date.now(),
    value: daily
  };
  return daily;
}

async function buildDashboard({
  priceMode = "auto",
  sessionId = "",
  followLatest = false,
  forceBalance = false,
  forceDaily = false
} = {}) {
  const mode = ["auto", "peak", "offPeak"].includes(priceMode) ? priceMode : "auto";
  const file = await resolveSessionFile(sessionId, { followLatest });
  if (!file) {
    return {
      ok: false,
      error: `未找到 Codex 会话日志，请确认 ${SESSION_ROOT} 存在`,
      balance: await fetchBalance()
    };
  }

  const parsed = await parseSession(file);
  if (!parsed.ok) {
    return {
      ...parsed,
      balance: await fetchBalance()
    };
  }

  const rawCosts = [];
  const calls = parsed.calls.map((call) => {
    const rateKind = rateKindFor(new Date(call.time), mode);
    const usage = {
      input_tokens: call.inputTokens,
      cached_input_tokens: call.cachedInputTokens,
      output_tokens: call.outputTokens
    };
    const cost = calculateCallCost(usage, call.model, rateKind);
    rawCosts.push(cost);
    return {
      ...call,
      rateKind,
      costCny: round(cost.cost, 6),
      cacheHitCost: round(cost.cacheHitCost, 6),
      cacheMissCost: round(cost.cacheMissCost, 6),
      outputCost: round(cost.outputCost, 6),
      savedCny: round(cost.saved, 6)
    };
  });

  const totals = calls.reduce(
    (sum, call, index) => {
      const rawCost = rawCosts[index];
      sum.cost += rawCost.cost;
      sum.cacheHitCost += rawCost.cacheHitCost;
      sum.cacheMissCost += rawCost.cacheMissCost;
      sum.outputCost += rawCost.outputCost;
      sum.saved += rawCost.saved;
      return sum;
    },
    { cost: 0, cacheHitCost: 0, cacheMissCost: 0, outputCost: 0, saved: 0 }
  );

  const info = modelInfo(parsed.model.name);
  const activeRateKind = mode === "auto" ? rateKindFor(new Date(), "auto") : mode;
  const [balance, daily] = await Promise.all([
    fetchBalance({ force: forceBalance }),
    buildDailyUsage(forceDaily)
  ]);

  return {
    ...parsed,
    balance,
    daily,
    calls,
    conversation: {
      ...parsed.conversation,
      costCny: round(totals.cost, 6),
      cacheHitCostCny: round(totals.cacheHitCost, 6),
      cacheMissCostCny: round(totals.cacheMissCost, 6),
      outputCostCny: round(totals.outputCost, 6),
      cacheSavedCny: round(totals.saved, 6),
      averageCostCny: calls.length ? round(totals.cost / calls.length, 6) : 0,
      activeRateKind,
      priceMode: mode
    },
    pricing: {
      ...parsed.pricing,
      current: info[activeRateKind] || info.offPeak,
      offPeak: info.offPeak,
      peak: info.peak
    },
    catalog: MODELS
  };
}

function sendJson(response, status, data) {
  const payload = JSON.stringify(data);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "X-Content-Type-Options": "nosniff"
  });
  response.end(payload);
}

function readRequestBody(request, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("请求体过大"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("请求 JSON 格式无效"));
      }
    });
    request.on("error", reject);
  });
}

async function streamSessionEvents(request, response, sessionId = "", followLatest = false) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff"
  });
  response.write("retry: 3000\n\n");

  const send = (event, data) => {
    if (!response.writableEnded) {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  const activeSessionListener = (data) => send("active_session_changed", data);
  if (followLatest) {
    activeSessionListeners.add(activeSessionListener);
  }

  const file = await resolveSessionFile(sessionId, { followLatest });
  if (!file) {
    send("stream_error", { error: "未找到会话日志" });
    response.end();
    return;
  }

  let lastSize = 0;
  try {
    lastSize = (await fsp.stat(file.path)).size;
  } catch {
    send("stream_error", { error: "无法读取会话日志" });
    response.end();
    return;
  }

  send("ready", {
    sessionId: path.basename(file.path),
    watchingFrom: new Date().toISOString()
  });
  console.log(`[sse] client connected: ${path.basename(file.path)}`);

  let checking = false;
  let pendingText = "";
  const pollTimer = setInterval(async () => {
    if (checking || response.writableEnded) return;
    checking = true;
    try {
      const stat = await fsp.stat(file.path);
      if (stat.size < lastSize) {
        lastSize = stat.size;
      } else if (stat.size > lastSize) {
        const start = lastSize;
        const length = stat.size - lastSize;
        const buffer = Buffer.alloc(length);
        const handle = await fsp.open(file.path, "r");
        try {
          await handle.read(buffer, 0, length, start);
        } finally {
          await handle.close();
        }
        lastSize = stat.size;
        pendingText += buffer.toString("utf8");
        const appendedLines = pendingText.split(/\r?\n/);
        pendingText = appendedLines.pop() || "";
        const appendedEvents = [];
        for (const line of appendedLines) {
          if (!line.trim()) continue;
          try {
            appendedEvents.push(JSON.parse(line));
          } catch {
            // Ignore incomplete or malformed log lines and keep watching.
          }
        }
        // The final JSONL record of a turn may not have its trailing newline
        // flushed yet. Parse it as soon as it is valid instead of waiting for
        // the next user turn to append another line.
        if (pendingText.trim()) {
          try {
            appendedEvents.push(JSON.parse(pendingText));
            pendingText = "";
          } catch {
            // Keep the partial record buffered until the rest arrives.
          }
        }

        if (appendedEvents.some((event) => event.type === "token_usage_record")) {
          send("token_usage", {
            at: new Date().toISOString(),
            sessionId: path.basename(file.path)
          });
        }

        for (const event of appendedEvents) {
          if (event.type !== "event_msg" || event.payload?.type !== "task_complete") {
            continue;
          }
          console.log(`[sse] task_complete: ${event.payload.turn_id || "unknown"}`);
          send("task_complete", {
            at: new Date().toISOString(),
            sessionId: path.basename(file.path),
            turnId: event.payload.turn_id || null,
            startedAt: event.payload.started_at || null,
            completedAt: event.payload.completed_at || event.timestamp || null,
            durationMs: safeNumber(event.payload.duration_ms)
          });
        }
      }
    } catch {
      // The session can be rotated while a turn is running.
    } finally {
      checking = false;
    }
  }, 1_000);

  const heartbeatTimer = setInterval(() => {
    if (response.writableEnded) return;
    response.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15_000);

  const cleanup = () => {
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    activeSessionListeners.delete(activeSessionListener);
  };

  request.on("close", cleanup);
  response.on("close", cleanup);
}

async function serveStatic(requestPath, response) {
  const pathname = decodeURIComponent(requestPath.split("?")[0]);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(PUBLIC_DIR, `.${requested}`);

  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) throw new Error("not a file");
    const extension = path.extname(resolved).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": [".html", ".css", ".js"].includes(extension)
        ? "no-cache"
        : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    });
    fs.createReadStream(resolved).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, time: new Date().toISOString() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const dashboard = await buildDashboard({
        priceMode: url.searchParams.get("priceMode") || "auto",
        sessionId: url.searchParams.get("sessionId") || "",
        followLatest: url.searchParams.get("follow") === "1",
        forceBalance: url.searchParams.get("refreshBalance") === "1",
        forceDaily: url.searchParams.get("fresh") === "1"
      });
      sendJson(response, 200, dashboard);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      await streamSessionEvents(
        request,
        response,
        url.searchParams.get("sessionId") || "",
        url.searchParams.get("follow") === "1"
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/active-session") {
      const body = await readRequestBody(request);
      const sessionId = String(body.sessionId || "").trim();
      const transcriptPath = normalizeTranscriptPath(body.transcriptPath);
      if (!sessionId && !transcriptPath) {
        sendJson(response, 400, {
          ok: false,
          error: "缺少有效的 sessionId 或 transcriptPath"
        });
        return;
      }

      activeSession = {
        sessionId,
        transcriptPath,
        event: String(body.event || ""),
        updatedAt: new Date().toISOString()
      };
      persistActiveSession(activeSession);
      for (const listener of activeSessionListeners) {
        listener(activeSession);
      }
      sendJson(response, 200, { ok: true, activeSession });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/connect") {
      const body = await readRequestBody(request);
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey) {
        sendJson(response, 400, { ok: false, error: "请输入 DeepSeek API Key" });
        return;
      }
      const result = await fetchBalance({ force: true, keyOverride: apiKey });
      if (!result.ok) {
        sendJson(response, 400, result);
        return;
      }
      sessionApiKey = apiKey;
      balanceCache = null;
      sendJson(response, 200, { ...result, savedForSession: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/disconnect") {
      sessionApiKey = null;
      balanceCache = null;
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/widget/layout") {
      const body = await readRequestBody(request);
      const mode = body.collapsed ? "collapsed" : "expanded";
      await resizeWidgetWindow(mode);
      sendJson(response, 200, { ok: true, mode });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { ok: false, error: "接口不存在" });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    console.error(`[dashboard] ${request.method} ${url.pathname}: ${error.message}`);
    if (!response.headersSent) {
      sendJson(response, 500, { ok: false, error: "服务端请求处理失败" });
    } else {
      response.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DeepSeek Usage Dashboard: http://${HOST}:${PORT}`);
  console.log(`Session source: ${SESSION_ROOT}`);
});
