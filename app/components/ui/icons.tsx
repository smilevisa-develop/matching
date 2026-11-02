import type { SVGProps } from "react";

// アイコンはこの1セットだけを使う。線幅 1.75・塗りなし・色は文字と同じ（currentColor）。
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7.5" r="3.25" />
      <path d="M21 20v-1.5a4 4 0 0 0-3-3.85" />
      <path d="M15.5 4.4a3.25 3.25 0 0 1 0 6.2" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13.5a4.5 4.5 0 0 0 6.4.3l3-3a4.5 4.5 0 0 0-6.4-6.3l-1.5 1.5" />
      <path d="M14 10.5a4.5 4.5 0 0 0-6.4-.3l-3 3a4.5 4.5 0 0 0 6.4 6.3l1.5-1.5" />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 10v4a1 1 0 0 0 1 1H7l7 4.5v-15L7 9H4.5a1 1 0 0 0-1 1z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
      <path d="M7 15v4.5" />
    </Icon>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Icon>
  );
}

export function GroupIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" />
      <path d="m9 13 2 2 4-4" />
    </Icon>
  );
}

export function FormIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h1.5" />
      <path d="M9 6h11" />
      <path d="M4 12h1.5" />
      <path d="M9 12h11" />
      <path d="M4 18h1.5" />
      <path d="M9 18h11" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3.5 10.5h17" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 6-6 6 6 6" />
    </Icon>
  );
}

export function ChevronUpDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 9 4-4 4 4" />
      <path d="m8 15 4 4 4-4" />
    </Icon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

/* ここから下は SMILE MATCHING で足したもの (線幅などは上と同じ) */

export function ListCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 6.5 1.5 1.5 3-3" />
      <path d="m3.5 16.5 1.5 1.5 3-3" />
      <path d="M12 7h9" />
      <path d="M12 17h9" />
    </Icon>
  );
}

export function BoardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M8 8v7" />
      <path d="M12 8v3" />
      <path d="M16 8v9" />
    </Icon>
  );
}

export function UserCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7.5" r="3.25" />
      <path d="m16 11 2 2 3.5-4" />
    </Icon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </Icon>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M9 8h.01" />
      <path d="M15 8h.01" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
      <path d="M10 20.5V16h4v4.5" />
    </Icon>
  );
}

export function BriefcaseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3.5 13h17" />
    </Icon>
  );
}

export function StarListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 4 1.2 2.6 2.8.3-2.1 1.9.6 2.8L7 10.2l-2.5 1.4.6-2.8L3 6.9l2.8-.3z" />
      <path d="M14 7h7" />
      <path d="M3.5 16h17" />
      <path d="M3.5 20h12" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4z" />
      <path d="M9 8.5h6" />
      <path d="M9 12.5h6" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z" />
    </Icon>
  );
}

export function BarChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20.5h16" />
      <path d="M7 17v-5" />
      <path d="M12 17V6" />
      <path d="M17 17V9.5" />
    </Icon>
  );
}

export function YenIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.5 4 5.5 8 5.5-8" />
      <path d="M12 12v8.5" />
      <path d="M7.5 13h9" />
      <path d="M7.5 16.5h9" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h12l-2.5 4 2.5 4h-12" />
    </Icon>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5" />
      <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9l2.4 2.4" />
      <path d="M20.5 3.5v5h-5" />
      <path d="M3.5 20.5v-5h5" />
    </Icon>
  );
}
