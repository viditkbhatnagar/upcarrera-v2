import { useEffect } from "react";

/**
 * Works around a long-standing Radix UI bug (dialog / select / dropdown / popover):
 * while an overlay is open Radix sets `document.body { pointer-events: none }` and
 * clears it on close — but a fast close→open, an Escape/Cancel, or two overlapping
 * overlays can leave the inline style stuck, so the FIRST click afterwards is
 * swallowed (sidebar links, New Application, the Reports toggle, global search,
 * and the row Edit buttons — QA G1, and Sharon's "edit button isn't functional").
 *
 * We observe body's inline style and, whenever it is locked but NO Radix overlay
 * remains open, clear it on the next frame. The guard only ever REMOVES a stuck
 * lock — it never sets one — and the "no overlay open" check means it cannot race
 * a legitimately open overlay. Mounted once at the app root.
 */
export function BodyPointerEventsGuard() {
  useEffect(() => {
    const body = document.body;
    let raf = 0;

    const anyOverlayOpen = () =>
      document.querySelector(
        '[data-radix-popper-content-wrapper],[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]',
      ) != null;

    const check = () => {
      if (body.style.pointerEvents !== "none") return;
      cancelAnimationFrame(raf);
      // Defer one frame so Radix finishes its own close sequence first.
      raf = requestAnimationFrame(() => {
        if (body.style.pointerEvents === "none" && !anyOverlayOpen()) {
          body.style.pointerEvents = "";
        }
      });
    };

    const observer = new MutationObserver(check);
    observer.observe(body, { attributes: true, attributeFilter: ["style"] });
    check();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
