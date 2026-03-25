'use client';

const NODE_COLORS = {
  customer: '#f59e0b',
  sales_order: '#3b82f6',
  so_item: '#6366f1',
  product: '#10b981',
  delivery: '#0ea5e9',
  plant: '#14b8a6',
  billing: '#ef4444',
  journal: '#f97316',
  payment: '#06d6a0',
  address: '#94a3b8',
};

const TYPE_LABELS = {
  customer: 'Customer',
  sales_order: 'Sales Order',
  so_item: 'SO Item',
  product: 'Product',
  delivery: 'Delivery',
  plant: 'Plant',
  billing: 'Billing Doc',
  journal: 'Journal Entry',
  payment: 'Payment',
  address: 'Address',
};

// Keys to hide from the detail view
const HIDDEN_KEYS = ['x', 'y', 'vx', 'vy', 'index', '__indexColor', 'fx', 'fy'];

export default function NodeDetail({ node, onClose, pos, isPersistent }) {
  if (!node) return null;

  const color = NODE_COLORS[node.type] || '#94a3b8';
  const typeLabel = TYPE_LABELS[node.type] || node.type;

  // Merge node data with top-level props
  const allData = {
    ...(node.data || {}),
  };

  // Filter out internal force-graph props
  const displayProps = Object.entries(allData).filter(
    ([key]) => !HIDDEN_KEYS.includes(key) && key !== 'type' && key !== 'label' && key !== 'id' && key !== 'data'
  );

  return (
    <div 
      className="node-detail-panel"
      style={pos ? { 
        left: pos.x + 15, 
        top: pos.y + 15, 
        position: 'absolute',
        pointerEvents: isPersistent ? 'auto' : 'none'
      } : {}}
    >
      <div className="node-detail-header" style={{ display: isPersistent ? 'flex' : 'none' }}>
        <span
          className="node-detail-type"
          style={{ background: `${color}33`, color }}
        >
          {typeLabel}
        </span>
        <button className="node-detail-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="node-detail-title">{node.label}</div>

      <div className="node-detail-props">
        {displayProps.map(([key, value]) => (
          <div className="node-prop" key={key}>
            <span className="node-prop-key">{formatKey(key)}</span>
            <span className="node-prop-value">{formatValue(value)}</span>
          </div>
        ))}

        {displayProps.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
            No additional properties
          </div>
        )}
      </div>
    </div>
  );
}

function formatKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean' || value === 0 || value === 1) {
    if (value === true || value === 1) return '✓ Yes';
    return '✗ No';
  }
  if (typeof value === 'object') return JSON.stringify(value);

  // Format dates
  const str = String(value);
  if (str.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return str.split('T')[0];
  }
  return str;
}
