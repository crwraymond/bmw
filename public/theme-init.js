(function () {
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem("toko-offline-theme") === "light" ? "light" : "dark";
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
