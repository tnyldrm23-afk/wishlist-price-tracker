# Reliability and failure handling

## Input and price validation

The parser accepts only the configured private Telegram chat. It validates command arguments, full HTTPS Amazon France product URLs, positive EUR targets and percentage thresholds between 0 and 100. Unknown commands receive help; invalid arguments receive a relevant explanation.

Observations must match the expected ASIN, Amazon France, EUR, new condition and the same price series. Missing, non-positive, unavailable, stale or inconsistent observations never become discounts. The Scrapingdog adapter selects the lowest eligible new-condition item offer and rejects unsupported conditions or bulk minimum quantities.

## State and duplicate prevention

- Telegram update IDs have a unique database key. Repeated delivery of the same update does not repeat the command.
- A tracked product has a unique owner/product/source key. Registering an already-active product does not create a second watch.
- PostgreSQL locks the tracking record and rechecks alert eligibility before reserving a notification.
- Pending or review reservations block another alert for that watch.
- Successful delivery updates the last-alert price. Unchanged qualifying prices are suppressed.

A new message has a new Telegram update ID, even if its text is the same. Exactly-once delivery across Telegram and PostgreSQL is not guaranteed. A crash after reservation or an unconfirmed send requires reconciliation rather than blind retries.

## Retries and local AI

The price-fetch workflow makes at most three attempts for retryable failures, using a bounded wait. The selected adapter retries network failures and HTTP 5xx. It does not automatically retry HTTP 429. This is a dedicated fetch loop; Retry On Fail is not configured on every external node.

The local LLM generates a short label from product facts. A word allowlist and unsupported-term check reject unsuitable output; the original title is used on failure. This is a limited output guard rather than a structured-output schema or a guarantee of semantic accuracy. Numerical price decisions never use the model.

## Shared error workflow

```
Error Trigger → Prepare failure notification → Notify owner
```

`settings.errorWorkflow` links the original workflows to `Wishlist | Error Handler`. It handles unexpected failures of automatic executions. The message includes workflow name, last node, a safe reason category and a local execution URL. Raw external errors and stack traces are not sent because they may contain request URLs or credentials. Trigger failures without a saved execution explicitly omit the link.

Handled invalid-price results and nodes continuing after errors do not trigger a separate execution-failure notification. A failed error-handler Telegram send cannot notify through the same broken channel; the saved execution must be inspected. The handler has no recursive error-workflow reference.

A controlled webhook test in the local deployment intentionally failed without requesting Amazon data. The error-handler execution then succeeded, including Telegram delivery. The temporary test workflow was unpublished and archived afterwards. This is historical verification of that deployment, not a guarantee about a fresh clone or future provider availability.

## Scope of verification

The offline suite currently contains 46 tests. Existing local deployment checks also covered real price retrieval, registration, listing, checking, removal and the automatic error notification. Re-running live checks requires credentials and may consume provider credits. They are not part of `npm test`.
