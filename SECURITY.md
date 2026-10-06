# BackSoon data security policy

Owner: Sun Skill Tech (management.sunskilltechs@gmail.com). Last reviewed: October 7, 2026.

This is how BackSoon protects the personal data it holds: shopper email addresses, the variant each shopper asked about, and dates. It backs the answers given in Shopify's protected customer data form. Review it whenever the app's data handling changes, and at least once a year.

## Who can reach the data
- One person, the developer, has access to the production server, its database and the app's Shopify, Hetzner, GitHub and Resend accounts. Nobody else gets access without updating this file first.
- The server only accepts SSH key logins. Password logins are switched off.
- Every account above uses a unique password of at least 16 characters from a password manager, with two-factor login turned on.
- Merchants see their own store's waitlist only, through Shopify's authenticated admin.

## Storage and encryption
- In transit: all traffic is HTTPS (Caddy, Let's Encrypt). Shopify webhooks and app proxy requests are signature-checked.
- At rest: shopper emails are encrypted in the database with AES-256-GCM (`app/crypto.server.ts`). The key (`DATA_ENCRYPTION_KEY`) lives in the server's `.env`, readable by root only, with a copy in the password manager. It is never committed to git.
- Backups: `scripts/backup.sh` dumps the database every night, encrypts it with GPG (AES-256) before it is written to disk, and keeps 14 days. The passphrase is stored the same way as the encryption key.
- Test and production data are separate. Development uses a local database and a development store with test addresses. Production data is never copied to a laptop.

## Retention
- Sent, unsubscribed and failed requests are deleted 180 days after their last activity. Waiting requests stay until they are sent or unsubscribed.
- All of a store's data is deleted when Shopify sends `shop/redact`, 48 hours after uninstall. A shopper's records are deleted on `customers/redact`.
- The access log is kept for 365 days.

## Data loss prevention
- Only the minimum is collected: an email address per request. No names, phone numbers, addresses or order data.
- The app has no bulk export apart from the merchant's own CSV of their own store, and every export is logged.
- Shopper data never goes into application logs. Logs record counts only.
- No production data is sent to third parties apart from the subprocessors listed in the data processing terms (`/dpa`).
- Laptops used for development have full-disk encryption and a screen lock turned on.

## Access logging
- Every merchant CSV export and every `customers/data_request` is written to the `DataAccessLog` table with the shop, the staff user ID (for exports), the number of records and the time.
- SSH logins to the server are recorded in the system auth log (`journalctl -u ssh`).

## Security incident response
1. **Contain** (as soon as it's noticed): rotate the affected secrets (Shopify API secret, `DATA_ENCRYPTION_KEY`, database password, Resend key), block the access path, and take the app offline if data is still leaking.
2. **Assess** (within 24 hours): work out what data, which stores and which period are affected, using the access log, the auth log and app logs. Keep copies as evidence.
3. **Notify** (within 72 hours of becoming aware): email the affected merchants with what happened, what data was involved and what they should do. Tell Shopify through the Partner support channel. Merchants decide whether to notify their shoppers and regulators, and we give them the details they need.
4. **Recover**: fix the cause, restore from an encrypted backup if data was damaged, and confirm the fix.
5. **Review** (within 2 weeks): write down what happened and update this policy.
