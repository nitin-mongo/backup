import Dashboard from '@/components/Dashboard';
import { DashboardData } from '@/lib/types';
import staticData from '@/data/dashboardData.json';

async function getDashboardData(): Promise<{ data: DashboardData; source: string }> {
  try {
    // During build/SSG, call the API route directly via the db helper
    const { getDb } = await import('@/lib/mongodb');
    const db = await getDb();
    const col = db.collection('dashboard_data');
    let doc = await col.findOne({ _id: 'main' as unknown as never });

    if (!doc) {
      // Seed MongoDB with static JSON on first load
      const seedDoc = {
        _id: 'main' as unknown as never,
        ...(staticData as unknown as DashboardData),
        _seededAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      };
      await col.insertOne(seedDoc);
      return { data: staticData as unknown as DashboardData, source: 'seeded' };
    }

    const { _id, _seededAt, _updatedAt, ...data } = doc as Record<string, unknown>;
    return { data: data as unknown as DashboardData, source: 'mongodb' };
  } catch (err) {
    console.warn('[page.tsx] MongoDB unavailable, using static data:', err);
    return { data: staticData as unknown as DashboardData, source: 'static' };
  }
}

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data, source } = await getDashboardData();
  return <Dashboard data={data} dbSource={source} />;
}
