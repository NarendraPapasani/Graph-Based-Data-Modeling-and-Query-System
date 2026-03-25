'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

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

const NODE_SIZES = {
  customer: 8,
  sales_order: 6,
  so_item: 4,
  product: 6,
  delivery: 6,
  plant: 5,
  billing: 6,
  journal: 5,
  payment: 6,
  address: 4,
};

export default function GraphView({
  graphData,
  loading,
  highlightedEntities,
  onNodeClick,
  onNodeHover,
  selectedNode,
  dimensions,
}) {
  const fgRef = useRef();

  // Build highlighted set for quick lookup
  const highlightSet = useMemo(() => {
    const set = new Set();
    if (highlightedEntities) {
      for (const e of highlightedEntities) {
        set.add(`${e.type}:${e.id}`);
      }
    }
    return set;
  }, [highlightedEntities]);

  // Zoom to fit on first load
  useEffect(() => {
    if (fgRef.current && graphData?.nodes?.length > 0) {
      setTimeout(() => {
        fgRef.current.zoomToFit(400, 60);
      }, 500);
    }
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node) => {
      if (onNodeClick) {
        onNodeClick(node);
      }
      // Center on node
      if (fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 300);
        fgRef.current.zoom(3, 300);
      }
    },
    [onNodeClick]
  );

    const nodeCanvasObject = useCallback(
      (node, ctx, globalScale) => {
        const isHighlighted = highlightSet.has(node.id);
        const isSelected = selectedNode?.id === node.id;
        const baseSize = NODE_SIZES[node.type] || 5;
        const size = isHighlighted ? baseSize * 1.5 : isSelected ? baseSize * 1.5 : baseSize;
        const color = NODE_COLORS[node.type] || '#94a3b8';

        // Background circle (hollow by default, filled for selected or main hubs)
        const isHub = node.type === 'customer' || node.type === 'sales_order';
        const isFilled = isHub || isHighlighted || isSelected;

        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = isFilled ? color : '#ffffff';
        ctx.fill();

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = isFilled ? 0.5 : 1.5;
        if (isFilled && !isHub) {
          ctx.strokeStyle = '#2563eb';
        }
        ctx.stroke();

        // Inner dot if filled but not a hub
        if (isFilled && !isHub && size > 3) {
           ctx.beginPath();
           ctx.arc(node.x, node.y, size / 3, 0, 2 * Math.PI);
           ctx.fillStyle = '#ffffff';
           ctx.fill();
        }

        // Label (only show at certain zoom levels)
        if (globalScale > 2 || isHighlighted || isSelected) {
          const label = node.label || '';
          const fontSize = Math.max(10 / globalScale, 2.5);
          ctx.font = `${isHighlighted || isSelected ? '600' : '500'} ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#0f172a'; // Dark text
          ctx.fillText(label, node.x, node.y + size + 2);
        }
      },
      [highlightSet, selectedNode]
    );

  const linkCanvasObject = useCallback(
    (link, ctx) => {
      const sourceHighlighted = highlightSet.has(link.source.id);
      const targetHighlighted = highlightSet.has(link.target.id);
      const isHighlighted = sourceHighlighted && targetHighlighted;

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isHighlighted
        ? 'rgba(59, 130, 246, 0.8)'
        : '#bfdbfe';
      ctx.lineWidth = isHighlighted ? 1.5 : 0.6;
      ctx.stroke();
    },
    [highlightSet]
  );

  // Convert edges to links format for force graph — must be before early returns
  const processedData = useMemo(() => {
    if (!graphData?.nodes?.length) return { nodes: [], links: [] };

    const nodeIds = new Set(graphData.nodes.map((n) => n.id));
    const validLinks = graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      }));

    return {
      nodes: graphData.nodes.map((n) => ({ ...n })),
      links: validLinks,
    };
  }, [graphData]);

  if (loading) {
    return (
      <div className="graph-loading">
        <div className="graph-loading-spinner" />
        <span>Loading graph data...</span>
      </div>
    );
  }

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="graph-loading">
        <span>No graph data available</span>
      </div>
    );
  }

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={processedData}
      width={dimensions?.width || 800}
      height={dimensions?.height || 600}
      nodeCanvasObject={nodeCanvasObject}
      linkCanvasObject={linkCanvasObject}
      onNodeClick={handleNodeClick}
      onNodeHover={onNodeHover}
      nodeLabel={() => ''} /* Disable native tooltip in favor of NodeDetail */
      enableNodeDrag={true}
      enableZoomPanInteraction={true}
      d3AlphaDecay={0.04}
      d3VelocityDecay={0.3}
      cooldownTicks={100}
      backgroundColor="transparent"
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={0.9}
    />
  );
}
