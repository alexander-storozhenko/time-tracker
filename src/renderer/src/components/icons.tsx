import type { SVGProps } from 'react'

/**
 * Line icons in the Lucide idiom: 24-unit box, 1.75 stroke, round caps. Drawn
 * here rather than pulled in as a dependency because the app needs a dozen.
 * Every icon is `aria-hidden` — the accessible name lives on the control.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const PauseIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const StopIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Icon>
)

export const PlusIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const TrashIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Icon>
)

export const PencilIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M13.5 6.5 17.5 10.5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
  </Icon>
)

export const ArrowUpIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
)

export const ArrowDownIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
)

export const ClockIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Icon>
)

export const SettingsIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Icon>
)

export const SunIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

export const MoonIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5" />
  </Icon>
)

export const PanelRightIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M14.5 4v16" />
  </Icon>
)

export const GripIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const LayersIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />
  </Icon>
)

export const CloseIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const DownloadIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 4v10M7.5 10.5 12 15l4.5-4.5M4 18.5h16" />
  </Icon>
)

export const FolderIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
)

export const ChartIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
)

export const FlameIcon = (p: SVGProps<SVGSVGElement>): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.7.8-3 1.6-4 .2 1 .9 1.8 1.7 1.8 1 0 1.7-.9 1.7-2.2 0-1.7-.5-3.3-2-4.6z" />
  </Icon>
)
