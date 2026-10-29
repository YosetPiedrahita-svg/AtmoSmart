(function () {
  AS.qs("[data-logo]").innerHTML = AS.logo(20);
  AS.qsa("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", AS.icon(el.dataset.icon)));
  AS.qs("[data-icon-callout]").insertAdjacentHTML("afterbegin", AS.icon("wifiOff", "icon-sm"));

  const role = AS.qs("#role");
  role.innerHTML = Object.entries(AS.ROLES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  role.value = "supervisor";

  AS.qs("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const user = AS.qs("#user");
    if (!user.value.trim()) {
      user.setAttribute("aria-invalid", "true");
      user.focus();
      return;
    }
    AS.session.login(user.value.trim(), role.value);
    location.href = "dashboard.html";
  });
})();
