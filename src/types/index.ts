export type TransactionType = 'expense' | 'income';
export type Payer = 'Shi' | 'Ortal' | 'Joint';
export type PaymentMethod = 'אשראי' | 'מזומן' | 'העברה' | 'ביט' | "צ'ק" | 'הוראת קבע';
export type ExpenseClass = 'קבועה' | 'משתנה';
export type TransactionStatus = 'paid' | 'pending' | 'future';

export const CATEGORIES = [
  'מצרכים', 'אוכל בחוץ', 'דיור', 'רכב', 'דלק', 'ילדים',
  'ביגוד', 'בריאות', 'ספורט', 'לימודים', 'פנאי', 'ביטוחים', 'תקשורת', 'חשבונות', 'מתנות/אירועים', 'השקעה', 'הוצאות עבודה', 'שונות',
] as const;

export const INCOME_CATEGORIES = [
  'משכורת', 'בונוס', 'מתנה', 'מכירה', 'מופ"ת מילואים', 'קצבת ילדים',
  'שכר דירה', 'החזר רכב ממוטי', 'ריבית זכות', 'החזר ביטוחי',
  'החזר הוצאות עבודה', 'החזר מגורם אחר', 'ESPP',
] as const;

export type Category = typeof CATEGORIES[number];
export type IncomeCategory = typeof INCOME_CATEGORIES[number];

export const PAYMENT_METHODS: PaymentMethod[] = ['אשראי', 'מזומן', 'העברה', 'ביט', "צ'ק", 'הוראת קבע'];

export const ASSET_OWNERS = ['Shi', 'Ortal', 'Yuval', 'Aviv', 'Ziv', 'Joint', 'Car_Private', 'Apt_Rent', 'Apt_Own'] as const;
export type AssetOwner = typeof ASSET_OWNERS[number];

export const ASSET_INSURANCE_TYPES = [
  'פנסיה', 'חיים', 'ריסק', 'מנהלים', 'אובדן כושר עבודה', 'מחלות קשות',
  'בריאות', 'שיניים', 'סיעוד', 'קופת חולים', 'אבחון מהיר באסותא',
  'מבנה', 'תכולה', 'מבנה + תכולה',
  'רכב - חובה', 'רכב - מקיף', 'רכב - צד שלישי',
  'משכנתא', 'כללי',
] as const;

export const ASSET_INVESTMENT_TYPES = [
  'ניירות ערך', 'עו"ש', 'מט"ח', 'קרקע', 'נדל"ן',
  'קרן השתלמות', 'קופת גמל להשקעה', 'קופת גמל להשקעה - ילדים',
  'חיסכון לכל ילד', 'מניות RSU', 'חשבון מסחר עצמאי', 'קריפטו', 'אחר',
] as const;

export const ASSET_TYPES = [...ASSET_INSURANCE_TYPES, ...ASSET_INVESTMENT_TYPES] as const;
export type AssetType = typeof ASSET_TYPES[number];

export type AssetClass = 'ביטוח/קרן' | 'נכס/השקעה';
export type RiskLevel = 'סולידי' | 'מנייתי' | 'כללי' | 'נדל"ן';

export interface Transaction {
  id: string;
  date: string;
  created_at?: number;
  type: TransactionType;
  category: Category;
  sub_category?: string;
  amount: number;
  payer: Payer;
  payment_method: PaymentMethod;
  expense_class: ExpenseClass;
  notes?: string;
  installments?: number;
  status: TransactionStatus;
}

export interface Budget {
  id: string;
  month: string;
  total_limit: number;
  category_limits: Record<string, number>;
  alert_threshold: number;
}

export interface MileageSettings {
  id: string;
  car_receipt_date: string; // YYYY-MM-DD
  yearly_km_limit: number;
  created_at?: number;
}

export interface MileageReading {
  id: string;
  reading_date: string; // YYYY-MM-DD
  odometer_km: number;
  note?: string;
  created_at?: number;
}

export interface Asset {
  id: string;
  owner: AssetOwner;
  asset_class?: AssetClass;
  type: AssetType;
  provider: string;
  product_name: string;
  policy_number?: string;
  start_date?: string;
  end_date?: string;
  monthly_premium?: number;
  num_payments?: number;
  annual_premium?: number;
  balance?: number;
  risk_level?: RiskLevel;
}

export const SUB_CATEGORIES = [
  'חנויות ולקוחות',
  'פנאי וטבע',
  'בידור ומדיה',
  'בריאות וספורט',
  'מזון ומשלוחים',
  'רכב ותחבורה',
  'חינוך',
  'שירותים',
  'אחר',
] as const;
export type SubCategory = typeof SUB_CATEGORIES[number];

export interface Subscription {
  id: string;
  name: string;
  provider: string;
  category: SubCategory;
  owner: 'Shi' | 'Ortal' | 'Joint';
  payment_type?: 'none' | 'monthly' | 'onetime';
  monthly_fee: number;
  renewal_date?: string;
  card_number?: string;
  image_url?: string;
  notes?: string;
  is_active: boolean;
  created_at?: number;
}
