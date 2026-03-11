type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';
type DashboardStatus = 'success' | 'error' | 'running' | 'unregistered' | 'disabled';

interface StatusLampProps {
  status: HealthStatus | DashboardStatus;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<HealthStatus | DashboardStatus, { className: string; title: string }> = {
  healthy: { className: 'bg-green-500', title: '正常' },
  unhealthy: { className: 'bg-red-500', title: 'エラー' },
  unknown: { className: 'bg-gray-400', title: '未確認' },
  success: { className: 'bg-green-500', title: '正常' },
  error: { className: 'bg-red-500', title: 'エラー' },
  running: { className: 'bg-blue-500 animate-pulse', title: '実行中' },
  unregistered: { className: 'bg-gray-400', title: '未登録' },
  disabled: { className: 'bg-gray-300', title: '無効' },
};

export function StatusLamp({ status, size = 'md' }: StatusLampProps) {
  const sizeClass = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const { className, title } = STATUS_STYLES[status];

  return (
    <div
      className={`rounded-full ${sizeClass} ${className}`}
      title={title}
      role="status"
      aria-label={title}
    />
  );
}
