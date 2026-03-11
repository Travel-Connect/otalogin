import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { ChannelLogoSettings } from './ChannelLogoSettings';

export default async function ChannelLogosPage() {
  if (!isSupabaseConfigured()) {
    redirect('/login');
  }

  const supabase = await createClient();
  if (!supabase) {
    redirect('/login');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: channels } = await supabase
    .from('channels')
    .select('id, code, name, logo_url, bg_color, category')
    .order('name');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </a>
            <h1 className="text-lg font-semibold text-gray-900">チャネルロゴ設定</h1>
          </div>
        </div>
      </header>
      <ChannelLogoSettings channels={channels || []} />
    </div>
  );
}
