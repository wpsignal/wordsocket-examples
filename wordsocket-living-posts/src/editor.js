/**
 * WordSocket Live Feed - Editor script.
 */
const {
  blocks: { registerBlockType },
  serverSideRender: ServerSideRender,
  element: { createElement: el },
} = wp;

registerBlockType("wordsocket/live-feed", {
  edit({ attributes }) {
    return el(ServerSideRender, {
      block: "wordsocket/live-feed",
      attributes,
    });
  },
});
