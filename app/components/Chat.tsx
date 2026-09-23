"use client";

import { FormEvent, useState } from "react";

type Doc = { id: string; name: string };
type Source = { document_id: string; chunk_id: string; page_number: number | null; quote: string; relevance_score: number };
type Entity = { text: string; label: string };
type QueryResult = { answer: string; confidence: number; sources: Source[]; entities: Entity[] };
type ApiError = { detail?: string | { message?: string } };

function errorMessage(body: ApiError): string {
  return typeof body.detail === "string" ? body.detail : (body.detail?.message ?? "The query could not be completed.");
}

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export default function Chat({ token, docs }: { token: string; docs: Doc[] }) {
  const [question, setQuestion] = useState("");
  const [filter, setFilter] = useState("");
  const [topK, setTopK] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const documentNames = new Map(docs.map((document) => [document.id, document.name]));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question: trimmedQuestion,
          ...(filter.trim() ? { filter: filter.trim() } : {}),
          top_k: topK,
        }),
      });
      const body = (await response.json()) as QueryResult | ApiError;
      if (!response.ok) throw new Error(errorMessage(body as ApiError));
      setResult(body as QueryResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The query could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="query-workspace" aria-labelledby="query-title">
      <header className="query-intro">
        <p className="eyebrow">RETRIEVAL WORKSPACE</p>
        <h1 id="query-title">Ask your documents</h1>
        <p className="muted">Get an evidence-grounded answer with the passages used to produce it.</p>
      </header>

      <form onSubmit={handleSubmit} className="query-panel">
        <label className="question-field" htmlFor="query-question">
          <span>Question</span>
          <textarea id="query-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: What are the key risks in this plan?" disabled={isSubmitting} rows={3} />
        </label>
        <div className="query-options">
          <label htmlFor="query-filter">
            <span>Focus results <em>Optional</em></span>
            <input id="query-filter" type="text" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Entity, person, team, or topic" disabled={isSubmitting} />
            <small>Uses matching document entities to guide retrieval.</small>
          </label>
          <label htmlFor="query-top-k">
            <span>Evidence passages</span>
            <select id="query-top-k" value={topK} onChange={(event) => setTopK(Number(event.target.value))} disabled={isSubmitting}>
              {[1, 3, 5, 8, 10, 15, 20].map((value) => <option key={value} value={value}>{value} passages</option>)}
            </select>
            <small>Choose how many cited passages to return.</small>
          </label>
        </div>
        <div className="query-actions">
          <p>{docs.length > 0 ? `${docs.length} authorized document${docs.length === 1 ? "" : "s"} available` : "Only authorized documents are searched"}</p>
          <button className="primary query-submit" type="submit" disabled={isSubmitting || !question.trim()}>{isSubmitting ? "Searching documents…" : "Search documents"}</button>
        </div>
      </form>

      {error && <p className="form-error query-error" role="alert">{error}</p>}
      {isSubmitting && <div className="query-loading" role="status"><span aria-hidden="true" />Finding authorized evidence and preparing an answer…</div>}

      {result && <div className="query-results">
        <article className="answer-card">
          <div className="answer-heading"><div><p className="eyebrow">GROUNDED ANSWER</p><h2>Answer</h2></div><span className="confidence-badge">{percentage(result.confidence)} evidence confidence</span></div>
          <p className="answer-copy">{result.answer}</p>
          {result.entities.length > 0 && <div className="entity-row"><span>Guided by entities</span>{result.entities.map((entity) => <i key={`${entity.label}-${entity.text}`}>{entity.text}</i>)}</div>}
        </article>
        <section className="sources-section" aria-labelledby="sources-title">
          <div className="sources-heading"><div><p className="eyebrow">VERIFIABLE EVIDENCE</p><h2 id="sources-title">Sources</h2></div><span>{result.sources.length} cited passage{result.sources.length === 1 ? "" : "s"}</span></div>
          <div className="source-list">{result.sources.map((source, index) => <article key={source.chunk_id} className="source-card">
            <div className="source-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="source-content"><div className="source-meta"><strong>{documentNames.get(source.document_id) ?? "Authorized document"}</strong><span>{source.page_number === null ? "Source passage" : `Page ${source.page_number}`}</span></div><blockquote>{source.quote}</blockquote></div>
            <span className="source-score">{percentage(source.relevance_score)} match</span>
          </article>)}</div>
        </section>
      </div>}

      {!result && !isSubmitting && !error && <div className="query-empty"><span aria-hidden="true">⌕</span><strong>Start with a question</strong><p>Use a focus term to guide retrieval, or choose more passages when you need broader evidence.</p></div>}
    </section>
  );
}
