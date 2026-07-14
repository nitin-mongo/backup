import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { DashboardData } from '@/lib/types';
import staticData from '@/data/dashboardData.json';

const COLLECTION = 'dashboard_data';
const DOC_ID = 'main';

/**
 * GET /api/data
 * Returns the dashboard data from MongoDB.
 * If MongoDB is empty, seeds it with the static JSON first.
 */
export async function GET() {
  try {
    const db = await getDb();
    const col = db.collection(COLLECTION);

    let doc = await col.findOne({ _id: DOC_ID as unknown as never });

    if (!doc) {
      // Seed the database with the static JSON data
      const seedDoc = {
        _id: DOC_ID as unknown as never,
        ...(staticData as unknown as DashboardData),
        _seededAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      };
      await col.insertOne(seedDoc);
      doc = seedDoc;
    }

    // Remove MongoDB internal _id before returning
    const { _id, ...data } = doc as Record<string, unknown>;
    return NextResponse.json({ success: true, data, source: _id ? 'mongodb' : 'seed' });
  } catch (err) {
    console.error('[GET /api/data] MongoDB error:', err);
    // Fall back to static data if MongoDB is unreachable
    return NextResponse.json({ success: true, data: staticData, source: 'static' });
  }
}

/**
 * POST /api/data
 * Accepts updated dashboard data (after CSV upload analysis) and persists it.
 * Body: { months, monthly_totals, clusters, partialMonths, ... }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<DashboardData>;

    if (!body.months || !body.monthly_totals || !body.clusters) {
      return NextResponse.json({ success: false, error: 'Invalid payload: missing required fields' }, { status: 400 });
    }

    const db = await getDb();
    const col = db.collection(COLLECTION);

    const update = {
      ...body,
      _updatedAt: new Date().toISOString(),
    };

    await col.updateOne(
      { _id: DOC_ID as unknown as never },
      { $set: update },
      { upsert: true }
    );

    return NextResponse.json({ success: true, message: 'Dashboard data saved to MongoDB Atlas', updatedAt: update._updatedAt });
  } catch (err) {
    console.error('[POST /api/data] MongoDB error:', err);
    return NextResponse.json({ success: false, error: 'Failed to save data to MongoDB' }, { status: 500 });
  }
}
