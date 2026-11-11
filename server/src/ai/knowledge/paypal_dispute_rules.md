# PayPal Dispute Defense & Seller Protection Knowledge Base

> Summarized guidance for demo purposes. Not legal advice. Verify against PayPal's current User Agreement and Seller Protection policy.

---

## 1. PayPal Dispute Lifecycle & Deadlines

A PayPal dispute progresses through up to three distinct stages:

1. **Inquiry Phase (Resolution Center Discussion):**
   - Buyer and seller communicate directly through PayPal's Resolution Center to resolve the issue amicably.
   - Money is held temporarily in the seller's account.
   - The dispute does not affect the seller's dispute rate yet.
   - If unresolved within 20 calendar days, either party may escalate to a Claim.

2. **Claim Phase (PayPal Review):**
   - Either party escalates the dispute; PayPal steps in to review evidence and make a final ruling.
   - **Critical Deadline:** The seller typically has **10 calendar days** from the escalation date to submit official proof via `provide-evidence`.
   - Failure to respond within the deadline results in an automatic default judgment in favor of the buyer, permanent refund deduction, and potential dispute fee ($15–$30).

3. **Chargeback / Financial Institution Dispute:**
   - Buyer bypasses PayPal or escalates directly through their credit card company or bank.
   - Bank makes the final determination; PayPal defends the merchant if Seller Protection criteria are met.
   - Chargebacks carry an additional non-refundable dispute/chargeback fee unless protected.

---

## 2. PayPal Seller Protection: Core Requirements

To qualify for PayPal Seller Protection, the seller must satisfy ALL of the following:

1. **Primary PayPal Account:** Account must be in good standing.
2. **Physical Address Match:** Item must be shipped to the exact shipping address listed on the PayPal "Transaction Details" page. Shipping to any alternate address requested in chat/email voids Seller Protection.
3. **Eligible Item Type:** Physical goods sent with verifiable tracking, or qualifying intangible/digital services where proof of fulfillment is established.
4. **Timely Fulfillment:** Online tracking must confirm shipment within the seller's stated handling time.

---

## 3. Strong Proof Standards by Dispute Reason

### A. Merchandise or Service Not Received (INR)
- **Physical Goods:**
  - Verifiable online tracking number from an integrated or recognized carrier (FedEx, UPS, DHL, BlueDart, India Post, Delhivery, etc.).
  - Tracking status must clearly display **"Delivered"**.
  - Delivery date must match or precede the dispute date.
  - Delivery city/state or postal code must match the address on the PayPal Transaction Details page.
  - **Signature Confirmation:** Mandatory for transactions valued at **$750 USD or more** (or local currency equivalent, e.g. ~₹60,000 INR). Signature receipt with recipient name or initials proves physical handover.
- **Digital Goods / Intangible Services:**
  - System logs displaying date/time the file, license, or service was accessed or downloaded.
  - IP address, timestamp, and user agent of the downloader matching the buyer's account or checkout IP.
  - Delivery email / download link sent to the buyer's primary PayPal email address.
  - Customer acknowledgment in written communication (email, support ticket, WhatsApp) confirming receipt or access.

### B. Unauthorized Transaction / Payment Not Authorized (UA)
- Buyer claims their PayPal account, credit card, or computer was compromised.
- **Defensive Proof:**
  - Proof that shipment was delivered to the verified transaction address.
  - Proof that digital asset was accessed from an IP address, device, or network previously associated with the buyer.
  - Client communications (emails, design reviews, approval sign-offs) showing conscious engagement with the purchase.
  - For digital goods: evidence that buyer accepted terms of service, completed two-factor verification, or actively utilized the deliverable after delivery.

### C. Merchandise Not As Described (SNAD)
- Buyer claims item is damaged, defective, counterfeit, or significantly materially different from the listing description.
- **Defensive Proof:**
  - Original item listing description, specifications, dimensions, materials, and photos showing condition before dispatch.
  - Courier weight receipts showing packaged weight matches manufacturer specs (disproves "empty box" claims).
  - Serial numbers, IMEI numbers, or custom identifier tags matched between invoice and packaging photos.
  - Written chat or email logs where buyer previously acknowledged item is in good condition, or buyer later altered the product.
  - If buyer refuses to return the item or return tracking shows no delivery back to seller, seller is protected.

### D. Credit Not Processed / Duplicate Transaction
- **Proof:**
  - Detailed transaction receipt showing distinct order IDs, separate items, or individual authorization IDs for duplicate claims.
  - Proof that a prior refund or store credit was already issued (PayPal transaction ID of refund).
  - Clear merchant cancellation policy accepted by buyer at checkout.

---

## 4. Evidence Classification Mapping (PayPal API `evidence_type`)

When submitting evidence through PayPal's `POST /v1/customer/disputes/{id}/provide-evidence`, evidence must be categorized accurately:

- `PROOF_OF_FULFILLMENT`: Tracking numbers, dispatch confirmation, shipment creation timestamp, courier label receipt.
- `PROOF_OF_DELIVERY_SIGNATURE`: Signature delivery card, electronic courier signature image with signer name.
- `RECEIPT_OF_MERCHANDISE`: Proof that buyer received merchandise, proof of download, customer chat stating "received".
- `PROOF_OF_REFUND`: Transaction receipt if money was already returned or credited.
- `PROOF_OF_RESHIPMENT`: Tracking for replacement items sent to resolve initial complaint.
- `OTHER`: Contract agreements, Terms of Service, IP download logs, design approval emails, WhatsApp transcripts.

---

## 5. Golden Rules for Writing Dispute Response Letters

1. **Be Neutral, Factual, and Concise:** PayPal dispute adjudicators review hundreds of claims daily. Keep letters under 400 words. Never use emotional language or accuse the buyer of fraud or theft.
2. **State Key Facts Upfront:** Transaction ID, order date, delivery date, carrier name, tracking number, and delivery status must appear in the first paragraph.
3. **Cite Specific Evidence IDs:** Anchor every factual claim to an attached document or log reference (e.g., `"As demonstrated in Exhibit A (Courier Proof of Delivery) and Exhibit B (WhatsApp Chat Transcript)..."`).
4. **Highlight Exact Alignment with Policy:** Explicitly quote PayPal Seller Protection terms: `"The seller has fulfilled all requirements under PayPal Seller Protection by delivering the merchandise to the authorized transaction address with verified online tracking."`
5. **Never Fabricate or Assume:** If an item lacks a signature, do not claim one exists. Focus instead on confirmed GPS delivery scan, address match, and buyer messages.

