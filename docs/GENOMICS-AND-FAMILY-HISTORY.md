# Genomics and family history

## Family history

Use FHIR `FamilyMemberHistory` with relationship, sex when relevant, condition, age or age-at-onset, deceased status, source and certainty. Represent unknown and absent information differently. Family members need not be personally identifiable.

Family history is a risk-context signal, not a prediction. It can prioritise preventive questions and evidence monitoring, but must not imply that a relative's diagnosis determines the person's future.

## Genomic layers

1. Immutable source files and checksums.
2. Normalised variants with reference assembly and representation.
3. Genotypes/haplotypes and quality evidence.
4. External assertions from ClinVar, ClinGen, CPIC and other governed sources.
5. Research associations from GWAS Catalog, kept explicitly separate from clinical assertions.
6. Person-specific matches produced reproducibly against a particular WGS release.

Use HL7 Genomics Reporting IG R4 for clinical reporting shapes and evaluate GA4GH VRS/Beacon for computational representation and discovery.

## Evidence monitoring

Each update records upstream source, accession, release, retrieval date, population/ancestry context, effect size, confidence interval, p-value where applicable, clinical review status and superseded assertions. Conflicts remain visible.

GWAS associations are research signals. A matched allele is not automatically causal, clinically actionable or transferable across ancestries. ClinVar classifications retain review status and conflicts. Pharmacogenomic guidance must come from reviewed guidelines and be discussed with a clinician or pharmacist.

## APOE example

APOE genotype and a family history of Alzheimer’s can be stored as separate evidence objects and used to monitor high-quality guidance. The system must not calculate or present a deterministic personal prognosis, nor recommend testing, medication or lifestyle changes solely from that combination.
