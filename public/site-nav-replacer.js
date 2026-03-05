/**
 * Site Nav Replacer — Modified for Font Awesome / HTML icon support
 * Based on original by Will-Myers (willmyethewebsiteguy/SiteNavReplacer)
 * Modified: innerHTML support added so Font Awesome <i> tags are preserved
 */

!function () {
  let initialized = false;

  function init(options = {}) {
    if (initialized && !options.force) {
      console.warn("Nav Replacer: Already initialized. Pass { force: true } to reinitialize.");
      return false;
    }

    let pluginEl, dataEl;

    if (options.navId) {
      dataEl = document.querySelector(`[data-nav-id="${options.navId}"]`);
      if (!dataEl) {
        console.warn(`Nav Replacer: No element found with [data-nav-id="${options.navId}"]`);
        return false;
      }
      pluginEl = dataEl;
    } else {
      if (document.querySelectorAll('[data-wm-plugin="new-nav"]').length === 0) {
        console.warn('Nav Replacer: No element found with [data-wm-plugin="new-nav"]');
        return false;
      }
      pluginEl = document.querySelector('[data-wm-plugin="new-nav"]');
      if (pluginEl.hasAttribute("data-nav-id")) {
        let id = pluginEl.getAttribute("data-nav-id");
        dataEl = document.querySelector(`[data-nav-id="${id}"]:not([data-wm-plugin="new-nav"])`);
      } else {
        dataEl = pluginEl;
      }
    }

    try {
      dataEl.closest(".sqs-block").classList.add("hide-block");
    } catch (e) {}

    const header         = document.querySelector("#header");
    let titleDesktop     = header.querySelector(".header-display-desktop #site-title");
    let titleMobile      = header.querySelector(".header-display-mobile #site-title");
    let logoDesktop      = header.querySelector(".header-display-desktop .header-title img");
    let logoMobile       = header.querySelector(".header-display-mobile .header-title img");
    let ctaBtns          = header.querySelectorAll(".header-actions-action--cta .btn");
    let ctaMobileBtn     = header.querySelector('[data-folder="root"] .header-menu-cta .btn');
    const navList        = header.querySelector(".header-nav-list");
    const mobileNavList  = header.querySelector(".header-display-mobile .header-nav-list");
    const menuNavList    = header.querySelector(".header-menu-nav-list");
    const socialEl       = header.querySelector(".header-actions-action--social");
    const menuActions    = header.querySelector(".header-menu-actions");

    // ── Announcement Bar ──────────────────────────────────────────────────────
    const announcementEl = dataEl.querySelector(".new-announcement-bar");
    if (announcementEl) {
      const barHTML = announcementEl.innerHTML;
      const saved = {
        showBar: Static.SQUARESPACE_CONTEXT.showAnnouncementBar,
        abSettings: Static.SQUARESPACE_CONTEXT.websiteSettings?.announcementBarSettings,
        localStorage: localStorage.getItem("squarespace-announcement-bar")
      };
      Static.SQUARESPACE_CONTEXT.showAnnouncementBar = true;
      let stored = JSON.parse(localStorage.getItem("squarespace-announcement-bar")) || {};
      stored.text = barHTML;
      stored.closed = false;
      stored.clickthroughUrl = null;
      Static.SQUARESPACE_CONTEXT.websiteSettings.announcementBarSettings.clickthroughUrl = null;
      if (announcementEl.getAttribute("href")) {
        let link = { url: announcementEl.getAttribute("href"), newWindow: announcementEl.getAttribute("target") === "_blank" };
        stored.clickthroughUrl = link;
        if (Static.SQUARESPACE_CONTEXT.websiteSettings?.announcementBarSettings) {
          Static.SQUARESPACE_CONTEXT.websiteSettings.announcementBarSettings.clickthroughUrl = link;
        }
      }
      localStorage.setItem("squarespace-announcement-bar", JSON.stringify(stored));
      if (Static.SQUARESPACE_CONTEXT.websiteSettings?.announcementBarSettings?.text) {
        Static.SQUARESPACE_CONTEXT.websiteSettings.announcementBarSettings.text = barHTML;
      }
      const style = document.createElement("style");
      style.textContent = `.new-nav-loaded .sqs-announcement-bar-close { display: none; }`;
      document.head.appendChild(style);
      window.addEventListener("load", () => {
        Static.SQUARESPACE_CONTEXT.showAnnouncementBar = saved.showBar;
        if (Static.SQUARESPACE_CONTEXT.websiteSettings?.announcementBarSettings) {
          Static.SQUARESPACE_CONTEXT.websiteSettings.announcementBarSettings = saved.abSettings;
        }
        saved.localStorage
          ? localStorage.setItem("squarespace-announcement-bar", saved.localStorage)
          : localStorage.removeItem("squarespace-announcement-bar");
      });
    }

    // ── Build nav item elements ───────────────────────────────────────────────
    // KEY CHANGE: uses innerHTML instead of textContent so <i> FA tags are kept
    function buildNavItem(labelHTML, href, type, newWindow) {
      let wrapper  = document.createElement("div");
      let link     = document.createElement("a");
      let mWrapper = document.createElement("div");
      let mLink    = document.createElement("a");

      if (newWindow) { link.target = "_blank"; mLink.target = "_blank"; }
      wrapper.append(link);
      mWrapper.append(mLink);

      if (type === "collection") {
        wrapper.classList.add("header-nav-item--collection", "header-nav-item");
        link.href      = href;
        link.innerHTML = labelHTML; // ← innerHTML preserves <i> tags

        mWrapper.classList.add("container", "header-menu-nav-item", "header-menu-nav-item--collection");
        mLink.href      = href;
        mLink.innerHTML = labelHTML; // ← innerHTML preserves <i> tags

      } else if (type === "dropdown") {
        let folderContent = document.createElement("div");
        folderContent.classList.add("header-nav-folder-content");
        wrapper.append(folderContent);
        wrapper.classList.add("header-nav-item--folder", "header-nav-item");
        link.classList.add("header-nav-folder-title");
        link.href      = href || "javascript:void(0)";
        link.innerHTML = labelHTML; // ← innerHTML

        let visHidden = document.createElement("span");
        let labelSpan = document.createElement("span");
        let chevron   = document.createElement("span");
        mWrapper.classList.add("container", "header-menu-nav-item");
        mLink.href = href;
        mLink.setAttribute("data-folder-id", href);
        visHidden.textContent = "Folder:";
        visHidden.classList.add("visually-hidden");
        labelSpan.innerHTML = labelHTML; // ← innerHTML
        chevron.classList.add("chevron", "chevron--right");
        mLink.append(visHidden, labelSpan, chevron);

        let folderEl        = document.createElement("div");
        let folderContentEl = document.createElement("div");
        folderEl.setAttribute("data-folder", href);
        folderEl.classList.add("header-menu-nav-folder");
        folderContentEl.classList.add("header-menu-nav-folder-content");
        folderEl.append(folderContentEl);
        menuNavList.append(folderEl);

        let controls    = document.createElement("div");
        let backLink    = document.createElement("a");
        let backChevron = document.createElement("span");
        let backText    = document.createElement("span");
        controls.classList.add("header-menu-controls", "container", "header-menu-nav-item");
        backLink.classList.add("header-menu-controls-control", "header-menu-controls-control--active");
        backLink.tabIndex = "-1";
        backLink.href = "/";
        backLink.setAttribute("data-action", "back");
        backChevron.classList.add("chevron", "chevron--left");
        backText.textContent = "Back";
        backLink.append(backChevron, backText);
        controls.append(backLink);
        folderContentEl.append(controls);

      } else if (type === "dropdown-link") {
        wrapper.classList.add("header-nav-folder-item");
        link.href      = href;
        link.innerHTML = labelHTML; // ← innerHTML

      } else if (type === "mobile-folder-item") {
        wrapper.classList.add("container", "header-menu-nav-item");
        link.href      = href;
        link.innerHTML = labelHTML; // ← innerHTML
      }

      return [wrapper, mWrapper];
    }

    // ── Social links ──────────────────────────────────────────────────────────
    const socialItems = dataEl.querySelectorAll(":scope > .social");
    if (socialItems.length) {
      socialItems.forEach(el => {
        let href    = el.getAttribute("href");
        let domain  = new URL(href).host;
        let sIcon   = socialEl?.querySelector(`[href*="${domain}"]`);
        let mIcon   = menuActions?.querySelector(`[href*="${domain}"]`);
        if (sIcon) { sIcon.href = href; sIcon.classList.add("new-social"); }
        if (mIcon) { mIcon.href = href; mIcon.parentElement.classList.add("new-social"); }
      });
      socialEl?.querySelectorAll(".icon:not(.new-social)").forEach(e => e.remove());
      menuActions?.querySelectorAll(".header-menu-actions-action--social:not(.new-social)").forEach(e => e.remove());
    }

    // ── Nav items ─────────────────────────────────────────────────────────────
    const navItems = dataEl.querySelectorAll(":scope > div:not(.new-site-title):not(.new-cta):not(.new-mobile-title):not(.social):not(.new-announcement-bar)");

    if (navItems.length !== 0) {
      // Clear existing nav items
      navList.querySelectorAll(".header-nav-item").forEach(el => {
        if (!el.querySelector('[href="/secondary-nav"]')) el.remove();
      });
      mobileNavList.querySelectorAll(".header-nav-item").forEach(el => {
        if (!el.querySelector('[href="/secondary-nav"]')) el.remove();
      });
      menuNavList.querySelectorAll('[data-folder="root"] .header-menu-nav-item').forEach(el => {
        if (!el.querySelector('[href="/secondary-nav"]')) {
          if (el.classList.contains("user-accounts-link")) {
            el.insertAdjacentHTML("beforebegin", `<style>.header-menu-nav-folder-content .user-accounts-link{order:1}</style>`);
          } else {
            el.remove();
          }
        }
      });
      menuNavList.querySelectorAll('[data-folder]:not([data-folder="root"])').forEach(el => {
        if (!el.querySelector('[href="/secondary-nav"]')) el.remove();
      });

      navItems.forEach(el => {
        let items;
        // ── KEY CHANGE: use innerHTML to capture icon markup ──
        let labelHTML  = el.innerHTML.trim();
        let href       = el.getAttribute("href");
        let isDropdown = el.classList.contains("new-nav-dropdown");
        let newWindow  = el.hasAttribute("data-new-window") || el.getAttribute("target") === "_blank";

        if (isDropdown) {
          let folderCount = menuNavList.querySelectorAll("[data-folder]").length;
          labelHTML = el.getAttribute("data-title"); // dropdown title is plain text attr
          if (!href) href = "wm-folder-" + folderCount;
          items = buildNavItem(labelHTML, href, "dropdown", newWindow);

          let dropContent = items[0].querySelector(".header-nav-folder-content");
          el.querySelectorAll("div").forEach(child => {
            let childHTML  = child.innerHTML.trim();
            let childHref  = child.getAttribute("href");
            let childNew   = child.hasAttribute("data-new-window") || child.getAttribute("target") === "_blank";
            let childItems = buildNavItem(childHTML, childHref, "dropdown-link", childNew);
            dropContent.append(childItems[0]);
            let mobileItem = buildNavItem(childHTML, childHref, "mobile-folder-item");
            menuNavList.querySelector(`[data-folder="${href}"] .header-menu-nav-folder-content`).append(mobileItem[0]);
          });
        } else {
          items = buildNavItem(labelHTML, href, "collection", newWindow);
        }

        navList.append(items[0]);
        mobileNavList.append(items[0].cloneNode(true));
        menuNavList.querySelector('[data-folder="root"] .header-menu-nav-folder-content').append(items[1]);
      });

      // Back button listeners
      document.querySelectorAll('.header-menu-controls-control[data-action="back"]').forEach(el => {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          document.querySelector('[data-folder="root"]').classList.remove("header-menu-nav-folder--open");
          menuNavList.querySelector('[data-folder].header-menu-nav-folder--active:not([data-folder="root"])').classList.remove("header-menu-nav-folder--active");
        });
      });

      // Dropdown folder open listeners
      document.querySelectorAll('[data-folder="root"] [data-folder-id]').forEach(el => {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          let folderId = el.getAttribute("data-folder-id");
          document.querySelector('[data-folder="root"]').classList.add("header-menu-nav-folder--open");
          menuNavList.querySelector(`[data-folder="${folderId}"]`).classList.add("header-menu-nav-folder--active");
        });
      });
    }

    // ── CTA Button ────────────────────────────────────────────────────────────
    const ctaEl = dataEl.querySelector(".new-cta");
    if (ctaEl) {
      if (!ctaBtns.length) {
        let ctaWrapper   = document.createElement("div");
        let mobileMenu   = document.createElement("div");
        let ctaLink      = document.createElement("a");
        ctaMobileBtn     = document.createElement("a");
        ctaWrapper.classList.add("header-actions-action", "header-actions-action--cta");
        mobileMenu.classList.add("header-menu-cta");
        ctaLink.classList.add("btn", "btn--border", "sqs-button-element--primary");
        ctaMobileBtn.classList.add("btn");
        ctaWrapper.append(ctaLink);
        mobileMenu.append(ctaMobileBtn);
        header.querySelector(".header-display-desktop .header-actions").append(ctaWrapper);
        header.querySelector(".header-display-mobile .header-actions").append(ctaWrapper.cloneNode(true));
        header.querySelector('[data-folder="root"]').append(mobileMenu);
        ctaBtns = header.querySelectorAll(".header-actions-action--cta .btn");
      }

      // ── KEY CHANGE: innerHTML so icons work in CTA too ──
      let ctaHTML   = ctaEl.innerHTML.trim();
      let ctaHref   = ctaEl.getAttribute("href");
      let ctaTarget = ctaEl.getAttribute("target");
      ctaBtns.forEach(btn => {
        btn.innerHTML = ctaHTML;
        btn.href = ctaHref;
        if (ctaTarget) btn.target = ctaTarget;
      });
      ctaMobileBtn.innerHTML = ctaHTML;
      ctaMobileBtn.href = ctaHref;
      if (ctaTarget) ctaMobileBtn.target = ctaTarget;
    }

    // ── Site Title / Logo ─────────────────────────────────────────────────────
    const titleEl = dataEl.querySelector(".new-site-title");
    if (titleEl) {
      let titleText     = titleEl.textContent;
      let logoSrc       = titleEl.getAttribute("data-src-url");
      let logoMobileSrc = titleEl.getAttribute("data-mobile-src-url") || logoSrc;
      let titleHref     = titleEl.getAttribute("href");

      if (titleText && titleDesktop) { titleDesktop.textContent = titleText; titleMobile.textContent = titleText; }
      if (titleHref && titleDesktop) { titleDesktop.href = titleHref; titleMobile.href = titleHref; }
      if (titleHref && logoDesktop)  {
        logoDesktop.closest("a").href = titleHref;
        header.querySelector(".header-display-mobile .header-title").querySelectorAll("a").forEach(a => a.href = titleHref);
      }
      if (logoSrc && logoDesktop) {
        logoDesktop.src = logoSrc;
        logoMobile.src = logoMobileSrc;
        let srcsetDesktop = header.querySelector(".header-title-logo source");
        if (srcsetDesktop) {
          header.querySelectorAll(".header-title-logo source").forEach(s => s.srcset = logoSrc);
          header.querySelectorAll(".header-mobile-logo source").forEach(s => s.srcset = logoMobileSrc);
        }
      }
    }

    // ── Account link ──────────────────────────────────────────────────────────
    if (document.querySelector('.header-nav-item--collection [href="#sqsp-account"]')) {
      window.addEventListener("DOMContentLoaded", function () {
        let accountLinks = document.querySelectorAll('[href="#sqsp-account"]');
        let accountBtn   = document.querySelector(".user-accounts-text-link");
        function handleClick(e) { e.preventDefault(); e.stopPropagation(); accountBtn && accountBtn.click(); }
        accountLinks.forEach(el => el.addEventListener("click", handleClick));
      });
    }

    // ── Active state ──────────────────────────────────────────────────────────
    const currentPath = window.location.pathname;
    header.querySelectorAll(".header-nav-list .header-nav-item").forEach(item => {
      item.querySelectorAll("a").forEach(a => {
        if (currentPath === a.getAttribute("href")) {
          item.classList.add("header-nav-item--active");
          if (a.parentElement.classList.contains("header-nav-folder-item")) {
            a.parentElement.classList.add("header-nav-folder-item--active");
            let span = document.createElement("span");
            span.classList.add("header-nav-folder-item-content");
            span.innerHTML = a.innerHTML;
            a.innerHTML = "";
            a.appendChild(span);
            a.classList.add("header-nav-item--active");
            a.setAttribute("aria-current", "page");
          }
        }
      });
    });

    header.querySelectorAll(".header-menu-nav-list .header-menu-nav-item").forEach(item => {
      let a = item.querySelector("a");
      if (currentPath === a?.getAttribute("href")) {
        let labelHTML = a.innerHTML.trim();
        let content   = document.createElement("div");
        content.classList.add("header-menu-nav-item-content");
        content.innerHTML = labelHTML;
        a.innerHTML = "";
        a.appendChild(content);
        item.classList.add("header-menu-nav-item--active");
        a.setAttribute("aria-current", "page");

        let folderAttr = a.closest("[data-folder]")?.getAttribute("data-folder");
        let folderLink = document.querySelector(`[data-folder="root"] a[href="${folderAttr}"]`);
        if (folderLink) {
          folderLink.setAttribute("aria-current", "true");
          folderLink.parentElement.classList.add("header-menu-nav-item--active");
          let fSpan = document.createElement("span");
          fSpan.classList.add("header-menu-nav-item-content");
          fSpan.innerHTML = folderLink.innerHTML;
          folderLink.innerHTML = "";
          folderLink.appendChild(fSpan);
        }
      }
    });

    // ── Finish ────────────────────────────────────────────────────────────────
    document.body.classList.add("new-nav-loaded");

    let transitionStyle = document.createElement("style");
    transitionStyle.setAttribute("type", "text/css");
    transitionStyle.appendChild(document.createTextNode(
      `.new-nav-loaded #header .header-display-desktop,
       .new-nav-loaded #header .header-display-mobile {
         transition: opacity .3s ease, visibility 0s ease, transform .3s ease;
         opacity: 1; visibility: visible; transform: unset;
       }`
    ));
    document.head.prepend(transitionStyle);

    initialized = true;
    return true;
  }

  window.wmNavReplacer = { init, isInitialized: () => initialized };
  init();
}();
