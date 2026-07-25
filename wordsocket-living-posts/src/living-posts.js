/**
 * WordSocket Living Posts - Interactivity API store.
 */

import { store, getServerState } from "@wordpress/interactivity";

const CARD_SELECTOR = ".wpslp-item";
const DURATIONS = {
  move: 300,
  flash: 1000,
  exit: 400,
};
const STATE_BG_COLORS = {
  updated: "#bbf7d0",
  deleted: "#fecaca",
};

const { state } = store("wordsocket/living-posts", {
  state: {
    ...getServerState(),
  },
});

const cards = () => document.querySelectorAll(CARD_SELECTOR);

// Deletions committed on a delay, keyed by post ID. A post that comes back
// before its removal commits (bulk trash then undo) must cancel it.
const pendingDeletes = new Map();

/**
 * Abandon a scheduled removal and clear the exit animation's `fill` so a
 * restored card is not left faded out.
 *
 * @param postId Post ID whose pending removal should be dropped.
 */
function cancelPendingDelete(postId) {
  const pending = pendingDeletes.get(postId);
  if (!pending) {
    return;
  }

  pending.cancelled = true;
  pending.animation?.cancel();
  pendingDeletes.delete(postId);
}

/**
 * Resolver function to retrieve a card by its post ID.
 *
 * @param postId Post ID data attribute value.
 * @returns DOM element with the given post ID.
 */
function cardById(postId) {
  return document.querySelector(`${CARD_SELECTOR}[data-post-id="${postId}"]`);
}

/**
 * Check if the user has enabled reduced motion.
 *
 * @returns True if the user has enabled reduced motion, false otherwise.
 */
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Record where every card sits, apply the state change, then animate
 * each surviving card from its old position to its new one.
 */
function animateCards(mutateCallback) {
  if (prefersReducedMotion()) {
    mutateCallback();
    return;
  }

  const before = new Map(
    [...cards()].map((el) => [el.dataset.postId, el.getBoundingClientRect()]),
  );
  mutateCallback();

  requestAnimationFrame(() => {
    for (const el of cards()) {
      const first = before.get(el.dataset.postId);

      // Brand-new card: nothing to slide from.
      if (!first) {
        continue;
      }

      const last = el.getBoundingClientRect();
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;

      // Card did not move.
      if (!deltaX && !deltaY) {
        continue;
      }

      el.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "none" },
        ],
        { duration: DURATIONS.move, easing: "ease" },
      );
    }
  });
}

/**
 * WPSignal: Handle the `livingposts.updated` event.
 */
WPS.on("lp.updated", (updatedPost) => {
  cancelPendingDelete(updatedPost.postId);

  animateCards(() => {
    const posts = [...state.posts];
    const index = posts.findIndex((p) => p.postId === updatedPost.postId);
    if (index >= 0) {
      posts[index] = { ...posts[index], ...updatedPost };
    } else {
      posts.unshift(updatedPost);
    }

    // Same order as in `render.php`. post_date strings ("YYYY-MM-DD HH:MM:SS")
    state.posts = posts.sort(
      (a, b) => b.date.localeCompare(a.date) || a.postId - b.postId,
    );
  });

  // Flash after the re-render so a freshly inserted card exists in the DOM.
  requestAnimationFrame(() => {
    const el = cardById(updatedPost.postId);
    if (!el || prefersReducedMotion()) {
      return;
    }
    const base = getComputedStyle(el).backgroundColor;
    el.animate(
      [{ backgroundColor: STATE_BG_COLORS.updated }, { backgroundColor: base }],
      { duration: DURATIONS.flash, easing: "ease-out" },
    );
  });
});

/**
 * WPSignal: Handle the `livingposts.deleted` event.
 */
WPS.on("lp.deleted", ({ postId }) => {
  if (!state.posts.some((p) => p.postId === postId)) {
    return; // not in existing cards
  }

  if (pendingDeletes.has(postId)) {
    return; // already on its way out
  }

  const pending = { cancelled: false, animation: null };
  pendingDeletes.set(postId, pending);

  const removeFromFeed = () => {
    if (pending.cancelled) {
      return; // post came back before the removal landed
    }

    pendingDeletes.delete(postId);
    animateCards(() => {
      state.posts = state.posts.filter((p) => p.postId !== postId);
    });
  };

  const el = cardById(postId);
  if (!el || prefersReducedMotion()) {
    removeFromFeed();
    return;
  }

  // Flash red and fade out, then remove and let the survivors slide up.
  pending.animation = el.animate(
    [
      { backgroundColor: STATE_BG_COLORS.deleted, opacity: 1 },
      { backgroundColor: STATE_BG_COLORS.deleted, opacity: 0 },
    ],
    { duration: DURATIONS.exit, easing: "ease-in", fill: "forwards" },
  );

  // Hidden tabs freeze the document timeline, so `finished` can stall for as
  // long as the window is off screen. Commit on whichever settles first.
  Promise.race([
    pending.animation.finished.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, DURATIONS.exit + 100)),
  ]).then(removeFromFeed);
});
