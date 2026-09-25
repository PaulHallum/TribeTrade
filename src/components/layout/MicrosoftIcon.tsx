import React from 'react';

interface MicrosoftIconProps {
  className?: string;
  isColoured?: boolean;
}

export default function MicrosoftIcon({ className = "w-4 h-4", isColoured = true }: MicrosoftIconProps) {
  if (!isColoured) {
    return (
      <svg viewBox="0 0 23 23" className={className} fill="currentColor">
        <rect x="1" y="1" width="10" height="10" fill="#9ca3af" />
        <rect x="12" y="1" width="10" height="10" fill="#9ca3af" />
        <rect x="1" y="12" width="10" height="10" fill="#9ca3af" />
        <rect x="12" y="12" width="10" height="10" fill="#9ca3af" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 23 23" className={className}>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
