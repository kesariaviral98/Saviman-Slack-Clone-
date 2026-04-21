/**
 * Avatar — shows a user's profile photo or their initials as a coloured fallback.
 *
 * Props:
 *   user   — { displayName, avatarUrl }
 *   size   — 'xs' | 'sm' | 'md' | 'lg'  (default 'md')
 *   className — extra classes
 */

const SIZE_MAP = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

const COLOR_PALETTE = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-fuchsia-500',
];

function colorForName(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Avatar({ user, size = 'md', className = '' }) {
  const sizeClasses = SIZE_MAP[size] ?? SIZE_MAP.md;
  const name = user?.displayName ?? '?';

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={name}
        className={`${sizeClasses} rounded-md object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      className={`${sizeClasses} ${colorForName(name)} rounded-md flex items-center justify-center font-bold text-white flex-shrink-0 select-none ${className}`}
    >
      {initials(name)}
    </span>
  );
}
