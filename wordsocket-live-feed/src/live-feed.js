/**
 * WordSocket Live Feed - Interactivity API store.
 */

import { store, getServerState } from "@wordpress/interactivity";

const CARD_SELECTOR = ".wpslf-item";
const DURATION = 300;

const { state } = store("wordsocket/live-feed", {
  state: {
    ...getServerState(),
  },
});

const cards = () => document.querySelectorAll(CARD_SELECTOR);

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Record where every card sits, apply the state change, then animate
 * each surviving card from its old position to its new one.
 */
const animateCards = (mutate) => {
  if (prefersReducedMotion()) {
    mutate();
    return;
  }

  const before = new Map(
    [...cards()].map((el) => [el.dataset.postId, el.getBoundingClientRect()]),
  );
  mutate();

  requestAnimationFrame(() => {
    for (const el of cards()) {
      const first = before.get(el.dataset.postId);
      if (!first) continue; // brand-new card: nothing to slide from

      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (!dx && !dy) continue; // did not move

      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: DURATION, easing: "ease" },
      );
    }
  });
};

/**
 * Handle the `livefeed.updated` event.
 */
WPS.on("livefeed.updated", (updatedPost) => {
  animateCards(() => {
    const posts = [...state.posts];
    const index = posts.findIndex((p) => p.postId === updatedPost.postId);
    if (index >= 0) {
      posts[index] = { ...posts[index], ...updatedPost };
    } else {
      posts.unshift(updatedPost);
    }
    // Match wp-admin: newest first, ties broken by oldest id first.
    state.posts = posts.sort(
      (a, b) => new Date(b.date) - new Date(a.date) || a.postId - b.postId,
    );
  });
});


/**
 * Handle the `livefeed.deleted` event.
 */
WPS.on("livefeed.deleted", ({ postId }) => {
  if (!state.posts.some((p) => p.postId === postId)) {
    return; // not in the current feed
  }
  animateCards(() => {
    state.posts = state.posts.filter((p) => p.postId !== postId);
  });
});
