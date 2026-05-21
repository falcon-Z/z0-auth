# Platform recovery key

The recovery key is generated **once** during initial platform setup (and again only when an authenticated platform admin explicitly regenerates it). It replaces email-based password reset until SMTP is configured.

## Storage recommendations

- Prefer a password manager or hardware-encrypted storage.
- If you download the `.txt` file, store it on an encrypted volume and delete copies you no longer need.
- Avoid screenshots, chat apps, and shared cloud folders.

## Clipboard and email

- **Copy** puts the key in your system clipboard; other applications may read it. Clear the clipboard after saving.
- **Email to myself** opens your local mail client with a pre-filled draft. Z0 Auth does not send email. The key is plaintext in the draft. Only send to an address you control.

## If you lose the key

- Use a saved copy with `/forgot-password`.
- If the key is lost and SMTP is not configured, account recovery requires operator break-glass procedures (database restore or documented maintenance access).

## Regeneration

Signed-in platform admins can call `POST /api/v1/me/recovery-key` with their current password. The previous key stops working immediately.
