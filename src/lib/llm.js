import Groq from 'groq-sdk';
import { getSchema } from './db';

let groqClient = null;

function getGroq() {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

/**
 * Build the schema description for the LLM prompt.
 */
function buildSchemaContext() {
  const schema = getSchema();
  let context = 'DATABASE SCHEMA:\n\n';

  for (const table of schema) {
    context += `TABLE: ${table.table} (${table.rowCount} rows)\n`;
    context += `COLUMNS: ${table.columns.map((c) => `${c.name} (${c.type})`).join(', ')}\n`;
    if (table.sampleRows.length > 0) {
      context += `SAMPLE: ${JSON.stringify(table.sampleRows[0])}\n`;
    }
    context += '\n';
  }

  context += `
KEY RELATIONSHIPS:
- sales_order_headers.sold_to_party → business_partners.customer (Customer placed Sales Order)
- sales_order_items.sales_order → sales_order_headers.sales_order (Sales Order contains Items)
- sales_order_items.material → products.product (Sales Order Item refers to Product)
- sales_order_schedule_lines.sales_order, .sales_order_item → sales_order_items (Schedule Lines for Items)
- outbound_delivery_items.reference_sd_document → sales_order_headers.sales_order (Delivery fulfills Sales Order)
- outbound_delivery_items.delivery_document → outbound_delivery_headers.delivery_document (Delivery Items belong to Delivery)
- outbound_delivery_items.plant → plants.plant (Delivery shipped from Plant)
- billing_document_items.reference_sd_document → outbound_delivery_headers.delivery_document (Billing for Delivery)
- billing_document_items.billing_document → billing_document_headers.billing_document (Billing Items belong to Billing Doc)
- billing_document_headers.accounting_document → journal_entry_items_accounts_receivable.accounting_document (Billing creates Journal Entry)
- billing_document_headers.sold_to_party → business_partners.customer (Customer billed)
- journal_entry_items_accounts_receivable.clearing_accounting_document → payments_accounts_receivable.accounting_document (Journal cleared by Payment)
- payments_accounts_receivable.customer → business_partners.customer (Payment from Customer)
- product_descriptions.product → products.product (Product has Description)
- product_plants.product → products.product, product_plants.plant → plants.plant (Product available at Plant)
- business_partner_addresses.business_partner → business_partners.business_partner (BP has Address)
- customer_sales_area_assignments.customer → business_partners.customer (Customer Sales Area config)
- customer_company_assignments.customer → business_partners.customer (Customer Company config)
- billing_document_cancellations.billing_document → billing_document_headers.billing_document (Cancelled Billing Docs)

ORDER-TO-CASH FLOW:
Sales Order → Delivery → Billing Document → Journal Entry → Payment
`;

  return context;
}

let cachedSchema = null;

function getSchemaContext() {
  if (!cachedSchema) {
    cachedSchema = buildSchemaContext();
  }
  return cachedSchema;
}

/**
 * Check if a query is relevant to the dataset domain.
 * Returns { isRelevant: boolean, reason: string }
 */
export async function checkGuardrail(question) {
  const groq = getGroq();

  const systemPrompt = `You are a guard that determines if a user question is relevant to an SAP Order-to-Cash business dataset.

The dataset contains: Sales Orders, Deliveries, Billing Documents, Journal Entries, Payments, Products, Customers/Business Partners, Plants, and their relationships.

Valid topics include:
- Questions about orders, deliveries, invoices/billing, payments, products, customers, plants
- Data analysis, aggregations, trends, flows, tracing document chains
- Business process questions related to order-to-cash cycle
- Questions about relationships between entities

Invalid topics include:
- General knowledge questions not related to the dataset
- Creative writing, storytelling, jokes
- Personal advice, opinions
- Programming help unrelated to querying this data
- Current events, news, weather
- Any topic not directly about the SAP O2C dataset

Respond with ONLY a JSON object exactly matching this format:
{"isRelevant": true, "reason": "brief explanation"}`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = chatCompletion.choices[0]?.message?.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('Guardrail error:', error);
    return { isRelevant: true, reason: 'Could not parse guardrail response' };
  }
}

/**
 * Generate SQL from a natural language question.
 * Returns { sql: string, explanation: string }
 */
export async function generateSQL(question, conversationHistory = []) {
  const groq = getGroq();
  const schemaContext = getSchemaContext();

  const systemPrompt = `You are an expert SQL analyst for an SAP Order-to-Cash dataset stored in SQLite.

${schemaContext}

INSTRUCTIONS:
1. Generate a valid SQLite SELECT query to answer the user's question.
2. Use proper JOINs based on the KEY RELATIONSHIPS above.
3. Always limit results to at most 50 rows unless the user asks for all.
4. Use table and column names exactly as shown in the schema (snake_case, quoted with double quotes if needed).
5. For tracing flows, JOIN across multiple tables following the Order-to-Cash path.
6. Handle NULLs appropriately.
7. Return ONLY a JSON object with this exact structure:
   {"sql": "YOUR SQL QUERY HERE or null if cannot answer", "explanation": "Brief explanation of what the query does or why you cannot answer"}

IMPORTANT:
- Table names use underscores, not camelCase.
- String values in the data may have leading zeros (e.g., material codes like "S890736700XXXX").
- Dates are stored as ISO strings like "2025-03-31T00:00:00.000Z".
- Amounts are stored as TEXT, cast to REAL for numeric operations: CAST(column AS REAL).
- Always use double quotes for table/column names if they might conflict with SQL keywords.
- Users often copy entity IDs directly from the graph UI, which includes prefixes. **You must REMOVE these prefixes when querying the database.**
  - "SO 7..." -> Table: sales_order_headers, Column: sales_order
  - "Item ..." -> Table: sales_order_items, Column: sales_order_item
  - "DEL 807..." -> Table: outbound_delivery_headers, Column: delivery_document
  - "BILL 905..." (or similar) -> Table: billing_document_headers, Column: billing_document
  - "JE 940..." -> Table: journal_entry_items_accounts_receivable, Column: accounting_document
  - "PAY 940..." -> Table: payments_accounts_receivable, Column: accounting_document
  For example, if the user asks for "BILL 91150172", your SQL should use \`WHERE billing_document = '91150172'\`.`;

  const messages = [{ role: 'system', content: systemPrompt }];
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-6));
  }
  messages.push({ role: 'user', content: question });

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = chatCompletion.choices[0]?.message?.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('SQL generation error:', error);
    return {
      sql: null,
      explanation: 'Failed to generate SQL query',
    };
  }
}

/**
 * Generate a natural language answer from query results.
 */
export async function generateAnswer(question, sql, queryResults, conversationHistory = []) {
  const groq = getGroq();

  const resultPreview =
    queryResults.rows.length > 0
      ? JSON.stringify(queryResults.rows.slice(0, 20), null, 2)
      : 'No results found';

  const systemPrompt = `You are a helpful data analyst for an SAP Order-to-Cash system. You answer questions based on actual data query results.

RULES:
1. Answer based ONLY on the provided data. Never make up information.
2. If the data is empty, say so clearly.
3. Format numbers, dates, and amounts clearly.
4. Use markdown formatting: tables, bold, bullet points for readability.
5. If the results show entity IDs, mention them so the user can explore them in the graph.
6. Be concise but thorough.
7. If the result set is large, summarize key findings and highlight notable patterns.`;

  const messages = [{ role: 'system', content: systemPrompt }];
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-6));
  }
  messages.push({
    role: 'user',
    content: `Question: ${question}\n\nSQL Query executed:\n${sql}\n\nQuery Results:\n${resultPreview}\n\nPlease provide a clear, data-backed answer to the question.`,
  });

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
    });

    return chatCompletion.choices[0]?.message?.content;
  } catch (error) {
    console.error('Answer generation error:', error);
    return 'I apologize, but I encountered an error while formulating your answer based on the data.';
  }
}

/**
 * Extract entity references from the answer for graph highlighting.
 */
export async function extractEntities(answer, queryResults) {
  const entities = [];

  if (!queryResults.rows || queryResults.rows.length === 0) return entities;

  // Look for known entity ID patterns in the results
  const entityPatterns = {
    sales_order: /^7\d{5}$/,
    delivery_document: /^807\d{5}$/,
    billing_document: /^905\d{5}$/,
    product: /^[A-Z0-9]{5,}$/,
    customer: /^3[12]\d{7}$/,
    plant: /^[A-Z0-9]{4}$/,
    accounting_document: /^940\d{7}$/,
  };

  const columns = queryResults.columns || [];
  for (const row of queryResults.rows.slice(0, 20)) {
    for (const col of columns) {
      const value = String(row[col] || '');
      for (const [type, pattern] of Object.entries(entityPatterns)) {
        if (col.toLowerCase().includes(type.replace('_', '')) || col.toLowerCase().includes(type)) {
          if (value && value !== 'null') {
            entities.push({ type, id: value });
          }
          break;
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return entities.filter((e) => {
    const key = `${e.type}:${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
