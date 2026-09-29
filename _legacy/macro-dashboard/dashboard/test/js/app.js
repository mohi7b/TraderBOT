"use strict";
/* Macro Backend — test UI bootstrap.
   * fetches /api/groups (backend metadata)
   * builds the tab bar (one per group screen; Inflation = Row 1 demo)
   * on activate: fetch group endpoint, dispatch to its renderer.
   Growth / Labor are intentionally placeholders (future Row tasks). */
(function (g) {
  const NS = (g.Macro = g.Macro || {});
  const view = document.getElementById("view");
  const meta = document.getElementById("meta");
  const tabWrap = document.getElementById("tabs");

  const GROUP_FA = { Inflation: "تورم", Growth: "رشد", Labor: "بازار کار" };

   function msg(title, extra) {
    return (
      '<div class="g-head"><h2>' + title + "</h2></div>" +
      '<p class="muted">' + (extra || "module pending — next Row task.") + "</p>"
    );
  }

  async function activate(slug, groups) {
    const g = groups.find((x) => x.slug === slug);
    if (!g) return;
    for (const b of tabWrap.children) b.classList.toggle("on", b.dataset.slug === slug);

    const fa = GROUP_FA[g.title] ? GROUP_FA[g.title] + " · " : "";
    meta.textContent =
      g.title + "  →  " + g.endpoint + "   ·   " + (g.canonical_indicators || []).join(" / ");

    view.textContent = "";
    try {
      const res = await fetch(g.endpoint);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const payload = await res.json();
      if (slug === "inflation") {
        view.innerHTML = NS.renderInflation(payload);
      } else {
        // Row 2/3 will attach their renderers here with the same contract.
        view.innerHTML = msg(g.title, "This Row is not implemented yet in this test screen.");
      }
    } catch (e) {
      view.innerHTML = msg("error", "Cannot build " + g.endpoint + " — " + e.message);
    }
  }

  async function boot() {
    try {
      const res = await fetch("/api/groups");
      const data = await res.json();
      const groups = data.groups.map((grp) => ({
        key: grp.key,
        title: grp.title,
        canonical_indicators: grp.canonical_indicators || [],
        endpoint: grp.endpoint,
        slug: String(grp.key).split("_")[1] || grp.title.toLowerCase(),
      }));

      tabWrap.textContent = "";
      for (const grp of groups) {
        const b = document.createElement("button");
        b.textContent = (GROUP_FA[grp.title] ? GROUP_FA[grp.title] + " · " : "") + grp.title;
        b.dataset.slug = grp.slug;
        b.addEventListener("click", () => activate(grp.slug, groups));
        tabWrap.appendChild(b);
      }

      meta.textContent = "groups: " + groups.map((gr) => gr.title).join(" / ") + " — ready";
      const def = groups.find((gr) => gr.slug === "inflation") || groups[0];
      if (def) await activate(def.slug, groups);
    } catch (e) {
      meta.textContent = "Cannot reach /api/groups — start backend on this origin. " + e.message;
      view.innerHTML = msg("offline", "no /api/groups received.");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})(window);
