export type ActiveScreen = 
  | 'dashboard'
  | 'pdv'
  | 'formulas'
  | 'estoque'
  | 'clientes'
  | 'fornecedores'
  | 'orcamentos'
  | 'vendas'
  | 'relatorios'
  | 'configuracoes'
  | 'auth';

export type RoleId = 'caixa' | 'gerente' | 'colorista' | 'admin';

export interface RBACRole {
  id: RoleId;
  title: string;
  badge: string;
  defaultUser: string;
  matricula: string;
  description: string;
  icon: string;
  privileges: {
    icon: string;
    iconColor: string;
    title: string;
    desc: string;
  }[];
}

export interface ProductItem {
  id: string;
  sku: string;
  barcode?: string;
  aliasCodes?: string[];
  colorName: string;
  swatchHex: string;
  swatchDot?: string;
  name: string;
  description: string;
  category: 'imobiliaria' | 'metais' | 'vernizes' | 'acessorios' | 'preparacao' | 'automotiva' | 'complementos';
  brand: string;
  finish: string;
  glossPercent: string;
  glossDotColor: string;
  volume?: string;
  price: number;
  stock: number;
  stockUnit: string;
  isCritical?: boolean;
  volumeToday: number;
  volumeUnit: string;
  salesTotal: number;
  baseType: 'A' | 'B' | 'C' | 'D';
  minStock?: number;
  maxStock?: number;
  costPrice?: number;
  location?: string;
  avgDailySales?: number;
  leadTimeDays?: number;
}

export interface StockAdjustmentRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  brand: string;
  previousStock: number;
  newStock: number;
  delta: number;
  reason: 'inventario' | 'avaria' | 'entrada_nf' | 'consumo_interno' | 'ajuste_rapido';
  reasonText: string;
  operator: string;
  timestamp: string;
}

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  sku: string;
  brand: string;
  category: string;
  stockUnit: string;
  currentStock: number;
  minStock: number;
  avgDailySales: number;
  daysCoverage: number;
  suggestedQty: number;
  orderQty: number;
  costPrice: number;
  sellingPrice: number;
  selected: boolean;
}

export interface CartItem {
  product: ProductItem;
  quantity: number;
}

export interface SuspendedOrder {
  id: string;
  orderNumber: string;
  timestamp: string;
  client: Client;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  note?: string;
  couponCode?: string;
  couponApplied?: boolean;
  selectedPayment?: 'pix' | 'credito' | 'debito' | 'dinheiro' | 'faturado';
}

export interface Client {
  id: string;
  code: string;
  name: string;
  tradeName?: string;
  doc: string;
  docType: 'CNPJ' | 'CPF';
  segment: string;
  creditLimit: number;
  creditUsed: number;
  paymentTerm: string;
  score: string;
  scorePercent: number;
  status: 'liberado' | 'atencao' | 'bloqueado';
  openInvoices: number;
  openAmount: number;
  email: string;
  phone: string;
  pixKey: string;
  duplicatas: {
    id: string;
    orderNum: string;
    description: string;
    daysDue: number;
    amount: number;
  }[];
}

export interface RecentSale {
  id: string;
  paymentType: string;
  paymentBadgeClass: string;
  clientName: string;
  itemsSummary: string;
  amount: number;
  time: string;
  operator: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  sub: string;
  date: string;
  dateBadge: string;
  isToday?: boolean;
  category: string;
  categoryBadgeClass: string;
  amount: number;
  isExpense: boolean;
  statusText: string;
  statusColor: string;
}

export interface CompletedSaleData {
  id?: string;
  orderNumber?: string;
  nfceNumber?: string;
  series?: string;
  accessKey?: string;
  protocol?: string;
  timestamp: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  total: number;
  paymentMethod: string;
  receivedAmount: number;
  changeAmount: number;
  client: Client;
  operatorName?: string;
}
