export type TransactionType = 'expense' | 'income';
export type Payer = 'Shi' | 'Ortal' | 'Joint';
export type PaymentMethod = 'אשראי' | 'מזומן' | 'העברה' | 'ביט' | "צ'ק" | 'הוראת קבע';
export type ExpenseClass = 'קבועה' | 'משתנה';
export type TransactionStatus = 'paid' | 'pending' | 'future';

export const CATEGORIES = [
  'מזון', 'סופר', 'מסעדות', 'דיור', 'רכב', 'דלק', 'ילדים',
  'ביגוד', 'בריאות', 'פנאי', 'ביטוחים', 'תקשורת', 'מתנות', 'שונות',
] as const;

export type Category = typeof CATEGORIES[number];

export const PAYMENT_METHODS: PaymentMethod[] = ['אשראי', 'מזומן', 'העברה', 'ביט', "צ'ק", 'הוראת קבע'];

export const ASSET_OWNERS = ['Shi', 'Ortal', 'Yuval', 'Aviv', 'Ziv', 'Joint', 'Car_Private', 'Apt_Rent', 'Apt_Own'] as const;
export type AssetOwner = typeof ASSET_OWNERS[number];

export const ASSET_TYPES = [
  'פנסיה', 'ביטוח נכות', 'קרן השתלמות', 'קופת גמל', 'קרן להשקעה',
  'חיסכון ילדים', 'מנהלים', 'בריאות', 'חיים', 'מחלות קשות', 'משכנתא',
  'שיניים', 'סיעוד', 'מבנה', 'תכולה', 'מבנה+תכולה',
  'רכב חובה', 'רכב מקיף', "צד ג'", 'אסותא', 'כללית',
] as const;
export type AssetType = typeof ASSET_TYPES[number];

export interface Transaction {
  id: string;
  date: string;
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

export interface Asset {
  id: string;
  owner: AssetOwner;
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
}
