import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/graph — Returns the full graph structure for visualization.
 * Optional query params:
 *   ?nodeType=X&nodeId=Y — Get neighbors of a specific node
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const nodeType = searchParams.get('nodeType');
    const nodeId = searchParams.get('nodeId');

    if (nodeType && nodeId) {
      return NextResponse.json(getNeighbors(nodeType, nodeId));
    }

    return NextResponse.json(getOverviewGraph());
  } catch (error) {
    console.error('Graph API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Build the overview graph with core entity nodes and edges.
 * Shows: Customers → Sales Orders → Deliveries → Billing → Journal → Payment
 * Plus Products and Plants.
 */
function getOverviewGraph() {
  const db = getDb();
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();

  function addNode(id, type, label, data = {}) {
    if (nodeSet.has(id)) return;
    nodeSet.add(id);
    nodes.push({ id, type, label, data });
  }

  function addEdge(source, target, relationship) {
    edges.push({ source, target, relationship });
  }

  // 1. Customers (Business Partners)
  const customers = db.prepare(`
    SELECT bp.business_partner, bp.customer, bp.business_partner_full_name,
           bp.organization_bp_name1
    FROM business_partners bp
  `).all();

  for (const c of customers) {
    addNode(
      `customer:${c.customer}`,
      'customer',
      c.business_partner_full_name || c.organization_bp_name1 || c.customer,
      c
    );
  }

  // 2. Sales Orders
  const salesOrders = db.prepare(`
    SELECT soh.sales_order, soh.sold_to_party, soh.total_net_amount,
           soh.transaction_currency, soh.creation_date,
           soh.overall_delivery_status, soh.overall_ord_reltd_billg_status
    FROM sales_order_headers soh
  `).all();

  for (const so of salesOrders) {
    addNode(
      `sales_order:${so.sales_order}`,
      'sales_order',
      `SO ${so.sales_order}`,
      { ...so, totalNetAmount: so.total_net_amount, currency: so.transaction_currency }
    );
    // Customer → Sales Order
    addEdge(`customer:${so.sold_to_party}`, `sales_order:${so.sales_order}`, 'PLACED_ORDER');
  }

  // 3. Sales Order Items → Products
  const soItems = db.prepare(`
    SELECT soi.sales_order, soi.sales_order_item, soi.material,
           soi.net_amount, soi.requested_quantity, soi.production_plant
    FROM sales_order_items soi
  `).all();

  for (const item of soItems) {
    addNode(
      `so_item:${item.sales_order}:${item.sales_order_item}`,
      'so_item',
      `Item ${item.sales_order_item}`,
      item
    );
    addEdge(
      `sales_order:${item.sales_order}`,
      `so_item:${item.sales_order}:${item.sales_order_item}`,
      'HAS_ITEM'
    );

    // Link to product
    if (item.material) {
      const prodDesc = db.prepare(`
        SELECT pd.product_description FROM product_descriptions pd
        WHERE pd.product = ? AND pd.language = 'EN' LIMIT 1
      `).get(item.material);

      addNode(
        `product:${item.material}`,
        'product',
        prodDesc?.product_description || item.material,
        { product: item.material, description: prodDesc?.product_description }
      );
      addEdge(
        `so_item:${item.sales_order}:${item.sales_order_item}`,
        `product:${item.material}`,
        'CONTAINS_PRODUCT'
      );
    }
  }

  // 4. Outbound Deliveries
  const deliveries = db.prepare(`
    SELECT DISTINCT odh.delivery_document, odh.actual_goods_movement_date,
           odh.creation_date, odh.overall_goods_movement_status, odh.overall_picking_status,
           odh.shipping_point
    FROM outbound_delivery_headers odh
  `).all();

  for (const d of deliveries) {
    addNode(`delivery:${d.delivery_document}`, 'delivery', `DEL ${d.delivery_document}`, d);
  }

  // Link deliveries to sales orders
  const delItems = db.prepare(`
    SELECT odi.delivery_document, odi.reference_sd_document, odi.plant
    FROM outbound_delivery_items odi
    WHERE odi.reference_sd_document IS NOT NULL AND odi.reference_sd_document != ''
  `).all();

  for (const di of delItems) {
    addEdge(`sales_order:${di.reference_sd_document}`, `delivery:${di.delivery_document}`, 'DELIVERED_BY');

    // Link to plant
    if (di.plant) {
      const plantInfo = db.prepare(`SELECT plant_name FROM plants WHERE plant = ? LIMIT 1`).get(di.plant);
      addNode(`plant:${di.plant}`, 'plant', plantInfo?.plant_name || di.plant, { plant: di.plant, plantName: plantInfo?.plant_name });
      addEdge(`delivery:${di.delivery_document}`, `plant:${di.plant}`, 'SHIPPED_FROM');
    }
  }

  // 5. Billing Documents
  const billingDocs = db.prepare(`
    SELECT bdh.billing_document, bdh.billing_document_type, bdh.total_net_amount,
           bdh.transaction_currency, bdh.creation_date, bdh.sold_to_party,
           bdh.accounting_document, bdh.billing_document_is_cancelled
    FROM billing_document_headers bdh
  `).all();

  for (const bd of billingDocs) {
    addNode(`billing:${bd.billing_document}`, 'billing', `BILL ${bd.billing_document}`, bd);
  }

  // Link billing to deliveries
  const billItems = db.prepare(`
    SELECT DISTINCT bdi.billing_document, bdi.reference_sd_document
    FROM billing_document_items bdi
    WHERE bdi.reference_sd_document IS NOT NULL AND bdi.reference_sd_document != ''
  `).all();

  for (const bi of billItems) {
    addEdge(`delivery:${bi.reference_sd_document}`, `billing:${bi.billing_document}`, 'BILLED_BY');
  }

  // 6. Journal Entries
  const journals = db.prepare(`
    SELECT DISTINCT je.accounting_document, je.fiscal_year, je.customer,
           je.posting_date, je.clearing_accounting_document
    FROM journal_entry_items_accounts_receivable je
  `).all();

  for (const je of journals) {
    addNode(
      `journal:${je.accounting_document}`,
      'journal',
      `JE ${je.accounting_document}`,
      je
    );
  }

  // Link billing → journal
  for (const bd of billingDocs) {
    if (bd.accounting_document) {
      addEdge(`billing:${bd.billing_document}`, `journal:${bd.accounting_document}`, 'CREATES_ENTRY');
    }
  }

  // 7. Payments
  const payments = db.prepare(`
    SELECT DISTINCT par.accounting_document, par.customer,
           par.amount_in_transaction_currency, par.transaction_currency,
           par.posting_date
    FROM payments_accounts_receivable par
  `).all();

  for (const p of payments) {
    addNode(
      `payment:${p.accounting_document}`,
      'payment',
      `PAY ${p.accounting_document}`,
      p
    );
  }

  // Link journal → payment via clearing document
  for (const je of journals) {
    if (je.clearing_accounting_document) {
      addEdge(`journal:${je.accounting_document}`, `payment:${je.clearing_accounting_document}`, 'CLEARED_BY');
    }
  }

  // Plants not yet added
  const allPlants = db.prepare('SELECT plant, plant_name FROM plants').all();
  for (const p of allPlants) {
    addNode(`plant:${p.plant}`, 'plant', p.plant_name || p.plant, p);
  }

  return { nodes, edges };
}

/**
 * Get neighbors of a specific node for progressive expansion.
 */
function getNeighbors(nodeType, nodeId) {
  const db = getDb();
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();

  function addNode(id, type, label, data = {}) {
    if (nodeSet.has(id)) return;
    nodeSet.add(id);
    nodes.push({ id, type, label, data });
  }

  function addEdge(source, target, relationship) {
    edges.push({ source, target, relationship });
  }

  switch (nodeType) {
    case 'customer': {
      // Find sales orders for this customer
      const orders = db.prepare(`
        SELECT * FROM sales_order_headers WHERE sold_to_party = ?
      `).all(nodeId);
      for (const o of orders) {
        addNode(`sales_order:${o.sales_order}`, 'sales_order', `SO ${o.sales_order}`, o);
        addEdge(`customer:${nodeId}`, `sales_order:${o.sales_order}`, 'PLACED_ORDER');
      }
      // Find address
      const bp = db.prepare(`SELECT business_partner FROM business_partners WHERE customer = ?`).get(nodeId);
      if (bp) {
        const addr = db.prepare(`SELECT * FROM business_partner_addresses WHERE business_partner = ?`).get(bp.business_partner);
        if (addr) {
          addNode(`address:${bp.business_partner}`, 'address', `${addr.city_name}, ${addr.country}`, addr);
          addEdge(`customer:${nodeId}`, `address:${bp.business_partner}`, 'LOCATED_AT');
        }
      }
      break;
    }
    case 'sales_order': {
      // Items
      const items = db.prepare(`SELECT * FROM sales_order_items WHERE sales_order = ?`).all(nodeId);
      for (const item of items) {
        addNode(`so_item:${item.sales_order}:${item.sales_order_item}`, 'so_item', `Item ${item.sales_order_item}`, item);
        addEdge(`sales_order:${nodeId}`, `so_item:${item.sales_order}:${item.sales_order_item}`, 'HAS_ITEM');
      }
      // Deliveries
      const dels = db.prepare(`
        SELECT DISTINCT odi.delivery_document, odh.*
        FROM outbound_delivery_items odi
        JOIN outbound_delivery_headers odh ON odi.delivery_document = odh.delivery_document
        WHERE odi.reference_sd_document = ?
      `).all(nodeId);
      for (const d of dels) {
        addNode(`delivery:${d.delivery_document}`, 'delivery', `DEL ${d.delivery_document}`, d);
        addEdge(`sales_order:${nodeId}`, `delivery:${d.delivery_document}`, 'DELIVERED_BY');
      }
      break;
    }
    case 'delivery': {
      // Billing docs
      const bills = db.prepare(`
        SELECT DISTINCT bdi.billing_document, bdh.*
        FROM billing_document_items bdi
        JOIN billing_document_headers bdh ON bdi.billing_document = bdh.billing_document
        WHERE bdi.reference_sd_document = ?
      `).all(nodeId);
      for (const b of bills) {
        addNode(`billing:${b.billing_document}`, 'billing', `BILL ${b.billing_document}`, b);
        addEdge(`delivery:${nodeId}`, `billing:${b.billing_document}`, 'BILLED_BY');
      }
      break;
    }
    case 'billing': {
      // Journal entry
      const bd = db.prepare(`SELECT * FROM billing_document_headers WHERE billing_document = ?`).get(nodeId);
      if (bd?.accounting_document) {
        const je = db.prepare(`SELECT * FROM journal_entry_items_accounts_receivable WHERE accounting_document = ? LIMIT 1`).get(bd.accounting_document);
        if (je) {
          addNode(`journal:${je.accounting_document}`, 'journal', `JE ${je.accounting_document}`, je);
          addEdge(`billing:${nodeId}`, `journal:${je.accounting_document}`, 'CREATES_ENTRY');
        }
      }
      break;
    }
    case 'product': {
      // Sales order items containing this product
      const items = db.prepare(`SELECT * FROM sales_order_items WHERE material = ?`).all(nodeId);
      for (const item of items) {
        addNode(`sales_order:${item.sales_order}`, 'sales_order', `SO ${item.sales_order}`, item);
        addEdge(`product:${nodeId}`, `sales_order:${item.sales_order}`, 'ORDERED_IN');
      }
      break;
    }
    default:
      break;
  }

  return { nodes, edges };
}
