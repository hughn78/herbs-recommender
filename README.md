# Herbs Recommender

PharmaPrompt OS — Lovable One-Shot Build Prompt (v2)

Paste everything below the line into Lovable as a single prompt.

Build a production-quality, pharmacist-facing clinical recommendation platform called:

PharmaPrompt OS
Subtitle: Pharmacy Recommendation Engine

An Australian community-pharmacy decision-support tool. Pharmacists and trained pharmacy staff enter patient context (medications, history, age, sex, pregnancy/breastfeeding, allergies, symptoms, existing supplements, goals) and receive ranked, explainable, conservative, source-aware pharmacist prompts powered by an uploaded RAG knowledge base (TG, AMH, Don't Rush to Crush, MIMS, Herbs of Gold, Metagenics, Eagle).

────────────────────────────────────────
HOW TO BUILD THIS (META-INSTRUCTIONS — READ FIRST)
────────────────────────────────────────

1. BUILD THE WORKING APP BEFORE THE PRETTY LANDING PAGE.
   The acceptance bar for this build is: a pharmacist can open the app, enter a
   patient in under 60 seconds, and get safe, explainable recommendation cards.
   The cinematic landing page is built LAST, in the final phase.

2. BUILD IN STRICT PHASES (defined at the end). Complete each phase fully and
   working before starting the next. Never leave a phase half-implemented to
   start visual polish.

3. NEVER FAKE FUNCTIONALITY. If something cannot run in this environment
   (e.g. full zip ingestion or embedding), build the real UI + schema + edge
   function scaffolding and show an honest "Ready for ingestion — not yet
   ingested" state. Do not display fake counts, fake progress bars, fake
   sources, or placeholder data presented as real.

4. DETERMINISTIC RULES ARE AUTHORITATIVE. The AI sense-check layer may only
   make output SAFER (downgrade confidence, suppress, add warnings, rewrite
   wording). It may NEVER upgrade confidence, un-suppress a card, remove a
   safety caution, or invent a product suggestion.

5. FAIL SAFE, NEVER FAIL SILENT. Every external dependency (AI gateway,
   vector search, lookup tables) must have an explicit fallback and an honest
   status message. Defined under FALLBACK BEHAVIOUR.

6. SMALL REUSABLE COMPONENTS. No giant single-file pages.

Stack: React, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres + pgvector +
Edge Functions + Auth + RLS), Lovable AI Gateway, Framer Motion (sparingly),
lucide-react.

────────────────────────────────────────
WHO USES THIS — DESIGN FOR NON-TECHNICAL PHARMACY STAFF
────────────────────────────────────────

Primary users are busy pharmacists and pharmacy assistants who are NOT
technical. They are standing at a counter, often interrupted, sometimes on a
shared till computer. Design accordingly:

USABILITY RULES (apply everywhere):
- One primary action per screen, as a large obvious button. Never make the
  user choose between two equally-weighted primary buttons.
- Plain pharmacy language, never tech jargon. Say "New patient review", not
  "Create case". Say "References", not "RAG knowledge base". Say "Set-up",
  not "Embedding status". Technical terms (chunks, embeddings, vectors,
  pgvector) may NEVER appear anywhere except the Admin/Set-up page.
- Progressive disclosure. Show the simple version first; advanced details
  (scores, source tiers, audit trails) live behind a "Show details" toggle.
- Forgiving input. Accept messy, pasted, misspelled medication lists. Never
  block the user with validation errors — interpret, then ask them to confirm.
- Always confirm interpretations. After parsing medications, show what the
  system THINKS the patient is taking as removable chips, and require one
  click to confirm before running the engine. Never run on an unconfirmed
  parse.
- Generous sizing: base font 16px minimum, touch/click targets 44px minimum,
  high contrast, works on a 1366×768 till screen and an iPad.
- Every empty state teaches. An empty page must say what it is, why it's
  empty, and have one button to fix that (e.g. "No reviews yet — Start your
  first patient review").
- Undo over confirm-dialogs. Destructive actions show a toast with Undo for
  8 seconds rather than a blocking "Are you sure?".
- Status uses words AND colour, never colour alone (accessibility).
- Loading states say what is happening in plain words: "Checking safety
  rules…", "Searching references…", never spinners alone.
- Keyboard-friendly: Enter advances, Escape closes, the review form is fully
  tabbable.
- A persistent, calm footer disclaimer on every app screen:
  "Pharmacist decision support only. Not patient-facing advice. Confirm
  clinical suitability and current references before counselling."

TONE OF ALL GENERATED OUTPUT:
Pharmacist-to-pharmacist decision-support language.
Use: "Worth asking about…", "I'd want to rule out…", "Check timing with…",
"Consider whether this is appropriate given…", "This may be a counselling
opportunity if clinically relevant…"
Never: "We recommend this product.", "This is perfect for you.", "You should
take this.", "Safe and effective for everyone.", "Boosts your health."

Core principle: Clinical appropriateness first. Safety first. Product
suggestions second. Commercial preference last.

This is NOT: patient-facing, a diagnosis engine, a prescribing tool, a
supplement sales page, or a chatbot. There is no free-text chat interface
anywhere in the app.

────────────────────────────────────────
INFORMATION ARCHITECTURE
────────────────────────────────────────

Routes:

/            Landing page (built last)
/app         Home (dashboard)
/app/review  New patient review (guided 3-step flow)
/app/results/:caseId   Results
/app/cases   Past reviews
/app/references        Knowledge base search ("References")
/app/products          Product browser
/app/queue   Needs review queue
/app/safety  Safety rules (read-only inspector)
/app/setup   Admin: data upload, ingestion, system status, settings

Shared app shell:
- Left sidebar, plain labels with icons:
  Home, New review (visually emphasised), Past reviews, References,
  Products, Needs review (with count badge), Safety rules, Set-up
- Main content area, max-width readable
- Sticky footer disclaimer (above)
- Top bar shows ingestion status pill ONLY if data is not yet loaded:
  "References not loaded yet — outputs will be limited. Set up →"
- No patient portal, no patient login, no share links.

────────────────────────────────────────
THE CORE FLOW: NEW PATIENT REVIEW (guided, 3 steps)
────────────────────────────────────────

Replace the single giant form with a 3-step wizard with a visible progress
indicator (Step 1 of 3 · Patient → Step 2 · Confirm → Step 3 · Results).
Each step fits on one screen without scrolling on a laptop.

STEP 1 — PATIENT
Fields, in this order, with friendly helper text:
- Review label (optional, e.g. "Mrs M — cramps", placeholder shows example)
- Age (number) and Sex (Female / Male / Prefer not to say — buttons, not a
  dropdown)
- If Female and age 12–55: show Pregnancy and Breastfeeding as simple
  Yes / No / Unsure toggles. "Unsure" is treated as a caution by the engine.
- Medications: one large textarea labelled
  "What are they taking? Paste or type the medication list — brand or
  generic, any format is fine."
- Allergies: single line, placeholder "e.g. penicillin, or NKDA"
- What's going on: textarea labelled
  "Symptoms, what the patient asked for, or counselling goal"
- Collapsible "More detail (optional)": medical history, existing
  vitamins/supplements, pathology notes, pharmacist notes.

Buttons:
- Primary: "Next: check medications"
- Secondary (small, top right): "Load sample patient" — fills the form with
  the demo patient below, clearly toast-labelled "Sample data loaded".

Sample patient:
68-year-old female. Medications: Metformin XR, Pantoprazole, Atorvastatin,
Aspirin, Coversyl Plus. History: type 2 diabetes, reflux, hypertension,
hyperlipidaemia. Symptoms: fatigue and occasional muscle cramps; asks whether
a vitamin might help. Allergies: NKDA.

STEP 2 — CONFIRM MEDICATIONS (the accuracy gate)
Parse the medication text. Show results as three groups of chips:

1. "We recognised these:" — confirmed chips showing
   Generic name (Brand entered), e.g. "perindopril/indapamide (Coversyl
   Plus)" with detected class as a small sub-label ("ACE inhibitor +
   diuretic"). Each chip removable with ×.
2. "Did you mean…?" — fuzzy matches as choice chips, e.g. user typed
   "atorvastain" → offer "atorvastatin?" [Yes / No, keep as typed].
3. "We couldn't identify these:" — unknown items kept as grey chips, with
   text: "These will be shown to the pharmacist but can't be safety-checked
   automatically."

Also show detected patient factors as read-only chips ("Type 2 diabetes",
"Possible polypharmacy (5+ medicines)", "Elderly") with the line:
"Based on what you entered. Edit Step 1 if anything is wrong."

The parser must handle: brand names (map common Australian brands to
generics — Coversyl, Lipitor, Somac, Diabex, Eutroxsig, Eliquis, Xarelto,
Plavix, Astrix, Cartia, Panadol Osteo, Nexium, etc.), generic names, mixed
case, commas/newlines/semicolons, strengths and doses appended (strip and
keep as metadata), misspellings via fuzzy match. Build this as a
deterministic dictionary + fuzzy-match module FIRST; the AI gateway may be
used as a secondary parser only for items the dictionary misses, and its
output still appears in the "Did you mean…?" confirm group — never
auto-accepted.

Primary button: "Run recommendation engine" (disabled until at least one
recognised medication OR the user ticks "No regular medications").

STEP 3 — RESULTS (route /app/results/:caseId)
Layout, top to bottom:
1. Patient summary strip (one line, editable via "Edit review")
2. SAFETY FIRST: any safety-caution cards, full width, signal-red left
   border, always expanded, never collapsible, never hidden by ranking caps.
3. Then administration/timing counselling cards.
4. Then "Pharmacist review required" cards.
5. Then counselling prompts.
6. Then "Possible product discussions" — maximum 3 shown; the rest under a
   collapsed "Other possible matches (n)".
7. Footer actions: Print, Export (JSON/CSV), Save & close.

RECOMMENDATION CARD (plain-language layout):
- Title (e.g. "Magnesium could be worth a conversation")
- Type badge + Confidence badge in words: "Confidence: Medium — pharmacist
  review required"
- "Why this came up" — 1–2 sentences, plain English.
- "Before you counsel" — checklist of pharmacist checks (visually a list
  with checkboxes the pharmacist can tick locally for their own workflow).
- "What you might say" — 2–4 talking points.
- "Watch out for" — safety cautions/interaction notes (omit section if none).
- Collapsed "Show sources & details" containing: source name, title, section
  heading, tier label in words ("Primary clinical reference" / "Product
  catalogue"), short excerpt, score, matched signals, AI review notes.
- Feedback row (small icon buttons with tooltips): Useful · Not relevant ·
  Unsafe · Already taking · Discussed · Hide. Hide = toast with Undo.

If nothing useful matched:
"No specific product discussion was generated from the available
information. Consider general counselling and pharmacist assessment."
— shown as a calm card, never an error state.

────────────────────────────────────────
RECOMMENDATION PIPELINE (server-side, Supabase Edge Function)
────────────────────────────────────────

Run as a single edge function `run_recommendation(case_id)` with these stages,
each writing its status so the UI can show plain-language progress:

1. Deterministic medication parse (dictionary + fuzzy) — already confirmed by
   the user in Step 2; use the confirmed list.
2. Patient factor detection (deterministic, from structured fields + keyword
   scan of history/symptoms): pregnancy, breastfeeding, child <12, elderly
   ≥65, polypharmacy (≥5), renal disease/CKD/dialysis/reduced eGFR, hepatic
   disease, diabetes, hypertension, CVD, bleeding risk, allergy risk,
   swallowing difficulty/crushing/PEG/enteral, mineral-timing risk, existing
   supplement duplication.
3. Drug-class detection (deterministic mapping): anticoagulants,
   antiplatelets, diabetes medicines, thyroid medicines, antibiotics
   (tetracyclines, quinolones flagged separately), bisphosphonates, PPIs,
   statins, ACEi, ARBs, beta blockers, CCBs, diuretics, opioids, sedatives,
   antidepressants, NSAIDs, corticosteroids, antiepileptics,
   immunosuppressants.
4. Lookup retrieval FIRST (exact/alias match against lookup tables for drugs,
   ingredients, supplements, topics, products).
5. Vector retrieval second: embed one composite clinical query (medicines +
   classes + history + symptoms + factors + supplements) and call
   match_kb_chunks. Boost chunks with lower source_tier, matching
   cross_source_tags, and title/section matches; boost chunks the lookup pass
   already identified.
6. Candidate card generation in fixed order: safety cautions →
   administration/timing → pharmacist review required → counselling prompts
   → possible product discussions.
7. DETERMINISTIC GUARDRAILS (below) applied to all candidates.
8. AI sense-check (below) — may only make things safer.
9. Persist cards + audit, return case to UI.

────────────────────────────────────────
DETERMINISTIC SAFETY GUARDRAILS (exact behaviour)
────────────────────────────────────────

Age: suppress children's/junior/paediatric products for adults. For under-12s,
adult-oriented products become "Pharmacist review required". Elderly triggers
polypharmacy/falls awareness notes where relevant.

Sex: suppress men's/prostate products for female patients and women's/
pregnancy/prenatal/menopause products for male patients. If sex unspecified
and product is sex-specific → "Pharmacist review required".

Pregnancy/breastfeeding (including "Unsure"): suppress general product
suggestions unless suitability explicitly supported; always add a pregnancy/
breastfeeding review warning card.

Anticoagulants/antiplatelets (warfarin, apixaban, rivaroxaban, dabigatran,
aspirin, clopidogrel, dipyridamole, ticagrelor): flag bleeding risk. Fish oil,
omega-3, turmeric/curcumin, ginkgo, garlic, cranberry, high-dose vitamin E
become SAFETY CAUTIONS, never product suggestions.

Mineral timing: levothyroxine/thyroxine, quinolones, tetracyclines,
bisphosphonates + any mineral (magnesium, calcium, iron, zinc) → timing
counselling prompt with "separate by 2–4 hours — verify the exact interval
for this combination".

Renal: renal disease/CKD/dialysis/stones/reduced eGFR → magnesium, potassium,
calcium, vitamin D and other mineral products require review.

Duplication: same ingredient already taken → duplication warning, never a
recommendation.

Allergies entered: append an allergy-check line to every product card.

Administration: swallowing difficulty/crushing/PEG/aged care/dysphagia/
enteral → prioritise Don't Rush to Crush content.

Unreviewed products: show "Product data unreviewed" and downgrade confidence
one level. Low extraction confidence: force Low + pharmacist review.

Cap: top 3 product-discussion cards visible; remainder collapsed. Safety
cards are never capped or collapsed.

────────────────────────────────────────
SCORING & CONFIDENCE
────────────────────────────────────────

Base: safety caution 900 · administration 800 · review required 700 ·
counselling prompt 500 · product discussion 300.
Add: +100 exact medication lookup match · +80 high-risk factor match ·
+60 symptom/goal match · +50 source tier 1–3 · +30 multi-source agreement ·
+20 specific product match.
Subtract: −100 unreviewed product · −100 low extraction confidence ·
−80 catalogue-only support · −60 weak semantic match · −50 missing
ingredient detail · −50 vague indication.

Confidence (display in words, score behind "Show details"):
High = strong match + tier 1–3 support + no unresolved concerns. Safety
cards may be High. Product cards are rarely High.
Medium = reasonable match, review still required.
Low = weak/catalogue-only/unreviewed/ambiguous.

────────────────────────────────────────
AI SENSE-CHECK (server-side function: runAiSenseCheck)
────────────────────────────────────────

Lovable AI Gateway. Hard rules enforced in code, not just the prompt:
- Runs AFTER deterministic guardrails.
- Allowed transitions only: pass · modify wording · downgrade confidence ·
  add warnings · suppress · mark needs_review. Code must reject any AI output
  that raises confidence, restores a suppressed card, or deletes a safety
  caution — on violation, keep the deterministic version and log it.
- Strict JSON response, validated with zod; on invalid JSON, retry once,
  then fall back to deterministic output with status "AI review unavailable —
  showing rule-based results."

System prompt for the reviewer:

"You are an Australian pharmacist clinical safety reviewer reviewing
pharmacist-facing decision-support prompts generated from a pharmacy
knowledge base. Make the output safer, more conservative and more clinically
useful. Do not provide patient-facing advice, diagnose, prescribe, invent
evidence, or use promotional language. Do not claim a product is effective
unless source context clearly supports it. Safety cautions come before
product discussions. Suppress or flag anything mismatched to age, sex,
pregnancy, breastfeeding, renal disease, anticoagulant use or allergies.
Rewrite talking points to sound like one pharmacist speaking to another.
Preserve source references. Downgrade confidence where evidence is weak or
catalogue-derived. Be cautious with bleeding-risk supplements on
anticoagulants/antiplatelets, mineral timing with thyroid medicines,
tetracyclines, quinolones and bisphosphonates, and anything in pregnancy or
breastfeeding."

JSON schema (return strictly this):
{
  "overall_status": "passed | modified | needs_review",
  "reviewed_recommendations": [{
    "recommendation_id": "string",
    "status": "passed | modified | suppressed | needs_review",
    "final_recommendation_type": "string",
    "final_confidence": "High | Medium | Low",
    "final_title": "string",
    "final_why_triggered": "string",
    "final_pharmacist_checks": ["string"],
    "final_talking_points": ["string"],
    "added_warnings": ["string"],
    "suppression_reason": "string | null",
    "reviewer_notes": ["string"]
  }],
  "global_safety_warnings": ["string"],
  "audit_summary": "string"
}

────────────────────────────────────────
DATABASE SCHEMA (Supabase)
────────────────────────────────────────

Enable pgvector. Create:

kb_chunks: id uuid pk default gen_random_uuid(), chunk_id text unique not
null, source text, source_name text, page_id text, page_short_id text,
page_type text, page_type_label text, title text, source_url text,
section_heading text, section_level int, section_index int, chunk_index int,
char_count int, text text not null, source_tier int, token_estimate int,
cross_source_tags text[], retrieval_hints text[], unified_id text, metadata
jsonb, embedding vector(1536).
Indexes: ivfflat on embedding (cosine), btree on source, source_tier, GIN on
cross_source_tags.

lookup_indexes: id uuid pk, index_name text not null, key text not null,
payload jsonb not null. Unique (index_name, key). Btree on (index_name, key).

products: product_id text pk, brand, product_name, product_name_normalised,
source, source_name, austl, artg, dosage_form, pack_size text; ingredients,
indications, directions, cautions, interactions, counselling_points,
clinical_tags, source_references jsonb; review_status text default
'Unreviewed', extraction_confidence text default 'Medium', created_at/
updated_at timestamptz default now().

patient_cases: case_id uuid pk, user_id uuid references auth.users,
case_label text, age int, sex text, pregnancy_status text
('yes'|'no'|'unsure'|null), breastfeeding_status text (same), medication_text
text, confirmed_medications jsonb, medical_history text, allergies text,
existing_supplements text, symptoms text, pathology_notes text,
counselling_goal text, pharmacist_notes text, parsed_medications jsonb,
detected_patient_factors jsonb, detected_drug_classes jsonb, created_at
timestamptz default now().

recommendations: recommendation_id uuid pk, case_id uuid references
patient_cases on delete cascade, recommendation_type, title, product_id,
product_name, brand, confidence text, score int, why_triggered text,
matched_medicines, matched_patient_factors, matched_product_tags,
pharmacist_checks, talking_points, safety_cautions, interaction_notes,
source_references jsonb, review_status, sense_check_status text,
ai_reviewer_notes jsonb, feedback_status text, deferred boolean default
false, created_at timestamptz default now().

safety_rules: rule_id text pk, name, description text, trigger_keywords,
trigger_drug_classes, trigger_patient_factors, match_product_tags,
avoid_product_keywords text[], severity, recommendation_type,
pharmacist_message text, pharmacist_checks jsonb, review_required boolean.
Seed with every guardrail above so /app/safety reads from this table.

medication_dictionary: id uuid pk, generic_name text, brand_names text[],
drug_class text, atc_hint text, aliases text[]. Seed with at least the 150
most-dispensed Australian medicines and their common brands.

sense_check_audits: audit_id uuid pk, case_id uuid fk cascade, source text,
overall_status text, global_warnings jsonb, entries jsonb, summary text,
created_at timestamptz.

pharmacist_feedback: feedback_id uuid pk, case_id uuid, recommendation_id
uuid, status text, notes text, created_at timestamptz.

RLS: enable on all tables. patient_cases, recommendations, audits, feedback
are user-owned (user_id = auth.uid()). kb_chunks, lookup_indexes, products,
safety_rules, medication_dictionary readable by authenticated users only.
Supabase Auth email/password sign-in; no public signup page on the landing
page — sign-in only. No API keys in the browser; all AI and embedding calls
go through edge functions.

RPCs:
match_kb_chunks(query_embedding vector, match_count int, filter_sources
text[], filter_tags text[], max_source_tier int) → chunk fields + cosine
similarity.
search_lookup_index(index_name text, key text) → matching payloads
(case-insensitive, trimmed key).

────────────────────────────────────────
DATA INGESTION (/app/setup) — BUILD HONESTLY
────────────────────────────────────────

The admin uploads the RAG zip. Primary file:
output/pharma_kb_unified.jsonl (one JSON chunk per line, fields matching
kb_chunks). Lookup files in intermediate/: lookup_drug.json,
lookup_product.json, lookup_topic.json, lookup_ingredient.json,
lookup_ingredient_alias.json, lookup_supplement.json,
lookup_supplement_ingredient.json, lookup_supplement_area.json.

Implementation requirements:
- Upload zip to Supabase Storage; an edge function extracts and processes it.
- Process the JSONL in BATCHES (e.g. 200 lines per invocation), embedding via
  the Lovable AI Gateway embedding endpoint, upserting on chunk_id so
  ingestion is RESUMABLE and idempotent. Persist progress in an
  ingestion_jobs table (job id, total lines, processed, failed, status) and
  show it on /app/setup as a plain progress card: "Loading references… 4,200
  of 18,000 sections processed. Safe to leave this page."
- Lookup JSONs load into lookup_indexes keyed by file name.
- Product-like records extracted into products where the source provides them.
- Errors listed in plain language with a "Retry failed items" button.
- If any part genuinely cannot run in this runtime, build the full UI +
  schema + function stubs and show "Ready for server-side ingestion — n/a in
  this environment" honestly. Never fake counts or success.

/app/setup also shows: sources loaded (name, tier label, chunk count),
product counts by source, rebuild indexes, clear MY saved reviews (with
Undo-toast), AI model settings, and the disclaimer text setting.

Source authority (display tiers in words, store as ints):
Tier 1–3 (clinical): TG (primary clinical guidance), AMH (primary drug
reference), Don't Rush to Crush (administration/crushing).
Tier 4–5 (product/medicine info): MIMS (manufacturer-derived), Herbs of Gold,
Metagenics (practitioner supplement info).
Tier 6 (trade): Eagle (catalogue).
Rules: clinical tiers outrank catalogue data; catalogue data supports
matching but never overrides cautions; all product data defaults to
"pharmacist review required" until marked reviewed; every recommendation
shows source name, title, section, tier label, URL if available, short
excerpt, and why that source was used (inside "Show sources & details").

────────────────────────────────────────
OTHER PAGES (keep simple)
────────────────────────────────────────

/app (Home): big "Start a new patient review" button; then small stat cards
(reviews this week, items needing review, references loaded yes/no with
counts); recent reviews list. If references not loaded: a single friendly
setup card instead of stats.

/app/cases: list of past reviews — label, date, age/sex, medicine count,
prompt count, safety flags; Open / Export / Delete (Undo toast). Search box.

/app/references: one big search box "Search medicines, conditions,
ingredients or products". Filters as chips: Source, Tier (in words), Type.
Results: source, title, section, excerpt, tier label, link. Each result has
"Use in a new review" which starts Step 1 prefilled.

/app/products: searchable table; filters Brand, Ingredient, Area, Review
status, Source. Row click opens a drawer: name, brand, AUST L/ARTG,
ingredients, directions, indications, cautions, interactions, counselling
points, tags, sources, review status, and a "Mark as reviewed" button
(records who/when).

/app/queue: grouped lists — unreviewed products, low-confidence extractions,
missing AUST L/ARTG, safety-flagged products, recommendations marked Unsafe,
AI-flagged items. Each row has one clear action.

/app/safety: read-only cards rendered from safety_rules: name, plain
description, what triggers it, severity in words, what it does.

Exports (results + cases): JSON, CSV, and a print stylesheet for a clean A4
print (no sidebar, no buttons). Default export excludes hidden/suppressed
cards; a checkbox "Include suppressed items (audit)" adds them.

────────────────────────────────────────
EDGE CASES & FALLBACK BEHAVIOUR
────────────────────────────────────────

Handle: empty medication list ("No regular medications" tick), unknown/
misspelled medications (confirm step), brand/generic confusion, similar
product names, pregnant/breastfeeding, children, elderly, renal/hepatic
disease, anticoagulants/antiplatelets, mineral timing, supplement
duplication, allergies, low-confidence data, missing product info, no
matches, AI unavailable, vector search unavailable, ingestion incomplete.

Fallback ladder (always show an honest status banner on results):
- AI gateway fails → deterministic results only: "AI review unavailable —
  showing rule-based results."
- Vector search fails → lookup-index results only.
- Lookups fail → semantic search only.
- Product matching fails → counselling prompts + safety cautions only.
- References not ingested → run guardrails + counselling prompts from
  safety_rules and medication_dictionary alone, banner: "References not
  loaded — safety rules only."

────────────────────────────────────────
VISUAL SYSTEM (locked — applies to landing AND app)
────────────────────────────────────────

Typography: Display = Raleway (or refined editorial sans); Body = Inter.
Headings oversized and confident; body calm and concise.

Palette: background #F7F5EF · primary text #151715 · secondary #5D615B ·
muted #8A8E86 · hairline border rgba(21,23,21,0.10) · panel
rgba(255,255,250,0.72) · deep panel #20251F · accent #7D927B · accent dark
#40513F · signal red reserved EXCLUSIVELY for safety cautions.
No purple, indigo, rainbow gradients or neon.

Surfaces: soft clinical glass — backdrop-blur-xl, bg-white/55, border
border-black/10, shadow-[0_24px_80px_rgba(20,24,20,0.08)], ~24px panel
radius, rounded-full chips, tactile understated buttons. One surface
language used consistently; the app may use a slightly flatter, faster
variant of the same system (less blur) for data-dense screens.

Motion: subtle and purposeful only — fades, gentle parallax on the landing
page, no bouncing, respect prefers-reduced-motion. App screens prioritise
speed over animation.

────────────────────────────────────────
LANDING PAGE (/) — BUILT LAST
────────────────────────────────────────

Feel: The Ordinary's restraint, Apple Health's polish, a private clinical
lab's precision. NOT: generic AI landing page, chatbot, SaaS template,
supplement sales site. No purple gradients, glowing blobs, cartoon
pharmacists, stock medical photos, floating pills, fake testimonials, fake
metrics, laptop mockups.

Sticky minimal nav: left "PharmaPrompt OS"; right links Workflow · Preview ·
Safety; CTA button "Launch Engine" → /app/review (via sign-in if needed).

Sections:
1. HERO (full viewport)
   Eyebrow: "Pharmacist decision support"
   Headline: "Clinical recommendations, built for the pace of pharmacy."
   Copy: "Enter the patient's medications, history, allergies and goals. Get
   clinically sensible product matches with counselling points that sound
   useful, not pushy."
   Primary CTA: "Launch Recommendation Engine". Secondary: "View example
   recommendation" (scrolls to preview).
   Microcopy: "Pharmacist decision support only. Patient counselling remains
   pharmacist-led."
   Visual: custom floating clinical interface preview (NOT a browser
   mockup) — a pathway of glass panels and thin prescription-line geometry:
   Patient context → Safety review → Product discussion → Counselling
   prompt, with the demo case (Sarah M., 42 · Metformin XR · Perindopril ·
   Atorvastatin · T2DM · muscle cramps → "Magnesium option may be
   considered · check renal function · review bowel symptoms · separate from
   selected medicines where relevant"). Every panel labelled "Demo data".
   Motion: headline reveals line by line, slow background drift, subtle
   panel parallax, chips resolve gently.

2. WORKFLOW — "From patient context to pharmacist-ready prompts."
   An integrated sequence (not three generic cards): 1 Patient context →
   2 Clinical reasoning pass → 3 Recommendation output, closing line:
   "The pharmacist stays in control at every step."

3. PREVIEW — "Recommendations that show their working."
   Wide custom panel: left patient input, middle detected clinical signals,
   right recommendation card (the Sarah M. magnesium card with checks,
   talking points, safety note), bottom audit strip: "AMH context reviewed ·
   Product monograph checked · Safety rule applied · AI sense-check
   completed." All labelled demo. Never imply magnesium treats diabetes,
   hypertension or any disease.

4. SAFETY — "A second pass before anything reaches the patient."
   Four pillars: Avoids obvious mismatches · Checks medication context ·
   Keeps counselling human · Shows its working.

5. CLOSING CTA — "Built for the counter, not the conference room." /
   "Fast enough for real pharmacy workflow. Careful enough to respect the
   patient in front of you." CTA: "Start a recommendation". Footnote:
   "Clinical decision support for pharmacists. Not patient-facing advice."

────────────────────────────────────────
BUILD PHASES & ACCEPTANCE CHECKS
────────────────────────────────────────

PHASE 1 — Core flow, no AI, no RAG:
App shell, auth, /app home, 3-step review wizard, deterministic medication
dictionary + parser + confirm step, seeded safety_rules, guardrail engine,
results page with cards, case saving. ✅ Accept when: sample patient runs
end-to-end and produces the aspirin bleeding-risk caution, the
PPI/duplication-aware output, and a magnesium timing-aware counselling
prompt — from rules alone.

PHASE 2 — Data layer:
Full schema, RLS, RPCs, /app/setup with real batched/resumable ingestion (or
honest "ready for ingestion" state), /app/references search, /app/products.
✅ Accept when: uploaded data shows true counts and reference search returns
real excerpts with tier labels.

PHASE 3 — Retrieval-powered engine:
Lookup-first retrieval, vector retrieval, source-aware ranking, scoring,
"Show sources & details" on cards. ✅ Accept when: cards cite real sources
and tier rules demonstrably outrank catalogue data.

PHASE 4 — AI sense-check:
runAiSenseCheck with code-enforced safer-only transitions, zod validation,
fallbacks, audit trail panel. ✅ Accept when: killing the AI gateway still
yields complete rule-based results with the honest banner.

PHASE 5 — Workflow extras:
/app/queue, feedback buttons, exports, print stylesheet, /app/safety
inspector. ✅ Accept when: a case can be printed cleanly on A4.

PHASE 6 — Landing page + final polish:
Cinematic landing page per spec, motion, reduced-motion support, empty
states, copy pass, performance pass (results render < 4s after engine
returns; wizard steps < 200ms). ✅ Accept when: a non-technical pharmacy
assistant could complete a review unaided.

────────────────────────────────────────
FINAL QUALITY BAR
────────────────────────────────────────

Fast. Conservative. Source-aware. Transparent. Auditable. Beautiful but
restrained. Usable one-handed at a busy counter by someone who has never
seen it before. Every output makes clear the pharmacist remains responsible
for final clinical judgement. No chatbot. No sales page. No fake anything.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d66c86ca-3247-4c38-a0d9-c7d7749d116f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
