# AI Development Session Logs

This document tracks the iterative prompt engineering used to co-develop the **SAP O2C Context Graph** application. The prompts demonstrate a structured approach to problem-solving, dividing the architecture into distinct modules (Ingestion, Database Modeling, Graph Engine, and LLM orchestration), allowing me to write the boilerplate and define the architecture while guiding the AI to implement the heavy-lifting logic.

---

## 1. Data Ingestion & Normalization

**User Prompt:**
> I have initialized the backend structure using `better-sqlite3`. I need to build an ingestion script `scripts/ingest.mjs` that loops through my `data/` directory. The data consists of `jsonl` files (like `sales_order_headers/part-***.jsonl`). 
> 
> *Requirements:*
> 1. Read all files dynamically.
> 2. Flatten all nested objects into `snake_case` properties (e.g. `creationTime: {hours, minutes}` -> `creation_time`).
> 3. Perform dynamic schema inference across all records to build the `CREATE TABLE` statements on the fly instead of hardcoding schemas.
> 
> I have already written the `fs` directory looping logic. Please provide the implementation for the `flattenRecord` and `processEntity` functions.

**AI Response:**
*(Provided the `flattenRecord` logic using recursive tracking, and the `processEntity` logic using SQLite prepared statements and transactional batch inserting for speed, which I directly integrated into the script).*

---

## 2. Graph Node & Edge Assembly

**User Prompt:**
> The SQLite database is successfully populated. Next, I am building the local graph API `src/app/api/graph/route.js`. My frontend `react-force-graph-2d` expects a strict `{ nodes: [], edges: [] }` format. 
>
> Write the logic for `getOverviewGraph()`. Your function must execute raw SQL `SELECT` statements to fetch entities and manually construct the graph topology. 
> 
> *Edge Mapping Constraints:*
> - Link Customers to Sales Orders using `sold_to_party` (Label: `PLACED_ORDER`)
> - Link Sales Orders to Deliveries using `reference_sd_document` within `outbound_delivery_items` (Label: `DELIVERED_BY`)
> - Link Deliveries to Billing via `billing_document_items` (Label: `BILLED_BY`)
> - Link Billing to Journal Entries via `accounting_document` (Label: `CREATES_ENTRY`)
>
> Ensure node IDs are strictly prefixed with their type (e.g., `customer:<id>`) to avoid key collisions.

**AI Response:**
*(Generated the extensive SQL relationship mappings which seamlessly connected the relational backend to the NoSQL graph frontend).*

---

## 3. UI/UX Theming and CSS Architecture

**User Prompt:**
> I've built the raw React component for `GraphView.js` but the default styles are quite harsh. I want to implement a modern, light-theme aesthetic prioritizing readability.
>
> Please refactor the standard `.node-prop` and `:root` CSS classes in `globals.css`. 
> *Design Specifications:*
> - The background should be purely white.
> - Link lines should be light blue (`#bfdbfe`).
> - The application layout should use Flexbox with a static right `.chat-section` and a responsive left `.graph-section`.
> - Replace `.node-detail-panel` with an absolute positioned floating tooltip that appears next to hovering coordinates, with a subtle drop shadow (`box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1)`).

**AI Response:**
*(Supplied the CSS refactoring. We iterated a few times on hydration mismatch errors by adjusting the sequence of child `<divs>` correctly matching the Client vs Server SSR layout).*

---

## 4. LLM Natural Language to SQL Translation Debugging

**User Prompt:**
> I've integrated the groq-sdk into `src/lib/llm.js` to process natural text into SQL queries. However, I am seeing a persistent bug. When a user asks "give me more details about BILL 91150172", the LLM returns `sql: null`. 
>
> The problem is a semantic disconnect: The UI labels the nodes with clean prefixes (like "BILL "), but the underlying database column `billing_document` simply expects the raw number `"91150172"`. 
>
> How can we update the `systemPrompt` effectively so the LLM understands how to translate UI prefixes into database constraints *without* altering the underlying tables?

**AI Response:**
*(Provided a brilliant adjustment to the system prompt containing a direct translation table constraint forcing the LLM to strip common prefixes like "SO ", "DEL ", and "BILL " prior to query generation, which instantly patched the routing bugs).*
