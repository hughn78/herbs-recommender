export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      catalogue_products: {
        Row: {
          austl: string | null
          brand: string
          category: string | null
          created_at: string
          dosage_form: string | null
          extraction_confidence: string | null
          hog_code: string
          name: string
          name_normalised: string
          product_family: string | null
          product_id: string
          review_status: string
          reviewer_notes: string | null
          source_page: number | null
          status: string
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          austl?: string | null
          brand?: string
          category?: string | null
          created_at?: string
          dosage_form?: string | null
          extraction_confidence?: string | null
          hog_code: string
          name: string
          name_normalised: string
          product_family?: string | null
          product_id?: string
          review_status?: string
          reviewer_notes?: string | null
          source_page?: number | null
          status?: string
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          austl?: string | null
          brand?: string
          category?: string | null
          created_at?: string
          dosage_form?: string | null
          extraction_confidence?: string | null
          hog_code?: string
          name?: string
          name_normalised?: string
          product_family?: string | null
          product_id?: string
          review_status?: string
          reviewer_notes?: string | null
          source_page?: number | null
          status?: string
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalogue_review_actions: {
        Row: {
          action: string
          action_id: string
          created_at: string
          entity_id: string
          entity_type: string
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
          reviewer: string | null
        }
        Insert: {
          action: string
          action_id?: string
          created_at?: string
          entity_id: string
          entity_type: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          reviewer?: string | null
        }
        Update: {
          action?: string
          action_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          reviewer?: string | null
        }
        Relationships: []
      }
      claim_citations: {
        Row: {
          citation_id: string
          claim_id: string
          document_id: string | null
          excerpt: string | null
          page: number | null
          section_heading: string | null
          source_format: string | null
        }
        Insert: {
          citation_id?: string
          claim_id: string
          document_id?: string | null
          excerpt?: string | null
          page?: number | null
          section_heading?: string | null
          source_format?: string | null
        }
        Update: {
          citation_id?: string
          claim_id?: string
          document_id?: string | null
          excerpt?: string | null
          page?: number | null
          section_heading?: string | null
          source_format?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_citations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "source_claims"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_citations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["document_id"]
          },
        ]
      }
      data_quality_issues: {
        Row: {
          created_at: string
          description: string | null
          hog_code: string | null
          issue_id: string
          issue_type: string
          severity: string | null
          source_file: string | null
          source_page: number | null
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hog_code?: string | null
          issue_id?: string
          issue_type: string
          severity?: string | null
          source_file?: string | null
          source_page?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hog_code?: string | null
          issue_id?: string
          issue_type?: string
          severity?: string | null
          source_file?: string | null
          source_page?: number | null
          status?: string
        }
        Relationships: []
      }
      extraction_conflicts: {
        Row: {
          conflict_id: string
          created_at: string
          field: string
          hog_code: string
          resolution: string | null
          resolved_at: string | null
          status: string
          values: Json
        }
        Insert: {
          conflict_id?: string
          created_at?: string
          field: string
          hog_code: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          values: Json
        }
        Update: {
          conflict_id?: string
          created_at?: string
          field?: string
          hog_code?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          values?: Json
        }
        Relationships: []
      }
      ingestion_jobs: {
        Row: {
          bucket: string
          chunks_inserted: number
          created_at: string
          job_id: string
          last_error: string | null
          shard_done: number
          shard_prefix: string
          shard_total: number
          source_label: string
          status: string
          updated_at: string
        }
        Insert: {
          bucket: string
          chunks_inserted?: number
          created_at?: string
          job_id?: string
          last_error?: string | null
          shard_done?: number
          shard_prefix: string
          shard_total?: number
          source_label: string
          status?: string
          updated_at?: string
        }
        Update: {
          bucket?: string
          chunks_inserted?: number
          created_at?: string
          job_id?: string
          last_error?: string | null
          shard_done?: number
          shard_prefix?: string
          shard_total?: number
          source_label?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          dry_run: boolean
          finished_at: string | null
          last_error: string | null
          run_id: string
          source_hashes: Json
          started_at: string
          stats: Json
          status: string
          triggered_by: string | null
        }
        Insert: {
          dry_run?: boolean
          finished_at?: string | null
          last_error?: string | null
          run_id?: string
          source_hashes?: Json
          started_at?: string
          stats?: Json
          status?: string
          triggered_by?: string | null
        }
        Update: {
          dry_run?: boolean
          finished_at?: string | null
          last_error?: string | null
          run_id?: string
          source_hashes?: Json
          started_at?: string
          stats?: Json
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      ingredient_aliases: {
        Row: {
          alias: string
          alias_id: string
          alias_type: string
          approved: boolean
          ingredient_id: string
          provenance: string
        }
        Insert: {
          alias: string
          alias_id?: string
          alias_type?: string
          approved?: boolean
          ingredient_id: string
          provenance?: string
        }
        Update: {
          alias?: string
          alias_id?: string
          alias_type?: string
          approved?: boolean
          ingredient_id?: string
          provenance?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_aliases_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["ingredient_id"]
          },
        ]
      }
      ingredients: {
        Row: {
          canonical_name: string
          created_at: string
          ingredient_id: string
          name_normalised: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          ingredient_id?: string
          name_normalised: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          ingredient_id?: string
          name_normalised?: string
        }
        Relationships: []
      }
      kb_chunks: {
        Row: {
          char_count: number | null
          chunk_id: string
          chunk_index: number | null
          created_at: string
          cross_source_tags: string[] | null
          id: string
          page_id: string | null
          page_short_id: string | null
          page_type: string | null
          retrieval_hints: string[] | null
          section_heading: string | null
          section_level: number | null
          source: string
          source_name: string | null
          source_tier: number
          source_url: string | null
          text: string
          title: string | null
          token_estimate: number | null
          topic_area: string | null
          topic_code: string | null
          tsv: unknown
        }
        Insert: {
          char_count?: number | null
          chunk_id: string
          chunk_index?: number | null
          created_at?: string
          cross_source_tags?: string[] | null
          id?: string
          page_id?: string | null
          page_short_id?: string | null
          page_type?: string | null
          retrieval_hints?: string[] | null
          section_heading?: string | null
          section_level?: number | null
          source: string
          source_name?: string | null
          source_tier?: number
          source_url?: string | null
          text: string
          title?: string | null
          token_estimate?: number | null
          topic_area?: string | null
          topic_code?: string | null
          tsv?: unknown
        }
        Update: {
          char_count?: number | null
          chunk_id?: string
          chunk_index?: number | null
          created_at?: string
          cross_source_tags?: string[] | null
          id?: string
          page_id?: string | null
          page_short_id?: string | null
          page_type?: string | null
          retrieval_hints?: string[] | null
          section_heading?: string | null
          section_level?: number | null
          source?: string
          source_name?: string | null
          source_tier?: number
          source_url?: string | null
          text?: string
          title?: string | null
          token_estimate?: number | null
          topic_area?: string | null
          topic_code?: string | null
          tsv?: unknown
        }
        Relationships: []
      }
      lookup_indexes: {
        Row: {
          chunk_id: string
          concept_key: string
          concept_type: string
          created_at: string
          id: string
          weight: number
        }
        Insert: {
          chunk_id: string
          concept_key: string
          concept_type: string
          created_at?: string
          id?: string
          weight?: number
        }
        Update: {
          chunk_id?: string
          concept_key?: string
          concept_type?: string
          created_at?: string
          id?: string
          weight?: number
        }
        Relationships: []
      }
      med_data_quality: {
        Row: {
          concept_id: string | null
          created_at: string
          description: string
          issue_id: string
          issue_type: string
          severity: string
          source_code: string | null
          source_file: string | null
          status: string
        }
        Insert: {
          concept_id?: string | null
          created_at?: string
          description: string
          issue_id?: string
          issue_type: string
          severity?: string
          source_code?: string | null
          source_file?: string | null
          status?: string
        }
        Update: {
          concept_id?: string | null
          created_at?: string
          description?: string
          issue_id?: string
          issue_type?: string
          severity?: string
          source_code?: string | null
          source_file?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "med_data_quality_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      med_ingestion_runs: {
        Row: {
          changed_assertions: number
          completed_at: string | null
          conflicts_found: number
          document_id: string | null
          error_summary: string | null
          files_failed: number
          files_processed: number
          files_skipped: number
          new_assertions: number
          new_concepts: number
          report_json: Json | null
          run_id: string
          source_code: string
          started_at: string
          status: string
          updated_concepts: number
        }
        Insert: {
          changed_assertions?: number
          completed_at?: string | null
          conflicts_found?: number
          document_id?: string | null
          error_summary?: string | null
          files_failed?: number
          files_processed?: number
          files_skipped?: number
          new_assertions?: number
          new_concepts?: number
          report_json?: Json | null
          run_id?: string
          source_code: string
          started_at?: string
          status?: string
          updated_concepts?: number
        }
        Update: {
          changed_assertions?: number
          completed_at?: string | null
          conflicts_found?: number
          document_id?: string | null
          error_summary?: string | null
          files_failed?: number
          files_processed?: number
          files_skipped?: number
          new_assertions?: number
          new_concepts?: number
          report_json?: Json | null
          run_id?: string
          source_code?: string
          started_at?: string
          status?: string
          updated_concepts?: number
        }
        Relationships: [
          {
            foreignKeyName: "med_ingestion_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "med_source_documents"
            referencedColumns: ["document_id"]
          },
        ]
      }
      med_source_documents: {
        Row: {
          corpus_path: string | null
          document_id: string
          file_count: number | null
          ingested_at: string
          scrape_date: string | null
          sha256: string
          source_code: string
          source_version: string | null
          title: string
        }
        Insert: {
          corpus_path?: string | null
          document_id?: string
          file_count?: number | null
          ingested_at?: string
          scrape_date?: string | null
          sha256: string
          source_code: string
          source_version?: string | null
          title: string
        }
        Update: {
          corpus_path?: string | null
          document_id?: string
          file_count?: number | null
          ingested_at?: string
          scrape_date?: string | null
          sha256?: string
          source_code?: string
          source_version?: string | null
          title?: string
        }
        Relationships: []
      }
      medication_assertion_conflicts: {
        Row: {
          assertion_a_id: string | null
          assertion_b_id: string | null
          assertion_type: string
          clinical_significance: string
          concept_id: string
          conflict_id: string
          created_at: string
          resolution: string
          resolved_at: string | null
          reviewer_notes: string | null
          source_a: string
          source_b: string
          statement_a: string
          statement_b: string
        }
        Insert: {
          assertion_a_id?: string | null
          assertion_b_id?: string | null
          assertion_type: string
          clinical_significance?: string
          concept_id: string
          conflict_id?: string
          created_at?: string
          resolution?: string
          resolved_at?: string | null
          reviewer_notes?: string | null
          source_a: string
          source_b: string
          statement_a: string
          statement_b: string
        }
        Update: {
          assertion_a_id?: string | null
          assertion_b_id?: string | null
          assertion_type?: string
          clinical_significance?: string
          concept_id?: string
          conflict_id?: string
          created_at?: string
          resolution?: string
          resolved_at?: string | null
          reviewer_notes?: string | null
          source_a?: string
          source_b?: string
          statement_a?: string
          statement_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_assertion_conflicts_assertion_a_id_fkey"
            columns: ["assertion_a_id"]
            isOneToOne: false
            referencedRelation: "medication_assertions"
            referencedColumns: ["assertion_id"]
          },
          {
            foreignKeyName: "medication_assertion_conflicts_assertion_b_id_fkey"
            columns: ["assertion_b_id"]
            isOneToOne: false
            referencedRelation: "medication_assertions"
            referencedColumns: ["assertion_id"]
          },
          {
            foreignKeyName: "medication_assertion_conflicts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      medication_assertions: {
        Row: {
          assertion_id: string
          assertion_type: string
          assertion_value: string | null
          concept_id: string
          confidence: string
          content_hash: string
          created_at: string
          extraction_method: string
          ingestion_run_id: string | null
          review_status: string
          reviewer_notes: string | null
          source_code: string
          source_document_id: string | null
          source_file: string | null
          source_locator: string | null
          source_section: string | null
          statement: string
          updated_at: string
        }
        Insert: {
          assertion_id?: string
          assertion_type: string
          assertion_value?: string | null
          concept_id: string
          confidence?: string
          content_hash: string
          created_at?: string
          extraction_method?: string
          ingestion_run_id?: string | null
          review_status?: string
          reviewer_notes?: string | null
          source_code: string
          source_document_id?: string | null
          source_file?: string | null
          source_locator?: string | null
          source_section?: string | null
          statement: string
          updated_at?: string
        }
        Update: {
          assertion_id?: string
          assertion_type?: string
          assertion_value?: string | null
          concept_id?: string
          confidence?: string
          content_hash?: string
          created_at?: string
          extraction_method?: string
          ingestion_run_id?: string | null
          review_status?: string
          reviewer_notes?: string | null
          source_code?: string
          source_document_id?: string | null
          source_file?: string | null
          source_locator?: string | null
          source_section?: string | null
          statement?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_assertions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "medication_assertions_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "med_ingestion_runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "medication_assertions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "med_source_documents"
            referencedColumns: ["document_id"]
          },
        ]
      }
      medication_class_memberships: {
        Row: {
          class_id: string
          concept_id: string
          confidence: string
          created_at: string
          membership_id: string
          source_code: string | null
        }
        Insert: {
          class_id: string
          concept_id: string
          confidence?: string
          created_at?: string
          membership_id?: string
          source_code?: string | null
        }
        Update: {
          class_id?: string
          concept_id?: string
          confidence?: string
          created_at?: string
          membership_id?: string
          source_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_class_memberships_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "medication_classes"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "medication_class_memberships_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      medication_classes: {
        Row: {
          class_category: string | null
          class_code: string
          class_id: string
          class_label: string
          created_at: string
          parent_class_id: string | null
          source_code: string | null
        }
        Insert: {
          class_category?: string | null
          class_code: string
          class_id?: string
          class_label: string
          created_at?: string
          parent_class_id?: string | null
          source_code?: string | null
        }
        Update: {
          class_category?: string | null
          class_code?: string
          class_id?: string
          class_label?: string
          created_at?: string
          parent_class_id?: string | null
          source_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_classes_parent_class_id_fkey"
            columns: ["parent_class_id"]
            isOneToOne: false
            referencedRelation: "medication_classes"
            referencedColumns: ["class_id"]
          },
        ]
      }
      medication_components: {
        Row: {
          combination_brand: string | null
          combination_label: string
          component_id: string
          concept_id: string
          created_at: string
          role: string | null
        }
        Insert: {
          combination_brand?: string | null
          combination_label: string
          component_id?: string
          concept_id: string
          created_at?: string
          role?: string | null
        }
        Update: {
          combination_brand?: string | null
          combination_label?: string
          component_id?: string
          concept_id?: string
          created_at?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_components_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      medication_concepts: {
        Row: {
          atc_code: string | null
          canonical_name: string
          concept_id: string
          created_at: string
          description: string | null
          name_normalised: string
          review_status: string
          reviewer_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          atc_code?: string | null
          canonical_name: string
          concept_id?: string
          created_at?: string
          description?: string | null
          name_normalised: string
          review_status?: string
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          atc_code?: string | null
          canonical_name?: string
          concept_id?: string
          created_at?: string
          description?: string | null
          name_normalised?: string
          review_status?: string
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      medication_dictionary: {
        Row: {
          aliases: string[] | null
          atc_hint: string | null
          brand_names: string[] | null
          created_at: string
          drug_class: string | null
          generic_name: string
          id: string
        }
        Insert: {
          aliases?: string[] | null
          atc_hint?: string | null
          brand_names?: string[] | null
          created_at?: string
          drug_class?: string | null
          generic_name: string
          id?: string
        }
        Update: {
          aliases?: string[] | null
          atc_hint?: string | null
          brand_names?: string[] | null
          created_at?: string
          drug_class?: string | null
          generic_name?: string
          id?: string
        }
        Relationships: []
      }
      medication_forms: {
        Row: {
          concept_id: string
          created_at: string
          dosage_form: string
          form_id: string
          route: string | null
          source_code: string | null
          strength_text: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string
          dosage_form: string
          form_id?: string
          route?: string | null
          source_code?: string | null
          strength_text?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string
          dosage_form?: string
          form_id?: string
          route?: string | null
          source_code?: string | null
          strength_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_forms_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      medication_names: {
        Row: {
          concept_id: string
          created_at: string
          is_primary: boolean
          name: string
          name_id: string
          name_type: string
          source_code: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string
          is_primary?: boolean
          name: string
          name_id?: string
          name_type: string
          source_code?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string
          is_primary?: boolean
          name?: string
          name_id?: string
          name_type?: string
          source_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_names_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      medication_patient_factor_rules: {
        Row: {
          class_id: string | null
          concept_id: string | null
          created_at: string
          detection_label: string
          patient_factor: string
          review_status: string
          rule_id: string
          source_code: string
        }
        Insert: {
          class_id?: string | null
          concept_id?: string | null
          created_at?: string
          detection_label: string
          patient_factor: string
          review_status?: string
          rule_id?: string
          source_code?: string
        }
        Update: {
          class_id?: string | null
          concept_id?: string | null
          created_at?: string
          detection_label?: string
          patient_factor?: string
          review_status?: string
          rule_id?: string
          source_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_patient_factor_rules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "medication_classes"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "medication_patient_factor_rules_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      medication_supplement_safety: {
        Row: {
          action: string
          advice: string
          class_id: string | null
          concept_id: string | null
          created_at: string
          mechanism: string | null
          pharmacist_checks: string[]
          product_tags: string[]
          review_status: string
          rule_id: string
          safety_net: string | null
          severity_tier: string
          source_assertion_id: string | null
          source_code: string
          supplement_ingredient: string | null
        }
        Insert: {
          action: string
          advice: string
          class_id?: string | null
          concept_id?: string | null
          created_at?: string
          mechanism?: string | null
          pharmacist_checks?: string[]
          product_tags?: string[]
          review_status?: string
          rule_id?: string
          safety_net?: string | null
          severity_tier: string
          source_assertion_id?: string | null
          source_code?: string
          supplement_ingredient?: string | null
        }
        Update: {
          action?: string
          advice?: string
          class_id?: string | null
          concept_id?: string | null
          created_at?: string
          mechanism?: string | null
          pharmacist_checks?: string[]
          product_tags?: string[]
          review_status?: string
          rule_id?: string
          safety_net?: string | null
          severity_tier?: string
          source_assertion_id?: string | null
          source_code?: string
          supplement_ingredient?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_supplement_safety_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "medication_classes"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "medication_supplement_safety_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "medication_concepts"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "medication_supplement_safety_source_assertion_id_fkey"
            columns: ["source_assertion_id"]
            isOneToOne: false
            referencedRelation: "medication_assertions"
            referencedColumns: ["assertion_id"]
          },
        ]
      }
      ontology_concepts: {
        Row: {
          canonical_label: string
          clinical_use_tags: string[]
          concept_id: string
          concept_type: string
          created_at: string
        }
        Insert: {
          canonical_label: string
          clinical_use_tags?: string[]
          concept_id?: string
          concept_type: string
          created_at?: string
        }
        Update: {
          canonical_label?: string
          clinical_use_tags?: string[]
          concept_id?: string
          concept_type?: string
          created_at?: string
        }
        Relationships: []
      }
      ontology_synonyms: {
        Row: {
          approved: boolean
          concept_id: string
          created_at: string
          provenance: string
          synonym_id: string
          synonym_type: string
          term: string
        }
        Insert: {
          approved?: boolean
          concept_id: string
          created_at?: string
          provenance?: string
          synonym_id?: string
          synonym_type: string
          term: string
        }
        Update: {
          approved?: boolean
          concept_id?: string
          created_at?: string
          provenance?: string
          synonym_id?: string
          synonym_type?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_synonyms_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "ontology_concepts"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      patient_cases: {
        Row: {
          age: number | null
          allergies: string | null
          breastfeeding_status: string | null
          case_id: string
          case_label: string | null
          confirmed_medications: Json | null
          counselling_goal: string | null
          created_at: string
          detected_drug_classes: Json | null
          detected_patient_factors: Json | null
          existing_supplements: string | null
          medical_history: string | null
          medication_text: string | null
          parsed_medications: Json | null
          pathology_notes: string | null
          pharmacist_notes: string | null
          pregnancy_status: string | null
          sex: string | null
          symptoms: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          age?: number | null
          allergies?: string | null
          breastfeeding_status?: string | null
          case_id?: string
          case_label?: string | null
          confirmed_medications?: Json | null
          counselling_goal?: string | null
          created_at?: string
          detected_drug_classes?: Json | null
          detected_patient_factors?: Json | null
          existing_supplements?: string | null
          medical_history?: string | null
          medication_text?: string | null
          parsed_medications?: Json | null
          pathology_notes?: string | null
          pharmacist_notes?: string | null
          pregnancy_status?: string | null
          sex?: string | null
          symptoms?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          age?: number | null
          allergies?: string | null
          breastfeeding_status?: string | null
          case_id?: string
          case_label?: string | null
          confirmed_medications?: Json | null
          counselling_goal?: string | null
          created_at?: string
          detected_drug_classes?: Json | null
          detected_patient_factors?: Json | null
          existing_supplements?: string | null
          medical_history?: string | null
          medication_text?: string | null
          parsed_medications?: Json | null
          pathology_notes?: string | null
          pharmacist_notes?: string | null
          pregnancy_status?: string | null
          sex?: string | null
          symptoms?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pharmacist_feedback: {
        Row: {
          case_id: string
          created_at: string
          feedback_id: string
          notes: string | null
          recommendation_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          feedback_id?: string
          notes?: string | null
          recommendation_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          feedback_id?: string
          notes?: string | null
          recommendation_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacist_feedback_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "patient_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pharmacist_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["recommendation_id"]
          },
        ]
      }
      product_directions: {
        Row: {
          adult_dose: string | null
          child_dose: string | null
          duration: string | null
          product_id: string
          raw_text: string | null
          timing: string | null
        }
        Insert: {
          adult_dose?: string | null
          child_dose?: string | null
          duration?: string | null
          product_id: string
          raw_text?: string | null
          timing?: string | null
        }
        Update: {
          adult_dose?: string | null
          child_dose?: string | null
          duration?: string | null
          product_id?: string
          raw_text?: string | null
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_directions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          bytes: number | null
          created_at: string
          derived_path: string | null
          height: number | null
          image_id: string
          is_primary: boolean
          match_confidence: number | null
          match_method: string | null
          mime_type: string | null
          original_source: Json
          product_id: string | null
          review_status: string
          role: string
          sha256: string
          source_url: string | null
          storage_path: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bytes?: number | null
          created_at?: string
          derived_path?: string | null
          height?: number | null
          image_id?: string
          is_primary?: boolean
          match_confidence?: number | null
          match_method?: string | null
          mime_type?: string | null
          original_source?: Json
          product_id?: string | null
          review_status?: string
          role?: string
          sha256: string
          source_url?: string | null
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bytes?: number | null
          created_at?: string
          derived_path?: string | null
          height?: number | null
          image_id?: string
          is_primary?: boolean
          match_confidence?: number | null
          match_method?: string | null
          mime_type?: string | null
          original_source?: Json
          product_id?: string | null
          review_status?: string
          role?: string
          sha256?: string
          source_url?: string | null
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_indications: {
        Row: {
          clinical_use_tag: string | null
          content_key: string
          indication_id: string
          indication_type: string
          product_id: string
          review_status: string
          source_page: number | null
          text: string
        }
        Insert: {
          clinical_use_tag?: string | null
          content_key: string
          indication_id?: string
          indication_type?: string
          product_id: string
          review_status?: string
          source_page?: number | null
          text: string
        }
        Update: {
          clinical_use_tag?: string | null
          content_key?: string
          indication_id?: string
          indication_type?: string
          product_id?: string
          review_status?: string
          source_page?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_indications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          content_key: string
          equivalent_amount: string | null
          equivalent_name: string | null
          equivalent_unit: string | null
          extraction_confidence: string | null
          ingredient_form: string | null
          ingredient_id: string
          product_id: string
          product_ingredient_id: string
          raw_text: string | null
          source_page: number | null
          standardised_to: string | null
          strength: string | null
          strength_unit: string | null
        }
        Insert: {
          content_key: string
          equivalent_amount?: string | null
          equivalent_name?: string | null
          equivalent_unit?: string | null
          extraction_confidence?: string | null
          ingredient_form?: string | null
          ingredient_id: string
          product_id: string
          product_ingredient_id?: string
          raw_text?: string | null
          source_page?: number | null
          standardised_to?: string | null
          strength?: string | null
          strength_unit?: string | null
        }
        Update: {
          content_key?: string
          equivalent_amount?: string | null
          equivalent_name?: string | null
          equivalent_unit?: string | null
          extraction_confidence?: string | null
          ingredient_form?: string | null
          ingredient_id?: string
          product_id?: string
          product_ingredient_id?: string
          raw_text?: string | null
          source_page?: number | null
          standardised_to?: string | null
          strength?: string | null
          strength_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_interaction_flags: {
        Row: {
          action: string | null
          content_key: string
          flag_id: string
          flags: string[]
          ingredient_name: string | null
          interacting_medicine_or_class: string | null
          interaction_text: string
          product_id: string
          severity: string | null
          source_page: number | null
        }
        Insert: {
          action?: string | null
          content_key: string
          flag_id?: string
          flags?: string[]
          ingredient_name?: string | null
          interacting_medicine_or_class?: string | null
          interaction_text: string
          product_id: string
          severity?: string | null
          source_page?: number | null
        }
        Update: {
          action?: string | null
          content_key?: string
          flag_id?: string
          flags?: string[]
          ingredient_name?: string | null
          interacting_medicine_or_class?: string | null
          interaction_text?: string
          product_id?: string
          severity?: string | null
          source_page?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_interaction_flags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_keywords: {
        Row: {
          approved: boolean
          keyword: string
          keyword_id: string
          keyword_type: string
          product_id: string
          provenance: string
        }
        Insert: {
          approved?: boolean
          keyword: string
          keyword_id?: string
          keyword_type?: string
          product_id: string
          provenance?: string
        }
        Update: {
          approved?: boolean
          keyword?: string
          keyword_id?: string
          keyword_type?: string
          product_id?: string
          provenance?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_keywords_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_population_rules: {
        Row: {
          product_id: string
          rule_id: string
          rule_type: string
          rule_value: string
          source: string | null
        }
        Insert: {
          product_id: string
          rule_id?: string
          rule_type: string
          rule_value: string
          source?: string | null
        }
        Update: {
          product_id?: string
          rule_id?: string
          rule_type?: string
          rule_value?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_population_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_synonyms: {
        Row: {
          approved: boolean
          product_id: string
          provenance: string
          synonym: string
          synonym_id: string
          synonym_type: string
        }
        Insert: {
          approved?: boolean
          product_id: string
          provenance?: string
          synonym: string
          synonym_id?: string
          synonym_type?: string
        }
        Update: {
          approved?: boolean
          product_id?: string
          provenance?: string
          synonym?: string
          synonym_id?: string
          synonym_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_synonyms_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          pack_size: string
          product_id: string
          sku: string | null
          status: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          pack_size: string
          product_id: string
          sku?: string | null
          status?: string
          variant_id?: string
        }
        Update: {
          created_at?: string
          pack_size?: string
          product_id?: string
          sku?: string | null
          status?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_warnings: {
        Row: {
          avoid_if_tags: string[]
          content_key: string
          product_id: string
          review_status: string
          severity: string | null
          source_page: number | null
          text: string
          warning_id: string
          warning_type: string
        }
        Insert: {
          avoid_if_tags?: string[]
          content_key: string
          product_id: string
          review_status?: string
          severity?: string | null
          source_page?: number | null
          text: string
          warning_id?: string
          warning_type?: string
        }
        Update: {
          avoid_if_tags?: string[]
          content_key?: string
          product_id?: string
          review_status?: string
          severity?: string | null
          source_page?: number | null
          text?: string
          warning_id?: string
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_warnings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalogue_products"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          active_ingredients: string[] | null
          avoid_if_tags: string[]
          brand: string | null
          category: string | null
          cautions: string[] | null
          clinical_use_tags: string[]
          counselling_flags: string[]
          created_at: string
          indications: string[] | null
          medicine_interaction_flags: string[]
          name: string
          notes: string | null
          pack_sizes: string[] | null
          product_id: string
          reviewed: boolean
          schedule: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          active_ingredients?: string[] | null
          avoid_if_tags?: string[]
          brand?: string | null
          category?: string | null
          cautions?: string[] | null
          clinical_use_tags?: string[]
          counselling_flags?: string[]
          created_at?: string
          indications?: string[] | null
          medicine_interaction_flags?: string[]
          name: string
          notes?: string | null
          pack_sizes?: string[] | null
          product_id?: string
          reviewed?: boolean
          schedule?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          active_ingredients?: string[] | null
          avoid_if_tags?: string[]
          brand?: string | null
          category?: string | null
          cautions?: string[] | null
          clinical_use_tags?: string[]
          counselling_flags?: string[]
          created_at?: string
          indications?: string[] | null
          medicine_interaction_flags?: string[]
          name?: string
          notes?: string | null
          pack_sizes?: string[] | null
          product_id?: string
          reviewed?: boolean
          schedule?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          advice: string | null
          ai_reviewer_notes: Json | null
          alternatives: Json
          brand: string | null
          case_id: string
          confidence: string
          confidence_score: number | null
          created_at: string
          deferred: boolean
          feedback_status: string | null
          hidden: boolean
          interaction_notes: Json | null
          matched_factors: Json
          matched_medicines: Json | null
          matched_patient_factors: Json | null
          matched_product_tags: Json | null
          mechanism: string | null
          onset: string | null
          pharmacist_checks: Json | null
          product_id: string | null
          product_name: string | null
          rank: number
          recommendation_id: string
          recommendation_type: string
          review_status: string | null
          safety_cautions: Json | null
          safety_net: string | null
          score: number
          sense_check_status: string | null
          severity_tier: string | null
          source_references: Json | null
          talking_points: Json | null
          title: string
          user_id: string | null
          why_triggered: string | null
        }
        Insert: {
          advice?: string | null
          ai_reviewer_notes?: Json | null
          alternatives?: Json
          brand?: string | null
          case_id: string
          confidence?: string
          confidence_score?: number | null
          created_at?: string
          deferred?: boolean
          feedback_status?: string | null
          hidden?: boolean
          interaction_notes?: Json | null
          matched_factors?: Json
          matched_medicines?: Json | null
          matched_patient_factors?: Json | null
          matched_product_tags?: Json | null
          mechanism?: string | null
          onset?: string | null
          pharmacist_checks?: Json | null
          product_id?: string | null
          product_name?: string | null
          rank?: number
          recommendation_id?: string
          recommendation_type: string
          review_status?: string | null
          safety_cautions?: Json | null
          safety_net?: string | null
          score?: number
          sense_check_status?: string | null
          severity_tier?: string | null
          source_references?: Json | null
          talking_points?: Json | null
          title: string
          user_id?: string | null
          why_triggered?: string | null
        }
        Update: {
          advice?: string | null
          ai_reviewer_notes?: Json | null
          alternatives?: Json
          brand?: string | null
          case_id?: string
          confidence?: string
          confidence_score?: number | null
          created_at?: string
          deferred?: boolean
          feedback_status?: string | null
          hidden?: boolean
          interaction_notes?: Json | null
          matched_factors?: Json
          matched_medicines?: Json | null
          matched_patient_factors?: Json | null
          matched_product_tags?: Json | null
          mechanism?: string | null
          onset?: string | null
          pharmacist_checks?: Json | null
          product_id?: string | null
          product_name?: string | null
          rank?: number
          recommendation_id?: string
          recommendation_type?: string
          review_status?: string | null
          safety_cautions?: Json | null
          safety_net?: string | null
          score?: number
          sense_check_status?: string | null
          severity_tier?: string | null
          source_references?: Json | null
          talking_points?: Json | null
          title?: string
          user_id?: string | null
          why_triggered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "patient_cases"
            referencedColumns: ["case_id"]
          },
        ]
      }
      safety_rules: {
        Row: {
          advice: string | null
          avoid_product_keywords: string[] | null
          created_at: string
          description: string
          evidence_level: string | null
          match_product_tags: string[] | null
          mechanism: string | null
          mechanism_detail: string | null
          name: string
          onset: string | null
          pharmacist_checks: Json | null
          pharmacist_message: string
          recommendation_type: string
          review_required: boolean
          rule_id: string
          rule_source: string | null
          safety_net: string | null
          severity: string
          severity_tier: string | null
          trigger_drug_classes: string[] | null
          trigger_keywords: string[] | null
          trigger_patient_factors: string[] | null
        }
        Insert: {
          advice?: string | null
          avoid_product_keywords?: string[] | null
          created_at?: string
          description: string
          evidence_level?: string | null
          match_product_tags?: string[] | null
          mechanism?: string | null
          mechanism_detail?: string | null
          name: string
          onset?: string | null
          pharmacist_checks?: Json | null
          pharmacist_message: string
          recommendation_type: string
          review_required?: boolean
          rule_id: string
          rule_source?: string | null
          safety_net?: string | null
          severity: string
          severity_tier?: string | null
          trigger_drug_classes?: string[] | null
          trigger_keywords?: string[] | null
          trigger_patient_factors?: string[] | null
        }
        Update: {
          advice?: string | null
          avoid_product_keywords?: string[] | null
          created_at?: string
          description?: string
          evidence_level?: string | null
          match_product_tags?: string[] | null
          mechanism?: string | null
          mechanism_detail?: string | null
          name?: string
          onset?: string | null
          pharmacist_checks?: Json | null
          pharmacist_message?: string
          recommendation_type?: string
          review_required?: boolean
          rule_id?: string
          rule_source?: string | null
          safety_net?: string | null
          severity?: string
          severity_tier?: string | null
          trigger_drug_classes?: string[] | null
          trigger_keywords?: string[] | null
          trigger_patient_factors?: string[] | null
        }
        Relationships: []
      }
      sense_check_audits: {
        Row: {
          applied_changes: Json | null
          audit_id: string
          case_id: string
          created_at: string
          error_message: string | null
          input_summary: Json | null
          latency_ms: number | null
          model: string
          raw_response: Json | null
          rejected_changes: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          applied_changes?: Json | null
          audit_id?: string
          case_id: string
          created_at?: string
          error_message?: string | null
          input_summary?: Json | null
          latency_ms?: number | null
          model: string
          raw_response?: Json | null
          rejected_changes?: Json | null
          status: string
          user_id?: string | null
        }
        Update: {
          applied_changes?: Json | null
          audit_id?: string
          case_id?: string
          created_at?: string
          error_message?: string | null
          input_summary?: Json | null
          latency_ms?: number | null
          model?: string
          raw_response?: Json | null
          rejected_changes?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sense_check_audits_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "patient_cases"
            referencedColumns: ["case_id"]
          },
        ]
      }
      source_claims: {
        Row: {
          claim_id: string
          claim_type: string
          content_key: string
          created_at: string
          explicit_or_inferred: string
          extraction_confidence: string | null
          hog_code: string
          review_status: string
          reviewer_notes: string | null
          structured: Json | null
          text: string
        }
        Insert: {
          claim_id?: string
          claim_type: string
          content_key: string
          created_at?: string
          explicit_or_inferred?: string
          extraction_confidence?: string | null
          hog_code: string
          review_status?: string
          reviewer_notes?: string | null
          structured?: Json | null
          text: string
        }
        Update: {
          claim_id?: string
          claim_type?: string
          content_key?: string
          created_at?: string
          explicit_or_inferred?: string
          extraction_confidence?: string | null
          hog_code?: string
          review_status?: string
          reviewer_notes?: string | null
          structured?: Json | null
          text?: string
        }
        Relationships: []
      }
      source_documents: {
        Row: {
          corpus_path: string
          created_at: string
          document_id: string
          extracted_at: string | null
          format: string
          page_count: number | null
          role: string | null
          sha256: string
          title: string
        }
        Insert: {
          corpus_path: string
          created_at?: string
          document_id?: string
          extracted_at?: string | null
          format: string
          page_count?: number | null
          role?: string | null
          sha256: string
          title: string
        }
        Update: {
          corpus_path?: string
          created_at?: string
          document_id?: string
          extracted_at?: string | null
          format?: string
          page_count?: number | null
          role?: string | null
          sha256?: string
          title?: string
        }
        Relationships: []
      }
      source_sections: {
        Row: {
          document_id: string
          heading: string | null
          hog_code: string | null
          page: number | null
          section_id: string
          text: string | null
        }
        Insert: {
          document_id: string
          heading?: string | null
          hog_code?: string | null
          page?: number | null
          section_id?: string
          text?: string | null
        }
        Update: {
          document_id?: string
          heading?: string | null
          hog_code?: string | null
          page?: number | null
          section_id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["document_id"]
          },
        ]
      }
      tg_chunks: {
        Row: {
          active: boolean
          chunk_id: string
          chunk_index: number
          content_hash: string
          edition: string
          excerpt: string
          excerpt_length: number
          inserted_at: string
          page_id: string
          page_short_id: string
          page_type: string | null
          page_type_label: string | null
          section_heading: string | null
          section_index: number
          section_level: number
          source: string
          source_name: string
          source_url: string
          title: string
          topic_area: string | null
          topic_area_label: string | null
          topic_code: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          chunk_id: string
          chunk_index?: number
          content_hash: string
          edition: string
          excerpt: string
          excerpt_length: number
          inserted_at?: string
          page_id: string
          page_short_id: string
          page_type?: string | null
          page_type_label?: string | null
          section_heading?: string | null
          section_index?: number
          section_level?: number
          source: string
          source_name: string
          source_url: string
          title: string
          topic_area?: string | null
          topic_area_label?: string | null
          topic_code?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          chunk_id?: string
          chunk_index?: number
          content_hash?: string
          edition?: string
          excerpt?: string
          excerpt_length?: number
          inserted_at?: string
          page_id?: string
          page_short_id?: string
          page_type?: string | null
          page_type_label?: string | null
          section_heading?: string | null
          section_index?: number
          section_level?: number
          source?: string
          source_name?: string
          source_url?: string
          title?: string
          topic_area?: string | null
          topic_area_label?: string | null
          topic_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "pharmacist"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "pharmacist"],
    },
  },
} as const
