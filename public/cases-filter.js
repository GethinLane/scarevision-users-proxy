(function () {
  const overlay = document.getElementById("filtersOverlay");
  const openBtn = document.getElementById("filtersToggleBtn");
  const closeBtn = document.getElementById("filtersCloseBtn");
  const desktopMq = window.matchMedia("(min-width: 769px)");

  // Remember original parent + position so we can move back on mobile
  const originalParent = overlay.parentElement;
  const originalNextSibling = overlay.nextElementSibling;

  function placeOverlay(isDesktop) {
    if (isDesktop) {
      // Desktop: move overlay to <body> so it sits above all stacking contexts
      if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
      }
    } else {
      // Mobile: move overlay back to where it was in the layout (inline under button)
      if (overlay.parentElement !== originalParent) {
        if (originalNextSibling && originalNextSibling.parentElement === originalParent) {
          originalParent.insertBefore(overlay, originalNextSibling);
        } else {
          originalParent.appendChild(overlay);
        }
      }
    }
  }

  function openFilters() {
    overlay.classList.add("is-open");
    if (desktopMq.matches) {
      document.body.style.overflow = "hidden"; // lock scroll on desktop
    }
  }

  function closeFilters() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  // Initial placement based on current viewport
  placeOverlay(desktopMq.matches);

  openBtn.addEventListener("click", function () {
    if (overlay.classList.contains("is-open")) {
      closeFilters();
    } else {
      openFilters();
    }
  });

  closeBtn.addEventListener("click", closeFilters);

  // Click on the dark backdrop closes on desktop only
  overlay.addEventListener("click", function (e) {
    if (!desktopMq.matches) return;
    if (e.target === overlay) {
      closeFilters();
    }
  });

  // Handle viewport changes (desktop <-> mobile)
  desktopMq.addEventListener("change", function (e) {
    placeOverlay(e.matches);
    if (!e.matches) {
      // coming down to mobile: always clear any scroll lock
      document.body.style.overflow = "";
    }
  });

  // ─── Info icon toggles ───
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".filter-info-btn");
    if (!btn) return;

    const item = btn.closest(".filter-item");
    if (!item) return;

    const info = item.querySelector(".filter-info");
    if (!info) return;

    const isHidden = info.hasAttribute("hidden");
    if (isHidden) {
      info.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    } else {
      info.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }
  });
})();
