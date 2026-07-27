import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Card catalog, mirrored from the gcg-api bulk dataset.
 * PK is `product_id` (unique per printing; alt-arts get _p1/_p2 suffixes).
 * `card_number` (e.g. GD01-001) is the playable identity shared by alt-arts.
 * Array-valued source fields are stored as JSON text.
 */
export const cards = sqliteTable(
  'cards',
  {
    productId: text('product_id').primaryKey(),
    cardNumber: text('card_number').notNull(),
    name: text('name').notNull(),
    setCode: text('set_code').notNull(),
    setName: text('set_name'),
    rarity: text('rarity'),
    cardType: text('card_type'),
    color: text('color'),
    level: integer('level'),
    cost: integer('cost'),
    ap: integer('ap'),
    hp: integer('hp'),
    apRaw: text('ap_raw'),
    hpRaw: text('hp_raw'),
    zone: text('zone'),
    trait: text('trait'),
    link: text('link'),
    sourceTitle: text('source_title'),
    blockIcon: text('block_icon'),
    sp: text('sp'),
    effect: text('effect'),
    imageUrl: text('image_url'),
    detailUrl: text('detail_url'),
    whereToGet: text('where_to_get'),
    keywordsText: text('keywords_text'),
    keywordEffects: text('keyword_effects'), // JSON
    timingMarkers: text('timing_markers'), // JSON
    traits: text('traits'), // JSON
    linkRefs: text('link_refs'), // JSON
  },
  (t) => ({
    byCardNumber: index('idx_cards_card_number').on(t.cardNumber),
    bySet: index('idx_cards_set_code').on(t.setCode),
    byColor: index('idx_cards_color').on(t.color),
    byType: index('idx_cards_card_type').on(t.cardType),
    byRarity: index('idx_cards_rarity').on(t.rarity),
  }),
);

/** Application users (username + hashed password). */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    byUsername: uniqueIndex('uniq_users_username').on(t.username),
  }),
);

/** Physical copies owned, tracked per printing (product_id) and per user. */
export const collectionItems = sqliteTable(
  'collection_items',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => cards.productId, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.productId] }),
    byUser: index('idx_collection_user').on(t.userId),
  }),
);

/** A deck the user is building / plays with. */
export const decks = sqliteTable(
  'decks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    resourceDeckSize: integer('resource_deck_size').notNull().default(10),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    byUser: index('idx_decks_user').on(t.userId),
  }),
);

/** Desired composition of a deck, keyed by card_number (playable identity). */
export const deckCards = sqliteTable(
  'deck_cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    cardNumber: text('card_number').notNull(),
    quantity: integer('quantity').notNull().default(1),
  },
  (t) => ({
    uniq: uniqueIndex('uniq_deck_card').on(t.deckId, t.cardNumber),
    byDeck: index('idx_deck_cards_deck').on(t.deckId),
  }),
);

/**
 * Physical copies currently placed in an assembled deck, keyed by product_id.
 * Free copies of a printing = owned(product_id) - sum(allocations).
 * Anything not allocated lives "in the box". Different rarities/printings of the
 * same card_number are independent here (you may own 2 normals + 1 alt).
 */
export const allocations = sqliteTable(
  'allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => ({
    uniq: uniqueIndex('uniq_alloc_card').on(t.deckId, t.productId),
    byDeck: index('idx_alloc_deck').on(t.deckId),
    byCard: index('idx_alloc_card_number').on(t.productId),
  }),
);

/** Key/value app metadata (e.g. ingested dataset version). */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value'),
});

/** Bidirectional friendship (user_a < user_b for uniqueness). */
export const friendships = sqliteTable(
  'friendships',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userA: integer('user_a')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userB: integer('user_b')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // pending | accepted
    requestedBy: integer('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqPair: uniqueIndex('uniq_friendship_pair').on(t.userA, t.userB),
    byA: index('idx_friendships_user_a').on(t.userA),
    byB: index('idx_friendships_user_b').on(t.userB),
  }),
);

/** Open or closed loan between two users. */
export const loans = sqliteTable(
  'loans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lenderId: integer('lender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    borrowerId: integer('borrower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('open'), // open | closed
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    byLender: index('idx_loans_lender').on(t.lenderId),
    byBorrower: index('idx_loans_borrower').on(t.borrowerId),
    byPairStatus: index('idx_loans_pair_status').on(t.lenderId, t.borrowerId, t.status),
  }),
);

/** Outstanding quantities still out on a loan, per printing. */
export const loanItems = sqliteTable(
  'loan_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    loanId: integer('loan_id')
      .notNull()
      .references(() => loans.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => cards.productId, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => ({
    uniq: uniqueIndex('uniq_loan_item').on(t.loanId, t.productId),
    byProduct: index('idx_loan_items_product').on(t.productId),
  }),
);

/** Immutable history of lend/return events. */
export const loanTransactions = sqliteTable(
  'loan_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(), // lend | return
    loanId: integer('loan_id').references(() => loans.id, { onDelete: 'set null' }),
    fromUserId: integer('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: integer('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemsJson: text('items_json').notNull(),
    deckImpactsJson: text('deck_impacts_json').notNull().default('[]'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    byFrom: index('idx_loan_tx_from').on(t.fromUserId),
    byTo: index('idx_loan_tx_to').on(t.toUserId),
    byCreated: index('idx_loan_tx_created').on(t.createdAt),
  }),
);

/** Request to borrow a card from a friend. */
export const cardRequests = sqliteTable(
  'card_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromUserId: integer('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: integer('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => cards.productId, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    status: text('status').notNull().default('pending'), // pending | accepted | rejected | cancelled
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    byTo: index('idx_card_requests_to').on(t.toUserId, t.status),
    byFrom: index('idx_card_requests_from').on(t.fromUserId, t.status),
  }),
);

/** Request to return copies on an open loan. */
export const returnRequests = sqliteTable(
  'return_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    loanId: integer('loan_id')
      .notNull()
      .references(() => loans.id, { onDelete: 'cascade' }),
    requestedBy: integer('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => cards.productId, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    byLoan: index('idx_return_requests_loan').on(t.loanId, t.status),
  }),
);

/** One-shot registration invite codes. */
export const inviteCodes = sqliteTable(
  'invite_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    usedBy: integer('used_by').references(() => users.id, { onDelete: 'set null' }),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqCode: uniqueIndex('uniq_invite_code').on(t.code),
    byUsed: index('idx_invite_codes_unused').on(t.usedBy),
  }),
);

export type CardRow = typeof cards.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type DeckRow = typeof decks.$inferSelect;
export type DeckCardRow = typeof deckCards.$inferSelect;
export type AllocationRow = typeof allocations.$inferSelect;
export type FriendshipRow = typeof friendships.$inferSelect;
export type LoanRow = typeof loans.$inferSelect;
export type LoanItemRow = typeof loanItems.$inferSelect;
export type LoanTransactionRow = typeof loanTransactions.$inferSelect;
export type CardRequestRow = typeof cardRequests.$inferSelect;
export type ReturnRequestRow = typeof returnRequests.$inferSelect;
export type InviteCodeRow = typeof inviteCodes.$inferSelect;
