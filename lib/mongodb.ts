import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const dbName = process.env.MONGODB_DB || 'darwin_backup';

function buildClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. In Vercel: Project Settings → Environment Variables → add MONGODB_URI.'
    );
  }
  const client = new MongoClient(uri);
  return client.connect();
}

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === 'development') {
    // Reuse across HMR reloads in development
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = buildClientPromise();
    }
    return global._mongoClientPromise;
  }
  return buildClientPromise();
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}
