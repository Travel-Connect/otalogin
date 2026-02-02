import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FacilityList } from '@/components/FacilityList';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">
            OTAログイン支援ツール
          </h1>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="btn btn-secondary text-sm">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-6">施設一覧</h2>
        <FacilityList />
      </main>
    </div>
  );
}
