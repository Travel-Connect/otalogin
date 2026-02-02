import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { FacilityList } from '@/components/FacilityList';

export default async function HomePage() {
  // Supabase未設定の場合は開発モードとして動作
  const isDevelopmentMode = !isSupabaseConfigured();

  if (!isDevelopmentMode) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        redirect('/login');
      }
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">
            OTAログイン支援ツール
          </h1>
          <div className="flex items-center gap-4">
            {isDevelopmentMode && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                開発モード（Supabase未設定）
              </span>
            )}
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="btn btn-secondary text-sm">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-6">施設一覧</h2>
        <FacilityList />
      </main>
    </div>
  );
}
