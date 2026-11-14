import type { ReactNode } from 'react';

interface SvgProps {
  size?: number;
  color?: string;
  children: ReactNode;
}

export function Svg({ size = 22, color = 'currentColor', children }: SvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ACCENT = '#0e7c86';
const GRAY = '#4f5b63';

interface IconProps {
  size?: number;
  color?: string;
}

export const BackIcon = () => <Svg size={20} color={ACCENT}><path d="M15 5l-7 7 7 7" /></Svg>;
export const MailIcon = ({ size = 22, color }: IconProps) => (
  <Svg size={size} color={color}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7.5l8 6 8-6" /></Svg>
);
export const SearchIcon = () => <Svg size={18} color={GRAY}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>;
export const PersonIcon = () => <Svg color={ACCENT}><circle cx="12" cy="8" r="3" /><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /></Svg>;
export const ShieldIcon = () => <Svg color={ACCENT}><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>;
export const BellIcon = () => <Svg color={ACCENT}><path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7z" /><path d="M10 19a2 2 0 0 0 4 0" /></Svg>;
export const LockIcon = () => <Svg color={ACCENT}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const CloseIcon = () => <Svg color="#1b2428"><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const PlusIcon = () => <Svg size={20} color="#fff"><path d="M12 5v14M5 12h14" /></Svg>;
export const AddPersonIcon = () => (
  <Svg color={GRAY}><circle cx="10" cy="8" r="3.5" /><path d="M3 20c0-3.5 3-6 7-6" /><path d="M18 14v6M15 17h6" /></Svg>
);
export const ManageIcon = () => <Svg color={GRAY}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-6 6-6" /><circle cx="17" cy="16" r="2.2" /></Svg>;
export const InboxIcon = ({ color }: IconProps) => (
  <Svg size={24} color={color}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7.5l8 6 8-6" /></Svg>
);
export const StarIcon = ({ color }: IconProps) => (
  <Svg size={24} color={color}><path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" /></Svg>
);
export const SentIcon = ({ color }: IconProps) => (
  <Svg size={24} color={color}><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></Svg>
);
export const DraftIcon = ({ color }: IconProps) => <Svg size={24} color={color}><path d="M5 19l1-4L16 5l3 3L9 18z" /></Svg>;
export const GuestIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="#7fa9ad" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M4 22c0-5 3.6-8 8-8s8 3 8 8z" /></svg>
);

/* ---- ホーム画面のアプリアイコン（64×64の絵。背景の色はCSS側） ---- */
const teeth = [0, 45, 90, 135, 180, 225, 270, 315];

export const AppGearIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    <g fill="#fff">
      {teeth.map((a) => (
        <rect key={a} x="27" y="9" width="10" height="13" rx="2.5" transform={`rotate(${a} 32 32)`} />
      ))}
      <path fillRule="evenodd" d="M32 16a16 16 0 1 0 0 32 16 16 0 1 0 0-32zM32 24.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 1 1 0-15z" />
    </g>
  </svg>
);

export const AppMailIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="11" y="17" width="42" height="30" rx="6" fill="#fff" />
    <path d="M15 22l17 13.5L49 22" fill="none" stroke="#2f80ed" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BackWhiteIcon = () => <Svg size={20} color="#fff"><path d="M15 5l-7 7 7 7" /></Svg>;

export const AppVideoIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M25 19.5v25a2 2 0 0 0 3 1.7l21-12.5a2 2 0 0 0 0-3.4L28 17.8a2 2 0 0 0-3 1.7z" fill="#fff" />
  </svg>
);

export const AppBrowserIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round">
      <circle cx="32" cy="32" r="19" />
      <ellipse cx="32" cy="32" rx="8.5" ry="19" />
      <path d="M13 32h38" />
    </g>
  </svg>
);
