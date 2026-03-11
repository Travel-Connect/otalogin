import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

interface Props {
  params: Promise<{ slotNo: string }>;
}

/**
 * /shortcuts/slot/[slotNo]
 * Chrome拡張のキーボードショートカットから呼ばれるページ。
 * スロット番号に対応するショートカットを検索し、施設ページにリダイレクトする。
 */
export default async function SlotExecutePage({ params }: Props) {
  const { slotNo } = await params;
  const slotNum = parseInt(slotNo, 10);

  if (isNaN(slotNum) || slotNum < 1 || slotNum > 10) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">無効なスロット番号</h1>
          <p className="text-gray-600">スロット番号は1〜10の範囲で指定してください。</p>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">設定エラー</h1>
          <p className="text-gray-600">Supabaseが設定されていません。</p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">接続エラー</h1>
          <p className="text-gray-600">データベースに接続できません。</p>
        </div>
      </div>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnTo=/shortcuts/slot/${slotNo}`);
  }

  // スロット番号でショートカットを検索
  const { data: shortcut, error } = await supabase
    .from('user_shortcuts')
    .select('*, facilities(id, code), channels(id, code)')
    .eq('slot_no', slotNum)
    .single();

  if (error || !shortcut) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h1 className="text-xl font-bold text-yellow-600 mb-2">
            スロット {slotNum} は未登録です
          </h1>
          <p className="text-gray-600 mb-4">
            ショートカット管理画面でスロット番号を割り当ててください。
          </p>
          <a href="/shortcuts" className="text-blue-600 hover:underline">
            ショートカット管理へ →
          </a>
        </div>
      </div>
    );
  }

  // 施設・チャネル情報を取得
  const facility = shortcut.facilities as unknown as { id: string; code: string } | null;
  const channel = shortcut.channels as unknown as { id: string; code: string } | null;

  if (!facility || !channel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">データエラー</h1>
          <p className="text-gray-600">施設またはチャネルが見つかりません。</p>
        </div>
      </div>
    );
  }

  // アクションタイプに応じたURLにリダイレクト
  if (shortcut.action_type === 'public') {
    redirect(`/facility/${facility.id}?channel=${channel.code}&open=public`);
  } else {
    redirect(`/facility/${facility.id}?channel=${channel.code}&run=1`);
  }
}
