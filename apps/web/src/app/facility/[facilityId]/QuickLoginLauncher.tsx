'use client';

import { useEffect, useRef } from 'react';

interface Props {
  facilityId: string;
  channelCode: string;
  jobId: string;
}

/**
 * ディープリンク run=1 用の即時ランチャー
 * ジョブ作成済みの状態で拡張にDISPATCH_LOGINを送信し、
 * 拡張がこのタブを自動的に閉じる（close_sender_tab: true）
 */
export function QuickLoginLauncher({ facilityId, channelCode, jobId }: Props) {
  const dispatched = useRef(false);

  useEffect(() => {
    if (dispatched.current) return;
    dispatched.current = true;

    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
    if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(extensionId, {
        type: 'DISPATCH_LOGIN',
        payload: { job_id: jobId, close_sender_tab: true },
      });
    } else {
      // 拡張なしの場合は施設詳細にフォールバック
      window.location.replace(`/facility/${facilityId}?channel=${channelCode}`);
    }
  }, [jobId, facilityId, channelCode]);

  return null;
}
