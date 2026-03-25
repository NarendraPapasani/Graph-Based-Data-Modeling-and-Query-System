'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import ChatPanel from '@/components/ChatPanel';
import NodeDetail from '@/components/NodeDetail';

// Dynamic import for force graph (no SSR)
const GraphView = dynamic(() => import('@/components/GraphView'), {
  ssr: false,
  loading: () => (
    <div className="graph-loading">
      <div className="graph-loading-spinner" />
      <span>Loading graph engine...</span>
    </div>
  ),
});

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

const LEGEND_ITEMS = [
  { type: 'customer', label: 'Customer' },
  { type: 'sales_order', label: 'Sales Order' },
  { type: 'product', label: 'Product' },
  { type: 'delivery', label: 'Delivery' },
  { type: 'plant', label: 'Plant' },
  { type: 'billing', label: 'Billing' },
  { type: 'journal', label: 'Journal' },
  { type: 'payment', label: 'Payment' },
];

export default function HomePage() {
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [highlightedEntities, setHighlightedEntities] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const graphSectionRef = useRef(null);

  // Load initial graph data
  useEffect(() => {
    async function loadGraph() {
      try {
        const res = await fetch('/api/graph');
        const data = await res.json();
        setGraphData(data);
      } catch (error) {
        console.error('Failed to load graph:', error);
      } finally {
        setGraphLoading(false);
      }
    }
    loadGraph();
  }, []);

  // Handle resize
  useEffect(() => {
    function updateDimensions() {
      if (graphSectionRef.current) {
        const rect = graphSectionRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    }

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeClick = useCallback(
    async (node) => {
      setSelectedNode(node);

      // Expand neighbors
      try {
        const [type, id] = node.id.split(':');
        if (!type || !id) return;

        const res = await fetch(`/api/graph?nodeType=${type}&nodeId=${id}`);
        const neighborData = await res.json();

        if (neighborData.nodes?.length > 0) {
          setGraphData((prev) => {
            if (!prev) return prev;

            const existingIds = new Set(prev.nodes.map((n) => n.id));
            const existingEdges = new Set(
              prev.edges.map((e) => `${e.source}-${e.target}`)
            );

            const newNodes = neighborData.nodes.filter(
              (n) => !existingIds.has(n.id)
            );
            const newEdges = neighborData.edges.filter(
              (e) => !existingEdges.has(`${e.source}-${e.target}`)
            );

            return {
              nodes: [...prev.nodes, ...newNodes],
              edges: [...prev.edges, ...newEdges],
            };
          });
        }
      } catch (error) {
        console.error('Failed to load neighbors:', error);
      }
    },
    []
  );

  const handleHighlightEntities = useCallback((entities) => {
    setHighlightedEntities(entities);
    // Clear highlights after 10 seconds
    setTimeout(() => setHighlightedEntities([]), 10000);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (graphSectionRef.current) {
      const rect = graphSectionRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  return (
    <div className="app-container">
      {/* Global Header */}
      <div className="app-header">
        <div className="app-title">
          <div className="app-title-icon" />
          Mapping / <span>Order to Cash</span>
        </div>
      </div>

      <div className="main-content">
        {/* Graph Section */}
        <div className="graph-section" ref={graphSectionRef} onMouseMove={handleMouseMove}>
          {/* Graph Controls overlay */}
          <div className="graph-controls">
            <button className="graph-control-btn white">
              <span className="icon-expand">⤢</span> Minimize
            </button>
            <button className="graph-control-btn black">
              <span className="icon-layers">⚏</span> Hide Granular Overlay
            </button>
          </div>

        {/* Graph Canvas */}
        <GraphView
          graphData={graphData}
          loading={graphLoading}
          highlightedEntities={highlightedEntities}
          onNodeClick={handleNodeClick}
          onNodeHover={setHoveredNode}
          selectedNode={selectedNode}
          dimensions={dimensions}
        />

        {/* Legend */}
        <div className="graph-legend">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.type} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: NODE_COLORS[item.type] }}
              />
              {item.label}
            </div>
          ))}
        </div>

        {/* Node Detail Panel */}
        {(selectedNode || hoveredNode) && (
          <NodeDetail
            node={hoveredNode || selectedNode}
            pos={hoveredNode ? mousePos : null}
            isPersistent={!!selectedNode && !hoveredNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Chat Section */}
      <ChatPanel onHighlightEntities={handleHighlightEntities} />
      </div>
    </div>
  );
}
