export function AnalyticsLockedIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h5.75" />
      <path d="M18 9.75V9" />
      <path d="M13 13.4V5" />
      <path d="M8 17v-3" />
      <rect width="8" height="5" x="14" y="17" rx="1" />
      <path d="M20 17v-2a2 2 0 1 0-4 0v2" />
    </svg>
  );
}
