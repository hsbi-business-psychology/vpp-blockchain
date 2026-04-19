# Wallet recovery for students

> **Reading time:** about 5 minutes. This guide is written for students who
> use the VPP system to collect study credit points and want to use their
> browser wallet safely – no prior knowledge of blockchain or cryptography
> required.

## What is a recovery phrase?

When you create a new wallet in the VPP system, the application generates
12 random English words (also called _seed phrase_, _mnemonic_ or
_BIP-39 phrase_). Example:

```
witch  collapse  practice  feed  shame  open
despair  creek  road  again  ice  least
```

These 12 words are your **master key**:

- They contain your full wallet (address + private key) in a form that you
  can write down or paste into a password manager.
- From those 12 words you can restore the same wallet on any other device
  at any time – in the VPP frontend, in MetaMask, in Trust Wallet, or in
  any other standards-compliant wallet app.
- Whoever knows the 12 words controls your points. Treat them like the
  master password of your online banking.

> **Note:** The words come from an open industry-standard list of 2 048
> English words (BIP-39). It is not a secret which words exist – the
> secret is the order of _your_ 12 words.

## Where do I store the phrase?

**Do this:**

1. Save the 12 words in your password manager
   (e.g. Bitwarden, 1Password, KeePassXC).
2. Additionally write the 12 words on paper and keep them somewhere safe –
   for example with your important documents in a drawer at home.
3. Note the order (1 – 12), not just the words.

**Don't do this:**

- Don't take a photo of the screen or the paper (cloud sync!).
- Don't paste them into WhatsApp, Telegram, Discord, e-mail or Slack.
- Don't share them with lecturers, tutors, IT staff or support –
  HSBI will **never** ask for your phrase.
- Don't leave them in a `phrase.txt` on your desktop or in iCloud Drive.

## What happens during creation?

The flow in the VPP frontend has three short steps:

1. **Briefing & confirmation** – a dialog explains how the wallet is
   stored and what you have to look out for.
2. **Reveal phrase** – the 12 words appear one at a time by default. You
   can switch to "Show all" if you are sure you are alone. The words
   automatically re-hide as soon as you switch tabs.
3. **Verification** – we ask you for three random words (e.g. word 2,
   word 5, word 9) to make sure you've actually written them down. You
   have unlimited attempts and can return to the reveal screen at any
   time.

The wallet is only stored in the browser after successful verification –
so an aborted creation never leaves orphan key material behind.

## Restoring a wallet

### In the VPP frontend (same or new device)

1. Open `https://vpstunden.hsbi.de` (or your university's URL).
2. Click **"Import wallet"**.
3. Choose the **"Recovery phrase (12 words)"** tab.
4. Type the 12 words in the original order.
   - As you type, the browser autosuggests matching BIP-39 words.
   - You can also paste all 12 words at once from your password manager
     ("Paste from clipboard").
5. Click **"Import"**. The same wallet address as before will appear,
   including all points you've ever claimed.

### In MetaMask (browser extension or mobile app)

You can also open your VPP wallet in MetaMask without changing anything
else. The derived address is exactly the same.

1. **Install MetaMask** (if you haven't already):
   <https://metamask.io/download/>.
2. On first launch choose **"Import an existing wallet"**.
3. When MetaMask asks, set a **strong passcode** (at least 8 characters –
   that code encrypts your phrase inside MetaMask's vault).
4. In the **"Secret Recovery Phrase"** step type the 12 words in the
   exact order you wrote them down.
5. Confirm – MetaMask now shows the imported account. By default the
   active account is the same address you had in the VPP frontend.
6. Switch the network at the top to **"Base"** (Chain ID 8453). If Base
   isn't in the list yet, open <https://basescan.org/> once and load any
   block; MetaMask will offer to add the network automatically.
7. Back in the VPP frontend you can now also use "Connect with MetaMask"
   if you'd rather use MetaMask than the in-browser wallet.

> If MetaMask shows a different address after the import: check that you
> really selected the **first** account (Account 1). The VPP frontend
> uses the standard derivation path `m/44'/60'/0'/0/0`, which is exactly
> what MetaMask labels as Account 1.

## Frequently asked questions

**I cleared my browser cache – are my points lost?**
Not if you still have the 12 words. Import them as described above and
you'll be exactly where you left off.

**I lost the 12 words and have no backup – what now?**
Unfortunately the points you've already claimed are no longer
accessible. They remain on the blockchain under your old address, but
nobody can move them anymore. Create a new wallet, secure the new phrase
properly, and ask to have new points credited to that address for future
surveys.

**I wrote the words down but I see "Phrase invalid".**
That is almost always a typo. The phrase contains a checksum – a single
wrong character is enough to fail it. Pay attention to similar pairs
like _"use" / "used"_ or _"flat" / "flag"_ and double-check the
**order**.

**Can someone read my phrase out of the browser?**
In theory yes: an attacker with access to your user account on the
computer can read `localStorage`. Therefore you must **not** use the VPP
wallet on a computer you don't trust (internet café, shared family PC
without separate login). On a campus PC or your own laptop the risk is
very low, as long as you don't install shady browser extensions.

**Why can't I download the private key as a file anymore?**
A `.json` file with the plaintext key ends up in cloud backups or e-mail
attachments far too easily. The 12-word phrase serves the same purpose
but is much friendlier for humans to manage and fits any password
manager.

**I have an older wallet without a 12-word phrase. What now?**
You can keep using it – nothing is lost. The wallet area shows a hint
that no phrase is available. You have two options:

1. If needed, import the private key into MetaMask (in MetaMask:
   _"Import account"_ → _"Private key"_).
2. Or create a new wallet with phrase and claim future points to that
   one. Both addresses can coexist.

## I need help

- Ask in the official ILIAS / Moodle course. The tutors can help with
  the VPP frontend.
- For technical problems with the system (e.g. unreachable server),
  please use the contact address in the legal notice on the VPP site.
- **Nobody** will ever ask you for your recovery phrase – not lecturers,
  not support. If they do, it's a scam attempt.
