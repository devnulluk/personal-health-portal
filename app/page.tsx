const sources = [
  { name: 'Apple Health', detail: 'Activity, vitals and workouts', status: 'Connected', age: '4 min ago', tone: 'good' },
  { name: 'Google / Fitbit', detail: 'Sleep, heart and recovery', status: 'Connected', age: '7 min ago', tone: 'good' },
  { name: 'GP record', detail: 'Problems, tests and medication', status: 'Preparing', age: 'Importer in development', tone: 'warm' },
  { name: 'Genomics', detail: 'Variants and research annotations', status: 'Planned', age: 'Evidence model pending', tone: 'quiet' },
];

const metrics = [['Sources flowing', '2 of 4'], ['Latest observation', '7 minutes ago'], ['Clinical records', 'Import pending']];
const rhythm = [32, 44, 38, 62, 70, 54, 77, 68, 86, 72, 58, 48, 64, 82, 74, 92, 67, 55, 61, 79, 88, 71, 52, 41];
const geekStats = [['Samples · 24h', '18,442'], ['Median source lag', '6m 18s'], ['FHIR profiles', '6 UK Core'], ['Terminologies', 'SNOMED · ICD · dm+d']];

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
      <section className="panel today" aria-label="Preview health dashboard">
        <div className="panelHeading"><div><p className="eyebrow">Preview data</p><h2>Your last 24 hours</h2></div><span className="smallPill">Representative values</span></div>
        <div className="todayGrid"><div className="heroMetric"><span>Resting heart rate</span><strong>62</strong><small>bpm · 3 below your 30-day median</small></div><div className="heroMetric"><span>Sleep</span><strong>7h 41m</strong><small>88% consistency · bedtime streak 4 days</small></div><div className="heroMetric"><span>HRV</span><strong>47</strong><small>ms · within your usual range</small></div></div>
        <div className="chart" aria-label="Illustrative hourly activity rhythm">{rhythm.map((height, index) => <span key={index} style={{ height: `${height}%` }} title={`Hour ${index}: ${height}%`} />)}</div>
        <div className="chartLabels"><span>Midnight</span><span>Noon</span><span>Now</span></div>
      </section>
      <section className="contentGrid">
        <article className="panel sources">
          <div className="panelHeading"><div><p className="eyebrow">Coverage</p><h2>Health sources</h2></div><span className="smallPill">Live status</span></div>
          <div className="sourceList">{sources.map((source) => <div className="source" key={source.name}><span className={`sourceIcon ${source.tone}`}>{source.name.slice(0, 1)}</span><div className="sourceCopy"><strong>{source.name}</strong><span>{source.detail}</span></div><div className="sourceState"><strong>{source.status}</strong><span>{source.age}</span></div></div>)}</div>
        </article>
        <aside className="panel next"><p className="eyebrow">Next milestone</p><h2>GP record import</h2><p>Preserve the original SystmOnline record, turn coded entries into validated FHIR, and keep provenance attached.</p><ol><li><span>1</span>Capture without changing the source</li><li><span>2</span>Normalise and validate locally</li><li><span>3</span>Review before publishing to the record</li></ol></aside>
      </section>
      <section className="genomics panel"><div><p className="eyebrow">Genomics, with guardrails</p><h2>Useful context—not an oracle.</h2></div><p>Variant evidence can be linked to conditions, investigations and medicines, with source, review date and confidence always visible. Clinical decisions stay with qualified professionals.</p></section>
      <section className="lowerGrid">
        <article className="panel fun"><p className="eyebrow">Fun & useful</p><h2>Small wins</h2><div className="win"><strong>Most active hour</strong><span>12:00–13:00</span></div><div className="win"><strong>Sleep consistency</strong><span>Best week this month</span></div><div className="win"><strong>Data streak</strong><span>43 days without a gap</span></div></article>
        <article className="panel family"><p className="eyebrow">Family history</p><h2>What deserves attention</h2><p>Structured family conditions, age at onset and relationship can inform prevention and questions for clinicians—without implying destiny.</p><span className="familyTag">Neurological</span><span className="familyTag">Cardiovascular</span><span className="familyTag">Metabolic</span></article>
        <article className="panel geek"><p className="eyebrow">Geek corner</p><h2>Under the bonnet</h2>{geekStats.map(([label,value]) => <div className="geekRow" key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>
      </section>
      <footer>Personal Health Data · Person-centred · Source-preserving · FHIR-ready</footer>
    </main>
  );
}
