'use client';

import { useMemo, useState } from 'react';

type RecordItem = { id: number; date: string; type: string; title: string; summary: string; source: string; confidence: number; review?: string; fhir: string };

const records: RecordItem[] = [
  { id: 1, date: '28 Aug 2026', type: 'Tests', title: 'Example laboratory panel', summary: 'Detailed result captured and linked to its index entry.', source: 'SystmOnline · detailed result', confidence: 99, review: 'Confirm index linkage', fhir: 'Observation · final · UKCore-Observation' },
  { id: 2, date: '13 Aug 2026', type: 'Measurements', title: 'Example blood pressure', summary: 'Representative measurement retained with its original context.', source: 'SystmOnline · Patient Record', confidence: 100, fhir: 'Observation · final · UKCore-Observation' },
  { id: 3, date: '04 Jul 2026', type: 'Medications', title: 'Example repeat medicine', summary: 'Medication description preserved; dm+d coding not yet supplied by source.', source: 'SystmOnline · Summary', confidence: 100, review: 'Code unavailable', fhir: 'MedicationStatement · unknown · UKCore-MedicationStatement' },
  { id: 4, date: 'Unknown date', type: 'Vaccinations', title: 'Example vaccination status', summary: 'Source grid records the status but does not provide a parseable date.', source: 'SystmOnline · Childhood Vaccinations', confidence: 90, review: 'Date required', fhir: 'Immunization · completed · UKCore-Immunization' },
  { id: 5, date: '16 May 2026', type: 'Problems', title: 'Example clinical problem', summary: 'Source wording is intact. No terminology code is inferred from its description.', source: 'SystmOnline · Patient Record', confidence: 100, review: 'Terminology candidate pending', fhir: 'Condition · UKCore-Condition' },
  { id: 6, date: '09 Apr 2026', type: 'Letters', title: 'Example clinical letter', summary: 'Document listing retained; attachment capture remains a future source task.', source: 'SystmOnline · Patient Record', confidence: 100, fhir: 'DocumentReference · current' },
];

const filters = ['All', 'Problems', 'Medications', 'Tests', 'Measurements', 'Vaccinations', 'Letters'];

export default function Home() {
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(1);
  const [inspector, setInspector] = useState<'source' | 'fhir'>('source');
  const shown = useMemo(() => records.filter((record) => (filter === 'All' || record.type === filter) && `${record.title} ${record.summary} ${record.type}`.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  const active = records.find((record) => record.id === selected) ?? records[0];

  return <main>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Personal Health home"><span className="brandMark">NB</span><span>Personal Health</span></a>
      <nav className="nav" aria-label="Portal sections"><a href="#overview">Overview</a><a href="#records">GP records</a><a href="#sources">Sources</a></nav>
      <span className="privacy"><span className="privacyDot" />Private household system</span>
    </header>
    <section className="hero compactHero" id="top">
      <div><p className="eyebrow">Your data, independent of the device</p><h1>Your health record,<br />with receipts.</h1><p className="lede">Every clinical fact stays connected to its source, confidence and review history.</p></div>
      <div className="freshness" aria-label="Pipeline status"><span className="pulse" /><div><strong>GP capture complete</strong><span>24 source pages verified</span></div></div>
    </section>
    <section className="metricGrid" id="overview" aria-label="GP record summary">
      <article className="metric"><span>Current events</span><strong>433</strong><small>Corrected v0.4 dataset</small></article>
      <article className="metric"><span>Needs attention</span><strong>30</strong><small>Explicit review flags</small></article>
      <article className="metric"><span>Source integrity</span><strong>24 / 24</strong><small>Checksums verified</small></article>
    </section>
    <section className="workspace panel" id="records" aria-label="GP record review workspace">
      <div className="workspaceHeader"><div><p className="eyebrow">Clinical record review</p><h2>GP timeline</h2><p>Representative records · real project totals · no private clinical content in this preview</p></div><span className="smallPill goodPill">Source preserved</span></div>
      <div className="recordTools">
        <label className="search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a record…" /></label>
        <div className="filterRow" aria-label="Filter record types">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </div>
      <div className="reviewLayout">
        <div className="timeline" aria-live="polite">
          {shown.length ? shown.map((record) => <button key={record.id} className={`recordRow ${selected === record.id ? 'selected' : ''}`} onClick={() => setSelected(record.id)}><span className="recordDate">{record.date}</span><span className={`typeDot type-${record.type.toLowerCase()}`} /><span className="recordCopy"><strong>{record.title}</strong><small>{record.type} · {record.source}</small></span><span className={`confidence ${record.confidence === 100 ? 'verified' : 'review'}`}>{record.confidence}%</span></button>) : <div className="emptyState"><strong>No matching records</strong><span>Try another filter or search phrase.</span></div>}
        </div>
        <aside className="inspector" aria-label="Selected record inspector">
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
    <footer>Personal Health Data · Person-centred · Source-preserving · FHIR-ready</footer>
  </main>;
}
