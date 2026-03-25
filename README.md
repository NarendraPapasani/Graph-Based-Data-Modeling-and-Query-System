# SAP Order-to-Cash Context Graph System

An intelligent, graph-based data exploration and querying system built on top of an SAP Order-to-Cash dataset. It combines interactive force-directed graph visualization with an LLM-powered conversational interface capable of dynamically translating natural language questions into data-backed SQL answers.

## 🚀 Features

- **Interactive Graph Visualization:** Explore 800+ entities and 1,000+ relationships across Customers, Sales Orders, Deliveries, and Payments visually.
- **Natural Language to SQL:** Ask complex business questions in plain English and let Google Gemini translate them into precise, structured SQLite queries.
- **Graph & Conversation Synchronization:** Entities mentioned in the LLM's answers are automatically highlighted as glowing nodes in the graph canvas.
- **Domain Guardrails:** Intelligently rejects off-topic queries and strictly limits SQL execution to read-only operations.

## 🏗️ Architecture Decisions

### Framework: Next.js (App Router)
Chosen for its unified full-stack developer experience. It allows us to serve the React-based force graph on the client while securely hiding database connections and API keys in server-side API endpoints (`/api/query`, `/api/graph`).

### Visualization: `react-force-graph-2d`
For graph rendering, an HTML5 Canvas-based force-directed graph was selected over DOM-based solutions like React Flow. Canvas rendering is incredibly performant for large datasets (hundreds or thousands of nodes) and supports interactive physics out of the box.

### Database Choice: SQLite (`better-sqlite3`)
We opted to model the dataset using **SQLite** rather than a dedicated property graph database (like Neo4j).
- **Zero Setup:** A single file `database.sqlite` requires no separate daemon or docker image for reviewers to run.
- **LLM Compatibility:** LLMs (like Gemini/Llama) are heavily trained on SQL syntax. By providing a clear schema with "Key Relationships" (foreign keys), the LLM essentially traverses the "graph" via SQL `JOIN`s with a near-perfect accuracy rate.
- **Performance:** For read-heavy analytic queries tracing document flows, SQLite is exceptionally fast and scales well for the provided dataset size.

## 🧠 LLM Prompting Strategy

We implemented a **Multi-Stage LLM Pipeline** using Google Gemini (`gemini-2.5-flash`):

1.  **Guardrail Classification (Prompt 1):** The user's input is passed to an LLM evaluator strictly instructed to classify the input as relevant to the SAP O2C domain or not. It outputs JSON (`{ "isRelevant": true/false }`).
2.  **SQL Generation (Prompt 2):** If relevant, the question, along with conversation history, is sent to the SQL generator. The system prompt is heavily enriched with:
    - **Dynamic Schema Context:** Table names, column types, and row counts.
    - **Key Relationships Mapping:** A hand-curated list of edges (e.g., `sales_order_items.sales_order → sales_order_headers.sales_order`), essentially teaching the LLM the "Graph" structure so it knows how to join tables.
    - **Few-Shot Rules:** Instructions on handling data types, NULLs, and limiting rows.
3.  **Data-Backed Synthesis (Prompt 3):** The generated SQL is executed securely. The raw data rows (JSON) and the user's question are sent back to the LLM to synthesize a conversational, Markdown-formatted answer. It is strictly instructed to *never make up data*.

## 🛡️ Guardrails

1.  **Semantic Reject:** The initial LLM guardrail instantly flags creative writing, jokes, code generation requests, or out-of-domain knowledge, returning a polite rejection message.
2.  **SQL Sandbox:** The backend SQL executor aggressively restricts query operations. It only permits statements starting with `SELECT` or `WITH`, and actively blocks dangerous keywords (`DROP`, `DELETE`, `UPDATE`, `INSERT`).

## 🛠️ Usage

1.  **Install Dependencies:** `npm install`
2.  **Environment Variables:** Create a `.env.local` file and add your Google Gemini API key:
    \`\`\`env
    GEMINI_API_KEY=your_gemini_api_key_here
    \`\`\`
3.  **Run the App:** `npm run dev`
4.  Navigate to `http://localhost:3000` to interact with the system.

## 📝 Example Queries to Try

- "Which products are associated with the highest number of billing documents?"
- "Trace the full flow of billing document 90504248"
- "Identify sales orders that have broken or incomplete flows (e.g. delivered but not billed)"
