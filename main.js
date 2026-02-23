const menuBtn = document.querySelector(".menu-btn");
const topNav = document.querySelector(".top-nav");
const captchaRuntime = document.querySelector("#captcha-runtime");
const isLocalDevHost = (() => {
  const host = window.location.hostname;
  return (
    window.location.protocol === "file:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  );
})();

window.onTurnstileSuccess = () => {
  if (!captchaRuntime) return;
  captchaRuntime.textContent = "Verification completed.";
  captchaRuntime.className = "captcha-runtime ok";
};

window.onTurnstileError = (errorCode) => {
  if (!captchaRuntime) return;
  const host = window.location.hostname || "(unknown-host)";
  captchaRuntime.textContent =
    `Verification failed to load (code: ${errorCode || "unknown"}). Host: ${host}. Check Turnstile hostname allowlist or network access.`;
  captchaRuntime.className = "captcha-runtime error";
};

window.onTurnstileExpired = () => {
  if (!captchaRuntime) return;
  captchaRuntime.textContent = "Verification expired. Please verify again.";
  captchaRuntime.className = "captcha-runtime error";
};

if (menuBtn && topNav) {
  menuBtn.addEventListener("click", () => {
    const expanded = menuBtn.getAttribute("aria-expanded") === "true";
    menuBtn.setAttribute("aria-expanded", String(!expanded));
    topNav.classList.toggle("open");
  });
}

const revealItems = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

revealItems.forEach((item) => revealObserver.observe(item));

const countItems = document.querySelectorAll("[data-count]");

const formatCount = (num, decimals = 0) =>
  Number(num).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const runCount = (el) => {
  const targetRaw = String(el.getAttribute("data-count") || "0");
  const target = Number(targetRaw);
  const decimals = (targetRaw.split(".")[1] || "").length;
  const duration = 1200;
  const start = performance.now();

  const frame = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    let current = progress * target;
    if (decimals === 0) current = Math.floor(current);
    else current = Number(current.toFixed(decimals));
    el.textContent = formatCount(current, decimals);
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = formatCount(target, decimals);
    }
  };

  requestAnimationFrame(frame);
};

const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        runCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.6 }
);

countItems.forEach((item) => countObserver.observe(item));

const availabilityForm = document.querySelector("#availability-form");
const availabilityInput = document.querySelector("#availability-input");
const availabilityDataList = document.querySelector("#na-location-list");
const availabilityStatus = document.querySelector("#availability-status");

const naLocationSuggestions = [
  "Houston, TX",
  "Dallas, TX",
  "Chicago, IL",
  "New York, NY",
  "Savannah, GA",
  "Norfolk, VA",
  "Los Angeles, CA",
  "Long Beach, CA",
  "Seattle, WA",
  "Tacoma, WA",
  "Oakland, CA",
  "Miami, FL",
  "Jacksonville, FL",
  "Atlanta, GA",
  "Baltimore, MD",
  "Memphis, TN",
  "Kansas City, MO",
  "Minneapolis, MN",
  "Detroit, MI",
  "Cleveland, OH",
  "Toronto, ON",
  "Vancouver, BC",
  "Montreal, QC",
  "Calgary, AB",
  "Edmonton, AB",
  "Winnipeg, MB",
  "Halifax, NS",
  "77001",
  "60601",
  "10001",
  "90001",
  "30301",
  "33101",
  "M5H",
  "V6B",
];

const renderAvailabilitySuggestions = (keyword = "") => {
  if (!availabilityDataList) return;
  const query = keyword.trim().toLowerCase();
  const filtered = naLocationSuggestions
    .filter((item) => item.toLowerCase().includes(query))
    .slice(0, 12);
  availabilityDataList.innerHTML = filtered
    .map((item) => `<option value="${item}"></option>`)
    .join("");
};

if (availabilityInput && availabilityDataList) {
  renderAvailabilitySuggestions("");
  availabilityInput.addEventListener("input", () => {
    renderAvailabilitySuggestions(availabilityInput.value);
    if (availabilityStatus) {
      availabilityStatus.textContent = "";
      availabilityStatus.className = "availability-status";
    }
  });
}

const setAvailabilityStatus = (text, type = "") => {
  if (!availabilityStatus) return;
  availabilityStatus.textContent = text;
  availabilityStatus.className = "availability-status";
  if (type) availabilityStatus.classList.add(type);
};

if (availabilityForm) {
  availabilityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = (availabilityInput?.value || "").trim();
    const submitBtn = availabilityForm.querySelector('button[type="submit"]');

    setAvailabilityStatus("");

    if (!query) {
      setAvailabilityStatus("Please enter a city or ZIP code first.", "error");
      return;
    }

    const isZipLike =
      /^[0-9A-Za-z][0-9A-Za-z\- ]{2,10}$/.test(query) && /\d/.test(query);

    if (submitBtn) submitBtn.disabled = true;

    if (isLocalDevHost) {
      const devUrl = new URL("https://inventory.oceanbox.cn");
      if (isZipLike) devUrl.searchParams.set("zip", query);
      else devUrl.searchParams.set("location", query);
      window.open(devUrl.toString(), "_blank", "noopener,noreferrer");
      setAvailabilityStatus(
        "Local development mode: skipping live availability verification.",
        "ok"
      );
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const checkUrl = new URL("/api/check-availability", window.location.origin);
    if (isZipLike) checkUrl.searchParams.set("zip", query);
    else checkUrl.searchParams.set("location", query);

    try {
      const checkResp = await fetch(checkUrl.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const checkJson = await checkResp.json().catch(() => null);

      if (!checkResp.ok || !checkJson?.ok) {
        throw new Error(
          String(
            checkJson?.message ||
              "Unable to verify inventory right now. Please try again shortly."
          )
        );
      }

      if (!checkJson.available) {
        setAvailabilityStatus(
          String(
            checkJson.message ||
              "Sorry, we do not have inventory for this location at the moment."
          ),
          "error"
        );
        return;
      }

      const targetUrl = String(checkJson.url || "");
      if (!targetUrl) {
        throw new Error("Inventory target URL is missing.");
      }

      window.open(targetUrl, "_blank", "noopener,noreferrer");
      setAvailabilityStatus("Inventory found. Opening live listings...", "ok");
    } catch (error) {
      setAvailabilityStatus(
        String(
          error?.message ||
            "Unable to verify inventory right now. Please try again shortly."
        ),
        "error"
      );
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");
const turnstileWidget = document.querySelector("#turnstile-widget");

if (turnstileWidget && captchaRuntime) {
  if (isLocalDevHost) {
    captchaRuntime.textContent =
      "Local development mode: bot verification is bypassed on localhost.";
    captchaRuntime.className = "captcha-runtime ok";
    turnstileWidget.style.display = "none";
  }

  window.setTimeout(() => {
    if (isLocalDevHost) return;
    const loaded = !!window.turnstile;
    if (!loaded) {
      const host = window.location.hostname || "(unknown-host)";
      captchaRuntime.textContent =
        `Verification box did not load on host ${host}. Please check your Turnstile hostname allowlist.`;
      captchaRuntime.className = "captcha-runtime error";
    }
  }, 3000);
}

if (contactForm && formStatus) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formStatus.textContent = "";
    formStatus.className = "form-status";

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const formData = new FormData(contactForm);
    const emailValue = String(formData.get("email") || "").trim();
    const turnstileToken = formData.get("cf-turnstile-response");
    const siteKey = turnstileWidget?.getAttribute("data-sitekey") || "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      formStatus.textContent = "Please provide a valid business email address.";
      formStatus.classList.add("error");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (isLocalDevHost) {
      formData.set("dev_bypass_turnstile", "1");
    }

    if (!isLocalDevHost && !window.turnstile) {
      formStatus.textContent =
        "Bot verification widget did not load. Check Turnstile domain settings and network access.";
      formStatus.classList.add("error");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (!isLocalDevHost && (!siteKey || siteKey.includes("YOUR_TURNSTILE_SITE_KEY"))) {
      formStatus.textContent = "Bot verification is not configured yet. Please set a valid Turnstile site key.";
      formStatus.classList.add("error");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (!isLocalDevHost && !turnstileToken) {
      formStatus.textContent = "Please complete the bot verification before submitting.";
      formStatus.classList.add("error");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (isLocalDevHost) {
      formStatus.textContent =
        "Local dev mode: inquiry captured successfully. Deploy to Cloudflare Pages to test real email delivery.";
      formStatus.classList.add("ok");
      contactForm.reset();
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    try {
      let response;
      try {
        response = await fetch(contactForm.action, {
          method: "POST",
          body: formData,
        });
      } catch (networkError) {
        throw new Error(
          `Request failed before reaching server: ${String(networkError?.message || networkError)}`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      let result = null;
      let rawText = "";

      if (contentType.includes("application/json")) {
        result = await response.json().catch(() => null);
      } else {
        rawText = await response.text().catch(() => "");
      }

      if (!response.ok || !result?.ok) {
        const detail =
          result?.message ||
          rawText.slice(0, 240) ||
          `HTTP ${response.status}`;
        throw new Error(detail);
      }

      formStatus.textContent = result.message || "Inquiry submitted successfully.";
      formStatus.classList.add("ok");
      contactForm.reset();
      if (window.turnstile && typeof window.turnstile.reset === "function") {
        window.turnstile.reset();
      }
    } catch (error) {
      const errMsg = String(error?.message || "");
      if (isLocalDevHost && (/load failed/i.test(errMsg) || /failed to fetch/i.test(errMsg))) {
        formStatus.textContent =
          "Local network request failed. Deploy to Cloudflare Pages to test real submission.";
      } else {
        formStatus.textContent = errMsg || "Submission failed. Please try again.";
      }
      formStatus.classList.add("error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
