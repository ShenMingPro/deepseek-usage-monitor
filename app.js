const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const initialSearchParams = new URLSearchParams(location.search);
const widgetMode = initialSearchParams.get("widget") === "1";
const followLatestSession = initialSearchParams.get("follow") === "1";
const HERO_COMPLETION_RETURN_MS = 4000;
const HERO_COMPLETION_REDUCED_MOTION_RETURN_MS = 3000;

const storedTheme = localStorage.getItem("dsmon-theme");
const preferredTheme =
  storedTheme ||
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.documentElement.dataset.theme = preferredTheme;

const state = {
  data: null,
  view: "overview",
  widgetCollapsed: document.documentElement.dataset.collapsed === "true",
  widgetLayoutBusy: false,
  chartMode: "requests",
  requestFilter: "all",
  priceMode: localStorage.getItem("dsmon-price-mode") || "auto",
  refreshSeconds: followLatestSession
    ? 3
    : Number(localStorage.getItem("dsmon-refresh-seconds") ?? 15),
  loading: false,
  lastFetchAt: null,
  autoTimer: null,
  toastTimer: null,
  chartGeometry: null,
  requestedSessionId: followLatestSession
    ? ""
    : initialSearchParams.get("sessionId") || "",
  eventSource: null,
  eventSourceSessionId: null,
  eventRefreshTimer: null,
  pendingUsageRefresh: false,
  pendingCelebration: false,
  pendingCelebrationTurnId: null,
  lastSeenCompletedTurnId: null,
  heroCompletionOpen: false,
  heroCompletionTimers: [],
  heroCompletionRestoreTimer: null,
  completionPlayedUnfocused: false,
  previousDailyTokens: null,
  previousDailyCost: null,
  tokenRefreshAnimating: false,
  pendingTokenRefresh: null,
  previousSpeed: null,
  speedFlashTimer: null,
  starfield: null
};

const viewTitles = {
  overview: "实时总览",
  requests: "请求明细",
  pricing: "计费与连接",
  about: "数据说明"
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const clockFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});
const shortTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const refs = {
  loadingState: $("#loadingState"),
  errorState: $("#errorState"),
  errorMessage: $("#errorMessage"),
  dashboardMain: $("#dashboardMain"),
  dailyHero: $("#dailyHero"),
  starfield: $("#starfield"),
  dailyDate: $("#dailyDate"),
  dailyTokens: $("#dailyTokens"),
  dailyModels: $("#dailyModels"),
  dailyClock: $("#dailyClock"),
  dailyCalls: $("#dailyCalls"),
  dailyCost: $("#dailyCost"),
  tokenDeltaBadge: $("#tokenDeltaBadge"),
  balanceDeltaBadge: $("#balanceDeltaBadge"),
  dailyBalanceCurrency: $("#dailyBalanceCurrency"),
  dailyBalanceValue: $("#dailyBalanceValue"),
  dailyBalanceHint: $("#dailyBalanceHint"),
  refreshBtn: $("#refreshBtn"),
  refreshBalanceBtn: $("#refreshBalanceBtn"),
  syncStatus: $("#syncStatus"),
  lastSync: $("#lastSync"),
  pageBreadcrumb: $("#pageBreadcrumb"),
  modelName: $("#modelName"),
  modelVersion: $("#modelVersion"),
  sidebarSessionId: $("#sidebarSessionId"),
  sidebarContextFill: $("#sidebarContextFill"),
  sidebarContextLabel: $("#sidebarContextLabel"),
  navRequestCount: $("#navRequestCount"),
  openConnectBtn: $("#openConnectBtn"),
  balanceStatus: $("#balanceStatus"),
  balanceCurrency: $("#balanceCurrency"),
  balanceValue: $("#balanceValue"),
  balanceDetail: $("#balanceDetail"),
  spendRateChip: $("#spendRateChip"),
  spendValue: $("#spendValue"),
  spendDetail: $("#spendDetail"),
  spendSpark: $("#spendSpark"),
  contextChip: $("#contextChip"),
  contextValue: $("#contextValue"),
  contextDetail: $("#contextDetail"),
  contextMiniFill: $("#contextMiniFill"),
  heroContextBadge: $("#heroContextBadge"),
  heroContextPercent: $("#heroContextPercent"),
  heroTooltip: $("#heroTooltip"),
  inputValue: $("#inputValue"),
  inputDetail: $("#inputDetail"),
  inputSpark: $("#inputSpark"),
  outputValue: $("#outputValue"),
  outputDetail: $("#outputDetail"),
  outputSpark: $("#outputSpark"),
  heroSpeedBadge: $("#heroSpeedBadge"),
  heroSpeedValue: $("#heroSpeedValue"),
  heroFirstTokenBadge: $("#heroFirstTokenBadge"),
  heroFirstToken: $("#heroFirstToken"),
  heroDurationBadge: $("#heroDurationBadge"),
  heroTurnDuration: $("#heroTurnDuration"),
  cacheChip: $("#cacheChip"),
  cacheValue: $("#cacheValue"),
  cacheDetail: $("#cacheDetail"),
  cacheMiniFill: $("#cacheMiniFill"),
  chartSubtitle: $("#chartSubtitle"),
  chartPeriod: $("#chartPeriod"),
  trendChart: $("#trendChart"),
  trendTooltip: $("#trendTooltip"),
  donutCached: $("#donutCached"),
  donutUncached: $("#donutUncached"),
  donutOutput: $("#donutOutput"),
  donutValue: $("#donutValue"),
  donutTokens: $("#donutTokens"),
  contextCached: $("#contextCached"),
  contextUncached: $("#contextUncached"),
  contextOutput: $("#contextOutput"),
  contextRemaining: $("#contextRemaining"),
  contextCallout: $("#contextCallout"),
  recentRows: $("#recentRows"),
  costTotal: $("#costTotal"),
  costBars: $("#costBars"),
  cacheSavings: $("#cacheSavings"),
  savingsContext: $("#savingsContext"),
  pricingModeChip: $("#pricingModeChip"),
  priceFootnote: $("#priceFootnote"),
  requestSummary: $("#requestSummary"),
  requestRows: $("#requestRows"),
  exportBtn: $("#exportBtn"),
  connectionBadge: $("#connectionBadge"),
  keySourceText: $("#keySourceText"),
  connectionSummary: $("#connectionSummary"),
  connectForm: $("#connectForm"),
  apiKeyInput: $("#apiKeyInput"),
  connectBtn: $("#connectBtn"),
  showKeyBtn: $("#showKeyBtn"),
  verifyBalanceBtn: $("#verifyBalanceBtn"),
  disconnectBtn: $("#disconnectBtn"),
  refreshSelect: $("#refreshSelect"),
  priceCards: $("#priceCards"),
  previewCompletionBtn: $("#previewCompletionBtn"),
  widgetSettingsBtn: $("#widgetSettingsBtn"),
  widgetSettingsClose: $("#widgetSettingsClose"),
  widgetCollapseBtn: $("#widgetCollapseBtn"),
  widgetExpandBtn: $("#widgetExpandBtn"),
  widgetDragHandle: $("#widgetDragHandle"),
  heroCollisionFlash: $("#heroCollisionFlash"),
  heroCompletionView: $("#heroCompletionView"),
  heroDailyView: $("#heroDailyView"),
  heroCompletionQuestion: $("#heroCompletionQuestion"),
  heroCompletionTokens: $("#heroCompletionTokens"),
  heroCompletionMeta: $("#heroCompletionMeta"),
  heroCompletionInput: $("#heroCompletionInput"),
  heroCompletionOutput: $("#heroCompletionOutput"),
  heroCompletionCache: $("#heroCompletionCache"),
  heroCompletionCost: $("#heroCompletionCost"),
  toast: $("#toast"),
  toastMessage: $("#toastMessage"),
  errorRetryBtn: $("#errorRetryBtn"),
  menuBtn: $("#menuBtn"),
  sidebar: $("#sidebar"),
  sidebarOverlay: $("#sidebarOverlay"),
  sidebarClose: $("#sidebarClose"),
  themeBtn: $("#themeBtn")
};

function formatInt(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatCompact(value) {
  const number = Number(value) || 0;
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(absolute >= 10_000_000_000 ? 1 : 2)}B`;
  }
  if (absolute >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(absolute >= 10_000_000 ? 1 : 2)}M`;
  }
  if (absolute >= 1_000) {
    return `${(number / 1_000).toFixed(absolute >= 100_000 ? 0 : 1)}K`;
  }
  return formatInt(number);
}

function formatPercent(value, digits = 1) {
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

function formatSpeed(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "--";
  return number >= 100 ? String(Math.round(number)) : number.toFixed(1);
}

const HERO_STATUS_CLASSES = ["is-good", "is-warning", "is-danger"];
const HERO_THRESHOLDS = {
  context: { warning: 50, danger: 75 },
  speed: { good: 80, warning: 30 },
  firstToken: { good: 5000, warning: 10000 },
  duration: { good: 8000, warning: 16000 }
};

function applyHeroStatus(element, status) {
  if (!element) return;
  element.classList.remove(...HERO_STATUS_CLASSES);
  if (status) element.classList.add(`is-${status}`);
}

function formatMilliseconds(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value <= 0) return "--";
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function formatCompactDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}秒`;
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  if (minutes < 60) return `${minutes}分${String(remaining).padStart(2, "0")}秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours}时${String(minutes % 60).padStart(2, "0")}分`;
}

function showHeroTooltip(trigger) {
  const message = trigger?.dataset.tooltip?.trim();
  if (!message) return;
  const tooltip = refs.heroTooltip;
  if (!tooltip) return;
  tooltip.hidden = false;
  tooltip.classList.remove("is-visible");
  tooltip.textContent = message;

  const heroRect = refs.dailyHero.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipWidth = tooltip.offsetWidth;
  const left = Math.max(
    12,
    Math.min(
      triggerRect.left - heroRect.left + triggerRect.width / 2 - tooltipWidth / 2,
      heroRect.width - tooltipWidth - 12
    )
  );
  const arrowLeft = triggerRect.left - heroRect.left + triggerRect.width / 2 - left;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${triggerRect.bottom - heroRect.top + 8}px`;
  tooltip.style.setProperty(
    "--tooltip-arrow-left",
    `${Math.max(14, Math.min(tooltipWidth - 14, arrowLeft))}px`
  );
  requestAnimationFrame(() => tooltip.classList.add("is-visible"));
}

function hideHeroTooltip() {
  const tooltip = refs.heroTooltip;
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  setTimeout(() => {
    if (!tooltip.classList.contains("is-visible")) tooltip.hidden = true;
  }, 160);
}

function formatMoneyValue(value, digits = 2) {
  const number = Number(value) || 0;
  const decimals =
    number !== 0 && Math.abs(number) < 0.01 ? 4 : number < 1 ? Math.max(digits, 3) : digits;
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatCny(value, digits = 2) {
  return `¥${formatMoneyValue(value, digits)}`;
}

function formatFixedMoney(value, digits = 2) {
  return (Number(value) || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function currencySymbol(currency) {
  return String(currency || "").toUpperCase() === "USD" ? "$" : "¥";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  if (minutes < 60) return `${minutes} 分 ${remaining} 秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

function formatRate(rateKind) {
  return rateKind === "peak" ? "高峰价" : "空闲价";
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setSyncStatus(mode, label) {
  refs.syncStatus.classList.toggle("is-syncing", mode === "syncing");
  refs.syncStatus.classList.toggle("is-error", mode === "error");
  const labelNode = refs.syncStatus.querySelector("span:nth-child(2)");
  if (labelNode && label) labelNode.textContent = label;
  updateRelativeSync();
}

function updateRelativeSync() {
  if (!state.lastFetchAt) {
    setText(refs.lastSync, "等待同步");
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - state.lastFetchAt) / 1000));
  if (seconds < 5) {
    setText(refs.lastSync, "刚刚");
  } else if (seconds < 60) {
    setText(refs.lastSync, `${seconds} 秒前`);
  } else if (seconds < 3600) {
    setText(refs.lastSync, `${Math.floor(seconds / 60)} 分钟前`);
  } else {
    setText(refs.lastSync, `${Math.floor(seconds / 3600)} 小时前`);
  }
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  refs.toast.classList.toggle("is-error", isError);
  refs.toastMessage.textContent = message;
  const iconUse = refs.toast.querySelector("use");
  if (iconUse) iconUse.setAttribute("href", isError ? "#icon-alert" : "#icon-check");
  refs.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    refs.toast.hidden = true;
  }, 3200);
}

function showError(message) {
  refs.loadingState.hidden = true;
  refs.dashboardMain.hidden = true;
  refs.errorState.hidden = false;
  refs.errorMessage.textContent = message;
  setSyncStatus("error", "同步失败");
}

function showDashboard() {
  refs.loadingState.hidden = true;
  refs.errorState.hidden = true;
  refs.dashboardMain.hidden = false;
}

async function loadDashboard({
  initial = false,
  forceBalance = false,
  fresh = false,
  silent = false,
  successMessage = "用量数据已更新"
} = {}) {
  if (state.loading) return;
  state.loading = true;
  refs.refreshBtn.classList.add("is-loading");
  setSyncStatus("syncing", initial ? "同步中" : "更新中");

  try {
    const params = new URLSearchParams({
      priceMode: state.priceMode
    });
    if (followLatestSession) params.set("follow", "1");
    if (state.requestedSessionId) params.set("sessionId", state.requestedSessionId);
    if (forceBalance) params.set("refreshBalance", "1");
    if (fresh) params.set("fresh", "1");

    const response = await fetch(`/api/dashboard?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`本地服务返回 ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "无法读取用量数据");

    const previousSessionId = state.data?.session.id || null;
    const sessionChanged = Boolean(
      previousSessionId && previousSessionId !== data.session.id
    );
    if (sessionChanged) {
      restoreHeroDailyView();
      if (state.celebrationOpen) {
        closeSessionCelebration({ immediate: true, restoreFocus: false });
      }
      state.pendingCelebration = false;
      state.pendingCelebrationTurnId = null;
      state.completionPlayedUnfocused = false;
    }

    const previousCompletedTurnId = state.lastSeenCompletedTurnId;
    const currentCompletedTurnId = data.lastCompletedTurnId || null;
    const hasNewCompletedTurn =
      !initial &&
      !sessionChanged &&
      currentCompletedTurnId &&
      currentCompletedTurnId !== previousCompletedTurnId;
    state.lastSeenCompletedTurnId = currentCompletedTurnId;
    if (hasNewCompletedTurn) {
      state.pendingCelebration = true;
      state.pendingCelebrationTurnId = currentCompletedTurnId;
    }

    state.data = data;
    state.lastFetchAt = Date.now();
    showDashboard();
    renderAll();
    connectLiveEvents();
    setSyncStatus("ok", "已同步");
    if (state.pendingCelebration) {
      maybeShowPendingCelebration();
    } else if (!silent && !initial) {
      showToast(successMessage);
    }
  } catch (error) {
    if (!state.data) {
      showError(error.message || "无法连接本地监控服务");
    } else {
      setSyncStatus("error", "同步失败");
      if (!silent) showToast(error.message || "同步失败，请稍后重试", true);
    }
  } finally {
    state.loading = false;
    refs.refreshBtn.classList.remove("is-loading");
    if (state.pendingUsageRefresh && state.data) {
      state.pendingUsageRefresh = false;
      setTimeout(() => {
        loadDashboard({
          fresh: true,
          silent: true
        });
      }, 120);
    }
  }
}

function restartAutoRefresh() {
  clearInterval(state.autoTimer);
  state.autoTimer = null;
  if (state.refreshSeconds > 0) {
    state.autoTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadDashboard({ silent: true });
      }
    }, state.refreshSeconds * 1000);
  }
}

function renderAll() {
  if (!state.data) return;
  renderHeader();
  renderDailyHero();
  renderMetricCards();
  renderTrendChart();
  renderContext();
  renderRecentRequests();
  renderCostBreakdown();
  renderRequestsView();
  renderPricingView();
}

function animateNumber(element, from, to, formatter, duration = 680) {
  if (!element) return;
  const startValue = Number(from);
  const endValue = Number(to);
  if (element._numberFrame) cancelAnimationFrame(element._numberFrame);
  if (
    !Number.isFinite(startValue) ||
    !Number.isFinite(endValue) ||
    Math.abs(endValue - startValue) < 0.0001 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    element.textContent = formatter(endValue || 0);
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const value = startValue + (endValue - startValue) * eased;
    element.textContent = formatter(value);
    if (progress < 1) {
      element._numberFrame = requestAnimationFrame(tick);
    }
  };
  element._numberFrame = requestAnimationFrame(tick);
}

function formatDailyCost(value) {
  const number = Number(value) || 0;
  return formatCny(number, 6);
}

function createFlipDigitMarkup(digit) {
  return `
    <span class="flip-digit" data-digit="${digit}" aria-hidden="true">
      <span class="flip-static">${digit}</span>
      <span class="flip-flap flip-top"><span class="flap-value">${digit}</span></span>
      <span class="flip-flap flip-bottom"><span class="flap-value">${digit}</span></span>
    </span>
  `;
}

function renderFlipNumber(element, value, animate = true) {
  if (!element) return;
  const formatted = formatInt(value);
  const previous = element.dataset.value || "";
  const canAnimate =
    animate &&
    previous.length === formatted.length &&
    element.children.length === formatted.length;

  if (!canAnimate) {
    element.innerHTML = Array.from(formatted)
      .map((character) =>
        /\d/.test(character)
          ? createFlipDigitMarkup(character)
          : `<span class="flip-separator" aria-hidden="true">${escapeHtml(character)}</span>`
      )
      .join("");
    element.dataset.value = formatted;
    element.setAttribute("aria-label", `今日消耗 Tokens ${formatted}`);
    return;
  }

  Array.from(formatted).forEach((character, index) => {
    const child = element.children[index];
    if (!child?.classList.contains("flip-digit")) return;
    const oldDigit = child.dataset.digit || "";
    if (oldDigit === character) return;
    const topValue = child.querySelector(".flip-top .flap-value");
    const bottomValue = child.querySelector(".flip-bottom .flap-value");
    const staticValue = child.querySelector(".flip-static");
    if (!topValue || !bottomValue || !staticValue) return;
    topValue.textContent = oldDigit;
    bottomValue.textContent = character;
    staticValue.textContent = character;
    child.dataset.digit = character;
    child.classList.remove("is-flipping");
    void child.offsetWidth;
    child.style.setProperty("--flip-delay", `${index * 24}ms`);
    child.classList.add("is-flipping");
  });

  element.dataset.value = formatted;
  element.setAttribute("aria-label", `今日消耗 Tokens ${formatted}`);
}

function flashDailyHero() {
  refs.dailyHero.classList.remove("is-updated");
  void refs.dailyHero.offsetWidth;
  refs.dailyHero.classList.add("is-updated");
  setTimeout(() => refs.dailyHero.classList.remove("is-updated"), 1000);
}

function showDeltaBadge(element, text, duration = 1400) {
  if (!element) return;
  clearTimeout(element._deltaTimer);
  element.textContent = text;
  element.hidden = false;
  element.classList.remove("is-visible");
  void element.offsetWidth;
  element.classList.add("is-visible");
  element._deltaTimer = setTimeout(() => {
    element.classList.remove("is-visible");
    setTimeout(() => {
      element.hidden = true;
    }, 280);
  }, duration);
}

function formatCostDelta(value) {
  const amount = Math.abs(Number(value) || 0);
  return `-${formatFixedMoney(amount, 6)}`;
}

function commitDailyUsage(target, { animate = true, flash = true } = {}) {
  const previousTokens = state.previousDailyTokens;
  const previousCost = state.previousDailyCost;
  const tokenDelta =
    previousTokens !== null ? Math.max(0, target.tokens - previousTokens) : 0;
  const costDelta =
    previousCost !== null ? Math.max(0, target.cost - previousCost) : 0;

  state.previousDailyTokens = target.tokens;
  state.previousDailyCost = target.cost;

  if (flash && tokenDelta > 0) {
    showDeltaBadge(refs.tokenDeltaBadge, `+${Math.round(tokenDelta)}`);
  }
  if (flash && costDelta > 0) {
    showDeltaBadge(refs.balanceDeltaBadge, formatCostDelta(costDelta));
  }

  const applyUpdate = () => {
    renderFlipNumber(
      refs.dailyTokens,
      target.tokens,
      animate && previousTokens !== null
    );
    animateNumber(
      refs.dailyCost,
      previousCost ?? target.cost,
      target.cost,
      formatDailyCost
    );
    if (flash) flashDailyHero();
  };

  if (flash && (tokenDelta > 0 || costDelta > 0)) {
    setTimeout(applyUpdate, 120);
  } else {
    applyUpdate();
  }
}

function scheduleTokenRefresh(target) {
  state.pendingTokenRefresh = target;
  if (state.tokenRefreshAnimating) return;
  state.tokenRefreshAnimating = true;

  let committed = false;
  const finish = () => {
    if (committed) return;
    committed = true;
    const pending = state.pendingTokenRefresh;
    state.pendingTokenRefresh = null;
    if (pending) commitDailyUsage(pending);
  };

  const tokenRect = refs.dailyTokens?.getBoundingClientRect();
  const heroRect = refs.dailyHero.getBoundingClientRect();
  const targetX = tokenRect?.width
    ? tokenRect.left - heroRect.left + tokenRect.width / 2
    : heroRect.width / 2;
  const targetY = tokenRect?.height
    ? tokenRect.top - heroRect.top + tokenRect.height / 2
    : heroRect.height * 0.46;

  if (state.starfield?.tokenImpact) {
    state.starfield.tokenImpact(targetX, targetY, finish);
  } else {
    finish();
  }

  setTimeout(finish, 1_100);
  setTimeout(() => {
    state.tokenRefreshAnimating = false;
    refs.dailyHero.classList.remove("is-token-refreshing");
    const queued = state.pendingTokenRefresh;
    if (queued && queued.tokens !== state.previousDailyTokens) {
      state.pendingTokenRefresh = null;
      scheduleTokenRefresh(queued);
    }
  }, 1_800);
}

function renderDailyHero() {
  const daily = state.data?.daily;
  if (!daily) return;
  setText(refs.dailyDate, daily.dateLabel);
  setText(
    refs.dailyModels,
    daily.models.length
      ? daily.models.map((model) => model.id).join(" + ")
      : state.data.model.name
  );
  setText(refs.dailyCalls, `今日 ${formatInt(daily.callCount)} 次调用`);

  const balance = state.data.balance || {};
  if (balance.ok) {
    setText(refs.dailyBalanceCurrency, currencySymbol(balance.currency));
    setText(refs.dailyBalanceValue, formatFixedMoney(balance.total, 2));
    setText(
      refs.dailyBalanceHint,
      balance.isAvailable ? "DeepSeek 可用余额" : "账户余额不足"
    );
  } else {
    setText(refs.dailyBalanceCurrency, "¥");
    setText(refs.dailyBalanceValue, "--");
    setText(
      refs.dailyBalanceHint,
      balance.source ? "余额查询失败" : "尚未连接账户"
    );
  }

  const tokensChanged =
    state.previousDailyTokens !== null &&
    state.previousDailyTokens !== daily.totalTokens;
  const costChanged =
    state.previousDailyCost !== null &&
    Math.abs(state.previousDailyCost - daily.costCny) > 0.000001;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canAnimateRefresh =
    tokensChanged &&
    !state.heroCompletionOpen &&
    !state.widgetCollapsed &&
    !reducedMotion;
  const target = { tokens: daily.totalTokens, cost: daily.costCny };

  if (canAnimateRefresh) {
    scheduleTokenRefresh(target);
  } else if (tokensChanged || costChanged || state.previousDailyTokens === null) {
    commitDailyUsage(target, {
      animate: state.previousDailyTokens !== null && !reducedMotion,
      flash: tokensChanged || costChanged
    });
  }
}

function renderHeader() {
  const { data } = state;
  setText(refs.modelName, data.model.name);
  setText(refs.modelVersion, data.model.version);
  setText(refs.sidebarSessionId, `${data.session.shortId} · ${data.session.callCount} 次调用`);
  setText(refs.navRequestCount, String(data.session.callCount));
  setText(refs.chartPeriod, `${formatDuration(data.session.durationSeconds)} · ${data.session.callCount} 次调用`);
  setText(refs.sidebarContextLabel, `上下文 ${formatPercent(data.context.rate)}`);
  refs.sidebarContextFill.style.width = `${Math.min(100, Math.max(1.5, data.context.rate))}%`;
  refs.openConnectBtn.querySelector("span").textContent = data.balance?.ok ? "账户已连接" : "连接账户";
  document.title = widgetMode
    ? "DeepSeek Usage Widget"
    : `DeepSeek 用量 · ${formatPercent(data.context.rate)} 上下文`;
}

function renderMetricCards() {
  const { data } = state;
  const balance = data.balance || {};
  const conversation = data.conversation;
  const context = data.context;
  const totals = data.totals;
  const speed = data.speed || {};

  if (balance.ok) {
    const symbol = currencySymbol(balance.currency);
    setText(refs.balanceCurrency, symbol);
    setText(refs.balanceValue, formatFixedMoney(balance.total, 2));
    setText(refs.balanceStatus, balance.isAvailable ? "余额可用" : "余额不足");
    refs.balanceStatus.style.background = balance.isAvailable
      ? "rgba(130,255,194,.14)"
      : "rgba(255,209,128,.16)";
    setText(refs.balanceDetail, `充值 ${symbol}${formatFixedMoney(balance.toppedUp, 2)} · 赠送 ${symbol}${formatFixedMoney(balance.granted, 2)}`);
  } else {
    setText(refs.balanceCurrency, "¥");
    setText(refs.balanceValue, "--");
    setText(refs.balanceStatus, balance.source ? "连接异常" : "未连接");
    setText(
      refs.balanceDetail,
      balance.error || "在“计费与连接”中配置 DeepSeek API Key"
    );
  }

  setText(refs.spendValue, formatMoneyValue(conversation.costCny, 6));
  setText(
    refs.spendDetail,
    `${formatInt(data.session.callCount)} 次调用 · 平均 ${formatCny(conversation.averageCostCny, 6)}/次`
  );
  setText(refs.spendRateChip, formatRate(conversation.activeRateKind));
  refs.spendRateChip.classList.toggle("metric-chip-warning", conversation.activeRateKind === "peak");

  setText(refs.contextValue, Number(context.rate).toFixed(1));
  setText(refs.contextDetail, `${formatInt(context.tokens)} / ${formatCompact(context.window)} tokens`);
  setText(refs.contextChip, context.rate >= 70 ? "接近上限" : context.rate >= 40 ? "占用较高" : "余量充足");
  refs.contextChip.classList.toggle("metric-chip-warning", context.rate >= 70);
  refs.contextMiniFill.style.width = `${Math.min(100, Math.max(1.5, context.rate))}%`;

  setText(refs.inputValue, formatInt(totals.inputTokens));
  setText(
    refs.inputDetail,
    `缓存 ${formatCompact(totals.cachedInputTokens)} · 未命中 ${formatCompact(totals.uncachedInputTokens)}`
  );
  setText(refs.outputValue, formatInt(totals.outputTokens));
  const latestSpeed = speed.latestTokensPerSecond;
  const averageSpeed = speed.averageTokensPerSecond;
  if (latestSpeed) {
    const changed =
      state.previousSpeed !== null &&
      Math.abs(state.previousSpeed - latestSpeed) >= 0.05;
    if (changed) {
      animateNumber(
        refs.heroSpeedValue,
        state.previousSpeed,
        latestSpeed,
        (value) => formatSpeed(value),
        620
      );
      clearTimeout(state.speedFlashTimer);
      refs.heroSpeedBadge.classList.remove("is-updated");
      void refs.heroSpeedBadge.offsetWidth;
      refs.heroSpeedBadge.classList.add("is-updated");
      state.speedFlashTimer = setTimeout(
        () => refs.heroSpeedBadge.classList.remove("is-updated"),
        760
      );
    } else {
      setText(refs.heroSpeedValue, formatSpeed(latestSpeed));
    }
    state.previousSpeed = latestSpeed;
  } else {
    setText(refs.heroSpeedValue, "--");
    state.previousSpeed = null;
  }
  refs.heroSpeedBadge.classList.toggle("is-empty", !latestSpeed);
  applyHeroStatus(
    refs.heroSpeedBadge,
    !latestSpeed
      ? null
      : latestSpeed >= HERO_THRESHOLDS.speed.good
        ? "good"
        : latestSpeed >= HERO_THRESHOLDS.speed.warning
          ? "warning"
          : "danger"
  );
  refs.heroSpeedBadge.dataset.tooltip = latestSpeed
    ? `模型输出速度：最近一次 ${formatSpeed(latestSpeed)} tok/s，近 ${speed.sampleSize || 0} 次平均 ${formatSpeed(averageSpeed)} tok/s。按输出 Token ÷ 单次模型调用耗时估算，不包含工具执行时间。`
    : "模型输出速度：每次模型调用完成后按输出 Token 与调用耗时估算。";
  refs.heroSpeedBadge.setAttribute(
    "aria-label",
    latestSpeed
      ? `模型输出速度 ${formatSpeed(latestSpeed)} tokens 每秒，近 ${speed.sampleSize || 0} 次平均 ${formatSpeed(averageSpeed)} tokens 每秒`
      : "等待模型调用以计算输出速度"
  );
  const latestCall = state.data.calls?.at(-1) || null;
  refs.heroFirstTokenBadge.setAttribute(
    "aria-label",
    `首字延迟 ${latestCall ? formatMilliseconds(latestCall.firstTokenMs) : "暂无数据"}`
  );
  setText(
    refs.heroFirstToken,
    latestCall ? formatMilliseconds(latestCall.firstTokenMs) : "--"
  );
  refs.heroFirstTokenBadge.dataset.tooltip = latestCall
    ? `首字延迟：最近一次 API 调用从请求开始到收到首个模型输出事件的时间，为 ${formatMilliseconds(latestCall.firstTokenMs)}。`
    : "首字延迟：每次 API 调用从请求开始到收到首个模型输出事件的时间。";
  applyHeroStatus(
    refs.heroFirstTokenBadge,
    !latestCall?.firstTokenMs
      ? null
      : latestCall.firstTokenMs <= HERO_THRESHOLDS.firstToken.good
        ? "good"
        : latestCall.firstTokenMs <= HERO_THRESHOLDS.firstToken.warning
          ? "warning"
          : "danger"
  );
  refs.heroDurationBadge.setAttribute(
    "aria-label",
    `耗时 ${latestCall ? formatMilliseconds(latestCall.latencyMs) : "暂无数据"}`
  );
  setText(
    refs.heroTurnDuration,
    latestCall ? formatMilliseconds(latestCall.latencyMs) : "--"
  );
  refs.heroDurationBadge.dataset.tooltip = latestCall
    ? `耗时：最近一次 API 调用从请求开始到调用完成的耗时，为 ${formatMilliseconds(latestCall.latencyMs)}，不包含工具执行时间。`
    : "耗时：每次 API 调用从请求开始到完成的时间，不包含工具执行时间。";
  applyHeroStatus(
    refs.heroDurationBadge,
    !latestCall?.latencyMs
      ? null
      : latestCall.latencyMs <= HERO_THRESHOLDS.duration.good
        ? "good"
        : latestCall.latencyMs <= HERO_THRESHOLDS.duration.warning
          ? "warning"
          : "danger"
  );
  setText(
    refs.outputDetail,
    `推理 ${formatCompact(totals.reasoningTokens)} · 平均 ${formatCompact(
      conversation.averageOutputTokens
    )}/次`
  );

  setText(refs.cacheValue, Number(conversation.cacheHitRate).toFixed(1));
  setText(refs.cacheDetail, `已节省 ${formatCny(conversation.cacheSavedCny, 6)}`);
  setText(
    refs.cacheChip,
    conversation.cacheHitRate >= 80
      ? "命中优秀"
      : conversation.cacheHitRate >= 50
        ? "命中良好"
        : "可优化"
  );
  refs.cacheChip.classList.toggle("metric-chip-positive", conversation.cacheHitRate >= 50);
  refs.cacheChip.classList.toggle("metric-chip-warning", conversation.cacheHitRate < 50);
  refs.cacheMiniFill.style.width = `${Math.min(100, Math.max(1.5, conversation.cacheHitRate))}%`;

  const costSeries = data.calls.map((call) => call.costCny);
  const inputSeries = data.calls.map((call) => call.inputTokens);
  const outputSeries = data.calls.map((call) => call.outputTokens);
  renderSparkline(refs.spendSpark, costSeries, "--brand", "spark-spend");
  renderSparkline(refs.inputSpark, inputSeries, "--violet", "spark-input");
  renderSparkline(refs.outputSpark, outputSeries, "--amber", "spark-output");
}

function renderSparkline(svg, values, colorVariable, gradientId) {
  if (!svg) return;
  const series = values.length ? values.map((value) => Number(value) || 0) : [0, 0];
  const width = 78;
  const height = 34;
  const padding = 3;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = Math.max(max - min, 1);
  const step = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const points = series.map((value, index) => {
    const x = padding + index * step;
    const y = padding + (1 - (value - min) / range) * (height - padding * 2);
    return [x, y];
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width - padding} ${height - padding} L${padding} ${height - padding} Z`;
  const last = points.at(-1) || [0, 0];
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(${colorVariable})" stop-opacity=".22"></stop>
        <stop offset="100%" stop-color="var(${colorVariable})" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gradientId})"></path>
    <path d="${line}" fill="none" stroke="var(${colorVariable})" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" fill="var(${colorVariable})" stroke="var(--surface)" stroke-width="1.2"></circle>
  `;
}

function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

function renderTrendChart() {
  if (!state.data) return;
  const shell = refs.trendChart.parentElement;
  const width = Math.max(260, Math.floor(shell.clientWidth || 700));
  const height = Math.max(210, Math.floor(shell.clientHeight || 286));
  const margin = {
    top: 17,
    right: width < 520 ? 42 : 48,
    bottom: 31,
    left: width < 520 ? 44 : 52
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const calls = state.data.calls;

  if (!calls.length) {
    refs.trendChart.innerHTML = `
      <title id="trendChartTitle">本次对话 Token 用量趋势</title>
      <desc id="trendChartDesc">当前会话还没有可绘制的 Token 用量记录。</desc>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-label">暂无调用数据</text>
    `;
    return;
  }

  let inputValues;
  let outputValues;
  let inputRunning = 0;
  let outputRunning = 0;
  if (state.chartMode === "cumulative") {
    inputValues = calls.map((call) => {
      inputRunning += call.inputTokens;
      return inputRunning;
    });
    outputValues = calls.map((call) => {
      outputRunning += call.outputTokens;
      return outputRunning;
    });
  } else {
    inputValues = calls.map((call) => call.inputTokens);
    outputValues = calls.map((call) => call.outputTokens);
  }

  const leftMax = niceCeil(Math.max(...inputValues, 1) * 1.08);
  const rightMax = niceCeil(Math.max(...outputValues, 1) * 1.18);
  const count = calls.length;
  const xForIndex = (index) =>
    margin.left + (count === 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const yLeft = (value) => margin.top + (1 - value / leftMax) * plotHeight;
  const yRight = (value) => margin.top + (1 - value / rightMax) * plotHeight;

  const inputPoints = inputValues.map((value, index) => [xForIndex(index), yLeft(value)]);
  const outputPoints = outputValues.map((value, index) => [xForIndex(index), yRight(value)]);
  const pointsToPath = (points) =>
    points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");
  const inputPath = pointsToPath(inputPoints);
  const outputPath = pointsToPath(outputPoints);
  const areaPath = `${inputPath} L${inputPoints.at(-1)[0].toFixed(2)} ${margin.top + plotHeight} L${inputPoints[0][0].toFixed(2)} ${margin.top + plotHeight} Z`;

  const tickCount = 4;
  const gridMarkup = Array.from({ length: tickCount + 1 }, (_, index) => {
    const ratio = index / tickCount;
    const y = margin.top + ratio * plotHeight;
    const leftValue = leftMax * (1 - ratio);
    const rightValue = rightMax * (1 - ratio);
    return `
      <line class="chart-grid-line" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>
      <text class="chart-label" x="${margin.left - 8}" y="${(y + 3).toFixed(2)}" text-anchor="end">${formatCompact(leftValue)}</text>
      <text class="chart-label" x="${width - margin.right + 8}" y="${(y + 3).toFixed(2)}" text-anchor="start">${formatCompact(rightValue)}</text>
    `;
  }).join("");

  const xTickLimit = width < 480 ? 4 : width < 760 ? 5 : 6;
  const tickTotal = Math.min(xTickLimit, count);
  const indices = [];
  for (let index = 0; index < tickTotal; index += 1) {
    const value =
      tickTotal === 1 ? 0 : Math.round((index / (tickTotal - 1)) * (count - 1));
    if (!indices.includes(value)) indices.push(value);
  }
  const xMarkup = indices
    .map((index) => {
      const x = xForIndex(index);
      const anchor = index === 0 && count > 1 ? "start" : index === count - 1 && count > 1 ? "end" : "middle";
      return `<text class="chart-label" x="${x.toFixed(2)}" y="${height - 8}" text-anchor="${anchor}">${shortTimeFormatter.format(new Date(calls[index].time))}</text>`;
    })
    .join("");

  const dotIndexes =
    count <= 16
      ? calls.map((_, index) => index)
      : [0, Math.floor(count / 2), count - 1].filter((value, index, array) => array.indexOf(value) === index);
  const inputDots = dotIndexes
    .map(
      (index) =>
        `<circle class="chart-dot-input" cx="${inputPoints[index][0].toFixed(2)}" cy="${inputPoints[index][1].toFixed(2)}" r="3"></circle>`
    )
    .join("");
  const outputDots = dotIndexes
    .map(
      (index) =>
        `<circle class="chart-dot-output" cx="${outputPoints[index][0].toFixed(2)}" cy="${outputPoints[index][1].toFixed(2)}" r="2.8"></circle>`
    )
    .join("");
  const totalInput = inputValues.at(-1);
  const totalOutput = outputValues.at(-1);
  const description =
    state.chartMode === "cumulative"
      ? `累计输入 ${formatInt(totalInput)} Token，累计输出 ${formatInt(totalOutput)} Token。`
      : `最近 ${count} 次调用，当前输入 ${formatInt(totalInput)} Token，输出 ${formatInt(totalOutput)} Token。`;

  refs.trendChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  refs.trendChart.innerHTML = `
    <title id="trendChartTitle">本次对话 Token 用量趋势</title>
    <desc id="trendChartDesc">${escapeHtml(description)}</desc>
    <defs>
      <linearGradient id="inputAreaGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity=".18"></stop>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${gridMarkup}
    <line class="chart-axis-line" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}"></line>
    <path class="chart-input-area" d="${areaPath}"></path>
    <path class="chart-input-line" d="${inputPath}"></path>
    <path class="chart-output-line" d="${outputPath}"></path>
    ${inputDots}
    ${outputDots}
    <text class="chart-axis-title" x="${margin.left}" y="10">输入</text>
    <text class="chart-axis-title" x="${width - margin.right}" y="10" text-anchor="end">输出</text>
    ${xMarkup}
    <g id="trendHoverGroup" visibility="hidden" pointer-events="none">
      <line id="trendGuide" class="chart-guide" y1="${margin.top}" y2="${margin.top + plotHeight}" x1="0" x2="0"></line>
      <circle id="trendHoverInput" class="chart-dot-input" r="4.5"></circle>
      <circle id="trendHoverOutput" class="chart-dot-output" r="4"></circle>
    </g>
    <rect class="chart-hit" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
  `;

  state.chartGeometry = {
    width,
    height,
    plotWidth,
    plotLeft: margin.left,
    plotTop: margin.top,
    plotBottom: margin.top + plotHeight,
    inputPoints,
    outputPoints,
    calls,
    inputValues,
    outputValues,
    mode: state.chartMode
  };

  const hitArea = refs.trendChart.querySelector(".chart-hit");
  if (hitArea) {
    hitArea.addEventListener("pointermove", handleChartPointer);
    hitArea.addEventListener("pointerdown", handleChartPointer);
    hitArea.addEventListener("pointerleave", hideChartTooltip);
  }
}

function handleChartPointer(event) {
  const geometry = state.chartGeometry;
  if (!geometry) return;
  const rect = refs.trendChart.getBoundingClientRect();
  if (!rect.width) return;
  const svgX = ((event.clientX - rect.left) / rect.width) * geometry.width;
  const ratio = Math.max(0, Math.min(1, (svgX - geometry.plotLeft) / geometry.plotWidth));
  const index =
    geometry.calls.length === 1
      ? 0
      : Math.round(ratio * (geometry.calls.length - 1));
  const call = geometry.calls[index];
  const inputPoint = geometry.inputPoints[index];
  const outputPoint = geometry.outputPoints[index];
  const group = refs.trendChart.querySelector("#trendHoverGroup");
  const guide = refs.trendChart.querySelector("#trendGuide");
  const hoverInput = refs.trendChart.querySelector("#trendHoverInput");
  const hoverOutput = refs.trendChart.querySelector("#trendHoverOutput");
  if (!call || !group || !guide || !hoverInput || !hoverOutput) return;

  group.setAttribute("visibility", "visible");
  guide.setAttribute("x1", inputPoint[0]);
  guide.setAttribute("x2", inputPoint[0]);
  hoverInput.setAttribute("cx", inputPoint[0]);
  hoverInput.setAttribute("cy", inputPoint[1]);
  hoverOutput.setAttribute("cx", outputPoint[0]);
  hoverOutput.setAttribute("cy", outputPoint[1]);

  refs.trendTooltip.innerHTML = `
    <strong>${escapeHtml(clockFormatter.format(new Date(call.time)))} · 第 ${call.index} 次调用</strong>
    <div class="tooltip-row">
      <span><i class="tooltip-hit"></i>输入</span>
      <b>${formatInt(geometry.inputValues[index])}</b>
    </div>
    <div class="tooltip-row">
      <span><i class="tooltip-output"></i>输出</span>
      <b>${formatInt(geometry.outputValues[index])}</b>
    </div>
    <div class="tooltip-row">
      <span>本次费用</span>
      <b>${formatCny(call.costCny, 6)}</b>
    </div>
  `;
  refs.trendTooltip.hidden = false;
  const shellRect = refs.trendChart.parentElement.getBoundingClientRect();
  const pointerContentX = event.clientX - shellRect.left;
  const pointerContentY = event.clientY - shellRect.top;
  const tooltipWidth = 158;
  const left = Math.min(
    Math.max(8, pointerContentX + 14),
    Math.max(8, shellRect.width - tooltipWidth - 8)
  );
  const top = Math.min(
    Math.max(8, pointerContentY - 96),
    Math.max(8, shellRect.height - 100)
  );
  refs.trendTooltip.style.left = `${left}px`;
  refs.trendTooltip.style.top = `${top}px`;
}

function hideChartTooltip() {
  const group = refs.trendChart.querySelector("#trendHoverGroup");
  if (group) group.setAttribute("visibility", "hidden");
  refs.trendTooltip.hidden = true;
}

function renderContext() {
  const { context, calls } = state.data;
  setText(refs.heroContextPercent, formatPercent(context.rate));
  applyHeroStatus(
    refs.heroContextBadge,
    context.rate >= HERO_THRESHOLDS.context.danger
      ? "danger"
      : context.rate >= HERO_THRESHOLDS.context.warning
        ? "warning"
        : "good"
  );
  refs.heroContextBadge.dataset.tooltip = `上下文窗口：最近一次模型调用后已用 ${formatInt(
    context.tokens
  )} / ${formatInt(context.window)} tokens，剩余 ${formatInt(
    context.remaining
  )} tokens，占窗口 ${formatPercent(context.rate)}。`;
  refs.heroContextBadge.setAttribute(
    "aria-label",
    `上下文窗口已用 ${formatPercent(context.rate)}，剩余 ${formatInt(
      context.remaining
    )} tokens`
  );

  const circumference = 2 * Math.PI * 67;
  const total = Math.max(context.tokens, 1);
  const segments = [
    { element: refs.donutCached, value: context.cached },
    { element: refs.donutUncached, value: context.uncached },
    { element: refs.donutOutput, value: context.output }
  ];
  let offset = 0;
  segments.forEach(({ element, value }) => {
    const ratio = value / total;
    const rawLength = ratio * circumference;
    const length = rawLength > 5 ? rawLength - 1.6 : rawLength;
    element.setAttribute("stroke-dasharray", `${length} ${circumference - length}`);
    element.setAttribute("stroke-dashoffset", `${-offset}`);
    offset += rawLength;
  });

  setText(refs.donutValue, formatPercent(context.rate));
  setText(refs.donutTokens, `${formatCompact(context.tokens)} tokens`);
  setText(refs.contextCached, formatInt(context.cached));
  setText(refs.contextUncached, formatInt(context.uncached));
  setText(refs.contextOutput, formatInt(context.output));
  setText(refs.contextRemaining, formatInt(context.remaining));

  const deltas = calls
    .slice(1)
    .map((call, index) => call.contextTokens - calls[index].contextTokens)
    .filter((delta) => delta > 0);
  const averageDelta = deltas.length
    ? Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
    : 0;
  if (averageDelta > 0 && context.remaining > 0) {
    const estimatedTurns = Math.max(1, Math.floor(context.remaining / averageDelta));
    setText(
      refs.contextCallout,
      `按当前增长速度，距离 1M 窗口还可容纳约 ${formatInt(estimatedTurns)} 轮调用。`
    );
  } else {
    setText(
      refs.contextCallout,
      `距离上下文窗口上限还有 ${formatInt(context.remaining)} tokens。`
    );
  }
}

function renderCallRows(calls, compact = false) {
  if (!calls.length) {
    return `<tr class="table-placeholder"><td colspan="${compact ? 6 : 10}">暂无模型调用记录</td></tr>`;
  }

  if (compact) {
    return calls
      .map(
        (call) => `
          <tr>
            <td><span class="table-time">${escapeHtml(clockFormatter.format(new Date(call.time)))}</span></td>
            <td>
              <span class="table-token">${formatCompact(call.inputTokens)}</span>
              <span class="table-sub">${formatCompact(call.cachedInputTokens)} 缓存</span>
            </td>
            <td><span class="table-token">${formatCompact(call.outputTokens)}</span></td>
            <td>
              <div class="cache-cell">
                <span>${formatPercent(call.cacheHitRate)}</span>
                <span class="cache-meter"><span style="width:${Math.min(100, call.cacheHitRate)}%"></span></span>
              </div>
            </td>
            <td>${formatCny(call.costCny, 6)}</td>
            <td><span class="rate-badge ${call.rateKind === "peak" ? "peak" : ""}">${formatRate(call.rateKind)}</span></td>
          </tr>
        `
      )
      .join("");
  }

  return calls
    .map(
      (call) => `
        <tr>
          <td>${call.index}</td>
          <td><span class="table-time">${escapeHtml(dateTimeFormatter.format(new Date(call.time)))}</span></td>
          <td>${escapeHtml(state.data.model.label)}</td>
          <td><span class="table-token">${formatInt(call.inputTokens)}</span></td>
          <td>
            <span class="table-token">${formatInt(call.cachedInputTokens)}</span>
            <span class="table-sub">未命中 ${formatInt(call.uncachedInputTokens)}</span>
          </td>
          <td>
            <span class="table-token">${formatInt(call.outputTokens)}</span>
            <span class="table-sub">推理 ${formatInt(call.reasoningTokens)}</span>
          </td>
          <td><span class="table-token">${formatInt(call.contextTokens)}</span></td>
          <td>
            <div class="cache-cell">
              <span>${formatPercent(call.cacheHitRate)}</span>
              <span class="cache-meter"><span style="width:${Math.min(100, call.cacheHitRate)}%"></span></span>
            </div>
          </td>
          <td>${formatCny(call.costCny, 6)}</td>
          <td><span class="rate-badge ${call.rateKind === "peak" ? "peak" : ""}">${formatRate(call.rateKind)}</span></td>
        </tr>
      `
    )
    .join("");
}

function renderRecentRequests() {
  const recent = state.data.calls.slice(-6).reverse();
  refs.recentRows.innerHTML = renderCallRows(recent, true);
}

function renderCostBreakdown() {
  const { conversation, pricing } = state.data;
  setText(refs.costTotal, formatCny(conversation.costCny, 6));
  setText(refs.cacheSavings, formatCny(conversation.cacheSavedCny, 6));
  setText(
    refs.pricingModeChip,
    conversation.actualRateLabel ||
      (conversation.activeRateKind === "peak" ? "高峰计价" : "空闲计价")
  );

  const totalInputCost = conversation.cacheHitCostCny + conversation.cacheMissCostCny;
  const savingShare =
    totalInputCost + conversation.cacheSavedCny > 0
      ? (conversation.cacheSavedCny / (totalInputCost + conversation.cacheSavedCny)) * 100
      : 0;
  setText(
    refs.savingsContext,
    conversation.cacheSavedCny > 0
      ? `输入成本约减少 ${savingShare.toFixed(0)}%`
      : "等待缓存收益"
  );

  const costs = [
    {
      key: "hit",
      label: "缓存命中",
      value: conversation.cacheHitCostCny
    },
    {
      key: "miss",
      label: "缓存未命中",
      value: conversation.cacheMissCostCny
    },
    {
      key: "output",
      label: "输出 Token",
      value: conversation.outputCostCny
    }
  ];
  const maxValue = Math.max(...costs.map((item) => item.value), 0.000001);
  refs.costBars.innerHTML = costs
    .map(
      (item) => `
        <div class="cost-row">
          <span class="cost-label"><i class="${item.key}"></i>${item.label}</span>
          <span class="cost-track"><span class="${item.key}" style="width:${Math.max(1.5, (item.value / maxValue) * 100)}%"></span></span>
          <span class="cost-value">${formatCny(item.value, 6)}</span>
        </div>
      `
    )
    .join("");

  const rates = pricing.current || {};
  setText(
    refs.priceFootnote,
    `未命中输入 ¥${formatPrice(rates.cacheMiss)}/M · 输出 ¥${formatPrice(rates.output)}/M · ${
      conversation.activeRateKind === "peak" ? "高峰时段" : "空闲时段"
    }`
  );
}

function renderRequestsView() {
  if (!state.data) return;
  const filtered = state.data.calls.filter(
    (call) => state.requestFilter === "all" || call.rateKind === state.requestFilter
  );
  setText(
    refs.requestSummary,
    `${filtered.length} 次模型调用 · 共 ${formatInt(
      filtered.reduce((sum, call) => sum + call.inputTokens, 0)
    )} 输入 tokens`
  );
  refs.requestRows.innerHTML = renderCallRows(filtered.slice().reverse(), false);
}

function renderPricingView() {
  const { data } = state;
  if (!data) return;
  const balance = data.balance || {};
  const connected = Boolean(balance.ok);
  refs.connectionBadge.classList.toggle("is-connected", connected);
  refs.connectionBadge.classList.toggle("is-error", !connected && Boolean(balance.source));
  refs.connectionBadge.innerHTML = `<i></i>${
    connected ? "余额已连接" : balance.source ? "连接异常" : "尚未连接"
  }`;

  refs.connectionSummary.classList.toggle("is-connected", connected);
  refs.connectionSummary.classList.toggle("is-error", !connected && Boolean(balance.source));
  const summaryTitle = refs.connectionSummary.querySelector("strong");
  const summaryText = refs.connectionSummary.querySelector("p");
  if (connected) {
    summaryTitle.textContent = "DeepSeek 余额接口连接正常";
    summaryText.textContent = `当前余额 ${currencySymbol(balance.currency)}${formatMoneyValue(balance.total, 2)} · 数据来源：${balance.source}`;
    setText(refs.keySourceText, `凭证来源：${balance.source}，不会发送到浏览器。`);
  } else if (balance.source) {
    summaryTitle.textContent = "已找到凭证，但余额查询失败";
    summaryText.textContent = balance.error || "请检查 API Key 或网络连接。";
    setText(refs.keySourceText, `凭证来源：${balance.source}。`);
  } else {
    summaryTitle.textContent = "尚未连接余额接口";
    summaryText.textContent = "可在下方输入 API Key，或设置环境变量 DEEPSEEK_API_KEY。";
    setText(refs.keySourceText, "未检测到本机 DeepSeek 凭证。");
  }

  const catalog = data.catalog || {};
  refs.priceCards.innerHTML = Object.entries(catalog)
    .map(([modelKey, model]) => {
      const isCurrent = modelKey === data.model.canonical;
      return `
        <article class="price-card ${isCurrent ? "is-current" : ""}">
          <div class="price-card-head">
            <div class="price-model">
              <span class="price-model-mark">${modelKey.includes("pro") ? "P" : "F"}</span>
              <div>
                <strong>${escapeHtml(model.label)}</strong>
                <span>${escapeHtml(model.version)}</span>
              </div>
            </div>
            ${isCurrent ? '<span class="current-tag">当前模型</span>' : ""}
          </div>
          <table class="price-table">
            <thead>
              <tr>
                <th>人民币 / 百万 tokens</th>
                <th>空闲价</th>
                <th>高峰价</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>输入 · 缓存命中</td>
                <td>¥${formatPrice(model.offPeak.cacheHit)}</td>
                <td>¥${formatPrice(model.peak.cacheHit)}</td>
              </tr>
              <tr>
                <td>输入 · 缓存未命中</td>
                <td>¥${formatPrice(model.offPeak.cacheMiss)}</td>
                <td>¥${formatPrice(model.peak.cacheMiss)}</td>
              </tr>
              <tr>
                <td><strong>输出 Token</strong></td>
                <td><strong>¥${formatPrice(model.offPeak.output)}</strong></td>
                <td><strong>¥${formatPrice(model.peak.output)}</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="price-context">
            <span>上下文 ${formatCompact(model.contextWindow)}</span>
            <span>最大输出 ${formatCompact(model.maxOutput)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function connectLiveEvents() {
  if (!state.data || typeof EventSource === "undefined") return;
  const sessionId = state.data.session.id;
  if (
    state.eventSource &&
    state.eventSourceSessionId === sessionId &&
    state.eventSource.readyState !== EventSource.CLOSED
  ) {
    return;
  }

  if (state.eventSource) state.eventSource.close();
  clearTimeout(state.eventRefreshTimer);
  const eventQuery = followLatestSession
    ? "follow=1"
    : `sessionId=${encodeURIComponent(sessionId)}`;
  const source = new EventSource(`/api/events?${eventQuery}`);
  state.eventSource = source;
  state.eventSourceSessionId = sessionId;

  source.addEventListener("token_usage", () => scheduleUsageRefresh());
  source.addEventListener("active_session_changed", () => scheduleUsageRefresh());
  source.addEventListener("task_complete", (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      state.pendingCelebrationTurnId = payload.turnId || null;
    } catch {
      state.pendingCelebrationTurnId = null;
    }
    scheduleUsageRefresh({ celebrate: true });
  });
}

function scheduleUsageRefresh({ celebrate = false } = {}) {
  if (celebrate) state.pendingCelebration = true;
  clearTimeout(state.eventRefreshTimer);
  state.eventRefreshTimer = setTimeout(() => {
    if (state.loading) {
      state.pendingUsageRefresh = true;
      return;
    }
    loadDashboard({
      fresh: true,
      silent: true
    });
  }, celebrate ? 800 : 180);
}

function drawCelebrationComet(context, x, y, centerX, centerY, color) {
  const dx = centerX - x;
  const dy = centerY - y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / distance;
  const unitY = dy / distance;
  const tailLength = Math.min(230, Math.max(110, distance * 0.34));
  const tailX = x - unitX * tailLength;
  const tailY = y - unitY * tailLength;
  const trail = context.createLinearGradient(x, y, tailX, tailY);
  trail.addColorStop(0, "rgba(255,255,255,.95)");
  trail.addColorStop(0.16, color);
  trail.addColorStop(0.62, color.replace("1)", ".26)"));
  trail.addColorStop(1, color.replace("1)", "0)"));

  context.save();
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = trail;
  context.lineWidth = 2.1;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(tailX, tailY);
  context.stroke();

  const glow = context.createRadialGradient(x, y, 0, x, y, 25);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.16, "rgba(255,255,255,.9)");
  glow.addColorStop(0.38, color);
  glow.addColorStop(1, color.replace("1)", "0)"));
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, 25, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,.82)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x - 14, y);
  context.lineTo(x + 14, y);
  context.moveTo(x, y - 14);
  context.lineTo(x, y + 14);
  context.stroke();
  context.restore();
}

function startCelebrationCanvas() {
  const canvas = refs.celebrationCanvas;
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return { stop() {} };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let stars = [];
  let particles = [];
  let frame = null;
  let startedAt = performance.now();
  let collided = false;
  let active = true;

  const buildStars = () => {
    const count = Math.max(90, Math.min(240, Math.round((width * height) / 7200)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.25 + Math.random() * 1.35,
      alpha: 0.18 + Math.random() * 0.72,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 1.4,
      driftX: 1 + Math.random() * 5,
      driftY: 0.3 + Math.random() * 1.7,
      tint:
        Math.random() > 0.8
          ? "rgba(247,214,255,1)"
          : Math.random() > 0.55
            ? "rgba(208,224,255,1)"
            : "rgba(255,255,255,1)"
    }));
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  };

  const drawAmbientStars = (now) => {
    context.globalCompositeOperation = "lighter";
    const elapsed = (now - startedAt) / 1000;
    for (const star of stars) {
      const x = (star.x + star.driftX * elapsed) % (width + 6);
      const y = (star.y + star.driftY * elapsed) % (height + 6);
      const alpha =
        star.alpha * (0.64 + 0.36 * Math.sin(now * 0.001 * star.speed + star.phase));
      context.globalAlpha = alpha;
      context.fillStyle = star.tint;
      context.beginPath();
      context.arc(x, y, star.radius, 0, Math.PI * 2);
      context.fill();
      if (star.radius > 1.2) {
        context.globalAlpha = alpha * 0.1;
        context.beginPath();
        context.arc(x, y, star.radius * 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
  };

  const spawnBurst = () => {
    const centerX = width / 2;
    const centerY = height / 2;
    particles = Array.from({ length: 110 }, (_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 330;
      return {
        x: centerX + (Math.random() - 0.5) * 12,
        y: centerY + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.65 + Math.random() * 1.05,
        age: 0,
        radius: 0.5 + Math.random() * 1.8,
        tint:
          index % 5 === 0
            ? "rgba(255,228,166,1)"
            : index % 3 === 0
              ? "rgba(255,165,245,1)"
              : "rgba(207,225,255,1)"
      };
    });
  };

  const drawParticles = (delta) => {
    context.globalCompositeOperation = "lighter";
    particles = particles.filter((particle) => {
      particle.age += delta;
      if (particle.age >= particle.life) return false;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 18 * delta;
      particle.vx *= 0.992;
      const opacity = Math.max(0, 1 - particle.age / particle.life);
      context.globalAlpha = opacity;
      context.fillStyle = particle.tint;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
      if (particle.radius > 1.5) {
        context.globalAlpha = opacity * 0.12;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * 5, 0, Math.PI * 2);
        context.fill();
      }
      return true;
    });
    context.globalAlpha = 1;
  };

  const frameLoop = (now) => {
    if (!active) return;
    const elapsed = (now - startedAt) / 1000;
    const delta = Math.min(0.04, 1 / 60);
    context.clearRect(0, 0, width, height);
    drawAmbientStars(now);

    if (!reducedMotion) {
      if (elapsed < 1.22) {
        const progress = Math.max(0, Math.min(1, elapsed / 1.22));
        const eased = progress * progress * (3 - 2 * progress);
        const centerX = width / 2;
        const centerY = height / 2;
        const pinkX = -width * 0.12 + (centerX + width * 0.12) * eased;
        const pinkY = height * 0.68 + (centerY - height * 0.68) * eased;
        const blueX = width * 1.12 + (centerX - width * 1.12) * eased;
        const blueY = height * 0.31 + (centerY - height * 0.31) * eased;
        drawCelebrationComet(
          context,
          pinkX,
          pinkY,
          centerX,
          centerY,
          "rgba(255,157,249,1)"
        );
        drawCelebrationComet(
          context,
          blueX,
          blueY,
          centerX,
          centerY,
          "rgba(132,183,255,1)"
        );
      } else if (!collided) {
        collided = true;
        spawnBurst();
      }
      drawParticles(delta);
    }

    context.globalCompositeOperation = "source-over";
    frame = requestAnimationFrame(frameLoop);
  };

  resize();
  window.addEventListener("resize", resize);
  frame = requestAnimationFrame(frameLoop);

  return {
    stop() {
      active = false;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      context.clearRect(0, 0, width, height);
    }
  };
}

function showSessionCelebration() {
  if (!state.data) return;
  clearTimeout(state.celebrationCloseTimer);
  clearTimeout(state.celebrationAutoCloseTimer);
  if (state.celebrationOpen) {
    closeSessionCelebration({ immediate: true, restoreFocus: false });
  }
  state.lastFocusedElement = document.activeElement;

  const turns = state.data.turns || [];
  const requestedTurn = state.pendingCelebrationTurnId
    ? turns.find((turn) => turn.id === state.pendingCelebrationTurnId)
    : null;
  const turn =
    requestedTurn ||
    turns
      .slice()
      .reverse()
      .find((item) => item.completed) ||
    turns.at(-1) ||
    null;
  const turnTokens = turn
    ? turn.totalTokens || turn.inputTokens + turn.outputTokens
    : state.data.totals.inputTokens + state.data.totals.outputTokens;
  const model = turn?.model || state.data.model.name;
  const calls = turn?.calls || state.data.session.callCount;
  const durationSeconds = turn?.durationSeconds || state.data.session.durationSeconds;
  const cost = turn?.costCny ?? state.data.conversation.costCny;
  const cacheHitRate = turn?.cacheHitRate ?? state.data.conversation.cacheHitRate;
  const inputTokens = turn?.inputTokens ?? state.data.totals.inputTokens;
  const outputTokens = turn?.outputTokens ?? state.data.totals.outputTokens;
  const turnSpeed = turn?.tokensPerSecond ?? null;
  state.pendingCelebrationTurnId = null;

  setText(refs.completionTokens, "0");
  setText(
    refs.completionBreakdown,
    `输入 ${formatInt(inputTokens)} · 输出 ${formatInt(outputTokens)} · 缓存命中 ${formatPercent(cacheHitRate)}`
  );
  setText(refs.completionModel, model);
  setText(
    refs.completionCalls,
    `${turn ? `第 ${turn.index} 次提问 · ` : ""}${formatInt(calls)} 次模型调用 · ${formatDuration(durationSeconds)}`
  );
  setText(refs.completionCost, `本次费用 ${formatCny(cost, 6)}`);

  refs.sessionCelebration.hidden = false;
  refs.sessionCelebration.classList.remove("is-visible", "is-revealed", "is-colliding");
  refs.appShell.inert = true;
  document.body.classList.add("celebration-open");
  state.celebrationOpen = true;
  state.celebrationController?.stop();
  state.celebrationController = startCelebrationCanvas();
  void refs.sessionCelebration.offsetWidth;
  refs.sessionCelebration.classList.add("is-visible");
  requestAnimationFrame(() => refs.completionClose.focus({ preventScroll: true }));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    refs.sessionCelebration.classList.add("is-revealed");
    setText(refs.completionTokens, formatInt(turnTokens));
  } else {
    setTimeout(() => {
      if (!state.celebrationOpen) return;
      refs.sessionCelebration.classList.add("is-colliding");
    }, 1180);
    setTimeout(() => {
      if (!state.celebrationOpen) return;
      refs.sessionCelebration.classList.add("is-revealed");
      animateNumber(
        refs.completionTokens,
        0,
        turnTokens,
        (value) => formatInt(value),
        1050
      );
    }, 1450);
  }

  state.celebrationAutoCloseTimer = setTimeout(() => {
    if (state.celebrationOpen) {
      closeSessionCelebration({ restoreFocus: false });
    }
  }, 12_000);
}

function closeSessionCelebration({ immediate = false, restoreFocus = true } = {}) {
  if (!state.celebrationOpen) return;
  state.celebrationOpen = false;
  clearTimeout(state.celebrationAutoCloseTimer);
  state.celebrationController?.stop();
  state.celebrationController = null;
  refs.sessionCelebration.classList.remove("is-visible", "is-revealed", "is-colliding");
  refs.appShell.inert = false;
  document.body.classList.remove("celebration-open");

  const finish = () => {
    refs.sessionCelebration.hidden = true;
    if (restoreFocus) {
      state.lastFocusedElement?.focus?.({ preventScroll: true });
    }
  };

  clearTimeout(state.celebrationCloseTimer);
  if (immediate) finish();
  else state.celebrationCloseTimer = setTimeout(finish, 380);
}

function clearHeroCompletionTimers() {
  state.heroCompletionTimers.forEach((timer) => clearTimeout(timer));
  state.heroCompletionTimers = [];
  clearTimeout(state.heroCompletionRestoreTimer);
  state.heroCompletionRestoreTimer = null;
}

function restoreHeroDailyView() {
  clearHeroCompletionTimers();
  refs.dailyHero.classList.remove("is-colliding", "is-collision-running", "is-celebrating");
  refs.heroCompletionView.setAttribute("aria-hidden", "true");
  refs.heroDailyView?.setAttribute("aria-hidden", "false");
  state.heroCompletionOpen = false;
}

function previewQuestionCompletion() {
  if (!state.data) return;
  if (state.view !== "overview") {
    switchView("overview");
  }
  setTimeout(playQuestionCompletion, 260);
}

function maybeShowPendingCelebration() {
  if (
    !state.pendingCelebration ||
    !state.data ||
    state.view !== "overview" ||
    state.widgetCollapsed
  ) {
    return;
  }
  if (document.visibilityState !== "visible") return;

  const targetTurnId = state.pendingCelebrationTurnId;
  if (
    targetTurnId &&
    Array.isArray(state.data.turns) &&
    !state.data.turns.some((turn) => turn.id === targetTurnId)
  ) {
    setTimeout(() => {
      if (state.pendingCelebration) {
        loadDashboard({ fresh: true, silent: true });
      }
    }, 350);
    return;
  }

  state.pendingCelebration = false;
  playQuestionCompletion();
}

function handleCompletionAttention() {
  maybeShowPendingCelebration();
  if (!state.heroCompletionOpen) return;
  if (state.completionPlayedUnfocused && document.hasFocus()) {
    state.completionPlayedUnfocused = false;
    playQuestionCompletion();
  } else {
    armHeroCompletionRestore();
  }
}

function armHeroCompletionRestore(delay = HERO_COMPLETION_RETURN_MS) {
  clearTimeout(state.heroCompletionRestoreTimer);
  state.heroCompletionRestoreTimer = null;
  if (!state.heroCompletionOpen) return;
  if (document.visibilityState !== "visible") return;
  state.heroCompletionRestoreTimer = setTimeout(restoreHeroDailyView, delay);
}

function playQuestionCompletion() {
  if (!state.data) return;
  if (state.widgetCollapsed) {
    state.pendingCelebration = true;
    return;
  }
  hideHeroTooltip();
  clearHeroCompletionTimers();
  refs.dailyHero.classList.remove("is-colliding", "is-collision-running", "is-celebrating");
  refs.heroDailyView?.setAttribute("aria-hidden", "false");

  const turns = state.data.turns || [];
  const requestedTurn = state.pendingCelebrationTurnId
    ? turns.find((turn) => turn.id === state.pendingCelebrationTurnId)
    : null;
  const turn =
    requestedTurn ||
    turns
      .slice()
      .reverse()
      .find((item) => item.completed) ||
    turns.at(-1) ||
    null;
  const turnTokens = turn
    ? turn.totalTokens || turn.inputTokens + turn.outputTokens
    : state.data.totals.inputTokens + state.data.totals.outputTokens;
  const model = turn?.model || state.data.model.name;
  const calls = turn?.calls || state.data.session.callCount;
  const durationSeconds = turn?.durationSeconds || state.data.session.durationSeconds;
  const cost = turn?.costCny ?? state.data.conversation.costCny;
  const cacheHitRate = turn?.cacheHitRate ?? state.data.conversation.cacheHitRate;
  const inputTokens = turn?.inputTokens ?? state.data.totals.inputTokens;
  const outputTokens = turn?.outputTokens ?? state.data.totals.outputTokens;
  const turnSpeed = turn?.tokensPerSecond ?? null;
  state.pendingCelebrationTurnId = null;

  setText(refs.heroCompletionQuestion, turn ? `第 ${turn.index} 次提问` : "本次提问");
  setText(refs.heroCompletionTokens, "0");
  setText(
    refs.heroCompletionMeta,
    `${model} · ${formatInt(calls)} 次调用 · ${formatDuration(durationSeconds)}${
      turnSpeed ? ` · ${formatSpeed(turnSpeed)} tok/s` : ""
    }`
  );
  setText(refs.heroCompletionInput, formatInt(inputTokens));
  setText(refs.heroCompletionOutput, formatInt(outputTokens));
  setText(refs.heroCompletionCache, formatPercent(cacheHitRate));
  setText(refs.heroCompletionCost, formatCny(cost, 6));
  refs.heroCompletionView.setAttribute("aria-hidden", "true");
  state.heroCompletionOpen = true;
  state.completionPlayedUnfocused =
    typeof document.hasFocus === "function" && !document.hasFocus();

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    refs.dailyHero.classList.add("is-celebrating");
    refs.heroCompletionView.setAttribute("aria-hidden", "false");
    refs.heroDailyView?.setAttribute("aria-hidden", "true");
    setText(refs.heroCompletionTokens, formatInt(turnTokens));
    armHeroCompletionRestore(HERO_COMPLETION_REDUCED_MOTION_RETURN_MS);
    return;
  }

  void refs.dailyHero.offsetWidth;
  refs.dailyHero.classList.add("is-collision-running");
  state.starfield?.collide?.();
  const collisionTimer = setTimeout(() => {
    if (!state.heroCompletionOpen) return;
    refs.dailyHero.classList.add("is-colliding");
  }, 1080);
  const revealTimer = setTimeout(() => {
    if (!state.heroCompletionOpen) return;
    refs.dailyHero.classList.add("is-celebrating");
    refs.heroCompletionView.setAttribute("aria-hidden", "false");
    refs.heroDailyView?.setAttribute("aria-hidden", "true");
    animateNumber(
      refs.heroCompletionTokens,
      0,
      turnTokens,
      (value) => formatInt(value),
      1050
    );
  }, 1260);
  state.heroCompletionTimers = [collisionTimer, revealTimer];
  armHeroCompletionRestore(HERO_COMPLETION_RETURN_MS);
}

function updateDailyClock() {
  setText(refs.dailyClock, clockFormatter.format(new Date()));
}

function initStarfield() {
  const canvas = refs.starfield;
  const host = refs.dailyHero;
  if (!canvas || !host) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let stars = [];
  let shootingStars = [];
  let frame = null;
  let lastFrame = 0;
  let visible = true;
  let nextShootingAt = performance.now() + 900 + Math.random() * 1800;
  let heroCollision = null;
  let tokenRefreshImpact = null;

  const buildStars = () => {
    stars = [];
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
    drawStatic();
  };

  const drawStatic = () => {
    context.clearRect(0, 0, width, height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  };

  const drawShootingStar = (star) => {
    const progress = Math.min(1, star.life / star.maxLife);
    const fadeIn = Math.min(1, progress / 0.14);
    const fadeOut = 1 - Math.max(0, (progress - 0.52) / 0.48);
    const fade = fadeIn * fadeOut;
    if (fade <= 0.005) return;
    const distance = Math.max(1, Math.hypot(star.vx, star.vy));
    const unitX = star.vx / distance;
    const unitY = star.vy / distance;
    const tailLength = star.tailLength * (0.9 + Math.sin(progress * Math.PI) * 0.1);
    const tailX = star.x - unitX * tailLength;
    const tailY = star.y - unitY * tailLength;
    const gradient = context.createLinearGradient(star.x, star.y, tailX, tailY);
    gradient.addColorStop(0, `rgba(255,255,255,${0.96 * fade})`);
    gradient.addColorStop(0.08, `rgba(240,248,255,${0.76 * fade})`);
    gradient.addColorStop(0.28, `rgba(${star.tint},${0.52 * fade})`);
    gradient.addColorStop(0.62, `rgba(${star.tint},${0.16 * fade})`);
    gradient.addColorStop(1, `rgba(${star.tint},0)`);

    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.strokeStyle = `rgba(${star.tint},${0.08 * fade})`;
    context.lineWidth = star.width * 4.8;
    context.beginPath();
    context.moveTo(star.x, star.y);
    context.lineTo(tailX, tailY);
    context.stroke();

    context.strokeStyle = gradient;
    context.lineWidth = star.width * 1.55;
    context.beginPath();
    context.moveTo(star.x, star.y);
    context.lineTo(tailX, tailY);
    context.stroke();

    context.strokeStyle = `rgba(255,255,255,${0.62 * fade})`;
    context.lineWidth = Math.max(0.55, star.width * 0.5);
    context.beginPath();
    context.moveTo(star.x, star.y);
    context.lineTo(
      star.x - unitX * Math.min(tailLength, 36),
      star.y - unitY * Math.min(tailLength, 36)
    );
    context.stroke();

    const glowRadius = 7 + star.width * 5;
    const glow = context.createRadialGradient(
      star.x,
      star.y,
      0,
      star.x,
      star.y,
      glowRadius
    );
    glow.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
    glow.addColorStop(0.24, `rgba(225,241,255,${0.46 * fade})`);
    glow.addColorStop(0.62, `rgba(${star.tint},${0.12 * fade})`);
    glow.addColorStop(1, `rgba(${star.tint},0)`);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawHeroCollisionMeteor = (x, y, centerX, centerY, color) => {
    const dx = centerX - x;
    const dy = centerY - y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const unitX = dx / distance;
    const unitY = dy / distance;
    const tailLength = Math.min(width * 0.48, 240);
    const tailX = x - unitX * tailLength;
    const tailY = y - unitY * tailLength;
    const gradient = context.createLinearGradient(x, y, tailX, tailY);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.1, `rgba(${color},0.9)`);
    gradient.addColorStop(0.42, `rgba(${color},0.34)`);
    gradient.addColorStop(0.78, `rgba(${color},0.08)`);
    gradient.addColorStop(1, `rgba(${color},0)`);

    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.strokeStyle = `rgba(${color},0.1)`;
    context.lineWidth = 14;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(tailX, tailY);
    context.stroke();

    context.strokeStyle = gradient;
    context.lineWidth = 3.2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(tailX, tailY);
    context.stroke();

    context.strokeStyle = "rgba(255,255,255,0.8)";
    context.lineWidth = 0.85;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - unitX * Math.min(tailLength, 74), y - unitY * Math.min(tailLength, 74));
    context.stroke();

    const glow = context.createRadialGradient(x, y, 0, x, y, 30);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.12, "rgba(242,249,255,0.78)");
    glow.addColorStop(0.34, `rgba(${color},0.25)`);
    glow.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, 30, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const spawnHeroCollisionBurst = () => {
    const centerX = width / 2;
    const centerY = height * 0.43;
    heroCollision.particles = Array.from({ length: 62 }, (_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 34 + Math.random() * 155;
      return {
        x: centerX + (Math.random() - 0.5) * 7,
        y: centerY + (Math.random() - 0.5) * 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.7 + Math.random() * 1.15,
        age: 0,
        radius: 0.45 + Math.random() * 1.35,
        streak: index % 3 !== 0,
        tint:
          index % 9 === 0
            ? "rgba(255,236,196,1)"
            : index % 4 === 0
              ? "rgba(196,224,255,1)"
              : index % 3 === 0
                ? "rgba(221,206,255,1)"
                : "rgba(236,247,255,1)"
      };
    });
    heroCollision.burst = true;
  };

  const drawHeroCollision = (now, delta) => {
    if (!heroCollision) return;
    const elapsed = (now - heroCollision.startedAt) / 1000;
    const centerX = width / 2;
    const centerY = height * 0.43;
    if (elapsed < 1.08) {
      const progress = Math.max(0, Math.min(1, elapsed / 1.08));
      const eased = progress * progress * (3 - 2 * progress);
      const leftX = -width * 0.12 + (centerX + width * 0.12) * eased;
      const leftY = height * 0.78 + (centerY - height * 0.78) * eased;
      const rightX = width * 1.12 + (centerX - width * 1.12) * eased;
      const rightY = height * 0.16 + (centerY - height * 0.16) * eased;
      drawHeroCollisionMeteor(
        leftX,
        leftY,
        centerX,
        centerY,
        "139,190,255"
      );
      drawHeroCollisionMeteor(
        rightX,
        rightY,
        centerX,
        centerY,
        "205,174,255"
      );
      return;
    }

    if (!heroCollision.burst) spawnHeroCollisionBurst();
    const burstAge = elapsed - 1.08;
    const flash = Math.max(0, 1 - burstAge / 0.56);
    if (flash > 0) {
      const flashGlow = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        88
      );
      flashGlow.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
      flashGlow.addColorStop(0.18, `rgba(222,240,255,${0.42 * flash})`);
      flashGlow.addColorStop(0.52, `rgba(122,174,255,${0.12 * flash})`);
      flashGlow.addColorStop(1, "rgba(122,174,255,0)");
      context.fillStyle = flashGlow;
      context.beginPath();
      context.arc(centerX, centerY, 88, 0, Math.PI * 2);
      context.fill();
    }

    const ringProgress = Math.min(1, burstAge / 0.82);
    if (ringProgress > 0 && ringProgress < 1) {
      const ringEase = 1 - (1 - ringProgress) ** 3;
      context.strokeStyle = `rgba(214,234,255,${0.34 * (1 - ringProgress) ** 1.6})`;
      context.lineWidth = 2.2 - ringProgress * 1.4;
      context.beginPath();
      context.arc(centerX, centerY, 18 + ringEase * 128, 0, Math.PI * 2);
      context.stroke();
    }

    context.globalCompositeOperation = "lighter";
    heroCollision.particles = heroCollision.particles.filter((particle) => {
      particle.age += delta;
      if (particle.age >= particle.life) return false;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 10 * delta;
      particle.vx *= 0.988;
      const opacity = Math.max(0, 1 - particle.age / particle.life);
      context.globalAlpha = opacity;
      context.fillStyle = particle.tint;
      context.strokeStyle = particle.tint;
      if (particle.streak) {
        context.lineWidth = particle.radius * 0.8;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.vx * 0.026, particle.y - particle.vy * 0.026);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      return true;
    });
    context.globalAlpha = 1;
    if (elapsed > 3.1) heroCollision = null;
  };

  const drawTokenRefreshImpact = (now, delta) => {
    if (!tokenRefreshImpact) return;
    const impact = tokenRefreshImpact;
    const elapsed = (now - impact.startedAt) / 1000;
    if (!impact.hit) {
      const progress = Math.min(1, elapsed / 0.62);
      const eased = progress * progress;
      const startX = impact.targetX + width * 0.28;
      const startY = -height * 0.16;
      const x = startX + (impact.targetX - startX) * eased;
      const y = startY + (impact.targetY - startY) * eased;
      drawHeroCollisionMeteor(
        x,
        y,
        impact.targetX,
        impact.targetY,
        "184,219,255"
      );

      if (progress >= 1) {
        impact.hit = true;
        impact.hitAt = now;
        impact.particles = Array.from({ length: 58 }, (_, index) => {
          const angle = Math.random() * Math.PI * 2;
          const speed = 58 + Math.random() * 230;
          return {
            x: impact.targetX + (Math.random() - 0.5) * 7,
            y: impact.targetY + (Math.random() - 0.5) * 7,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 18,
            life: 0.5 + Math.random() * 1.05,
            age: 0,
            radius: 0.5 + Math.random() * 1.35,
            streak: index % 3 !== 0,
            tint:
              index % 8 === 0
                ? "rgba(255,238,195,1)"
                : index % 4 === 0
                  ? "rgba(197,224,255,1)"
                  : "rgba(239,248,255,1)"
          };
        });
        if (impact.onHit) {
          const callback = impact.onHit;
          impact.onHit = null;
          setTimeout(callback, 90);
        }
      }
      return;
    }

    const burstElapsed = (now - impact.hitAt) / 1000;
    const flash = Math.max(0, 1 - burstElapsed / 0.5);
    if (flash > 0) {
      const glow = context.createRadialGradient(
        impact.targetX,
        impact.targetY,
        0,
        impact.targetX,
        impact.targetY,
        86
      );
      glow.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
      glow.addColorStop(0.18, `rgba(223,240,255,${0.42 * flash})`);
      glow.addColorStop(0.52, `rgba(123,177,255,${0.12 * flash})`);
      glow.addColorStop(1, "rgba(123,177,255,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(impact.targetX, impact.targetY, 86, 0, Math.PI * 2);
      context.fill();
    }

    const ringProgress = Math.min(1, burstElapsed / 0.78);
    if (ringProgress > 0 && ringProgress < 1) {
      const ringEase = 1 - (1 - ringProgress) ** 3;
      context.strokeStyle = `rgba(221,238,255,${0.36 * (1 - ringProgress) ** 1.6})`;
      context.lineWidth = 2.1 - ringProgress * 1.3;
      context.beginPath();
      context.arc(
        impact.targetX,
        impact.targetY,
        14 + ringEase * 112,
        0,
        Math.PI * 2
      );
      context.stroke();
    }

    context.globalCompositeOperation = "lighter";
    impact.particles = impact.particles.filter((particle) => {
      particle.age += delta;
      if (particle.age >= particle.life) return false;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 16 * delta;
      particle.vx *= 0.988;
      const opacity = Math.max(0, 1 - particle.age / particle.life);
      context.globalAlpha = opacity;
      context.fillStyle = particle.tint;
      context.strokeStyle = particle.tint;
      if (particle.streak) {
        context.lineWidth = particle.radius * 0.9;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(
          particle.x - particle.vx * 0.025,
          particle.y - particle.vy * 0.025
        );
        context.stroke();
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      return true;
    });
    context.globalAlpha = 1;

    if (elapsed > 1.7) {
      tokenRefreshImpact = null;
      refs.dailyHero.classList.remove("is-token-refreshing");
    }
  };

  const animate = (now) => {
    if (!visible || document.visibilityState === "hidden") {
      frame = null;
      return;
    }
    const delta = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";

    drawTokenRefreshImpact(now, delta);
    drawHeroCollision(now, delta);

    if (now > nextShootingAt) {
      const meteorCount = Math.random() > 0.82 ? 2 : 1;
      for (let index = 0; index < meteorCount; index += 1) {
        const angle = ((101 + Math.random() * 13) * Math.PI) / 180;
        const speed = 300 + Math.random() * 260;
        shootingStars.push({
          x: width * (0.58 + Math.random() * 0.6),
          y: height * (-0.08 + Math.random() * 0.28),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 1.45 + Math.random() * 0.6,
          tailLength: 120 + Math.random() * 120,
          width: 0.8 + Math.random() * 0.6,
          tint:
            Math.random() > 0.66
              ? "211,226,255"
              : Math.random() > 0.5
                ? "185,215,255"
                : "236,245,255"
        });
      }
      nextShootingAt = now + 2200 + Math.random() * 4200;
    }

    shootingStars = shootingStars.filter((star) => {
      star.x += star.vx * delta;
      star.y += star.vy * delta;
      star.life += delta;
      drawShootingStar(star);
      return star.life < star.maxLife;
    });

    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    frame = requestAnimationFrame(animate);
  };

  const start = () => {
    if (frame || reducedMotion.matches) {
      if (reducedMotion.matches) drawStatic();
      return;
    }
    lastFrame = 0;
    frame = requestAnimationFrame(animate);
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    },
    { threshold: 0.05 }
  );
  visibilityObserver.observe(host);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && visible) start();
    else stop();
  });
  reducedMotion.addEventListener?.("change", () => {
    stop();
    if (reducedMotion.matches) drawStatic();
    else if (visible) start();
  });

  resize();
  state.starfield = {
    start,
    stop,
    resize,
    collide() {
      if (reducedMotion.matches) return;
      heroCollision = {
        startedAt: performance.now(),
        burst: false,
        particles: []
      };
    },
    tokenImpact(targetX, targetY, onHit) {
      if (reducedMotion.matches) {
        onHit?.();
        return;
      }
      tokenRefreshImpact = {
        startedAt: performance.now(),
        targetX,
        targetY,
        onHit,
        hit: false,
        hitAt: 0,
        particles: []
      };
      refs.dailyHero.classList.add("is-token-refreshing");
    }
  };
}

function switchView(view, { scroll = true } = {}) {
  if (!viewTitles[view]) return;
  state.view = view;
  $$(".view").forEach((section) => {
    const active = section.id === `view-${view}`;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  $$(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === view);
  });
  setText(refs.pageBreadcrumb, viewTitles[view]);
  closeSidebar();
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "overview" && state.data) {
    requestAnimationFrame(() => {
      renderTrendChart();
      state.starfield?.resize();
      maybeShowPendingCelebration();
    });
  }
  updateWidgetSettingsControls();
}

function updateWidgetSettingsControls() {
  if (!widgetMode) return;
  const inSettings = state.view === "pricing";
  refs.widgetSettingsBtn.hidden = inSettings || state.widgetCollapsed;
  refs.widgetCollapseBtn.hidden = inSettings || state.widgetCollapsed;
  refs.widgetExpandBtn.hidden = !state.widgetCollapsed;
  refs.widgetSettingsClose.hidden = !inSettings || state.widgetCollapsed;
}

async function resizeWidgetLayout(collapsed) {
  if (!widgetMode) return;
  const bridge = window.chrome?.webview;
  if (bridge && typeof bridge.postMessage === "function") {
    bridge.postMessage(collapsed ? "layout-collapsed:0:0" : "layout-expanded:0:0");
    return;
  }
  try {
    await fetch("/api/widget/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collapsed })
    });
  } catch {
    // Layout still changes in the page even if the native window resize fails.
  }
}

async function setWidgetCollapsed(collapsed, { persist = true, resize = true } = {}) {
  if (!widgetMode || state.widgetLayoutBusy) return;
  state.widgetLayoutBusy = true;
  state.widgetCollapsed = collapsed;

  if (!collapsed) {
    refs.widgetSettingsBtn.style.pointerEvents = "none";
    refs.widgetCollapseBtn.style.pointerEvents = "none";
    setTimeout(() => {
      refs.widgetSettingsBtn.style.pointerEvents = "";
      refs.widgetCollapseBtn.style.pointerEvents = "";
    }, 480);
  }

  if (collapsed) {
    restoreHeroDailyView();
    if (state.view !== "overview") {
      switchView("overview");
    }
  }

  document.documentElement.dataset.collapsed = collapsed ? "true" : "false";
  if (persist) {
    localStorage.setItem("dsmon-widget-collapsed", collapsed ? "1" : "0");
  }
  updateWidgetSettingsControls();

  if (resize) {
    await resizeWidgetLayout(collapsed);
  }

  state.widgetLayoutBusy = false;
  if (!collapsed) {
    setTimeout(maybeShowPendingCelebration, 320);
  }
}

function bindWidgetDragHandle() {
  if (!widgetMode || !refs.widgetDragHandle || !refs.dailyHero) return;
  const bridge = window.chrome?.webview;
  if (!bridge || typeof bridge.postMessage !== "function") return;

  const handle = refs.widgetDragHandle;
  const hero = refs.dailyHero;
  let dragging = false;
  let moveFrame = null;
  let pendingPoint = null;
  let dragSource = null;

  const post = (type, x, y) => {
    bridge.postMessage(`${type}:${Math.round(x)}:${Math.round(y)}`);
  };

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (moveFrame) {
      cancelAnimationFrame(moveFrame);
      moveFrame = null;
    }
    pendingPoint = null;
    post("drag-end", 0, 0);
    dragSource = null;
  };

  const startDrag = (event) => {
    if (event.button !== 0 || dragging) return false;
    dragging = true;
    dragSource = event.currentTarget;
    pendingPoint = { x: event.screenX, y: event.screenY };
    try {
      dragSource.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
    post("drag-start", event.screenX, event.screenY);
    event.preventDefault();
    return true;
  };

  const isInteractiveTarget = (target) =>
    Boolean(
      target.closest(
        "button, a, input, select, textarea, option, [role='button'], [contenteditable='true'], .hero-topline, .hero-heading, .hero-token-value, .hero-bottom, .hero-account-row, .hero-completion-view, .widget-settings-close"
      )
    );

  handle.addEventListener("pointerdown", startDrag);

  hero.addEventListener("pointerdown", (event) => {
    if (state.widgetCollapsed || isInteractiveTarget(event.target)) return;
    startDrag(event);
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    pendingPoint = { x: event.screenX, y: event.screenY };
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = null;
      if (!dragging || !pendingPoint) return;
      post("drag-move", pendingPoint.x, pendingPoint.y);
    });
    event.preventDefault();
  });

  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
  window.addEventListener("blur", finishDrag);
}

function openSidebar() {
  refs.sidebar.classList.add("is-open");
  refs.sidebarOverlay.classList.add("is-visible");
}

function closeSidebar() {
  refs.sidebar.classList.remove("is-open");
  refs.sidebarOverlay.classList.remove("is-visible");
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("dsmon-theme", next);
  if (state.data) {
    renderSparkline(
      refs.spendSpark,
      state.data.calls.map((call) => call.costCny),
      "--brand",
      "spark-spend"
    );
    renderSparkline(
      refs.inputSpark,
      state.data.calls.map((call) => call.inputTokens),
      "--violet",
      "spark-input"
    );
    renderSparkline(
      refs.outputSpark,
      state.data.calls.map((call) => call.outputTokens),
      "--amber",
      "spark-output"
    );
    renderTrendChart();
  }
}

function exportCsv() {
  if (!state.data?.calls.length) {
    showToast("暂无可导出的请求记录", true);
    return;
  }
  const headers = [
    "序号",
    "调用时间",
    "模型",
    "输入Token",
    "缓存命中Token",
    "缓存未命中Token",
    "输出Token",
    "推理Token",
    "上下文Token",
    "缓存命中率",
    "估算费用(CNY)",
    "计价时段"
  ];
  const lines = state.data.calls.map((call) => [
    call.index,
    dateTimeFormatter.format(new Date(call.time)),
    state.data.model.name,
    call.inputTokens,
    call.cachedInputTokens,
    call.uncachedInputTokens,
    call.outputTokens,
    call.reasoningTokens,
    call.contextTokens,
    `${call.cacheHitRate.toFixed(2)}%`,
    call.costCny.toFixed(6),
    formatRate(call.rateKind)
  ]);
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[headers, ...lines]
    .map((row) => row.map(quote).join(","))
    .join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `deepseek-usage-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("请求明细已导出");
}

async function connectAccount(event) {
  event.preventDefault();
  const apiKey = refs.apiKeyInput.value.trim();
  if (!apiKey) {
    showToast("请输入 DeepSeek API Key", true);
    refs.apiKeyInput.focus();
    return;
  }
  refs.connectBtn.disabled = true;
  refs.connectBtn.textContent = "验证中…";
  try {
    const response = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "验证失败");
    }
    refs.apiKeyInput.value = "";
    showToast("DeepSeek 账户连接成功");
    await loadDashboard({ forceBalance: true, fresh: true, silent: true });
  } catch (error) {
    showToast(error.message || "连接失败", true);
  } finally {
    refs.connectBtn.disabled = false;
    refs.connectBtn.textContent = "验证并连接";
  }
}

async function disconnectAccount() {
  refs.disconnectBtn.disabled = true;
  try {
    const response = await fetch("/api/disconnect", { method: "POST" });
    if (!response.ok) throw new Error("清除失败");
    showToast("已清除本次自定义密钥");
    await loadDashboard({ forceBalance: true, fresh: true, silent: true });
  } catch (error) {
    showToast(error.message || "清除失败", true);
  } finally {
    refs.disconnectBtn.disabled = false;
  }
}

function bindEvents() {
  refs.refreshBtn.addEventListener("click", () => loadDashboard({ fresh: true }));
  refs.refreshBalanceBtn.addEventListener("click", () =>
    loadDashboard({ forceBalance: true, fresh: true })
  );
  refs.verifyBalanceBtn.addEventListener("click", () =>
    loadDashboard({ forceBalance: true, fresh: true })
  );
  refs.errorRetryBtn.addEventListener("click", () => {
    refs.errorState.hidden = true;
    refs.loadingState.hidden = false;
    loadDashboard({ initial: true, fresh: true });
  });

  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });
  $$("[data-goto-view]").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.gotoView));
  });

  refs.openConnectBtn.addEventListener("click", () => {
    switchView("pricing");
    setTimeout(() => refs.apiKeyInput.focus(), 220);
  });

  $$("[data-chart-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartMode = button.dataset.chartMode;
      $$("[data-chart-mode]").forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      setText(
        refs.chartSubtitle,
        state.chartMode === "cumulative"
          ? "从会话开始累计的 Token 用量"
          : "每一次模型调用的上下文与输出变化"
      );
      renderTrendChart();
    });
  });

  $$("[data-request-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.requestFilter = button.dataset.requestFilter;
      $$("[data-request-filter]").forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderRequestsView();
    });
  });

  $$("[data-price-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.priceMode === button.dataset.priceMode) return;
      state.priceMode = button.dataset.priceMode;
      localStorage.setItem("dsmon-price-mode", state.priceMode);
      $$("[data-price-mode]").forEach((item) =>
        item.classList.toggle("is-active", item.dataset.priceMode === state.priceMode)
      );
      loadDashboard({ fresh: true });
    });
  });

  refs.refreshSelect.addEventListener("change", () => {
    state.refreshSeconds = Number(refs.refreshSelect.value) || 0;
    localStorage.setItem("dsmon-refresh-seconds", String(state.refreshSeconds));
    restartAutoRefresh();
    showToast(
      state.refreshSeconds > 0
        ? `已设置为每 ${state.refreshSeconds} 秒自动刷新`
        : "已关闭自动刷新"
    );
  });

  refs.exportBtn.addEventListener("click", exportCsv);
  refs.connectForm.addEventListener("submit", connectAccount);
  refs.disconnectBtn.addEventListener("click", disconnectAccount);
  refs.previewCompletionBtn.addEventListener("click", previewQuestionCompletion);
  refs.widgetSettingsBtn.addEventListener("click", () => switchView("pricing"));
  refs.widgetSettingsClose.addEventListener("click", () => switchView("overview"));
  refs.widgetCollapseBtn.addEventListener("click", () => setWidgetCollapsed(true));
  refs.widgetExpandBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setWidgetCollapsed(false);
  });
  [refs.heroContextBadge, refs.heroSpeedBadge, refs.heroFirstTokenBadge, refs.heroDurationBadge]
    .filter(Boolean)
    .forEach((trigger) => {
      trigger.addEventListener("pointerenter", () => showHeroTooltip(trigger));
      trigger.addEventListener("pointerleave", hideHeroTooltip);
      trigger.addEventListener("pointercancel", hideHeroTooltip);
    });
  refs.showKeyBtn.addEventListener("click", () => {
    const isPassword = refs.apiKeyInput.type === "password";
    refs.apiKeyInput.type = isPassword ? "text" : "password";
    refs.showKeyBtn.textContent = isPassword ? "隐藏" : "显示";
  });

  refs.themeBtn.addEventListener("click", toggleTheme);
  refs.menuBtn.addEventListener("click", openSidebar);
  refs.sidebarClose.addEventListener("click", closeSidebar);
  refs.sidebarOverlay.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (widgetMode && state.view === "pricing") {
        switchView("overview");
        return;
      }
      closeSidebar();
      hideChartTooltip();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(state.heroCompletionRestoreTimer);
      state.heroCompletionRestoreTimer = null;
      return;
    }
    handleCompletionAttention();
    if (
      document.visibilityState === "visible" &&
      state.lastFetchAt &&
      Date.now() - state.lastFetchAt > state.refreshSeconds * 1000
    ) {
      loadDashboard({ silent: true });
    }
  });

  window.addEventListener("focus", () => {
    handleCompletionAttention();
  });
  window.addEventListener("blur", () => {
    if (state.heroCompletionOpen) {
      armHeroCompletionRestore();
    }
  });
  document.addEventListener("pointerenter", handleCompletionAttention);
  document.addEventListener("pointerdown", handleCompletionAttention);

  window.addEventListener("beforeunload", () => {
    state.eventSource?.close();
  });
  window.addEventListener("scroll", hideHeroTooltip, { passive: true });

  let resizeTimer = null;
  const chartObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.data && state.view === "overview") renderTrendChart();
    }, 90);
  });
  chartObserver.observe($("#trendChart").parentElement);
  bindWidgetDragHandle();
}

function initializeControls() {
  $$("[data-price-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.priceMode === state.priceMode);
  });
  refs.refreshSelect.value = String(state.refreshSeconds);
  if (!["0", "5", "10", "15", "30", "60"].includes(refs.refreshSelect.value)) {
    state.refreshSeconds = 15;
    refs.refreshSelect.value = "15";
  }
  if (widgetMode) {
    refs.widgetSettingsBtn.hidden = false;
    refs.widgetSettingsClose.hidden = true;
    document.title = "DeepSeek Usage Widget";
    updateWidgetSettingsControls();
    if (state.widgetCollapsed) {
      resizeWidgetLayout(true);
    }
  }
  const hashView = location.hash.replace("#", "");
  if (viewTitles[hashView]) {
    switchView(hashView, { scroll: false });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeControls();
  bindEvents();
  initStarfield();
  updateDailyClock();
  setInterval(updateDailyClock, 1000);
  restartAutoRefresh();
  setInterval(updateRelativeSync, 5000);
  loadDashboard({ initial: true, forceBalance: false });
});
