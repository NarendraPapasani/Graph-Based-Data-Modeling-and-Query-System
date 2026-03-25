'use client';

import { useState, useRef, useEffect } from 'react';

const SUGGESTIONS = [
  'Which products are associated with the highest number of billing documents?',
  'Trace the full flow of billing document 90504248',
  'Identify sales orders that have been delivered but not billed',
  'What is the total billing amount per customer?',
  'Which plants handle the most deliveries?',
];

export default function ChatPanel({ onHighlightEntities }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question) => {
    if (!question.trim() || loading) return;

    const userMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conversationHistory: messages.slice(-10),
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.error,
            isError: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            sql: data.sql,
            data: data.data,
            referencedEntities: data.referencedEntities,
            guardrailRejected: data.guardrailRejected,
          },
        ]);

        // Highlight referenced entities in graph
        if (data.referencedEntities?.length > 0) {
          onHighlightEntities?.(data.referencedEntities);
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Failed to reach the server. Please try again.',
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="chat-section">
      {/* Header */}
      <div className="chat-header">
        <div>
          <h2>Chat with Graph</h2>
          <p>Order to Cash</p>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <WelcomeMessage onSuggestionClick={sendMessage} />
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} onHighlightEntities={onHighlightEntities} />
        ))}

        {loading && (
          <div className="message message-assistant">
            <div className="message-header">
              <div className="message-avatar agent-avatar">D</div>
              <div className="sender-info">
                <span className="sender-name">Dodge AI</span>
                <span className="sender-role">Graph Agent</span>
              </div>
            </div>
            <div className="message-content">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-wrapper">
        <div className="chat-input-container">
          <div className="chat-status-bar">
            <span className="status-dot"></span> Dodge AI is awaiting instructions
          </div>
          <form className="chat-input-form" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Analyze anything"
              rows={1}
              disabled={loading}
            />
            <div className="chat-input-footer">
              <button
                type="submit"
                className="chat-send-btn"
                disabled={!input.trim() || loading}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function WelcomeMessage({ onSuggestionClick }) {
  return (
    <div className="welcome-message">
      <h3>SAP O2C Data Explorer</h3>
      <p>
        Ask questions about sales orders, deliveries, billing documents,
        payments, products, and customers. Powered by AI with real data queries.
      </p>
      <div className="welcome-suggestions">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            className="suggestion-btn"
            onClick={() => onSuggestionClick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, onHighlightEntities }) {
  const [showSql, setShowSql] = useState(false);
  const [showData, setShowData] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="message message-user">
        <div className="message-header">
          <span className="sender-name">You</span>
          <div className="message-avatar user-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
        </div>
        <div className="message-content">{message.content}</div>
      </div>
    );
  }

  return (
    <div className={`message message-assistant ${message.guardrailRejected ? 'message-guardrail' : ''}`}>
      <div className="message-header">
        <div className="message-avatar agent-avatar">D</div>
        <div className="sender-info">
          <span className="sender-name">Dodge AI</span>
          <span className="sender-role">Graph Agent</span>
        </div>
      </div>
      <div className="message-content">
        <MarkdownContent content={message.content} />

        {/* SQL Toggle */}
        {message.sql && (
          <div className="sql-toggle">
            <button
              className="sql-toggle-btn"
              onClick={() => setShowSql(!showSql)}
            >
              {showSql ? '▾' : '▸'} SQL Query
            </button>
            {showSql && <div className="sql-block">{message.sql}</div>}
          </div>
        )}

        {/* Data Preview */}
        {message.data?.rows?.length > 0 && (
          <div className="data-preview">
            <button
              className="data-preview-btn"
              onClick={() => setShowData(!showData)}
            >
              {showData ? '▾' : '▸'} Data ({message.data.totalRows} rows)
            </button>
            {showData && (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      {message.data.columns.map((col, i) => (
                        <th key={i}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {message.data.rows.slice(0, 15).map((row, i) => (
                      <tr key={i}>
                        {message.data.columns.map((col, j) => (
                          <td key={j}>{String(row[col] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Referenced entities */}
        {message.referencedEntities?.length > 0 && (
          <div className="entities-list">
            {message.referencedEntities.slice(0, 10).map((e, i) => (
              <span
                key={i}
                className="entity-tag"
                style={{
                  background: getEntityBg(e.type),
                  borderColor: getEntityColor(e.type),
                  color: getEntityColor(e.type),
                }}
                onClick={() => onHighlightEntities?.([e])}
              >
                {e.type}: {e.id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ content }) {
  // Simple markdown rendering
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let inList = false;
  let listItems = [];
  let listOrdered = false;

  const flushTable = () => {
    if (tableHeaders.length > 0) {
      elements.push(
        <table key={`table-${elements.length}`}>
          <thead>
            <tr>
              {tableHeaders.map((h, i) => (
                <th key={i}>{h.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    tableHeaders = [];
    tableRows = [];
    inTable = false;
  };

  const flushList = () => {
    if (listItems.length > 0) {
      const Tag = listOrdered ? 'ol' : 'ul';
      elements.push(
        <Tag key={`list-${elements.length}`}>
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </Tag>
      );
    }
    listItems = [];
    inList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!inTable) {
        flushList();
        inTable = true;
        tableHeaders = line.split('|').filter((c) => c.trim());
        continue;
      }
      if (line.replace(/[|\-\s]/g, '') === '') continue; // separator
      tableRows.push(line.split('|').filter((c) => c.trim()));
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={i}>{line.slice(4)}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={i}>{line.slice(3)}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h1 key={i}>{line.slice(2)}</h1>);
      continue;
    }

    // List items
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (ulMatch) {
      if (!inList || listOrdered) { flushList(); inList = true; listOrdered = false; }
      listItems.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      if (!inList || !listOrdered) { flushList(); inList = true; listOrdered = true; }
      listItems.push(olMatch[1]);
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      flushList();
      elements.push(
        <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
      );
    } else {
      flushList();
    }
  }

  flushTable();
  flushList();

  return <>{elements}</>;
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function getEntityColor(type) {
  const colors = {
    sales_order: '#3b82f6',
    delivery: '#0ea5e9',
    billing: '#ef4444',
    product: '#10b981',
    customer: '#f59e0b',
    plant: '#14b8a6',
    journal: '#f97316',
    payment: '#06d6a0',
    accounting_document: '#f97316',
  };
  return colors[type] || '#94a3b8';
}

function getEntityBg(type) {
  const color = getEntityColor(type);
  return `${color}22`;
}
