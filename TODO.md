*Take notes in .docs/ for valuable information or patterns related to this context, after executing the request:
*Update the postman collection with any route changes.

# Content Export

## Phase 1: Plan

Research shopify docs with our api version for retreiving content: metaobjects, files, menus, blog posts, and pages.

## Phase 2: Create Sample Export Functions (Export One)

Build functions/routes to pull sample content: metaobjects, files, menus, blog posts, and pages.

Land in the respective: `exports\content` directory.

Document the data in 

## Phase 3: Create Bulk Export Functions

Build functions/routes to pull bulk content: metaobjects, files, menus, blog posts, and pages.

Land in the respective: `exports\content` directory.

Document the data in each `index.csv`.



# Customer Migration

## Phase 0: Research & Compare Shopify and BigCommerce Customer Structures

- add .docs for how to build manage customers via api in each platform
- We want to map the fields for:
  - first name
  - last name
  - company name
  - email
  - customer group (skip)
  - phone
  - store credit
  - marketing consent
  - force password rest on next login: yes-for-all
  - tax exempt code: map to customer metafield `avatax_excise.customer_no`
  - default address
  - other addresses (need to build a strong regex filter to dedupe addresses)


## Phase 1: Extract sample customer / validate json

test customer ids: 2852474519615, 3096525045823, 6113125040191

land sample shopify json data into: migration\customers

## Phase 2: Compose payload for BigCommerce

Let's create a function to create example json files for the expected payloads for BigCommerce.

instead of mapping tax exempt category, let's just map the customer metafields in BC from shopify customer metafields. In shopify, those namespace/keys are:

```
avatax_excise.customer_type
avatax_excise.customer_no
adv_reg.EIN-Field
limits.exempt_order_limits
configuration.disable_cart_buttons
custom.purchasing_list_subscription
```

## Phase 3: Execute sample customer migration

Let's build a route to import a shopify customer by id for this test.

Use: 2147081748549

## Phase 4: Plan bulk customer migration

## Phase 5: Execute bulk customer migration

# Nav Migration

## Phase 0: Research & Compare Shopify and BigCommerce Navigation

Observation: BigCommerce top-level navigation seems to be determined by product categories. In Shopify, we manually create/set the nav. They may differ in setup, but we would like the nav to carry over.

- add .docs for how to build manage navs via api in each platform

## Phase 1: Extract & Validate Nav from Shopify

**In use navs:**

- sidebar-menu (Mobile Main Nav)
  - shopify menu id: 113748344895
- dsk-nav-21 (Desktop Main Nav)
  - shopify menu id: 179918012479

## Phase 2: Compose Payload for BigCommerce

1. Research the data structure for navigation
2. Analyze the nav-*.json files for the original structure
3. Generate a composed-nav.json, for the expected payload for BC
4. Add to .docs any items in the shopify navs that will need to be added separately/alternatively

## Phase 3: Execute Navigation Migration

- prepare a do & undo function
  - do: compose & send new navigation(s) to BC
  - undo: replace current navigation with original navigation (may require backup file)
- mount: `routes/migrate/navigation.js`, with `resetNavigation, migrateNavigation`

## Phase 4: Validate outlier nav items

Analyze the new bigcommerce navigation and create:

1. UAT Steps: How should we check the navigation created in BC
2. To-Do Steps: Outlier items that were not handled by the migration