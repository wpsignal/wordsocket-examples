/**
 * WordSocket Live Feed - Interactivity API store.
 */

import { store, getContext, getServerState } from "@wordpress/interactivity";

const COLUMNS = 3;

const { state } = store("wordsocket/live-feed", {
  state: {
    ...getServerState(),
  },
});

/**
 * Listen for WPSignal `post.published` events dispatched by the WPSignal
 * client as `wpsignal:post.published` CustomEvents on `document`.
 */
const on = WPS.on("livefeed.updated", (post, event) => {
  if (!post || !post.id) {
    return;
  }

  const postIndex = state.posts.findIndex((p) => p.id === post.id);
  let posts = [...state.posts];
  if (postIndex >= 0) {
    posts[postIndex] = { ...posts[postIndex], ...post };
  } else {
    posts.unshift(post);
  }

  const sortedByDate = posts.sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  state.posts = sortedByDate.map((p, index) => {
    const col = (index % COLUMNS) + 1;
    return {
      ...p,
      index: String(index),
      prevColumn: p.column ?? String(col),
      column: String(col),
      row: String(Math.floor(index / COLUMNS) + 1),
      prevRow: p.row ?? String(Math.floor(index / COLUMNS) + 1),
    };
  });
});
