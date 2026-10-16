// Step 1 "hello" page: proves the app builds, deploys and installs on the phone.
export default function App() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', textAlign: 'center', padding: 24 }}>
      <div>
        <img src={`${import.meta.env.BASE_URL}pwa-192.png`} alt="" width={120} height={120} />
        <h1 style={{ fontSize: '2.4rem', margin: '16px 0 8px' }}>Darts Scorer</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>Hello! The app is installed and ready to build on.</p>
      </div>
    </main>
  )
}
