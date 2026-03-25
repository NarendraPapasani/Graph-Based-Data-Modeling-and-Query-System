import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import { checkGuardrail, generateSQL, generateAnswer, extractEntities } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { question, conversationHistory = [] } = await request.json();

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: 'Please provide a question.' },
        { status: 400 }
      );
    }

    // Step 1: Guardrail check
    const guardrail = await checkGuardrail(question);
    if (!guardrail.isRelevant) {
      return NextResponse.json({
        answer: '⚠️ This system is designed to answer questions related to the SAP Order-to-Cash dataset only. Your question appears to be outside the scope of this dataset.\n\nYou can ask about:\n- Sales orders, deliveries, billing documents, payments\n- Products, customers, plants\n- Document flows and traceability\n- Data analysis and aggregations',
        sql: null,
        data: null,
        referencedEntities: [],
        guardrailRejected: true,
      });
    }

    // Step 2: Generate SQL
    const { sql, explanation } = await generateSQL(question, conversationHistory);

    if (!sql) {
      return NextResponse.json({
        answer: 'I was unable to generate a query for your question. Could you rephrase it or be more specific about what data you\'re looking for?',
        sql: null,
        data: null,
        referencedEntities: [],
      });
    }

    // Step 3: Execute SQL
    let queryResults;
    try {
      queryResults = executeQuery(sql);
    } catch (sqlError) {
      // If the first SQL fails, try to regenerate
      console.error('SQL execution error:', sqlError.message, 'SQL:', sql);

      // Try a second attempt with error context
      const retryResult = await generateSQL(
        `${question}\n\nNote: The previous SQL query failed with error: "${sqlError.message}". The failing query was: ${sql}. Please fix the query.`,
        conversationHistory
      );

      if (retryResult.sql) {
        try {
          queryResults = executeQuery(retryResult.sql);
        } catch (retryError) {
          return NextResponse.json({
            answer: `I generated a SQL query but it encountered an error: ${retryError.message}. Could you try rephrasing your question?`,
            sql: retryResult.sql,
            data: null,
            referencedEntities: [],
          });
        }
      } else {
        return NextResponse.json({
          answer: `I had trouble querying the data: ${sqlError.message}. Could you try rephrasing your question?`,
          sql,
          data: null,
          referencedEntities: [],
        });
      }
    }

    // Step 4: Generate natural language answer
    const answer = await generateAnswer(question, sql, queryResults, conversationHistory);

    // Step 5: Extract referenced entities for graph highlighting
    const referencedEntities = await extractEntities(answer, queryResults);

    return NextResponse.json({
      answer,
      sql,
      data: {
        columns: queryResults.columns,
        rows: queryResults.rows.slice(0, 50),
        totalRows: queryResults.rows.length,
      },
      referencedEntities,
    });
  } catch (error) {
    console.error('Query API error:', error);
    return NextResponse.json(
      { error: 'An error occurred processing your question. Please try again.' },
      { status: 500 }
    );
  }
}
