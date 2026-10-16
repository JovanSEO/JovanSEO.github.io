// Meni na telefonu: dugme sa tri crte otvara iste stavke kao na desktopu (vidi .nav-meni u style.css).
(function () {
  var nav = document.querySelector(".nav");
  var dugme = nav && nav.querySelector(".nav-meni");
  if (!dugme) return;
  function otvori(da) {
    nav.classList.toggle("otvoren", da);
    dugme.setAttribute("aria-expanded", String(da));
    dugme.setAttribute("aria-label", da ? "Zatvori meni" : "Otvori meni");
  }
  dugme.addEventListener("click", function () { otvori(!nav.classList.contains("otvoren")); });
  // Klik na stavku (i na „Isprobajte", koji otvara demo) zatvara meni.
  nav.querySelectorAll("ul a").forEach(function (a) { a.addEventListener("click", function () { otvori(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") otvori(false); });
  document.addEventListener("click", function (e) { if (!nav.contains(e.target)) otvori(false); });
  window.addEventListener("resize", function () { if (window.innerWidth > 860) otvori(false); });
})();
