// LunaSol mark: a Moon lit as a crescent from the upper right, where the Sun sits off its limb.
// The night side is a dark grey rather than black so the full disc still reads on a black page.

import { useId } from "react";

export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx="15" cy="17" r="11" />
        </clipPath>
      </defs>
      <circle cx="15" cy="17" r="11" fill="#e8e8e8" />
      <circle cx="11.2" cy="20.4" r="10.2" fill="#262626" clipPath={`url(#${clip})`} />
      <circle cx="15" cy="17" r="11" fill="none" stroke="#3a3a3a" strokeWidth="0.6" />
      <circle cx="27.2" cy="5.2" r="2.9" fill="#f5b942" />
    </svg>
  );
}
