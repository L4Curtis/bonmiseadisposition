import { useState } from 'react';
import type { SyntheticEvent } from 'react';

// ─── Auto-resize iframe ──────────────────────────────────────────────────────

export function AutoIframe({ srcDoc, title }: { srcDoc: string; title?: string }) {
  const [height, setHeight] = useState(300);

  const handleLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const h = e.currentTarget.contentDocument?.documentElement?.scrollHeight;
    if (h && h > 0) setHeight(h + 16);
  };

  return (
    <iframe
      srcDoc={srcDoc}
      title={title}
      onLoad={handleLoad}
      style={{ width: '100%', height, border: 'none', display: 'block' }}
      sandbox="allow-same-origin"
    />
  );
}
