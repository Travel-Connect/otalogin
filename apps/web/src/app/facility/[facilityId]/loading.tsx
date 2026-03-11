export default function FacilityLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 bg-gray-200 rounded" />
            <div>
              <div className="h-6 w-48 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-100 rounded mt-1" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* チャネルタブ */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="pb-4 px-2 flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-200 rounded-full" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </nav>
        </div>

        {/* チャネル詳細カード */}
        <div className="card">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-gray-200 rounded-full" />
                <div className="h-5 w-24 bg-gray-200 rounded" />
              </div>
              <div className="h-4 w-48 bg-gray-100 rounded mt-2" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-28 bg-gray-200 rounded" />
              <div className="h-8 w-24 bg-blue-200 rounded" />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="h-4 w-16 bg-gray-200 rounded mb-1" />
              <div className="h-5 w-32 bg-gray-100 rounded" />
            </div>
            <div>
              <div className="h-4 w-16 bg-gray-200 rounded mb-1" />
              <div className="h-5 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
