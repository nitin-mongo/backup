import Dashboard from '@/components/Dashboard';
import { DashboardData } from '@/lib/types';
import staticData from '@/data/dashboardData.json';

async function getDashboardData(): Promise<{ data: DashboardData; source: string }> {
  try {
    const { getDb } = await import('@/lib/mongodb');
    const db = await getDb();
    const col = db.collection('dashboard_data');
    const now = new Date().toISOString();

    // Idempotent upsert — only seeds the doc if it doesn't already exist
    await col.updateOne(
      { _id: 'main' as unknown as never },
      {
        $setOnInsert: {
          ...(staticData as unknown as DashboardData),
          _seededAt: now,
          _updatedAt: now,
        },
      },
      { upsert: true }
    );

    const doc = await col.findOne({ _id: 'main' as unknown as never });
    if (!doc) throw new Error('Document not found after upsert');

    const { _id, _seededAt, _updatedAt, ...data } = doc as Record<string, unknown>;
    return { data: data as unknown as DashboardData, source: 'mongodb' };
  } catch (err) {
    console.warn('[page.tsx] MongoDB error, falling back to static data:', err);
    return { data: staticData as unknown as DashboardData, source: 'static' };
  }
}

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data, source } = await getDashboardData();
  return <Dashboard data={data} dbSource={source} />;
}
