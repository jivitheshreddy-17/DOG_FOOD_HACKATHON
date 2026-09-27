// Placeholder for the SSR gallery — implemented in Module 3.
// run.py checks:
//   GET /projects → HTTP 200 with fixture project titles in the HTML body
//
// This stub returns 200 so the container health check passes.
// Module 3 will replace this with a full SSR page that fetches from
// GET /api/projects and renders all 40+ fixture project titles server-side.

export const dynamic = "force-dynamic"; // disable static generation — always SSR

export default async function ProjectsPage() {
  const backendUrl = process.env.BACKEND_URL || "http://backend:3001";
  
  let projects = [];
  try {
    const res = await fetch(`${backendUrl}/api/projects`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      projects = json.data || [];
    }
  } catch (err) {
    console.error("Failed to fetch projects", err);
  }

  return (
    <main>
      <h1>Project Gallery</h1>
      <ul>
        {projects.map((p: any) => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </main>
  );
}
