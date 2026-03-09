import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { ShortcutManager } from './ShortcutManager';

export default async function ShortcutsPage() {
  const isDevelopmentMode = !isSupabaseConfigured();

  if (isDevelopmentMode) {
    return (
      <ShortcutManager
        facilities={[]}
        channels={[]}
      />
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    redirect('/login');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?returnTo=/shortcuts');
  }

  // 施設・チャネル一覧を取得（ショートカット作成時の選択肢）
  const [facilitiesResult, channelsResult] = await Promise.all([
    supabase.from('facilities').select('id, name, code').order('code'),
    supabase.from('channels').select('id, name, code').order('code'),
  ]);

  return (
    <ShortcutManager
      facilities={facilitiesResult.data || []}
      channels={channelsResult.data || []}
    />
  );
}
