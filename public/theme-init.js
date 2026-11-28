// Runs before first paint (CSP blocks inline scripts, so this is a same-origin file).
// Sets data-theme from the cached theme choice; the app reconciles with the saved settings after load.
(function () {
  var t = "system";
  try {
    t = localStorage.getItem("lagsmith.theme") || "system";
  } catch (e) {}
  var dark = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
