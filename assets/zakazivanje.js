// Link za zakazivanje razgovora: Google Calendar stranica „1:1 call" na jovanseo@gmail.com
// (30 min, pon–pet 8–17, sredom 8–19, Beograd). Ako je prazan, dugmad za zakazivanje se ne prikazuju.
(function () {
  var ZAKAZIVANJE_URL = "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3VGLSACoMaoPwlDbVXYXfdmKRaeWw2TR6o38QtQz9BN17usa65XrH_b4eftvBQXhlyejM2B6Qw";

  function povezi(el) {
    if (!ZAKAZIVANJE_URL) { el.closest("li") ? el.closest("li").remove() : el.remove(); return; }
    el.href = ZAKAZIVANJE_URL;
    el.target = "_blank";
    el.rel = "noopener";
    el.addEventListener("click", function () {
      if (window.fbq) fbq("trackCustom", "ZakazivanjeKlik", { stranica: location.pathname });
    });
  }

  // demo.js koristi isto i za dugmad u prozoru „Demo poziv".
  window.csPoveziZakazivanje = povezi;
  document.querySelectorAll("[data-zakazi]").forEach(povezi);
})();
