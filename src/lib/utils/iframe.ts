// allow-scripts only: srcdoc iframes have origin "null", so allow-same-origin is not needed.
// Removing it prevents LLM-generated code from accessing the parent window's storage/DOM.
export const INTERACTIVE_WIDGET_IFRAME_SANDBOX = 'allow-scripts';

export function patchHtmlForIframe(html: string): string {
  const iframePatch = `<style data-stemotion-iframe-patch>
html, body {
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  background: #f8fafc;
}
* {
  box-sizing: border-box;
}
</style>`;

  const headMatch = html.match(/<head[^>]*>/i);
  if (!headMatch || headMatch.index === undefined) {
    return iframePatch + html;
  }

  const insertAt = headMatch.index + headMatch[0].length;
  return `${html.slice(0, insertAt)}\n${iframePatch}${html.slice(insertAt)}`;
}
