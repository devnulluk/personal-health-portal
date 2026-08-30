const sources = [
  { name: 'Apple Health', detail: 'Activity, vitals and workouts', status: 'Connected', age: '4 min ago', tone: 'good' },
  { name: 'Google / Fitbit', detail: 'Sleep, heart and recovery', status: 'Connected', age: '7 min ago', tone: 'good' },
  { name: 'GP record', detail: 'Problems, tests and medication', status: 'Preparing', age: 'Importer in development', tone: 'warm' },
  { name: 'Genomics', detail: 'Variants and research annotations', status: 'Planned', age: 'Evidence model pending', tone: 'quiet' },
];

const metrics = [['Sources flowing', '2 of 4'], ['Latest observation', '7 minutes ago'], ['Clinical records', 'Import pending']];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Personal Health home"><span className="brandMark">NB</span><span>Personal Health</span></a>
        <span className="privacy">Private household system</span>
      </header>
      <section className="hero" id="top">
        <div><p className="eyebrow">Your data, independent of the device</p><h1>One calm view of your health.</h1><p className="lede">A person-centred record that brings together measurements, clinical history and—carefully—genomic evidence.</p></div>
        <div className="freshness" aria-label="Pipeline status"><span className="pulse" /><div><strong>Data is flowing</strong><span>All active sources are fresh</span></div></div>
      </section>
      <section className="metricGrid" aria-label="Summary">
        {metrics.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>
      <section className="contentGrid">
        <article className="panel sources">
          <div className="panelHeading"><div><p className="eyebrow">Coverage</p><h2>Health sources</h2></div><span className="smallPill">Live status</span></div>
          <div className="sourceList">{sources.map((source) => <div className="source" key={source.name}><span className={`sourceIcon ${source.tone}`}>{source.name.slice(0, 1)}</span><div className="sourceCopy"><strong>{source.name}</strong><span>{source.detail}</span></div><div className="sourceState"><strong>{source.status}</strong><span>{source.age}</span></div></div>)}</div>
        </article>
        <aside className="panel next"><p className="eyebrow">Next milestone</p><h2>GP record import</h2><p>Preserve the original SystmOnline record, turn coded entries into validated FHIR, and keep provenance attached.</p><ol><li><span>1</span>Capture without changing the source</li><li><span>2</span>Normalise and validate locally</li><li><span>3</span>Review before publishing to the record</li></ol></aside>
      </section>
      <section className="genomics panel"><div><p className="eyebrow">Genomics, with guardrails</p><h2>Useful context—not an oracle.</h2></div><p>Variant evidence can be linked to conditions, investigations and medicines, with source, review date and confidence always visible. Clinical decisions stay with qualified professionals.</p></section>
      <footer>Personal Health Data · Person-centred · Source-preserving · FHIR-ready</footer>
    </main>
  );
}
