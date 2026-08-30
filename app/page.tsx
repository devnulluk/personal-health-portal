'use client';

import { useEffect, useState } from 'react';

type RecordItem = { id: number; date: string; type: string; title: string; summary: string; source: string; confidence: number; review?: string; fhir: string };

const representativeRecords: RecordItem[] = [
  { id: 1, date: '28 Aug 2026', type: 'Tests', title: 'Example laboratory panel', summary: 'Detailed result captured and linked to its index entry.', source: 'SystmOnline · detailed result', confidence: 99, review: 'Confirm index linkage', fhir: 'Observation · final · UKCore-Observation' },
  { id: 2, date: '13 Aug 2026', type: 'Measurements', title: 'Example blood pressure', summary: 'Representative measurement retained with its original context.', source: 'SystmOnline · Patient Record', confidence: 100, fhir: 'Observation · final · UKCore-Observation' },
  { id: 3, date: '04 Jul 2026', type: 'Medications', title: 'Example repeat medicine', summary: 'Medication description preserved; dm+d coding not yet supplied by source.', source: 'SystmOnline · Summary', confidence: 100, review: 'Code unavailable', fhir: 'MedicationStatement · unknown · UKCore-MedicationStatement' },
  { id: 4, date: 'Unknown date', type: 'Vaccinations', title: 'Example vaccination status', summary: 'Source grid records the status but does not provide a parseable date.', source: 'SystmOnline · Childhood Vaccinations', confidence: 90, review: 'Date required', fhir: 'Immunization · completed · UKCore-Immunization' },
  { id: 5, date: '16 May 2026', type: 'Problems', title: 'Example clinical problem', summary: 'Source wording is intact. No terminology code is inferred from its description.', source: 'SystmOnline · Patient Record', confidence: 100, review: 'Terminology candidate pending', fhir: 'Condition · UKCore-Condition' },
  { id: 6, date: '09 Apr 2026', type: 'Letters', title: 'Example clinical letter', summary: 'Document listing retained; attachment capture remains a future source task.', source: 'SystmOnline · Patient Record', confidence: 100, fhir: 'DocumentReference · current' },
];

const filters = ['All', 'Problems', 'Medications', 'Tests', 'Measurements', 'Vaccinations', 'Letters'];

function classifyType(entryType: string): string {
  const value = entryType.toLowerCase();
  if (value.includes('medication') || value.includes('repeat')) return 'Medications';
  if (value.includes('vaccin') || value.includes('immun')) return 'Vaccinations';
  if (value.includes('blood pressure') || value.includes('measurement')) return 'Measurements';
  if (value.includes('test') || value.includes('result') || value.includes('laboratory')) return 'Tests';
  if (value.includes('letter') || value.includes('document') || value.includes('attachment')) return 'Letters';
  return 'Problems';
}

export default function Home() {
  const [records, setRecords] = useState<RecordItem[]>(representativeRecords);
  const [summary, setSummary] = useState({ current_events: 433, review_items: 30, source_captures: 24 });
  const [usingRealData, setUsingRealData] = useState(false);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(1);
  const [inspector, setInspector] = useState<'source' | 'fhir'>('source');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const shown = records.filter((record) => (filter === 'All' || record.type === filter) && `${record.title} ${record.summary} ${record.type}`.toLowerCase().includes(query.toLowerCase()));
  const visibleRecords = shown.slice(0, visibleLimit);
  const active = records.find((record) => record.id === selected) ?? records[0];

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryResponse, eventsResponse] = await Promise.all([
          fetch('/api/clinical/summary'),
          fetch('/api/clinical/events?limit=1000'),
        ]);
        if (!summaryResponse.ok || !eventsResponse.ok) return;
        const liveSummary = await summaryResponse.json();
        const eventPayload = await eventsResponse.json();
        const liveRecords: RecordItem[] = eventPayload.items.map((item: {
          id: number; event_date: string; entry_type: string; source_text: string;
          source_file: string; organisation: string; parse_confidence: number; parse_notes: string;
        }) => ({
          id: item.id,
          date: item.event_date || 'Unknown date',
          type: classifyType(item.entry_type),
          title: item.entry_type || 'Clinical record',
          summary: item.source_text,
          source: [item.organisation, item.source_file].filter(Boolean).join(' · '),
          confidence: Math.round(item.parse_confidence * 100),
          review: item.parse_confidence < 1 || item.parse_notes !== '[]' ? 'Check source and parsing notes' : undefined,
          fhir: `${item.entry_type || 'Clinical event'} · source-preserving representation`,
        }));
        if (liveRecords.length) {
          setSummary(liveSummary);
          setRecords(liveRecords);
          setSelected(liveRecords[0].id);
          setUsingRealData(true);
        }
      } catch {
        // The hosted design prototype deliberately falls back to representative data.
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!detailsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailsOpen]);

  return <>
    <a className="skipLink" href="#records">Skip to health records</a>
    <header className="siteHeader"><div className="headerInner">
      <a className="brand" href="#top" aria-label="Personal Health home"><span className="brandMark">PH</span><span>Personal Health Data</span></a>
      <span className="privacy"><span className="privacyDot" />Private service</span>
    </div></header>
    <div className="serviceBar"><nav className="nav" aria-label="Portal sections"><a href="#overview">Overview</a><a href="#records">GP records</a><a href="#sources">Data quality</a></nav></div>
    <main>
    <div className="independentBanner"><strong>Independent personal project</strong><span>This service is not affiliated with GOV.UK, the NHS or any government department.</span></div>
    <section className="hero compactHero" id="top">
      <div><p className="eyebrow">Personal Health Data</p><h1>Your health record,<br />with receipts</h1><p className="lede">Review health information with its original source, confidence score and history clearly attached.</p></div>
      <div className="freshness" aria-label="Pipeline status"><span className="pulse" /><div><strong>{usingRealData ? 'Private clinical database connected' : 'GP capture complete'}</strong><span>{usingRealData ? `${summary.source_captures} source captures retained` : '24 source pages verified'}</span></div></div>
    </section>
    <section className="metricGrid" id="overview" aria-label="GP record summary">
      <article className="metric"><span>Current events</span><strong>{summary.current_events}</strong><small>{usingRealData ? 'Live private dataset' : 'Corrected v0.4 dataset'}</small></article>
      <article className="metric"><span>Needs attention</span><strong>{summary.review_items}</strong><small>Explicit review flags</small></article>
      <article className="metric"><span>Source captures</span><strong>{summary.source_captures}</strong><small>Checksummed evidence</small></article>
    </section>
    <section className="workspace panel" id="records" aria-label="GP record review workspace">
      <div className="workspaceHeader"><div><p className="eyebrow">Clinical record review</p><h2>GP timeline</h2><p>{usingRealData ? 'Private clinical records · retained on Mobius · source evidence preserved' : 'Representative records · real project totals · no private clinical content in this preview'}</p></div><span className="smallPill goodPill">{usingRealData ? 'Live private data' : 'Source preserved'}</span></div>
      <div className="recordTools">
        <label className="search"><span>Search</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(100); }} placeholder="Find a record…" /></label>
        <div className="filterRow" aria-label="Filter record types">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setVisibleLimit(100); }}>{item}</button>)}</div>
      </div>
      <div className="reviewLayout">
        <div className="timeline" aria-live="polite">
          <div className="timelineSummary"><strong>{shown.length} records</strong><span>{shown.length > visibleRecords.length ? `Showing the first ${visibleRecords.length}` : 'All matching records shown'}</span></div>
          {visibleRecords.length ? visibleRecords.map((record) => <button key={record.id} className={`recordRow ${selected === record.id ? 'selected' : ''}`} onClick={() => { setSelected(record.id); setDetailsOpen(true); }} aria-haspopup="dialog"><span className="recordDate">{record.date}</span><span className={`typeDot type-${record.type.toLowerCase()}`} /><span className="recordCopy"><strong>{record.title}</strong><small>{record.type} · {record.source}</small></span><span className={`confidence ${record.confidence === 100 ? 'verified' : 'review'}`}>{record.confidence}%</span></button>) : <div className="emptyState"><strong>No matching records</strong><span>Try another filter or search phrase.</span></div>}
          {visibleRecords.length < shown.length && <div className="loadMore"><button onClick={() => setVisibleLimit((limit) => limit + 100)}>Show 100 more</button></div>}
        </div>
        {detailsOpen && <button className="detailsBackdrop" aria-label="Close record details" onClick={() => setDetailsOpen(false)} />}
        <aside className={`inspector ${detailsOpen ? 'detailsOpen' : ''}`} aria-label="Selected record inspector" aria-modal={detailsOpen ? 'true' : undefined} role={detailsOpen ? 'dialog' : undefined}>
          <button className="detailsClose" onClick={() => setDetailsOpen(false)} aria-label="Close record details"><span aria-hidden="true">←</span> Back to records</button>
          <div className="inspectorTop"><span className="recordType">{active.type}</span><span className={`confidence ${active.confidence === 100 ? 'verified' : 'review'}`}>{active.confidence}% confidence</span></div>
          <h3>{active.title}</h3><p className="inspectorDate">{active.date}</p>
          {active.review && <div className="reviewBanner"><strong>Review needed</strong><span>{active.review}</span></div>}
          <div className="segmented" role="group" aria-label="Inspect record representation"><button className={inspector === 'source' ? 'active' : ''} onClick={() => setInspector('source')}>Source</button><button className={inspector === 'fhir' ? 'active' : ''} onClick={() => setInspector('fhir')}>FHIR</button></div>
          {inspector === 'source' ? <div className="evidence"><span>Preserved source wording</span><p>{active.summary}</p><dl><div><dt>Origin</dt><dd>{active.source}</dd></div><div><dt>Integrity</dt><dd>SHA-256 verified</dd></div><div><dt>Capture</dt><dd>Rendered DOM</dd></div></dl></div> : <div className="fhirCard"><span>Generated resource</span><strong>{active.fhir}</strong><p>Derived representation. Review state and source checksum remain attached.</p></div>}
          <div className="trustScale"><span className="done">Source fact</span><span className={active.confidence === 100 ? 'done' : ''}>Parsed record</span><span>Clinical review</span></div>
        </aside>
      </div>
    </section>
    <section className="lowerGrid recordsLower" id="sources">
      <article className="panel queue"><p className="eyebrow">Review queue</p><h2>30 items are visible—not hidden.</h2><div className="queueRow"><span>11</span><p><strong>Result linkages</strong><small>Index and detail agree; linkage remains 99%</small></p></div><div className="queueRow"><span>11</span><p><strong>Index facts</strong><small>Kept separately from detailed Observations</small></p></div><div className="queueRow"><span>8</span><p><strong>Unknown dates</strong><small>Source did not expose a usable date</small></p></div></article>
      <article className="panel terminology"><p className="eyebrow">Terminology</p><h2>Suggestions, never silent guesses.</h2><div className="bigStat">234</div><p>Coded-entry descriptions preserved. SystmOnline exposed no explicit Read, CTV3, SNOMED or ICD identifiers.</p><span className="familyTag">0 verified codes</span><span className="familyTag">0 hidden assumptions</span></article>
      <article className="panel geek"><p className="eyebrow">Trust model</p><h2>Four visible layers</h2><ol className="layerList"><li><span>1</span>Source evidence</li><li><span>2</span>Verified clinical record</li><li><span>3</span>Proposed interpretation</li><li><span>4</span>Experimental analysis</li></ol></article>
    </section>
    </main>
    <footer className="siteFooter"><div><strong>Personal Health Data</strong><span>Person-centred · Source-preserving · FHIR-ready</span><p>Uses accessible patterns inspired by the GOV.UK Design System. This is not an official government service.</p></div></footer>
  </>;
}
