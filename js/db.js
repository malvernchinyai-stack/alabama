// db.js — tiny IndexedDB wrapper for offline-first storage.
// Stores: settings, clients, catalog, quotes, boqs, invoices

const DB_NAME = 'alabama-electrical-db';
const DB_VERSION = 1;
const STORES = ['settings', 'clients', 'catalog', 'quotes', 'boqs', 'invoices'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export const DB = {
  async getAll(store) {
    const os = await tx(store);
    return new Promise((resolve, reject) => {
      const req = os.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async get(store, id) {
    const os = await tx(store);
    return new Promise((resolve, reject) => {
      const req = os.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
  async put(store, value) {
    const os = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  },
  async delete(store, id) {
    const os = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
  async clear(store) {
    const os = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = os.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
  async exportAll() {
    const dump = {};
    for (const s of STORES) dump[s] = await DB.getAll(s);
    return dump;
  },
  async importAll(dump) {
    for (const s of STORES) {
      if (!dump[s]) continue;
      await DB.clear(s);
      for (const row of dump[s]) await DB.put(s, row);
    }
  },
  STORES,
};

export const DEFAULT_SETTINGS = {
  id: 'settings',
  companyName: 'ALABAMA ELECTRICAL INCORPORATION (Pvt) Ltd',
  tagline: 'Your one stop shop for all your Home, Office, and Industrial Electrical Service Requirements',
  logoDataUrl: '',
  address: 'Harare, Zimbabwe',
  phone: '+263 77 309 5964',
  phone2: '066 219 2445',
  email: 'info@alabama.co.zw',
  website: 'www.alabama.co.zw',
  registrationNumber: '',
  vatNumber: '',
  bankName: 'ZB Bank',
  accountName: 'Denoos Ketule T/A Alabama Electricals',
  accountNumber: '4512086016405',
  branch: 'Jason Moyo',
  swift: '',
  ecocashNumber: '',
  currency: 'USD',
  enableSecondaryCurrency: false,
  secondaryCurrency: 'ZWG',
  exchangeRate: 1,
  vatEnabled: false,
  vatRate: 15,
  quotePrefix: 'ALB-QT-',
  invoicePrefix: 'ALB-INV-',
  boqPrefix: 'ALB-BOQ-',
  nextQuoteNumber: 1,
  nextInvoiceNumber: 1,
  nextBoqNumber: 1,
  quoteValidityDays: 30,
  invoiceDueDays: 14,
  primaryColor: '#002760',
  accentColor: '#F2A93B',
  quoteTerms:
    '1. This quotation is valid for the period stated above.\n2. A 50% deposit is required to confirm the order, balance on completion.\n3. Lead time begins after deposit and site survey confirmation.\n4. Prices are subject to change without notice after expiry of this quote.\n5. Warranty terms apply per manufacturer / supplier specification.',
  invoiceNotes:
    'Payment is due by the date shown above. Please use the invoice number as your payment reference and settle to the bank details provided.',
  updatedAt: new Date().toISOString(),
};

export async function ensureSettings() {
  const existing = await DB.get('settings', 'settings');
  if (existing) {
    // Backfill any newly-added fields for installs upgrading from an older version.
    let changed = false;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (existing[key] === undefined) { existing[key] = DEFAULT_SETTINGS[key]; changed = true; }
    }
    if (changed) await DB.put('settings', existing);
    return existing;
  }
  await DB.put('settings', { ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

export const DEFAULT_CATALOG = [
  { category: 'Solar Panel', name: '450W Monocrystalline Solar Panel', unit: 'pc', unitPrice: 95 },
  { category: 'Solar Panel', name: '550W Monocrystalline Solar Panel', unit: 'pc', unitPrice: 115 },
  { category: 'Inverter', name: '5kVA Hybrid Inverter', unit: 'pc', unitPrice: 650 },
  { category: 'Inverter', name: '8kVA Hybrid Inverter', unit: 'pc', unitPrice: 980 },
  { category: 'Battery', name: '100Ah Lithium (LiFePO4) Battery', unit: 'pc', unitPrice: 420 },
  { category: 'Battery', name: '200Ah Lithium (LiFePO4) Battery', unit: 'pc', unitPrice: 780 },
  { category: 'Solar Package', name: '3kW Residential Solar Package (panels, inverter, battery)', unit: 'set', unitPrice: 2400 },
  { category: 'Solar Package', name: '5kW Residential Solar Package (panels, inverter, battery)', unit: 'set', unitPrice: 3800 },
  { category: 'Mounting', name: 'Roof Mounting Structure (per panel)', unit: 'set', unitPrice: 25 },
  { category: 'Solar Accessories', name: '6mm DC Solar Cable', unit: 'm', unitPrice: 2 },
  { category: 'Solar Accessories', name: 'MC4 Connector Pair', unit: 'pair', unitPrice: 3 },
  { category: 'Solar Accessories', name: 'DC Isolator / Combiner Box', unit: 'pc', unitPrice: 45 },
  { category: 'Solar Accessories', name: 'Charge Controller (MPPT)', unit: 'pc', unitPrice: 120 },
  { category: 'Electrical Installation', name: 'Distribution Board (DB) Supply & Install', unit: 'pc', unitPrice: 180 },
  { category: 'Electrical Installation', name: 'Socket Outlet Point (Supply & Install)', unit: 'point', unitPrice: 25 },
  { category: 'Electrical Installation', name: 'Light Fitting Point (Supply & Install)', unit: 'point', unitPrice: 20 },
  { category: 'Electrical Installation', name: 'House Wiring & Cabling (per point)', unit: 'point', unitPrice: 30 },
  { category: 'Electrical Installation', name: 'Earthing & Lightning Protection', unit: 'lump sum', unitPrice: 150 },
  { category: 'Electrical Installation', name: 'Electrical Certificate of Compliance (COC)', unit: 'pc', unitPrice: 60 },
  { category: 'Labour', name: 'Installation Labour', unit: 'lump sum', unitPrice: 350 },
  { category: 'Labour', name: 'Site Survey & Design', unit: 'lump sum', unitPrice: 50 },
  { category: 'Labour', name: 'Transport / Delivery', unit: 'trip', unitPrice: 40 },
];

export async function seedCatalogIfEmpty() {
  const existing = await DB.getAll('catalog');
  if (existing.length) return;
  for (const item of DEFAULT_CATALOG) {
    await DB.put('catalog', { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...item });
  }
}
