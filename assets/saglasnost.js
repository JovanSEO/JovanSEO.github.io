// Saglasnost za Meta Pixel: pamti se u browseru; bez „Prihvatam" Pixel ne šalje podatke.
(function () {
  var box = document.getElementById("consent");
  if (!box) return;
  function procitaj() { try { return localStorage.getItem("cs_consent"); } catch (e) { return null; } }
  function sacuvaj(v) { try { localStorage.setItem("cs_consent", v); } catch (e) {} }
  function primeni(v) { if (v === "da" && window.fbq) fbq("consent", "grant"); }
  var odluka = procitaj();
  if (odluka) primeni(odluka); else box.hidden = false;
  document.getElementById("consent-da").addEventListener("click", function () { sacuvaj("da"); primeni("da"); box.hidden = true; });
  document.getElementById("consent-ne").addEventListener("click", function () {
    sacuvaj("ne"); if (window.fbq) fbq("consent", "revoke"); box.hidden = true;
  });
  document.getElementById("kolacici").addEventListener("click", function (e) { e.preventDefault(); box.hidden = false; });
})();
