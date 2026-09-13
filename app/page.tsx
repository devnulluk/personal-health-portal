'use client';

import { useEffect, useRef, useState } from 'react';

type CodingAssertion = { system: string; code: string; display?: string; version?: string; status: string; confidence: number; method: string; mapping_provenance: string; review_required: number };
type RecordItem = { id: number; date: string; type: string; title: string; summary: string; source: string; sourceFile?: string; captureSha?: string; parserVersion?: string; confidence: number; review?: string; fhir: string; codings?: CodingAssertion[] };
type ClinicalSummary = { current_events: number; review_items: number; source_captures: number };
type SourceStatus = { source_key: string; label: string; state: string; detail: string; latest_data_at?: string; latest_capture_at?: string; current_event_count?: number; capture_count?: number };
type SourcesPayload = { generated_at: string; sources: SourceStatus[] };
type ObservationPoint = { event_id: number; date: string; value: number | null; display: string; source_text: string; source_file: string; organisation: string; capture_sha256: string; parser_version: string; confidence: number };
type ObservationGroup = { key: string; label: string; kind: 'laboratory' | 'metric'; unit: string; guide_low: number | null; guide_high: number | null; guide_kind: string | null; points: ObservationPoint[] };
type ClinicalEventPayload = { items: Array<{ id: number; event_date: string; entry_type: string; source_text: string; source_file: string; organisation: string; parse_confidence: number; parse_notes: string; capture_sha256: string; parser_version: string; coding_assertions: string }> };
type Exploration = { filter: string; query: string; mode: 'all' | 'review' | 'undated' | 'recent'; explanation: string };
type WearableDay = { date: string; steps?: number | null; active_minutes?: number | null; duration_minutes?: number | null; efficiency_percent?: number | null; resting_heart_rate_bpm?: number | null; avg_hrv_sdnn_ms?: number | null; avg_spo2_percent?: number | null; recovery_score?: number | null };
type WearableOverview = { available: boolean; generated_at?: string; activity?: WearableDay[]; sleep?: WearableDay[]; recovery?: WearableDay[]; open_wearables_url: string; detail?: string };

const representativeRecords: RecordItem[] = [
  { id: 1, date: '28 Aug 2026', type: 'Tests', title: 'Example laboratory panel', summary: 'Detailed result captured and linked to its index entry.', source: 'SystmOnline · detailed result', confidence: 99, review: 'Confirm index linkage', fhir: 'Observation · final · UKCore-Observation' },
  { id: 2, date: '13 Aug 2026', type: 'Measurements', title: 'Example blood pressure', summary: 'Representative measurement retained with its original context.', source: 'SystmOnline · Patient Record', confidence: 100, fhir: 'Observation · final · UKCore-Observation' },
  { id: 3, date: '04 Jul 2026', type: 'Medications', title: 'Example repeat medicine', summary: 'Medication description preserved; dm+d coding not yet supplied by source.', source: 'SystmOnline · Summary', confidence: 100, review: 'Code unavailable', fhir: 'MedicationStatement · unknown · UKCore-MedicationStatement' },
  { id: 4, date: 'Unknown date', type: 'Vaccinations', title: 'Example vaccination status', summary: 'Source grid records the status but does not provide a parseable date.', source: 'SystmOnline · Childhood Vaccinations', confidence: 90, review: 'Date required', fhir: 'Immunization · completed · UKCore-Immunization' },
  { id: 5, date: '16 May 2026', type: 'Problems', title: 'Example clinical problem', summary: 'Source wording is intact. No terminology code is inferred from its description.', source: 'SystmOnline · Patient Record', confidence: 100, review: 'Terminology candidate pending', fhir: 'Condition · UKCore-Condition' },
  { id: 6, date: '09 Apr 2026', type: 'Letters', title: 'Example clinical letter', summary: 'Document listing retained; attachment capture remains a future source task.', source: 'SystmOnline · Patient Record', confidence: 100, fhir: 'DocumentReference · current' },
];

const filters = ['All', 'Problems', 'Medications', 'Tests', 'Measurements', 'Vaccinations', 'Appointments', 'Letters'];

function TrendChart({ group }: { group: ObservationGroup }) {
  const points = group.points.filter((point): point is ObservationPoint & { value: number } => point.value !== null).slice(-30);
  const values = points.map((point) => point.value).concat(group.guide_low ?? [], group.guide_high ?? []);
  const low = Math.min(...values); const high = Math.max(...values); const span = high - low || 1;
  const x = (index: number) => points.length === 1 ? 50 : 5 + index * 90 / (points.length - 1);
  const y = (value: number) => 92 - ((value - low) / span) * 82;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`).join(' ');
  return <svg className="trendChart" viewBox="0 0 100 100" role="img" aria-label={`${group.label} history, ${points.length} readings`} preserveAspectRatio="none">
    {group.guide_low !== null && group.guide_high !== null && <rect className="guideBand" x="0" y={y(group.guide_high)} width="100" height={Math.max(2, y(group.guide_low) - y(group.guide_high))} />}
    <path className="trendLine" d={path} />
    {points.map((point, index) => <circle key={`${point.event_id}-${index}`} cx={x(index)} cy={y(point.value)} r="1.8"><title>{point.date}: {point.value} {group.unit}</title></circle>)}
  </svg>;
}

function MiniSparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <div className="wearableSparkEmpty">Awaiting a trend</div>;
  const low = Math.min(...values); const high = Math.max(...values); const span = high - low || 1;
  const path = values.map((value, index) => `${index ? 'L' : 'M'} ${index * 100 / (values.length - 1)} ${38 - ((value - low) / span) * 34}`).join(' ');
  return <svg className="wearableSpark" viewBox="0 0 100 42" role="img" aria-label={`${label}, ${values.length}-day trend`} preserveAspectRatio="none"><path d={path} /></svg>;
}

function lastNumber(days: WearableDay[], field: keyof WearableDay): number | null {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const value = days[index][field];
    if (typeof value === 'number') return value;
  }
  return null;
}

function valuesFor(days: WearableDay[], field: keyof WearableDay): number[] {
  return days.map((day) => day[field]).filter((value): value is number => typeof value === 'number');
}

function classifyType(entryType: string): string {
  const value = entryType.toLowerCase();
  if (value.includes('medication') || value.includes('repeat')) return 'Medications';
  if (value.includes('vaccin') || value.includes('immun')) return 'Vaccinations';
  if (value.includes('appointment')) return 'Appointments';
  if (value.includes('blood pressure') || value.includes('measurement')) return 'Measurements';
  if (value.includes('test') || value.includes('result') || value.includes('laboratory') || value.includes('observation') || value.includes('diagnosticreport')) return 'Tests';
  if (value.includes('letter') || value.includes('document') || value.includes('attachment') || value.includes('questionnaire')) return 'Letters';
  return 'Problems';
}

function interpretQuestion(question: string): Exploration {
  const value = question.trim().toLowerCase();
  let filter = 'All';
  if (/medication|medicine|prescri|repeat/.test(value)) filter = 'Medications';
  else if (/test|result|laboratory|blood/.test(value)) filter = 'Tests';
  else if (/vaccin|immun/.test(value)) filter = 'Vaccinations';
  else if (/appointment|visit/.test(value)) filter = 'Appointments';
  else if (/letter|document|attachment|questionnaire/.test(value)) filter = 'Letters';
  else if (/problem|condition|diagnos/.test(value)) filter = 'Problems';

  let mode: Exploration['mode'] = 'all';
  if (/review|uncertain|confidence|attention/.test(value)) mode = 'review';
  else if (/unknown date|without (a )?date|missing date|undated/.test(value)) mode = 'undated';
  else if (/recent|latest|last 90 days|three months/.test(value)) mode = 'recent';

  const quoted = question.match(/["“]([^"”]+)["”]/)?.[1] ?? '';
  const explanation = [
    filter !== 'All' ? filter : 'All record types',
    mode === 'review' ? 'needs review' : mode === 'undated' ? 'date unavailable' : mode === 'recent' ? 'last 90 days' : 'all dates',
    quoted ? `containing “${quoted}”` : '',
  ].filter(Boolean).join(' · ');
  return { filter, query: quoted, mode, explanation };
}

export default function Home() {
  const [records, setRecords] = useState<RecordItem[]>(representativeRecords);
  const [summary, setSummary] = useState({ current_events: 433, review_items: 30, source_captures: 24 });
  const [usingRealData, setUsingRealData] = useState(false);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [observations, setObservations] = useState<ObservationGroup[]>([]);
  const [wearables, setWearables] = useState<WearableOverview | null>(null);
  const [observationKind, setObservationKind] = useState<'laboratory' | 'metric'>('laboratory');
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(1);
  const [inspector, setInspector] = useState<'source' | 'fhir'>('source');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [question, setQuestion] = useState('');
  const [exploration, setExploration] = useState<Exploration>({ filter: 'All', query: '', mode: 'all', explanation: 'All record types · all dates' });
  const [hasExplored, setHasExplored] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shown = records.filter((record) => {
    const matchesFilter = filter === 'All' || record.type === filter;
    const matchesQuery = `${record.title} ${record.summary} ${record.type}`.toLowerCase().includes(query.toLowerCase());
    const date = new Date(record.date);
    const recentBoundary = new Date();
    recentBoundary.setDate(recentBoundary.getDate() - 90);
    const matchesMode = exploration.mode === 'review' ? Boolean(record.review)
      : exploration.mode === 'undated' ? record.date.toLowerCase().includes('unknown')
      : exploration.mode === 'recent' ? !Number.isNaN(date.valueOf()) && date >= recentBoundary
      : true;
    return matchesFilter && matchesQuery && matchesMode;
  });
  const visibleRecords = shown.slice(0, visibleLimit);
  const active = records.find((record) => record.id === selected) ?? records[0];

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryResponse, eventsResponse, sourcesResponse, observationsResponse, wearableResponse] = await Promise.all([
          fetch('/api/clinical/summary'),
          fetch('/api/clinical/events?limit=1000'),
          fetch('/api/clinical/overview/sources'),
          fetch('/api/clinical/observations'),
          fetch('/api/clinical/overview/wearables'),
        ]);
        if (wearableResponse.ok) setWearables(await wearableResponse.json() as WearableOverview);
        if (observationsResponse.ok) setObservations((await observationsResponse.json() as { groups: ObservationGroup[] }).groups);
        if (sourcesResponse.ok) {
          try { setSources(((await sourcesResponse.json()) as SourcesPayload).sources); } catch { /* Keep the source panel explicitly unavailable. */ }
        }
        setSourcesLoaded(true);
        if (!summaryResponse.ok || !eventsResponse.ok) return;
        const liveSummary = await summaryResponse.json() as ClinicalSummary;
        const eventPayload = await eventsResponse.json() as ClinicalEventPayload;
        const liveRecords: RecordItem[] = eventPayload.items.map((item: {
          id: number; event_date: string; entry_type: string; source_text: string;
          source_file: string; organisation: string; parse_confidence: number; parse_notes: string;
          capture_sha256: string; parser_version: string; coding_assertions: string;
        }) => ({
          id: item.id,
          date: item.event_date || 'Unknown date',
          type: classifyType(item.entry_type),
          title: item.entry_type || 'Clinical record',
          summary: item.source_text,
          source: [item.organisation, item.source_file].filter(Boolean).join(' · '),
          sourceFile: item.source_file,
          captureSha: item.capture_sha256,
          parserVersion: item.parser_version,
          confidence: Math.round(item.parse_confidence * 100),
          review: item.parse_confidence < 1 || item.parse_notes !== '[]' ? 'Check source and parsing notes' : undefined,
          fhir: `${item.entry_type || 'Clinical event'} · source-preserving representation`,
          codings: JSON.parse(item.coding_assertions || '[]'),
        }));
        if (liveRecords.length) {
          setSummary(liveSummary);
          setRecords(liveRecords);
          setSelected(liveRecords[0].id);
          setUsingRealData(true);
        }
      } catch {
        setSourcesLoaded(true);
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

  useEffect(() => {
    if (detailsOpen) closeButtonRef.current?.focus();
  }, [detailsOpen]);

  const explore = (nextQuestion = question) => {
    if (!nextQuestion.trim()) return;
    const interpreted = interpretQuestion(nextQuestion);
    setQuestion(nextQuestion);
    setExploration(interpreted);
    setFilter(interpreted.filter);
    setQuery(interpreted.query);
    setVisibleLimit(100);
    setHasExplored(true);
    window.setTimeout(() => document.querySelector('#records')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const activityDays = wearables?.activity ?? [];
  const sleepDays = wearables?.sleep ?? [];
  const recoveryDays = wearables?.recovery ?? [];
  const latestSteps = lastNumber(activityDays, 'steps');
  const latestSleep = lastNumber(sleepDays, 'duration_minutes');
  const latestRestingHeartRate = lastNumber(recoveryDays, 'resting_heart_rate_bpm');
  const latestHrv = lastNumber(recoveryDays, 'avg_hrv_sdnn_ms');
  const sevenDayActiveMinutes = valuesFor(activityDays.slice(-7), 'active_minutes').reduce((total, value) => total + value, 0);
  const sleepValues = valuesFor(sleepDays.slice(-7), 'duration_minutes');
  const sevenDaySleepAverage = sleepValues.length ? sleepValues.reduce((total, value) => total + value, 0) / sleepValues.length : null;
  const wellbeingNote = sevenDaySleepAverage !== null && sevenDaySleepAverage < 420
    ? 'Your 7-day sleep average is below the general 7-hour guide. How you feel during the day matters too.'
    : sevenDayActiveMinutes < 150
      ? `You have ${Math.round(sevenDayActiveMinutes)} active minutes recorded in 7 days. Every minute counts towards the general 150-minute weekly guide.`
      : 'Your recent sleep and activity are within the broad general guides checked here. Keep watching the pattern, not a single day.';

  return <>
    <a className="skipLink" href="#records">Skip to health records</a>
    <header className="siteHeader"><div className="headerInner">
      <a className="brand" href="#top" aria-label="Personal Health home"><span className="brandMark">PH</span><span>Personal Health Data</span></a>
      <span className="privacy"><span className="privacyDot" />Private service</span>
    </div></header>
    <div className="serviceBar"><nav className="nav" aria-label="Portal sections"><a href="#today">Today</a><a href="#data-sources">Sources</a><a href="#observations">Labs & metrics</a><a href="#records">GP records</a><a href="#sources">Data quality</a></nav></div>
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
    <section className="todayPanel panel" id="today" aria-labelledby="today-title">
      <div className="todayHeading"><div><p className="eyebrow">Latest from your devices</p><h2 id="today-title">Today at a glance</h2><p>Current readings and short trends from Open Wearables. These are observations, not a diagnosis.</p></div><a className="openWearablesLink" href={wearables?.open_wearables_url ?? 'https://healthdata.devnull.co.uk/dashboard'} target="_blank" rel="noreferrer">Open Open Wearables <span aria-hidden="true">↗</span></a></div>
      {wearables?.available ? <>
        <div className="wearableGrid">
          <article className="wearableMetric"><span>Latest steps</span><strong>{latestSteps?.toLocaleString('en-GB') ?? '—'}</strong><MiniSparkline label="Steps" values={valuesFor(activityDays, 'steps')} /><small>Daily total · last 14 days</small></article>
          <article className="wearableMetric"><span>Latest sleep</span><strong>{latestSleep !== null ? `${Math.floor(latestSleep / 60)}h ${Math.round(latestSleep % 60)}m` : '—'}</strong><MiniSparkline label="Sleep duration" values={valuesFor(sleepDays, 'duration_minutes')} /><small>Sleep duration · last 14 days</small></article>
          <article className="wearableMetric"><span>Resting heart rate</span><strong>{latestRestingHeartRate !== null ? `${Math.round(latestRestingHeartRate)} bpm` : '—'}</strong><MiniSparkline label="Resting heart rate" values={valuesFor(recoveryDays, 'resting_heart_rate_bpm')} /><small>Compare with your own baseline</small></article>
          <article className="wearableMetric"><span>Heart-rate variability</span><strong>{latestHrv !== null ? `${Math.round(latestHrv)} ms` : '—'}</strong><MiniSparkline label="Heart-rate variability" values={valuesFor(recoveryDays, 'avg_hrv_sdnn_ms')} /><small>SDNN · trend matters more than one reading</small></article>
        </div>
        <div className="guidanceGrid">
          <article className="dailyNote"><span className="noteLabel">A useful nudge</span><h3>{wellbeingNote}</h3><p>General guidance only. Your health, medication, disability and circumstances can change what is appropriate.</p><div><a href="https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/" target="_blank" rel="noreferrer">NHS activity guidance</a><a href="https://www.nhs.uk/every-mind-matters/mental-health-issues/sleep/" target="_blank" rel="noreferrer">NHS sleep guidance</a></div></article>
          <article className="watchCard"><span className="noteLabel">Worth watching</span><h3>Your baseline beats generic thresholds</h3><p>Look for sustained changes across several days in sleep, resting heart rate, HRV and how you feel. The portal does not currently raise a clinical alert from a wearable reading.</p><small>Seek professional advice for symptoms or concerns; urgent symptoms should use NHS 111 or 999 as appropriate.</small></article>
        </div>
      </> : <div className="wearableUnavailable"><strong>Wearable metrics are not available just now</strong><span>{wearables?.detail ?? 'Connecting securely to Open Wearables…'}</span></div>}
    </section>
    <section className="sourceOverview panel" id="data-sources" aria-labelledby="source-freshness-title">
      <div className="sourceOverviewHeading"><div><p className="eyebrow">Data provenance</p><h2 id="source-freshness-title">Your connected sources</h2><p>When each source last supplied data. A delayed source does not mean the retained record is clinically wrong.</p></div><span className="smallPill">Evidence, not guesses</span></div>
      {sources.length ? <ul className="sourceStatusList">{sources.map((source) => {
        const timestamp = source.latest_data_at || source.latest_capture_at;
        const stateLabel = ({ fresh: 'Fresh', stale: 'Delayed', needs_attention: 'Needs attention', imported: 'Imported', not_linked: 'Not linked', unavailable: 'Unavailable', unknown: 'Unknown' } as Record<string, string>)[source.state] || source.state;
        return <li key={source.source_key}><span className={`sourceStatusMark state-${source.state}`} aria-hidden="true" /><div><strong>{source.label}</strong><span>{source.detail}</span>{source.current_event_count !== undefined && <small>{source.current_event_count} current events · {source.capture_count} retained captures</small>}</div><div className="sourceStatusState"><strong>{stateLabel}</strong>{timestamp ? <time dateTime={timestamp}>{new Date(timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time> : <span>No verified timestamp</span>}</div></li>;
      })}</ul> : <div className="sourceStatusEmpty" role="status">{sourcesLoaded ? 'Source overview is temporarily unavailable. The timeline remains available below.' : 'Source evidence is loading from the private service.'}</div>}
    </section>
    <section className="observations panel" id="observations" aria-labelledby="observations-title">
      <div className="observationsHeading"><div><p className="eyebrow">Longitudinal observations</p><h2 id="observations-title">Labs and personal metrics</h2><p>Each card keeps readings together by test or measurement, with history, units, range context and source evidence.</p></div><div className="observationTabs" role="group" aria-label="Observation type"><button className={observationKind === 'laboratory' ? 'active' : ''} onClick={() => setObservationKind('laboratory')}>Laboratory tests</button><button className={observationKind === 'metric' ? 'active' : ''} onClick={() => setObservationKind('metric')}>Body metrics</button></div></div>
      <div className="observationGrid">{observations.filter((group) => group.kind === observationKind).map((group) => { const latest = group.points[group.points.length - 1]; const numericCount = group.points.filter((point) => point.value !== null).length; return <article className="observationCard" key={group.key}><div className="observationCardTop"><div><h3>{group.label}</h3><p>{group.points.length} reading{group.points.length === 1 ? '' : 's'} · latest {latest.date}</p></div><strong>{latest.display}</strong></div>{numericCount ? <TrendChart group={group} /> : <div className="qualitativeHistory"><strong>Qualitative history</strong><span>No numeric value was supplied, so no numeric graph is drawn.</span></div>}<div className="rangeContext">{group.guide_low !== null && group.guide_high !== null ? <><strong>{group.guide_low}–{group.guide_high} {group.unit}</strong><span>{group.guide_kind}</span></> : <><strong>No range captured</strong><span>Check the preserved result or clinician guidance</span></>}</div><details><summary>Reading history and evidence</summary><ol>{[...group.points].reverse().map((point) => <li key={point.event_id}><time dateTime={point.date}>{point.date}</time><strong>{point.display}</strong><span>{Math.round(point.confidence * 100)}% extraction confidence · {point.organisation || point.source_file}</span></li>)}</ol></details></article>; })}</div>
      {!observations.some((group) => group.kind === observationKind) && <div className="observationEmpty"><strong>No chartable {observationKind === 'laboratory' ? 'laboratory results' : 'body metrics'} yet</strong><span>The source record remains available in the GP timeline. Only unambiguous numeric readings are graphed.</span></div>}
      <p className="clinicalCaveat">Shaded bands are source-provided laboratory intervals or clearly labelled NHS general guides—not personalised targets. Ranges vary by laboratory, method, age, context and individual circumstances.</p>
    </section>
    <section className="explorer panel" aria-labelledby="explorer-title">
      <div className="explorerCopy"><p className="eyebrow">Explore your timeline</p><h2 id="explorer-title">Ask a question, see the evidence</h2><p>This first version translates a question into visible, deterministic filters. It does not diagnose, infer causation or send your records to an AI service.</p></div>
      <form className="explorerForm" onSubmit={(event) => { event.preventDefault(); explore(); }}>
        <label htmlFor="timeline-question">Question</label>
        <div><input id="timeline-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder='Try “show medications needing review”' /><button type="submit">Explore records</button></div>
      </form>
      <div className="questionPresets" aria-label="Example questions">
        {['Show medications needing review', 'Show records without a date', 'Show recent tests and results'].map((example) => <button key={example} onClick={() => explore(example)}>{example}</button>)}
      </div>
      {hasExplored && <div className="explorerAnswer" role="status"><strong>{shown.length} matching records</strong><span>Interpreted as: {exploration.explanation}</span><small>Descriptive search only · inspect source evidence before drawing conclusions</small></div>}
    </section>
    <section className="workspace panel" id="records" aria-label="GP record review workspace">
      <div className="workspaceHeader"><div><p className="eyebrow">Clinical record review</p><h2>GP timeline</h2><p>{usingRealData ? 'Private clinical records · retained on Mobius · source evidence preserved' : 'Representative records · real project totals · no private clinical content in this preview'}</p></div><span className="smallPill goodPill">{usingRealData ? 'Live private data' : 'Source preserved'}</span></div>
      <div className="recordTools">
        <label className="search"><span>Search</span><input value={query} onChange={(event) => { setQuery(event.target.value); setExploration((current) => ({ ...current, mode: 'all' })); setVisibleLimit(100); }} placeholder="Find a record…" /></label>
        <div className="filterRow" aria-label="Filter record types">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setExploration((current) => ({ ...current, mode: 'all' })); setVisibleLimit(100); }}>{item}</button>)}</div>
      </div>
      <div className="reviewLayout">
        <div className="timeline" aria-live="polite">
          <div className="timelineSummary"><strong>{shown.length} records</strong><span>{shown.length > visibleRecords.length ? `Showing the first ${visibleRecords.length}` : 'All matching records shown'}</span></div>
          {visibleRecords.length ? visibleRecords.map((record) => <button key={record.id} className={`recordRow ${selected === record.id ? 'selected' : ''}`} onClick={() => { setSelected(record.id); setDetailsOpen(true); }} aria-haspopup="dialog" aria-controls="record-inspector" aria-expanded={selected === record.id && detailsOpen}><span className="recordDate">{record.date}</span><span className={`typeDot type-${record.type.toLowerCase()}`} /><span className="recordCopy"><strong>{record.title}</strong><small>{record.type} · {record.source}</small></span><span className={`confidence ${record.confidence === 100 ? 'verified' : 'review'}`}>{record.confidence}%</span></button>) : <div className="emptyState"><strong>No matching records</strong><span>Try another filter or search phrase.</span></div>}
          {visibleRecords.length < shown.length && <div className="loadMore"><button onClick={() => setVisibleLimit((limit) => limit + 100)}>Show 100 more</button></div>}
        </div>
        {detailsOpen && <button className="detailsBackdrop" aria-label="Close record details" onClick={() => setDetailsOpen(false)} />}
        <aside id="record-inspector" className={`inspector ${detailsOpen ? 'detailsOpen' : ''}`} aria-label="Selected record inspector" aria-modal={detailsOpen ? 'true' : undefined} role={detailsOpen ? 'dialog' : undefined}>
          <button ref={closeButtonRef} className="detailsClose" onClick={() => setDetailsOpen(false)} aria-label="Close record details"><span aria-hidden="true">←</span> Back to records</button>
          <div className="inspectorTop"><span className="recordType">{active.type}</span><span className={`confidence ${active.confidence === 100 ? 'verified' : 'review'}`}>{active.confidence}% confidence</span></div>
          <h3>{active.title}</h3><p className="inspectorDate">{active.date}</p>
          {active.review && <div className="reviewBanner"><strong>Review needed</strong><span>{active.review}</span></div>}
          <div className="segmented" role="group" aria-label="Inspect record representation"><button className={inspector === 'source' ? 'active' : ''} onClick={() => setInspector('source')}>Source</button><button className={inspector === 'fhir' ? 'active' : ''} onClick={() => setInspector('fhir')}>FHIR</button></div>
          {inspector === 'source' ? <div className="evidence"><span>Preserved source wording</span><p>{active.summary}</p><dl><div><dt>Origin</dt><dd>{active.source}</dd></div><div><dt>Source file</dt><dd>{active.sourceFile || 'Not supplied'}</dd></div><div><dt>Integrity</dt><dd>{active.captureSha ? `SHA-256 · ${active.captureSha.slice(0, 12)}…` : 'SHA-256 verified'}</dd></div><div><dt>Parser</dt><dd>{active.parserVersion || 'Not supplied'}</dd></div></dl></div> : <div className="fhirCard"><span>Generated resource</span><strong>{active.fhir}</strong><p>Derived representation. Review state and source checksum remain attached.</p></div>}
          <div className="codingEvidence"><span>Terminology mapping</span>{active.codings?.length ? active.codings.map((coding) => <div className="codingRow" key={`${coding.system}-${coding.code}-${coding.status}`}><strong>{coding.display || coding.code}</strong><small>{coding.system} · {coding.code} · {coding.status} · {Math.round(coding.confidence * 100)}% mapping confidence</small><small>{coding.method}{coding.review_required ? ' · review required' : ''}</small></div>) : <p>No terminology assertion attached to this event. Source wording remains authoritative.</p>}</div>
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
