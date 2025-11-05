'use client';

import { useEffect, useState } from 'react';

export default function BackgroundVideo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      crossOrigin="anonymous"
      src="/background.mp4"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: -1,
        pointerEvents: 'none',
        backgroundColor: '#000'
      }}
      suppressHydrationWarning
    />
  );
}


