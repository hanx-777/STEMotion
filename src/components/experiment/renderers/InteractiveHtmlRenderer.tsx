'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ExperimentConfig } from '@/lib/schema/experiment';
import { useWidgetIframeStore } from '@/lib/stores/widgetIframeStore';
import { INTERACTIVE_WIDGET_IFRAME_SANDBOX, patchHtmlForIframe } from '@/lib/utils/iframe';

export default function InteractiveHtmlRenderer({ config }: { config: ExperimentConfig }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const registerIframe = useWidgetIframeStore((state) => state.registerIframe);
  const setActiveExperiment = useWidgetIframeStore((state) => state.setActiveExperiment);

  const patchedHtml = useMemo(
    () => patchHtmlForIframe(config.interactiveWidget?.html ?? ''),
    [config.interactiveWidget?.html],
  );

  const sendMessage = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      const allowed = config.interactiveWidget?.allowedMessageTypes ?? [];
      if (!allowed.includes(type as (typeof allowed)[number])) return;

      iframeRef.current?.contentWindow?.postMessage({ type, ...payload }, '*');
    },
    [config.interactiveWidget?.allowedMessageTypes],
  );

  useEffect(() => {
    registerIframe(config.id, sendMessage);
    setActiveExperiment(config.id);

    return () => {
      registerIframe(config.id, null);
      setActiveExperiment(null);
    };
  }, [config.id, registerIframe, sendMessage, setActiveExperiment]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={patchedHtml}
      className="absolute inset-0 h-full w-full border-0 bg-slate-50"
      title={`${config.title} interactive experiment`}
      sandbox={INTERACTIVE_WIDGET_IFRAME_SANDBOX}
    />
  );
}
