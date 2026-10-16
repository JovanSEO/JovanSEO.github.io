// Link za zakazivanje razgovora (Google Calendar stranica za zakazivanje „Callsistent konsultacije").
// Dok je prazan, dugmad za zakazivanje se ne prikazuju.
(function () {
  var ZAKAZIVANJE_URL = "";

  document.querySelectorAll("[data-zakazi]").forEach(function (el) {
    if (!ZAKAZIVANJE_URL) { el.closest("li") ? el.closest("li").remove() : el.remove(); return; }
    el.href = ZAKAZIVANJE_URL;
    el.target = "_blank";
    el.rel = "noopener";
    el.addEventListener("click", function () {
      if (window.fbq) fbq("trackCustom", "ZakazivanjeKlik", { stranica: location.pathname });
    });
  });
})();
