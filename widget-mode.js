(() => {
  const searchParams = new URLSearchParams(window.location.search);
  const widgetMode = searchParams.get("widget") === "1";

  if (widgetMode) {
    document.documentElement.dataset.widget = "true";
    document.documentElement.dataset.collapsed =
      localStorage.getItem("dsmon-widget-collapsed") === "1"
        ? "true"
        : "false";
    document.documentElement.dataset.hosted =
      searchParams.get("hosted") === "1" ||
      (window.chrome &&
        window.chrome.webview &&
        typeof window.chrome.webview.postMessage === "function")
        ? "true"
        : "false";
  }
})();
