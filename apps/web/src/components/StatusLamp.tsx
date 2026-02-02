interface StatusLampProps {
  status: 'healthy' | 'unhealthy' | 'unknown';
  size?: 'sm' | 'md';
}

export function StatusLamp({ status, size = 'md' }: StatusLampProps) {
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const statusClass = {
    healthy: 'status-lamp-healthy',
    unhealthy: 'status-lamp-unhealthy',
    unknown: 'status-lamp-unknown',
  }[status];

  const title = {
    healthy: '正常',
    unhealthy: 'エラー',
    unknown: '未確認',
  }[status];

  return (
    <div
      className={`status-lamp ${sizeClass} ${statusClass}`}
      title={title}
      role="status"
      aria-label={title}
    />
  );
}
