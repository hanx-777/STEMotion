'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { InteractionArtifact } from '@/lib/deep-interaction/types';
import { useDeepWidgetIframeStore } from '@/lib/stores/deepWidgetIframeStore';
import { INTERACTIVE_WIDGET_IFRAME_SANDBOX, patchHtmlForIframe } from '@/lib/utils/iframe';

export default function HtmlWidgetRenderer({ artifact }: { artifact: InteractionArtifact }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const registerIframe = useDeepWidgetIframeStore((state) => state.registerIframe);
  const setActiveArtifact = useDeepWidgetIframeStore((state) => state.setActiveArtifact);
  const widget = artifact.schema.htmlWidget;

  const patchedHtml = useMemo(
    () => patchHtmlForIframe(widget?.html ?? ''),
    [widget?.html],
  );

  const sendMessage = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      const allowed = widget?.allowedMessageTypes ?? [];
      if (!allowed.includes(type as (typeof allowed)[number])) return;
      iframeRef.current?.contentWindow?.postMessage({ type, ...payload }, '*');
    },
    [widget?.allowedMessageTypes],
  );

  useEffect(() => {
    registerIframe(artifact.id, sendMessage);
    setActiveArtifact(artifact.id);

    return () => {
      registerIframe(artifact.id, null);
      setActiveArtifact(null);
    };
  }, [artifact.id, registerIframe, sendMessage, setActiveArtifact]);

  if (!widget?.html) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        这个交互还没有可渲染的 HTML Widget。
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
      <iframe
        ref={iframeRef}
        srcDoc={patchedHtml}
        className="absolute inset-0 h-full w-full border-0 bg-slate-50"
        title={`${artifact.title} interactive widget`}
        sandbox={INTERACTIVE_WIDGET_IFRAME_SANDBOX}
      />
    </div>
  );
}
