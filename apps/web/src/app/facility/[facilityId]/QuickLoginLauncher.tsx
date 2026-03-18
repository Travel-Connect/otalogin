'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  facilityId: string;
  channelCode: string;
  jobId: string;
}

/**
 * ディープリンク run=1 用の即時ランチャー
 * ジョブ作成済みの状態で拡張にDISPATCH_LOGINを送信し、
 * 即座に施設詳細ページにリダイレクトする（中間画面なし）
 */
export function QuickLoginLauncher({ facilityId, channelCode, jobId }: Props) {
  const dispatched = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (dispatched.current) return;
    dispatched.current = true;

    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
    if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(extensionId, {
        type: 'DISPATCH_LOGIN',
        payload: { job_id: jobId },
      });
    }

    // 即座に施設詳細ページにリダイレクト（run=1 なしで無限ループ防止）
    router.replace(`/facility/${facilityId}?channel=${channelCode}`);
  }, [jobId, facilityId, channelCode, router]);

  // リダイレクトまでの一瞬だけ表示（ほぼ見えない）
  return null;
}
