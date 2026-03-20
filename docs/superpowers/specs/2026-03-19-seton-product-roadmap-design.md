# Seton Product Roadmap Design

**Date:** 2026-03-19

## Product Thesis

Seton is a desktop, local-first thinking tool built around frictionless note capture. The core interaction is simple: write a note quickly, optionally attach capture context, and let the system organize the note afterward through derived metadata, relationships, and later synthesis.

The product should not rely on folders, filenames, or manual linking as its primary organizing model. Instead, it should use internal storage, post-save enrichment, and relationship discovery so the user can focus on getting ideas into the system with as little ceremony as possible.

AI is assistive, not editorial. The canonical note remains what the user wrote. AI can assign or suggest concept links, extract keywords, detect relationships, generate insights, surface tensions or alternative views, and support later document creation, but it must not silently rewrite saved notes.

## Product Principles

### 1. Low Friction Capture

The product must optimize for fast input of ideas, thoughts, and notes. The center of the app should behave like a minimal text-first workspace with support for LaTeX math notation, but no heavy formatting model. The right question is not "how powerful is the editor?" but "how quickly can a thought become a saved note?"

### 2. Local-First Privacy

Notes and their derived metadata should live locally by default. The system should support both local inference, such as Ollama-backed models, and optional external inference providers. This allows the user to choose the right balance between privacy, speed, cost, and model quality.

### 3. Deep Intelligence Without Editorial Control

AI should make the notes more navigable and more useful over time. It should enrich the system with concept links, keywords, relationships, and insights. It should not become a co-author of the original notes. Suggestions belong in metadata, side panels, or drafting workflows, not inside the canonical note body.

### 4. Inbox-First Product Strategy

The first complete product is the `Thought Inbox`. All later views should justify themselves by improving capture, retrieval, synthesis, or writing from notes. This keeps the roadmap coherent and prevents graph, insight, or document features from becoming disconnected products.

### 5. Stable Canonical Core, Revisable Derived Layer

The architecture should distinguish between canonical user-authored records and revisable derived artifacts. Notes and user-entered context are canonical. AI outputs such as keywords, concept links, embeddings, concept-to-concept relationships, OCR, captions, and insights are derived records that can be recalculated, replaced, suppressed, or versioned as models change.

## Core Product Model

### Note

The note is the canonical unit of user-authored content. A note is plain text with optional LaTeX and timestamps. It should support both short and long entries, since the user may capture anything from a sentence to a full page of thought.

Recommended core fields:

- `id`
- `body`
- `created_at`
- `updated_at`
- `content_hash`
- optional analysis lifecycle fields such as `analysis_status` and `analysis_requested_at`
- optional edit metadata such as `last_opened_at`

The note body is the product's primary authored truth. AI may derive metadata from it, but it must not silently rewrite `body`.

### Capture Context

Capture context is a first-class, note-associated entity used to preserve situational evidence and support later retrieval. It is not a folder, project, or hierarchy primitive, and it is not part of the canonical note body.

Capture context should support multiple modalities behind one model:

- plain text context
- image context
- URL context
- later multimodal context such as audio or imported clips

Recommended shell fields:

- `id`
- `note_id`
- `context_type`
- `source`
- `provenance`
- `status`
- `created_at`
- `updated_at`

Recommended payload split:

- `capture_context_text`
- `capture_context_images`
- `capture_context_urls`
- later `capture_context_audio` or equivalent

For Phase 1, capture context should be attached inside the center note workspace and saved as note-associated records rather than merged into the canonical note body. Text, image, and URL contexts are all valid Phase 1 inputs. An image can be attached only as context associated with an existing non-empty note. The image is not the note. A URL is stored as a linked context record only; preview fetching or enrichment is deferred. This preserves the product's text-first thinking model while making room for richer retrieval later.

### Concept Node

A concept node is a reusable typed concept entity. It is not a flat string label attached directly to a note. It is a reusable semantic unit that can later support search filters, graph projections, clustering, and insight generation.

Recommended fields:

- `id`
- `label`
- `normalized_label`
- `concept_type`
- `aliases`
- optional `description`
- `confidence`
- `status` such as `candidate`, `active`, `suppressed`, `merged`
- `provenance`
- optional embedding or embedding reference
- optional external IDs such as Wikipedia/Wikidata identifiers
- `created_at`
- `updated_at`

The system should prefer stable and reusable concept nodes across notes. However, extraction may begin with tentative note-level candidates that are only promoted into shared concept nodes after matching and confidence checks.

### Note-Concept Link

Notes should connect to concept nodes through an explicit relationship entity rather than by storing raw tag strings on the note.

Recommended fields:

- `note_id`
- `concept_id`
- `relationship_role`
- optional `source_span` or evidence excerpt
- `confidence`
- `provenance`
- `created_at`

This allows the system to distinguish between different semantic roles such as:

- `about`
- `mentions`
- `person`
- `organization`
- `place`
- `work`
- `topic`

### Keyword

Keywords are lightweight retrieval terms extracted from note text and, later, context enrichment outputs such as OCR or captions. They remain distinct from concept nodes. Keywords are cheap retrieval metadata; concept nodes are reusable semantic entities. This distinction is important because not every useful retrieval term deserves a stable node in the concept graph.

### Concept Relationship

Concept-to-concept relationships should be modeled explicitly in the derived layer rather than implied through shared tagging alone.

Recommended fields:

- `id`
- `from_concept_id`
- `to_concept_id`
- `relationship_type`
- `confidence`
- `provenance`
- optional `evidence`
- `created_at`
- `updated_at`

Useful relationship types include:

- `related`
- `broader_than`
- `narrower_than`
- `supports`
- `depends_on`
- `commonly_confused_with`
- `contrasts_with`
- `opposes`

This is important not only for later graph features, but also for future reflective features. If the system can model contrast or opposition between concepts, it can surface neglected counterarguments, competing frames, or alternative interpretations without touching the canonical note text.

### Insight

Insights are deferred AI outputs generated from notes, concept links, concept relationships, and context enrichments. They may identify dominant themes, recurring concerns, synthesis opportunities, missing counterarguments, or invitations to challenge the user's current viewpoint. They must remain suggestions that can be acknowledged, skipped, or acted upon.

### Document

Documents are later-phase writing artifacts built from selected notes. They are separate from notes and should maintain traceability back to their supporting note set.

## AI Boundary

AI should participate in the product in a bounded way:

- It may assign concept links, extract keywords, infer relationships, and create insights.
- It may recommend opposing viewpoints or research directions in the insights panel.
- It may enrich capture context with captions, OCR text, detected objects, or topic hints.
- It may support document generation and contradiction detection in later phases.
- It must not silently edit canonical notes.
- It should expose derived outputs in a way that can be inspected, recalculated, replaced, or suppressed when models change.

This separation keeps note content stable while allowing the intelligence layer to evolve over time.

## Architectural Direction

The recommended foundation is a `Tauri + Vite` desktop application with a hexagonal architecture and a SQLite-first local core. `Tauri` should own the native shell, application lifecycle, and backend command surface. `Vite` should own the frontend application build and development workflow. The domain model should not be shaped around SQLite tables, file paths, or any specific sync backend. Instead, it should depend on ports and adapters so the system can begin with SQLite and later add or replace adapters for vector search, graph projections, PostgreSQL, or sync services.

Recommended domain-facing ports:

- `NoteRepository`
- `CaptureContextRepository`
- `ConceptRepository`
- `KeywordRepository`
- `SearchIndexPort`
- `EmbeddingPort`
- `EnrichmentJobPort`
- `InsightRepository`
- `DocumentRepository`
- `SyncPort`

Recommended implementation stance:

- `Tauri + Vite` is the Phase 1 application stack
- SQLite is the first system of record
- the application uses an internal database rather than Markdown files on disk
- vector search is an optional derived subsystem, not the canonical store
- graph features should be projections from relational truth, not a second truth store
- remote sync or collaborative infrastructure should remain optional until the product proves the need

For the first release, the UI behavior should follow the existing spatial wireframe:

- `Center`: canonical note editor and `capture_contexts`
- `Bottom`: recent-note history and reopen flow
- `Left`: concept graph placeholder
- `Right`: insights placeholder
- `Top`: finished documents placeholder

Only the center and bottom flows need to be functional in Phase 1. The other directions should ship as placeholders that preserve the roadmap shape without forcing early implementation of graph, insight, or document features.

This gives the project a strong local-first base now without locking the long-term architecture into one storage technology.

## Optional Wikipedia/Wikidata Enrichment

Concept nodes should optionally support external identifiers such as Wikipedia and Wikidata references, but this should not be a hard dependency in Phase 1.

Recommended optional fields:

- `wikidata_qid`
- `wikipedia_title`
- `wikipedia_lang`
- `match_confidence`
- `match_method`
- `matched_at`

Recommended modeling approach:

- local concept identity is primary
- external IDs are optional pointers
- fetched enrichment should be stored as derived metadata, not merged into canonical note content
- the system must continue to work fully offline even if no external IDs are present

Practical benefits:

- better disambiguation for ambiguous labels
- alias resolution across notes
- richer semantic enrichment for future graph and insight features
- future interoperability with exports, citations, or external knowledge tooling

Risks and constraints:

- not every useful concept has a good public knowledge-base match
- external resolution should never block note save
- external enrichment may have privacy implications if it requires remote lookup

The correct product stance is that Wikipedia/Wikidata enrichment is optional concept metadata that improves disambiguation and interoperability. It should not define whether a concept may exist in the local system.

## Context Enrichment Model

Context should have its own derived-enrichment path that remains separate from notes.

Recommended derived records:

- `context_enrichments`
- `context_embeddings`

Possible enrichment types:

- `caption`
- `ocr_text`
- `detected_objects`
- `topic_hints`
- `dominant_entities`
- `embedding`

This model keeps context separate from canonical notes while still allowing:

- retrieval using OCR text or captions
- note ranking influenced by attached context
- linking image-derived concepts back to the note meaning
- future multimodal features without redesigning the note model

## Storage Architecture

Storage is a primary design decision for Seton, not an implementation detail. The chosen architecture is a SQLite-first relational local model. SQLite is the only system of record in Phase 1, and the application uses an internal database rather than Markdown files or a filesystem-centered note model.

Canonical and derived records should both live in the local relational store, with the canonical core kept clearly separate from revisable derived tables.

Recommended canonical tables:

- `notes`
- `capture_contexts`
- `capture_context_text`
- `capture_context_images`
- `capture_context_urls`

Recommended derived tables for later phases:

- `concept_nodes`
- `note_concepts`
- `keywords`
- `concept_relationships`
- `context_enrichments`
- `insights`
- `documents`
- `document_note_links`
- `ai_jobs`

This architecture preserves local-first capture speed, keeps the save path as a small local transaction, and leaves room for the later derived layer without forcing AI or graph work into the first release.

Planned storage evolution:

1. Use the SQLite relational core as the Phase 1 system of record.
2. Add local full-text and retrieval-oriented indexes when the retrieval workspace becomes product-critical.
3. Add embeddings as a rebuildable derived subsystem once hybrid retrieval is needed.
4. Add graph projections as a read model when concept exploration becomes product-critical.
5. Keep the domain hexagonal so later sync-capable infrastructure can be introduced without rewriting the core product model around it.

## Platform Assumptions

- single-user desktop app first
- `Tauri + Vite` desktop stack
- local-first storage and indexing
- internal database instead of a filesystem-centered note model
- optional pluggable inference layer for local or remote models
- fast save path with asynchronous deeper enrichment
- derived artifacts tracked with provenance, confidence, and model metadata
- hexagonal boundaries to preserve migration paths to PostgreSQL or sync-oriented architectures later

## Roadmap

### Phase 1: Thought Inbox

This is the first release and the product anchor.

The main view centers on a text-first note editor with LaTeX support and attached `capture_contexts`. Phase 1 should stay narrow, but it should be narrow in product surface area, not naive in architecture. The first release is the first usable desktop inbox, not the first intelligence release.

Phase 1 should implement:

- `Tauri + Vite` desktop shell
- note creation and editing
- local durable storage in SQLite
- note-attached `capture_contexts` for text, images, and URLs
- image attachment as context for an existing non-empty note
- URL storage as note-associated context without preview fetching
- recent-history retrieval
- basic note reopen/history flow that returns the user to the center editor
- placeholder views for concept graph, insights, and finished documents
- edit flow that can mark a note as needing fresh analysis without executing AI

Recommended synchronous save path:

- validate the note is non-empty
- persist the note
- persist any directly user-entered capture context
- write a content hash for downstream invalidation
- return success immediately

Recommended Phase 1 post-save behavior:

- update recent-history retrieval state
- if the user edited an existing note or changed attached context, ask whether fresh analysis should be run
- if analysis is requested, persist note-level analysis status only
- do not execute real AI pipelines yet
- keep the save path fast and local

Phase 1 should explicitly avoid:

- real concept extraction
- real keyword extraction
- OCR, captioning, or URL enrichment
- heavy save-time AI latency
- fully autonomous organization logic
- graph interactions
- daily insight system
- document drafting workflows
- mandatory external enrichment
- Markdown-file storage

Success criteria:

- capturing a note is easier than creating folders or manual links
- the user can save with near-zero friction
- reopening a note returns the user to the center workspace naturally
- attached context is available without cluttering the canonical note body
- the surrounding placeholder views communicate the roadmap without pretending features already exist
- the canonical note remains untouched by AI

### Phase 2: Retrieval Workspace

This phase evolves the retrieval surface into the main recall workspace.

The user can browse created notes, hover to preview content, click to reopen a note in the center panel, and search or filter by concepts, dates, contexts, and keywords. Hybrid retrieval may combine exact match, history, and semantic similarity if embeddings have been enabled.

This phase should include:

- recent note list
- hover preview behavior
- reopen-in-editor interaction
- search box
- filters for concepts, dates, contexts, and note metadata
- selection of notes for later document generation

Success criteria:

- the right note is recoverable without remembering exact wording
- filters feel additive rather than complex
- retrieval supports later graph and document workflows

### Phase 3: Relationship Map

This phase turns the left view into a concept-centered graph projection.

Graph nodes represent reusable concept nodes. Edges represent derived concept relationships and note-mediated co-occurrence. Clicking a node should jump the user into the retrieval workspace filtered by that concept. Clicking an edge should filter the notes that support or connect the displayed relationship.

This phase should include:

- graph of concept nodes as stable nodes
- concept-to-concept relationships as edges
- note-mediated co-occurrence edges where useful
- node click to filter retrieval by concept
- edge click to filter by supporting notes

Success criteria:

- the graph reveals meaningful structure rather than decorative complexity
- graph interactions feed directly into practical recall
- concept nodes are stable enough that users can build intuition around them

### Phase 4: Insight System

This phase expands the right view into a reflection and challenge layer.

Once per day, or when manually triggered, the system analyzes recent notes, concept links, concept relationships, and context enrichments to produce insights. These may include recurring topics, dominant concerns, over-indexed viewpoints, missing counterarguments, or signals that enough material exists to develop a stronger written piece.

This phase should include:

- daily or on-demand insight generation
- notification-like presentation of insights
- ability to acknowledge or skip an insight
- suggestions to challenge current views with alternative perspectives
- suggestions that enough material exists to write about a topic

Success criteria:

- insights feel useful and specific, not generic
- users can ignore low-value suggestions without friction
- insights support reflection without taking over the product

### Phase 5: Writing Workspace

This phase completes the top view as a document library and drafting surface.

The top view has two roles: a library of generated documents and a drafting mode where selected notes appear alongside a document editor. The user can build a draft from chosen notes while keeping source material visible. AI may point out contradictions or map source notes to passages, but it should not rewrite the original notes.

This phase should include:

- document library
- drafting workspace
- selected-note side panel
- note-to-draft traceability
- contradiction detection against supporting notes

Success criteria:

- documents are clearly distinct from notes
- drafting is grounded in selected source material
- the writing workflow benefits from the note system rather than bypassing it

## Architectural Implications

The product should separate canonical user content from derived AI artifacts and should do so explicitly in both the codebase and the storage schema.

Recommended high-level data domains:

- `notes`
- `capture_contexts`
- `capture_context_text`
- `capture_context_images`
- `capture_context_urls`
- `concept_nodes`
- `note_concepts`
- `keywords`
- `concept_relationships`
- `context_enrichments`
- `embeddings`
- `insights`
- `documents`
- `document_note_links`
- `ai_jobs`
- optional `concept_external_enrichments`

Recommended architectural decisions to make now:

- notes are canonical and never silently rewritten by AI
- capture context is separate from note body
- concepts are typed reusable nodes, not flat tags
- keywords are retrieval metadata, not concept graph nodes
- graph behavior is derived from relational truth
- save must be fast and local
- deeper enrichment runs after save
- every derived artifact should carry provenance, confidence, and model metadata where applicable

Decisions to defer:

- the exact ontology breadth for concept types beyond a focused starter set
- the exact ranking formula for hybrid retrieval
- the exact graph visualization strategy
- whether embeddings live inside SQLite or in a sidecar vector index
- when, if ever, a sync-capable backend architecture becomes necessary

## Open Product Questions For Later

- How strict should concept promotion be before the graph becomes noisy?
- Which concept types belong in the initial ontology?
- Should context suggestions be purely historical or partially AI-assisted?
- What ranking model should combine exact search, fuzzy retrieval, and semantic similarity?
- How should documents be stored and versioned relative to notes?
- Which parts of the AI pipeline must run locally by default, and which can be optional remote enrichments?
- How should audio capture eventually enter the same context pipeline?
- What user controls should exist for suppressing, merging, or confirming concept nodes and concept relationships?

## Recommended Next Step

Translate `Phase 1: Thought Inbox` into an implementation plan with concrete repository interfaces, SQLite schema boundaries, indexing assumptions, AI job orchestration, and UI states. That phase should be designed to stand on its own as a usable local-first product before graph, insights, or document generation are implemented.
