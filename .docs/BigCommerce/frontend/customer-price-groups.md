# Customer Price Groups — BigCommerce Migration Notes

**Store type:** Wholesale / B2B  
**Migrated from:** Shopify  
**Last updated:** June 2026

---

## Overview

This document covers how we restrict product pricing and purchasing to approved wholesale customers on BigCommerce. Guests and unapproved customers never see prices or an Add to Cart button. The implementation combines a native store setting with a Stencil theme customization.

---

## How It Works: The Three States

Every product page evaluates the visitor into one of three states:

| State | Who | What they see |
|---|---|---|
| **Guest** | Not logged in | "Log in to view pricing" prompt, no price, no Add to Cart |
| **Approved customer** | Logged in + assigned to one of 6 wholesale groups | Price from their assigned price list + Add to Cart |
| **Pending customer** | Logged in + no group assigned (group ID = 0) | "Contact your sales rep" message, no price, no Add to Cart |

---

## Implementation

### Part 1 — Native Store Setting

**Settings › Display › "Hide Product's Price from Guests"** — check this box.

This is the first line of defense. It hides all pricing and the Add to Cart button for any visitor who is not logged in, and prevents the base `$0` price from rendering for guests. No theme code required for this part.

> ⚠️ This setting must remain enabled. If it is ever unchecked, guests will see `$0` prices.

---

### Part 2 — Stencil Theme Customization

**File:** `templates/components/products/product-view.html`

The existing guest/logged-in check (around the `data-product-price` attribute on the wrapper div) was extended to add the third "pending customer" state. The same conditional logic is applied in two places in the file:

#### 1. Price display block (data-product-price attribute, ~line 21)

```handlebars
{{#if customer}}
  {{#if customer.customer_group_id}}
    {{#if product.price.with_tax}}
      {{product.price.with_tax.value}}
    {{else}}
      {{product.price.without_tax.value}}
    {{/if}}
  {{else}}
    {{!-- Logged in but no group: leave blank --}}
  {{/if}}
{{else}}
  {{lang 'common.login_for_pricing'}}
{{/if}}
```

#### 2. Add to Cart button block

Find the `{{> components/products/add-to-cart}}` include and wrap it:

```handlebars
{{#if customer}}
  {{#if customer.customer_group_id}}
    {{!-- Approved wholesale customer --}}
    {{> components/products/add-to-cart}}
  {{else}}
    {{!-- Logged in but no group assigned --}}
    <p class="wholesale-contact-msg">
      Your account doesn't have pricing assigned yet —
      please <a href="/contact-us">contact your sales rep</a>.
    </p>
  {{/if}}
{{else}}
  {{!-- Guest --}}
  <p class="wholesale-login-msg">
    <a href="{{urls.auth.login}}">Log in</a> to view pricing and place orders.
  </p>
{{/if}}
```

---

## Customer Group Setup

We have 6 approved wholesale groups configured under **Customers › Customer Groups**. Each group is assigned a price list.

New customer registrations land in the **default group (ID = 0)** — this is the "Pending" state. A team member manually reviews and moves them to the appropriate group once vetted.

### Why group ID `0` works as the "unassigned" check

In Handlebars, `0` is falsy. So `{{#if customer.customer_group_id}}` returns false when the customer is in the default group (ID 0), which is exactly our pending/unvetted state. Customers in any of the 6 approved groups have non-zero IDs and pass the check.

> ⚠️ **This only holds if your default group stays at ID 0.** See the Pitfalls section below.

---

## Relevant Handlebars Context Objects

These are available globally on all Stencil pages — no frontmatter declaration needed.

| Object | Type | Notes |
|---|---|---|
| `{{customer}}` | Object or undefined | Present only when logged in |
| `{{customer.customer_group_id}}` | Integer | `0` for default/unassigned group |
| `{{customer.customer_group_name}}` | String | Human-readable group name |
| `{{urls.auth.login}}` | String | Store login URL |
| `{{settings.hide_price_from_guests}}` | Boolean | Reflects the store setting |

> **Tip:** Append `?debug=context` to any storefront URL while developing to dump the full Handlebars context as JSON in the browser. Use this to verify `customer_group_id` values for test accounts.

---

## Pitfalls & Gotchas

### 1. The default group ID must be 0
The `{{#if customer.customer_group_id}}` check relies on `0` being falsy in Handlebars. If BigCommerce ever reassigns your default group to a non-zero ID (e.g. after a group deletion/recreation), this check silently breaks — approved customers in group `0` would see the "contact sales rep" message, and pending customers in a non-zero group would see Add to Cart.

**Mitigation:** Verify group IDs periodically in the control panel. If the default group ID is ever non-zero, switch to an explicit ID check:

```handlebars
{{!-- Replace the group_id check with a specific ID exclusion --}}
{{#unless (equals customer.customer_group_id 42)}}
  {{!-- 42 = your pending group ID --}}
{{/unless}}
```

### 2. The store setting is separate from the theme code
The "Hide Price from Guests" store setting and the Handlebars conditionals are independent. The store setting handles guests. The theme code handles the pending-customer state. Both must be in place for the full behavior to work.

### 3. Price list assignment ≠ customer group assignment
Assigning a customer to a group and assigning a price list to that group are two separate actions. If a group exists but has no price list attached, customers in it will be in the "approved" branch of the conditional but will see `$0` prices (the base price with no list override).

**Always verify:** when creating a new group, attach a price list before assigning customers to it.

### 4. Pricing changes can take up to 10 minutes to appear
BigCommerce caches storefront pricing. After updating a price list or reassigning a customer to a group, allow up to 10 minutes before prices reflect on the storefront.

### 5. Quick View and category card templates
The customization in `product-view.html` covers the product detail page. The Add to Cart button on **category pages (product cards)** and **Quick View modals** are in separate templates:

- `templates/components/products/card.html` — category/search grid cards
- `templates/components/products/quick-view.html` — quick view modal

These may need the same conditional logic applied if customers can add to cart from those surfaces.

### 6. Full-page caching for guests
BigCommerce automatically enables full-page caching for guest visitors on storefronts. This means the guest state is cached aggressively — do not attempt to show any personalised content to guests, as it will not render correctly.

---

## Testing Checklist

Use separate browser sessions (or incognito) to test each state.

- [ ] **Guest:** Visit a product page while logged out. Confirm no price is shown and no Add to Cart button is visible. Confirm the login prompt appears.
- [ ] **Pending customer:** Log in with an account assigned to the default group (ID 0). Confirm no price, no Add to Cart, and the "contact sales rep" message appears.
- [ ] **Approved customer:** Log in with an account in each of the 6 wholesale groups. Confirm the correct price list price is shown and Add to Cart is functional.
- [ ] **Store setting toggle:** Temporarily uncheck "Hide Price from Guests" and confirm the `$0` base price becomes visible to guests — then re-enable it immediately. This validates the setting is doing its job.
- [ ] **Group reassignment:** Move a pending account to an approved group and confirm pricing and Add to Cart appear within 10 minutes.

---

## Related Files

| File | Purpose |
|---|---|
| `templates/components/products/product-view.html` | Primary customization — price + Add to Cart conditionals |
| `templates/components/products/card.html` | Product cards on category/search pages — may need same logic |
| `templates/components/products/quick-view.html` | Quick view modal — may need same logic |
| `templates/components/products/add-to-cart.html` | The Add to Cart form partial being conditionally included |

---

## Control Panel Reference

| Setting | Location |
|---|---|
| Hide Price from Guests toggle | Settings › Display |
| Customer Groups | Customers › Customer Groups |
| Price Lists | Products › Price Lists |
| Assign price list to group | Customers › Customer Groups › Edit Group |
| Theme file editor | Storefront › My Themes › Edit Theme Files |