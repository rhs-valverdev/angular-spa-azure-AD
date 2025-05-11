import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'MedicalImageDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

interface ImageRecord {
  id: string; // Using string IDs like UUIDs or timestamps for more robust identification
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: Blob; // Store the image data as a Blob
  createdAt: Date;
}

interface MedicalImageDBSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: ImageRecord;
    indexes: { 'createdAt': Date };
  };
}

let dbPromise: Promise<IDBPDatabase<MedicalImageDBSchema>> | null = null;

const getDb = (): Promise<IDBPDatabase<MedicalImageDBSchema>> => {
  if (!dbPromise) {
    dbPromise = openDB<MedicalImageDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          console.log('IndexedDB object store created:', STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
};


export const saveImageToDB = async (file: File): Promise<string> => {
  const db = await getDb();
  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; // Simple unique ID
  const imageRecord: ImageRecord = {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    data: file, // File object is a Blob, so this is fine
    createdAt: new Date(),
  };
  await db.put(STORE_NAME, imageRecord);
  console.log('Image saved to IndexedDB with id:', id);
  return id;
};

export const getImageFromDB = async (id: string): Promise<ImageRecord | undefined> => {
  const db = await getDb();
  return db.get(STORE_NAME, id);
};

export const getAllImagesMetadataFromDB = async (): Promise<Omit<ImageRecord, 'data'>[]> => {
  const db = await getDb();
  const allRecords = await db.getAllFromIndex(STORE_NAME, 'createdAt');
  // Return records sorted by newest first, without the blob data for performance
  return allRecords.reverse().map(({ data, ...meta }) => meta);
};

export const deleteImageFromDB = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
  console.log('Image deleted from IndexedDB with id:', id);
};

// Initialize DB on load
getDb().then(() => console.log('MedicalImageDB initialized.')).catch(console.error);
