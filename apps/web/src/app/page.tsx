export default function HomePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return (
    <main style={{ padding: '2rem' }}>
      <h1>EquipCare AI</h1>
      <p>Baseline locked — M0 scaffold.</p>
      <p>
        API target:{' '}
        <a href={`${apiUrl}/healthz`} target="_blank" rel="noreferrer">
          {apiUrl}/healthz
        </a>
      </p>
      <p>
        Swagger:{' '}
        <a href={`${apiUrl}/docs`} target="_blank" rel="noreferrer">
          {apiUrl}/docs
        </a>
      </p>
    </main>
  );
}
