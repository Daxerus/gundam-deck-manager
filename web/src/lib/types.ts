export interface Card {
  productId: string;
  cardNumber: string;
  name: string;
  setCode: string;
  setName: string | null;
  rarity: string | null;
  cardType: string | null;
  color: string | null;
  level: number | null;
  cost: number | null;
  ap: number | null;
  hp: number | null;
  apRaw: string | null;
  hpRaw: string | null;
  zone: string | null;
  trait: string | null;
  link: string | null;
  sourceTitle: string | null;
  effect: string | null;
  imageUrl: string | null;
  detailUrl: string | null;
  whereToGet: string | null;
  keywordEffects: { keyword: string; value?: number }[] | null;
  traits: string[] | null;
  /** Parsed link targets (pilot names or trait names) from the unit's Link field. */
  linkRefs: string[] | null;
  /** Other physical printings of the same card_number (catalog grouped view). */
  variants?: Card[];
}

export interface SetInfo {
  setCode: string;
  setName: string | null;
  count: number;
}

export interface CatalogStatus {
  cardCount: number;
  datasetVersion: string | null;
  lastSync: number | null;
}

export interface Paginated<T> {
  _meta: { total: number; limit: number; offset: number; count: number; hasMore?: boolean };
  data: T[];
}

export interface DeckSummary {
  id: number;
  name: string;
  notes: string | null;
  isActive: boolean;
  resourceDeckSize: number;
  mainCount: number;
  complete: boolean;
  buildable: boolean;
  updatedAt: number;
}

export interface ShoppingShortage {
  cardNumber: string;
  name: string;
  required: number;
  owned: number;
  missing: number;
}

export interface DeckValidation {
  legal: boolean;
  mainCount: number;
  colors: string[];
  errors: string[];
  warnings: string[];
  shortages: ShoppingShortage[];
}

export interface DeckCardEntry {
  cardNumber: string;
  quantity: number;
  owned: number;
  allocated: number;
  allocatedByPrinting?: { productId: string; qty: number }[];
  card: Card | null;
}

export interface DeckDetail {
  id: number;
  name: string;
  notes: string | null;
  isActive: boolean;
  resourceDeckSize: number;
  updatedAt: number;
  cards: DeckCardEntry[];
  validation: DeckValidation;
  complete: boolean;
}

export type MoveSource = 'box' | { deckId: number; name: string };

export interface PlanMove {
  productId: string;
  name: string;
  from: MoveSource;
  qty: number;
}

export interface AffectedDeck {
  deckId: number;
  name: string;
  wasActive: boolean;
  pulled: { productId: string; name: string; qty: number }[];
}

export interface PlanShortage {
  cardNumber: string;
  name: string;
  required: number;
  owned: number;
  missing: number;
}

export interface PullPreference {
  cardNumber: string;
  pulls: { deckId: number; productId: string; qty: number }[];
}

export interface PullOption {
  cardNumber: string;
  name: string;
  qty: number;
  holders: {
    deckId: number;
    name: string;
    productId: string;
    qty: number;
    isActive: boolean;
  }[];
}

export interface ActivationPlan {
  targetId: number;
  targetName: string;
  moves: PlanMove[];
  affectedDecks: AffectedDeck[];
  shortages: PlanShortage[];
  pullOptions: PullOption[];
  allowBox: boolean;
  complete: boolean;
  targetAllocation: Record<string, number>;
}

export interface CardLocation {
  productId: string;
  cardNumber: string;
  name: string;
  imageUrl: string | null;
  owned: number;
  box: number;
  decks: { deckId: number; name: string; qty: number }[];
}

export type StatusColor = 'green' | 'yellow' | 'red';

export interface LoanPartyQty {
  /** Registered counterparty; null for external contacts. */
  userId: number | null;
  /** External contact id; null for registered users. */
  contactId: number | null;
  /** Username or external nick. */
  username: string;
  qty: number;
  loanId: number;
}

export interface LoanContact {
  id: number;
  nick: string;
  createdAt: number;
  updatedAt: number;
}

export interface CardStatusBreakdown {
  productId: string;
  owned: number;
  box: number;
  decks: { deckId: number; name: string; qty: number }[];
  lentOut: LoanPartyQty[];
  borrowedIn: LoanPartyQty[];
  statusColor: StatusColor;
  displayQty: number;
  ownTotal: number;
}

export interface Friendship {
  id: number;
  status: 'pending' | 'accepted';
  requestedBy: number;
  otherUserId: number;
  otherUsername: string;
  isIncoming: boolean;
  isOutgoing: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LoanHistoryEntry {
  id: number;
  type: string;
  loanId: number | null;
  fromUserId: number | null;
  fromUsername: string;
  fromContactId?: number | null;
  toUserId: number | null;
  toUsername: string;
  toContactId?: number | null;
  items: { productId: string; quantity: number }[];
  deckImpacts: { deckId: number; name: string }[];
  direction: string;
  createdAt: number;
}

export interface OpenLoan {
  id: number;
  lenderId: number | null;
  lenderUsername: string;
  borrowerId: number | null;
  borrowerUsername: string;
  contactId?: number | null;
  externalDirection?: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  items: { productId: string; quantity: number }[];
}

export interface CardRequest {
  id: number;
  fromUserId: number;
  fromUsername: string;
  toUserId: number;
  toUsername: string;
  productId: string;
  quantity: number;
  status: string;
  createdAt: number;
  direction: 'incoming' | 'outgoing';
}

export interface InviteCode {
  id: number;
  code: string;
  createdBy: number | null;
  usedBy: number | null;
  usedAt: number | null;
  createdAt: number;
  used: boolean;
}
