/**
 * WordSocket Living Posts - Editor script.
 */
const {
  blocks: { registerBlockType },
  blockEditor: { useBlockProps },
  serverSideRender: ServerSideRender,
  element: { createElement: el },
} = wp;

registerBlockType("wordsocket/living-posts", {
  edit({ attributes }) {
    return el(
      "div",
      useBlockProps({ className: "wpslp-editor-preview" }),
      el(ServerSideRender, {
        block: "wordsocket/living-posts",
        attributes,
      }),
    );
  },
});
