/**
 * WordSocket Living Posts - Editor script.
 */
const {
  blocks: { registerBlockType },
  serverSideRender: ServerSideRender,
  element: { createElement: el },
} = wp;

registerBlockType("wordsocket/living-posts", {
  edit({ attributes }) {
    return el(ServerSideRender, {
      block: "wordsocket/living-posts",
      attributes,
    });
  },
});
