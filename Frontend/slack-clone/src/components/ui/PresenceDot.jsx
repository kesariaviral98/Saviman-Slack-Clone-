/**
 * PresenceDot — small coloured indicator for a user's online/status state.
 *
 * Props:
 *   isOnline — bool
 *   status   — 'active' | 'away' | 'dnd' | 'invisible'
 *   size     — 'sm' | 'md'
 *   className
 */
export default function PresenceDot({ isOnline, status = 'active', size = 'sm', className = '' }) {
  const sizeCls = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  let colorCls = 'bg-gray-400'; // offline default
  if (isOnline) {
    if (status === 'dnd') colorCls = 'bg-red-500';
    else if (status === 'away') colorCls = 'bg-yellow-400';
    else colorCls = 'bg-green-500'; // active / invisible treated as online-dot
  }

  return (
    <span
      className={`${sizeCls} ${colorCls} rounded-full border-2 border-white flex-shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}
