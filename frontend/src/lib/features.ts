/**
 * Parts of HQ that are built and working but switched off for now.
 *
 * Nothing here deletes anything. The tables, the endpoints and every row that
 * already exists are untouched — a flag back to `true` brings the screens back
 * exactly as they were, with the old records still in them. This is how
 * something gets out of the way without being thrown away.
 */
export const FEATURES = {
  /**
   * Buying history on a supply: the log of past purchases, the "bought about
   * every N days" reading it produces, and the dialog that asks whether a
   * top-up was a purchase or a miscount. With it off, the + button simply adds
   * one, and a wrong count is fixed on the item's own page.
   */
  supplyPurchases: false,

  /** Attachments on a supply, and the paperclip count in the list. */
  supplyFiles: false,

  /**
   * How often a person should be said hello to, and the "waktunya nyapa"
   * nudge built on it. Off because nobody has ever set one: the field only
   * asked a question the address book did not need to answer.
   */
  peopleReachEvery: false,
} as const
