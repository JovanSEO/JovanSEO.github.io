// Saglasnost za Meta Pixel: pamti se u browseru; bez „Prihvatam" Pixel ne šalje podatke.
(function () {
  var box = document.getElementById("consent");
  if (!box) return;
  // Na telefonu baner zauzima dno ekrana, pa se plutajuće dugme za demo dok je baner otvoren skriva (vidi style.css).
  function prikazi(da) { box.hidden = !da; document.body.classList.toggle("cs-consent-open", da); }
  function procitaj() { try { return localStorage.getItem("cs_consent"); } catch (e) { return null; } }
  function sacuvaj(v) { try { localStorage.setItem("cs_consent", v); } catch (e) {} }
  function primeni(v) { if (v === "da" && window.fbq) fbq("consent", "grant"); }
  var odluka = procitaj();
  if (odluka) primeni(odluka); else prikazi(true);
  document.getElementById("consent-da").addEventListener("click", function () { sacuvaj("da"); primeni("da"); prikazi(false); });
  document.getElementById("consent-ne").addEventListener("click", function () {
    sacuvaj("ne"); if (window.fbq) fbq("consent", "revoke"); prikazi(false);
  });
  document.getElementById("kolacici").addEventListener("click", function (e) { e.preventDefault(); prikazi(true); });
})();
