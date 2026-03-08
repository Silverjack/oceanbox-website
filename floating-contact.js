(() => {
  const roots = document.querySelectorAll("[data-floating-contact]");
  if (!roots.length) return;

  const emailAddress = "rolly@oceanbox.cn";
  const whatsappNumber = "8613693004024";
  const whatsappText = encodeURIComponent("Hi Rolly, I would like to discuss container availability.");

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const createMenu = (root) => {
    root.classList.add("floating-contact-menu");
    root.setAttribute("aria-label", "Quick Contact");

    root.innerHTML = `
      <a class="floating-contact-menu__item" href="mailto:${emailAddress}" data-tip="Email Rolly" aria-label="Email Rolly">
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M3 6.25A2.25 2.25 0 0 1 5.25 4h13.5A2.25 2.25 0 0 1 21 6.25v11.5A2.25 2.25 0 0 1 18.75 20H5.25A2.25 2.25 0 0 1 3 17.75V6.25Zm2.67-.75L12 10.31l6.33-4.81H5.67Zm13.83 1.39-6.89 5.23a1 1 0 0 1-1.22 0L4.5 6.89v10.86c0 .41.34.75.75.75h13.5c.41 0 .75-.34.75-.75V6.89Z"></path>
        </svg>
      </a>
      <a class="floating-contact-menu__item" href="https://wa.me/${whatsappNumber}?text=${whatsappText}" target="_blank" rel="noopener noreferrer" data-tip="WhatsApp Rolly" aria-label="WhatsApp Rolly">
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.44 0 .07 5.37.07 11.98c0 2.11.55 4.18 1.58 6.01L0 24l6.18-1.62a11.9 11.9 0 0 0 5.86 1.5h.01c6.61 0 11.98-5.37 11.98-11.98 0-3.2-1.25-6.2-3.51-8.42Zm-8.47 18.38h-.01a9.91 9.91 0 0 1-5.06-1.39l-.36-.21-3.67.96.98-3.58-.24-.37a9.88 9.88 0 0 1-1.52-5.28c0-5.45 4.43-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.89a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.87-9.9 9.87Zm5.41-7.38c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.69.15-.2.3-.79.98-.96 1.18-.18.2-.35.23-.65.08-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.48-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.69-1.67-.95-2.29-.25-.6-.5-.52-.69-.53h-.59c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5s1.08 2.88 1.23 3.08c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.49 1.72.63.72.23 1.37.2 1.89.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.31.18-1.43-.08-.13-.28-.2-.58-.35Z"></path>
        </svg>
      </a>
    `;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerFine = window.matchMedia("(pointer:fine)").matches;

    let targetY = window.innerHeight * 0.62;
    let currentY = targetY;

    const getBounds = () => ({
      min: 90,
      max: Math.max(100, window.innerHeight - 90),
    });

    const applyPosition = (y) => {
      root.style.setProperty("--floating-y", `${y}px`);
    };

    const onMove = (event) => {
      const { min, max } = getBounds();
      targetY = clamp(event.clientY, min, max);
    };

    const onResize = () => {
      const { min, max } = getBounds();
      targetY = clamp(targetY, min, max);
    };

    const animate = () => {
      if (reduceMotion || !pointerFine) {
        currentY = targetY;
      } else {
        currentY += (targetY - currentY) * 0.16;
      }
      applyPosition(currentY);
      window.requestAnimationFrame(animate);
    };

    if (pointerFine) {
      window.addEventListener("mousemove", onMove, { passive: true });
    }
    window.addEventListener("resize", onResize, { passive: true });
    onResize();
    applyPosition(currentY);
    window.requestAnimationFrame(animate);
  };

  roots.forEach(createMenu);
})();
