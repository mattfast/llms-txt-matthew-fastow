export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-semibold text-lg tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M3 7l9 5 9-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 12v10" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span>llms.txt</span>
      <span className="text-foreground-muted font-normal text-sm ml-1">by Profound</span>
    </div>
  );
}
