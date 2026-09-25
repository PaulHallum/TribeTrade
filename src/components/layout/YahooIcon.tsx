import React from 'react';

interface YahooIconProps {
  className?: string;
  isColoured?: boolean;
}

export default function YahooIcon({ className = "w-4 h-4", isColoured = true }: YahooIconProps) {
  const fillColor = isColoured ? "#6001D2" : "#9ca3af";

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.5 3H7.8L12 12.8L16.2 3H21.5L14.4 17.5V21H9.6V17.5L2.5 3Z"
        fill={fillColor}
      />
      <circle cx="19.5" cy="19.5" r="2.2" fill={fillColor} />
    </svg>
  );
}
